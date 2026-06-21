// Multi-account routing test (hb2.0 core). Mocks senders + account manager,
// drives Engine.enqueue with two users, and verifies isolation + routing.
// Only exercises command paths (no real Claude spawn).
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { Engine } from "./dist/engine.js";
import { loadConfig } from "./dist/config.js";

const sent = [];
const mkSender = (tag) => ({
  sendText: async (to, text) => { sent.push({ tag, to, text }); },
  sendFile: async () => {},
  startTyping: () => () => {},
});

const noopAM = {
  startAll() {}, start() {}, remove() { return true; }, stopAll() {},
  list() { return []; }, count() { return 0; }, isOnline() { return false; },
};

const engine = new Engine();
engine.attachAccountManager(noopAM);

const acc = (id) => ({ token: "t", baseUrl: "https://x", accountId: "bot-" + id, userId: id, savedAt: "now" });
const msg = (from, text) => ({
  message_id: Math.floor(Math.random() * 1e9),
  from_user_id: from,
  message_type: 1,
  item_list: [{ type: 1, text_item: { text } }],
});

const A = "ZZtestA", B = "ZZtestB";
engine.enqueue(acc(A), mkSender("A"), msg(A, "/myid"));
engine.enqueue(acc(B), mkSender("B"), msg(B, "/myid"));
engine.enqueue(acc(A), mkSender("A"), msg(A, "/users"));

await new Promise((r) => setTimeout(r, 800));

const aMyid = sent.find((s) => s.tag === "A" && s.text.includes("用户 ID"));
const bMyid = sent.find((s) => s.tag === "B" && s.text.includes("用户 ID"));
assert.ok(aMyid && aMyid.text.includes(A) && aMyid.to === A, "A /myid routed to A");
assert.ok(bMyid && bMyid.text.includes(B) && bMyid.to === B, "B /myid routed to B");
console.log("  ✓ per-account routing: each reply uses that user's own sender + id");

const aUsers = sent.find((s) => s.tag === "A" && s.text.includes("仅机主"));
assert.ok(aUsers, "non-owner /users should be rejected");
console.log("  ✓ owner-only guard: non-owner /users rejected");

assert.ok(!sent.some((s) => s.tag === "A" && s.text.includes(B)), "no A->B leakage");
assert.ok(!sent.some((s) => s.tag === "B" && s.text.includes(A)), "no B->A leakage");
console.log("  ✓ isolation: no cross-account leakage");

console.log("\n✅ multi-account routing verified");

// cleanup test artifacts
const root = loadConfig().workingDirectory;
const home = process.env.USERPROFILE || process.env.HOME || "";
for (const id of [A, B]) {
  try { fs.rmSync(path.join(home, ".hybridbox", "sessions", id + ".json")); } catch {}
  try { fs.rmSync(path.join(root, id), { recursive: true, force: true }); } catch {}
}
