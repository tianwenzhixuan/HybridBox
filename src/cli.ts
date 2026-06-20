#!/usr/bin/env node
import { VERSION } from "./constants.js";
import { loadConfig } from "./config.js";
import { hasAccount, loadAccount } from "./wechat/accounts.js";

const HELP = `HybridBox v${VERSION} — 从微信远程使用这台 Windows 电脑上的 Claude Code

用法：
  hybridbox setup     扫码登录微信、设置工作目录
  hybridbox start     启动后台守护进程（开始收发消息）
  hybridbox status    查看登录与配置状态
  hybridbox help      显示本帮助

通常用 PM2 常驻：
  npm run build
  pm2 start ecosystem.config.cjs
`;

async function main() {
  const cmd = (process.argv[2] || "help").toLowerCase();

  switch (cmd) {
    case "setup": {
      const { runSetup } = await import("./setup.js");
      await runSetup();
      break;
    }
    case "start":
    case "daemon": {
      const { runDaemon } = await import("./daemon.js");
      await runDaemon();
      break;
    }
    case "status": {
      printStatus();
      break;
    }
    case "version":
    case "-v":
    case "--version":
      console.log(`HybridBox v${VERSION}`);
      break;
    case "help":
    case "-h":
    case "--help":
    default:
      console.log(HELP);
  }
}

function printStatus() {
  console.log(`HybridBox v${VERSION}`);
  if (!hasAccount()) {
    console.log("微信登录：❌ 未登录（运行 `hybridbox setup`）");
    return;
  }
  const acc = loadAccount()!;
  const cfg = loadConfig();
  console.log("微信登录：✅ 已登录");
  console.log(`  Bot ID：${acc.accountId}`);
  console.log(`  登录时间：${acc.savedAt}`);
  console.log(`工作目录：${cfg.workingDirectory}`);
  console.log(`默认模型：${cfg.model || "(默认)"}`);
  console.log(`自动批准工具：${cfg.autoApprove ? "是" : "否"}`);
}

main().catch((e) => {
  console.error("错误：", e?.message ?? e);
  process.exit(1);
});
