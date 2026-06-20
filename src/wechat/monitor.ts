import { log } from "../logger.js";
import type { IlinkApi } from "./api.js";
import { loadSyncBuf, saveSyncBuf } from "./sync-buf.js";
import { MessageType, type WeixinMessage } from "./types.js";

export interface MonitorCallbacks {
  onMessage: (msg: WeixinMessage) => void;
}

export interface Monitor {
  run: () => Promise<void>;
  stop: () => void;
}

const SESSION_EXPIRED = -14;
const MAX_SEEN = 1000;

/**
 * Long-polling loop over ilink/bot/getupdates.
 * Handles dedup, backoff, and session-expiry pauses.
 */
export function createMonitor(api: IlinkApi, callbacks: MonitorCallbacks): Monitor {
  const controller = new AbortController();
  const seen = new Set<number>();
  let syncBuf = loadSyncBuf();
  let consecutiveFailures = 0;
  let stopped = false;

  function remember(id: number) {
    seen.add(id);
    if (seen.size > MAX_SEEN) {
      // Evict oldest half.
      const it = seen.values();
      for (let i = 0; i < MAX_SEEN / 2; i++) {
        const v = it.next().value;
        if (v !== undefined) seen.delete(v);
      }
    }
  }

  async function run(): Promise<void> {
    log.info("Monitor started; long-polling for WeChat messages...");
    while (!stopped) {
      try {
        const res = await api.getUpdates(syncBuf, controller.signal);

        const ret = res.ret ?? res.errcode ?? 0;
        if (ret === SESSION_EXPIRED) {
          log.warn("Session expired (ret -14). Pausing 1 hour. Re-run `hybridbox setup` to re-login.");
          await sleep(3_600_000, controller.signal);
          continue;
        }
        if (ret !== 0) {
          throw new Error(`getUpdates ret=${ret} ${res.retmsg ?? res.errmsg ?? ""}`);
        }

        consecutiveFailures = 0;

        const nextBuf = res.get_updates_buf ?? res.sync_buf;
        if (nextBuf && nextBuf !== syncBuf) {
          syncBuf = nextBuf;
          saveSyncBuf(syncBuf);
        }

        for (const msg of res.msgs ?? []) {
          if (msg.message_type !== MessageType.USER) continue; // ignore our own/bot echoes
          const id = msg.message_id ?? msg.seq ?? 0;
          if (id && seen.has(id)) continue;
          if (id) remember(id);
          callbacks.onMessage(msg); // fire-and-forget; handler is async
        }
      } catch (e) {
        if (stopped || controller.signal.aborted) break;
        const err = e as Error;
        if (err.name === "AbortError") continue;
        consecutiveFailures++;
        const backoff = consecutiveFailures >= 3 ? 30_000 : 3_000;
        log.warn(`getUpdates failed (${consecutiveFailures}): ${err.message}. Backing off ${backoff}ms`);
        await sleep(backoff, controller.signal);
      }
    }
    log.info("Monitor stopped.");
  }

  function stop() {
    stopped = true;
    controller.abort();
  }

  return { run, stop };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });
}
