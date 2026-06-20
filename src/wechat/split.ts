import { WECHAT_TEXT_LIMIT } from "../constants.js";

/**
 * Split text into WeChat-sized chunks, preferring natural boundaries.
 * Strategy: pack paragraphs (\n\n) together; if one paragraph exceeds the
 * limit, break at the last newline / sentence end / space before the cap.
 */
export function splitMessage(text: string, limit = WECHAT_TEXT_LIMIT): string[] {
  if (text.length <= limit) return text.length ? [text] : [];

  const chunks: string[] = [];
  const paragraphs = text.split(/\n\n/);
  let current = "";

  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  for (const para of paragraphs) {
    const candidate = current ? current + "\n\n" + para : para;
    if (candidate.length <= limit) {
      current = candidate;
      continue;
    }
    push();
    if (para.length <= limit) {
      current = para;
    } else {
      // Hard paragraph: break into sub-chunks.
      for (const piece of hardSplit(para, limit)) chunks.push(piece);
    }
  }
  push();
  return chunks;
}

function hardSplit(text: string, limit: number): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    const window = rest.slice(0, limit);
    const cut = safeCut(window);
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut);
  }
  if (rest.trim()) out.push(rest.trim());
  return out;
}

/** Find a pleasant break point, at least 30% into the window. */
function safeCut(window: string): number {
  const min = Math.floor(window.length * 0.3);
  const candidates = [
    window.lastIndexOf("\n"),
    window.lastIndexOf("。"),
    window.lastIndexOf("！"),
    window.lastIndexOf("？"),
    window.lastIndexOf(". "),
    window.lastIndexOf("! "),
    window.lastIndexOf("? "),
    window.lastIndexOf(" "),
  ];
  const best = Math.max(...candidates);
  return best > min ? best + 1 : window.length;
}
