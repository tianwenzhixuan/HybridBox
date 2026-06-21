import { log } from "./logger.js";
import { ensureOwnerSeeded, loadConfig } from "./config.js";
import { Engine } from "./engine.js";
import { AccountManager } from "./account-manager.js";
import { listAccounts } from "./wechat/accounts.js";

/** Start the long-running daemon: poll WeChat for every account, drive Claude. */
export async function runDaemon(): Promise<void> {
  const accounts = listAccounts();
  if (accounts.length === 0) {
    console.error("尚未登录微信。请先运行：  npm run setup");
    process.exit(1);
  }

  // First bound account is the owner (only set if not already recorded).
  ensureOwnerSeeded(accounts[0].userId);

  const engine = new Engine();
  const accountManager = new AccountManager(engine);
  engine.attachAccountManager(accountManager);
  accountManager.startAll();

  let shuttingDown = false;
  const shutdown = (sig: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`Received ${sig}, shutting down…`);
    accountManager.stopAll();
    setTimeout(() => process.exit(0), 1500);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("uncaughtException", (e) => log.error("uncaughtException:", e));
  process.on("unhandledRejection", (e) => log.error("unhandledRejection:", e));

  const cfg = loadConfig();
  log.info(`HybridBox daemon started. ${accounts.length} account(s), workroot=${cfg.workingDirectory}`);
  console.log(`HybridBox 正在运行（多账号模式，${accounts.length} 人）。给微信机器人发消息即可。按 Ctrl+C 退出。`);

  // Monitors run in the background; keep the process alive until a signal.
  await new Promise<void>(() => {});
}
