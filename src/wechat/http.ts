/** Thin fetch wrapper with timeout + abort support. */

export interface HttpOptions {
  method?: "GET" | "POST" | "PUT";
  headers?: Record<string, string>;
  body?: string | Buffer;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

/** Perform an HTTP request, returning the raw text body. */
export async function httpRequest(url: string, opts: HttpOptions = {}): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);

  // Chain an external abort signal (used for graceful shutdown).
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: opts.headers,
      body: opts.body as string | Uint8Array | undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new HttpError(res.status, `HTTP ${res.status}: ${text.slice(0, 200)}`);
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

/** POST JSON and parse the JSON response. */
export async function postJson<T>(url: string, body: unknown, opts: HttpOptions = {}): Promise<T> {
  const payload = JSON.stringify(body);
  const text = await httpRequest(url, {
    ...opts,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
    body: payload,
  });
  return JSON.parse(text) as T;
}

/** GET and parse JSON. */
export async function getJson<T>(url: string, opts: HttpOptions = {}): Promise<T> {
  const text = await httpRequest(url, { ...opts, method: "GET" });
  return JSON.parse(text) as T;
}

/** Raw binary GET (for CDN downloads). */
export async function httpGetBuffer(url: string, opts: HttpOptions = {}): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);
  try {
    const res = await fetch(url, { method: "GET", headers: opts.headers, signal: controller.signal });
    if (!res.ok) throw new HttpError(res.status, `HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timeout);
  }
}

/** Raw binary PUT (for CDN uploads). */
export async function httpPutBuffer(url: string, data: Buffer, opts: HttpOptions = {}): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);
  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: opts.headers,
      body: new Uint8Array(data),
      signal: controller.signal,
    });
    if (!res.ok) throw new HttpError(res.status, `HTTP ${res.status}`);
  } finally {
    clearTimeout(timeout);
  }
}
