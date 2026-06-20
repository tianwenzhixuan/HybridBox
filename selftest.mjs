// Quick logic self-test against the compiled dist/ output.
import assert from "node:assert";
import { splitMessage } from "./dist/wechat/split.js";
import { parseLine, createLineBuffer } from "./dist/claude/parser.js";
import { aesEcbEncrypt, aesEcbDecrypt, randomAesKey, md5Hex } from "./dist/wechat/crypto.js";
import { detectFilePaths } from "./dist/engine.js";

let passed = 0;
const ok = (name) => { console.log("  ✓", name); passed++; };

// --- splitMessage ---
assert.deepEqual(splitMessage(""), []);
assert.deepEqual(splitMessage("hi"), ["hi"]);
ok("split: short text untouched");

const long = "段落一。\n\n" + "x".repeat(5000) + "\n\n段落三。";
const chunks = splitMessage(long, 4000);
assert.ok(chunks.length >= 2, "should split into multiple chunks");
assert.ok(chunks.every((c) => c.length <= 4000), "every chunk within limit");
ok("split: long text respects 4000 limit");

const paras = splitMessage("a".repeat(2000) + "\n\n" + "b".repeat(2000) + "\n\n" + "c".repeat(2000), 4000);
assert.ok(paras.every((c) => c.length <= 4000));
ok("split: packs paragraphs under limit");

// --- parser ---
assert.deepEqual(parseLine('{"type":"system","subtype":"init","session_id":"abc"}'), {
  kind: "session", sessionId: "abc",
});
ok("parser: system init -> session id");

assert.deepEqual(
  parseLine('{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"hello"}}}'),
  { kind: "text", text: "hello" },
);
ok("parser: text_delta -> text");

assert.deepEqual(
  parseLine('{"type":"stream_event","event":{"type":"content_block_stop"}}'),
  { kind: "blockEnd" },
);
ok("parser: content_block_stop -> blockEnd");

assert.deepEqual(parseLine('{"type":"result","subtype":"error","error":"boom"}'), {
  kind: "result", error: "boom",
});
ok("parser: error result");

assert.deepEqual(
  parseLine('{"type":"assistant","message":{"content":[{"type":"text","text":"hi"}]}}'),
  { kind: "fullText", text: "hi" },
);
ok("parser: full assistant message -> fullText (dedup fallback)");

assert.equal(parseLine("not json").kind, "ignore");
assert.equal(parseLine("").kind, "ignore");
ok("parser: junk -> ignore");

// --- line buffer ---
const lb = createLineBuffer();
assert.deepEqual(lb.push("a\nb\nc"), ["a", "b"]);
assert.deepEqual(lb.push("d\n"), ["cd"]);
assert.deepEqual(lb.flush(), []);
ok("lineBuffer: splits across chunks");

// --- crypto round trip ---
const key = randomAesKey();
const plain = Buffer.from("微信 Claude Code 测试 payload 12345", "utf8");
const enc = aesEcbEncrypt(plain, key);
const dec = aesEcbDecrypt(enc, key);
assert.ok(dec.equals(plain), "AES round trip must match");
assert.equal(md5Hex(plain).length, 32);
ok("crypto: AES-128-ECB round trip + md5");

// --- detectFilePaths ---
const text = "结果保存在 D:\\Claude\\proj\\out.txt 和 file:///C:/tmp/report.pdf 里。";
const paths = detectFilePaths(text);
assert.ok(paths.includes("D:\\Claude\\proj\\out.txt"), "win path detected");
assert.ok(paths.some((p) => /report\.pdf$/.test(p)), "file:// path detected");
ok("engine: detectFilePaths finds windows + file:// paths");

console.log(`\n✅ All ${passed} logic checks passed.`);
