#!/usr/bin/env node
import { VERSION } from "./constants.js";
import { getOwnerId, loadConfig } from "./config.js";
import { listAccounts } from "./wechat/accounts.js";

const HELP = `HybridBox v${VERSION} — 从微信远程使用这台 Windows 电脑上的 Claude Code

用法：
  hybridbox setup      首次扫码登录（首位用户成为机主）
  hybridbox add-user   终端扫码再添加一位成员
  hybridbox start      启动后台守护进程（开始收发消息）
  hybridbox status     查看登录与配置状态
  hybridbox help       显示本帮助

多人使用：服务运行后，机主在微信里发 /adduser 即可邀请更多成员（免重启）。

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
    case "add-user":
    case "adduser": {
      const { runAddUser } = await import("./setup.js");
      await runAddUser();
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
  const accounts = listAccounts();
  if (accounts.length === 0) {
    console.log("微信登录：❌ 未登录（运行 `hybridbox setup`）");
    return;
  }
  const cfg = loadConfig();
  const owner = getOwnerId();
  console.log(`微信登录：✅ 已绑定 ${accounts.length} 个账号`);
  accounts.forEach((a, i) => {
    const tag = a.userId === owner ? " 👑(机主)" : "";
    console.log(`  ${i + 1}. ${a.userId}${tag}  绑定于 ${a.savedAt}`);
  });
  console.log(`工作根目录：${cfg.workingDirectory}`);
  console.log(`默认模型：${cfg.model || "(默认)"}`);
  console.log(`自动批准工具：${cfg.autoApprove ? "是" : "否"}`);
}

main().catch((e) => {
  console.error("错误：", e?.message ?? e);
  process.exit(1);
});
