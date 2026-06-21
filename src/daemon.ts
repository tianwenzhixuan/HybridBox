import { log } from "./logger.js";
import { ensureOwnerSeeded, loadConfig } from "./config.js";
import { Engine } from "./engine.js";
import { createApi } from "./wechat/api.js";
import { loadAccount } from "./wechat/accounts.js";
import { createMonitor } from "./wechat/monitor.js";
import { Sender } from "./wechat/sender.js";

/** Start the long-running daemon: poll WeChat, drive Claude, reply. */
export async function runDaemon(): Promise<void> {
  const account = loadAccount();
  if (!account) {
    console.error("尚未登录微信。请先运行：  npm run setup");
    process.exit(1);
  }

  // Default the bot to "owner-only": record the bound account as owner and
  // ensure it is whitelisted, so an empty whitelist never means "everyone".
  ensureOwnerSeeded(account.userId);

  const api = createApi(account);
  const sender = new Sender(api);
  const engine = new Engine(api, sender);
  const monitor = createMonitor(api, { onMessage: (m) => engine.enqueue(m) });

  let shuttingDown = false;
  const shutdown = (sig: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`Received ${sig}, shutting down…`);
    monitor.stop();
    setTimeout(() => process.exit(0), 1500);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("uncaughtException", (e) => log.error("uncaughtException:", e));
  process.on("unhandledRejection", (e) => log.error("unhandledRejection:", e));

  const cfg = loadConfig();
  log.info(`HybridBox daemon started. Bot=${account.accountId}, workdir=${cfg.workingDirectory}`);
  console.log("HybridBox 正在运行（多用户隔离模式）。给微信机器人发消息即可。按 Ctrl+C 退出。");

  await monitor.run();
}
