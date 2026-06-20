/**
 * Parser for Claude Code's `--output-format stream-json` NDJSON events.
 * Each stdout line is one JSON object; we translate the ones we care about.
 */

export type ParsedEvent =
  | { kind: "session"; sessionId: string }
  | { kind: "text"; text: string }
  /** Full (non-streamed) assistant message — used only as a fallback. */
  | { kind: "fullText"; text: string }
  | { kind: "blockEnd" }
  | { kind: "result"; text?: string; error?: string }
  | { kind: "ignore" };

export function parseLine(line: string): ParsedEvent {
  const trimmed = line.trim();
  if (!trimmed) return { kind: "ignore" };

  let evt: any;
  try {
    evt = JSON.parse(trimmed);
  } catch {
    return { kind: "ignore" };
  }

  switch (evt.type) {
    case "system":
      if (evt.subtype === "init" && evt.session_id) {
        return { kind: "session", sessionId: evt.session_id };
      }
      return { kind: "ignore" };

    case "assistant": {
      // Full assistant message (non-partial). Extract text blocks.
      const blocks = evt.message?.content;
      if (Array.isArray(blocks)) {
        const text = blocks
          .filter((b: any) => b?.type === "text" && typeof b.text === "string")
          .map((b: any) => b.text)
          .join("");
        if (text) return { kind: "fullText", text };
      }
      return { kind: "ignore" };
    }

    case "stream_event": {
      const ev = evt.event;
      if (!ev) return { kind: "ignore" };
      if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
        return { kind: "text", text: ev.delta.text ?? "" };
      }
      if (ev.type === "content_block_stop") {
        return { kind: "blockEnd" };
      }
      return { kind: "ignore" };
    }

    case "result": {
      if (evt.subtype === "error" || evt.is_error) {
        return { kind: "result", error: evt.error ?? evt.result ?? "Claude returned an error" };
      }
      if (typeof evt.result === "string") {
        return { kind: "result", text: evt.result };
      }
      return { kind: "ignore" };
    }

    default:
      return { kind: "ignore" };
  }
}

/** Stateful line-splitter: feed raw stdout chunks, get whole lines out. */
export function createLineBuffer() {
  let buffer = "";
  return {
    push(chunk: string): string[] {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      return lines;
    },
    flush(): string[] {
      const rest = buffer;
      buffer = "";
      return rest ? [rest] : [];
    },
  };
}
