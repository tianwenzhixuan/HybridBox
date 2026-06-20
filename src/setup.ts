import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import QRCode from "qrcode";
import qrcodeTerminal from "qrcode-terminal";
import { DEFAULT_BASE_URL, TMP_DIR } from "./constants.js";
import { loadConfig, saveConfig } from "./config.js";
import { saveAccount } from "./wechat/accounts.js";
import { startQrLogin, waitForQrScan } from "./wechat/login.js";

function openFile(p: string): void {
  try {
    if (process.platform === "win32") spawn("cmd", ["/c", "start", "", p], { detached: true });
    else if (process.platform === "darwin") spawn("open", [p], { detached: true });
    else spawn("xdg-open", [p], { detached: true });
  } catch {
    /* best-effort */
  }
}

export async function runSetup(): Promise<void> {
  console.log("\n=== HybridBox 微信登录 ===\n");
  console.log("正在向微信服务器申请登录二维码…");

  const { qrContent, qrcodeId } = await startQrLogin(DEFAULT_BASE_URL);

  console.log("\n① 用微信「扫一扫」扫描下面的二维码：\n");
  qrcodeTerminal.generate(qrContent, { small: true });

  // Also save + open a PNG, in case the terminal can't render the QR cleanly.
  try {
    fs.mkdirSync(TMP_DIR, { recursive: true });
    const pngPath = path.join(TMP_DIR, "login-qr.png");
    await QRCode.toFile(pngPath, qrContent, { width: 400 });
    openFile(pngPath);
    console.log(`\n（已同时生成图片：${pngPath}）`);
  } catch {
    /* terminal QR is enough */
  }

  console.log(`\n② 如果都扫不了，把这个链接复制到微信打开：\n${qrContent}\n`);
  console.log("等待扫码确认中…（8 分钟内有效）\n");

  const account = await waitForQrScan(qrcodeId, DEFAULT_BASE_URL, {
    onScanned: () => console.log("✅ 已扫描，请在手机上点击「确认」…"),
  });

  saveAccount(account);
  console.log(`\n🎉 绑定成功！Bot ID: ${account.accountId}\n`);

  await promptWorkingDir();

  console.log("\n下一步：运行  npm start   或   pm2 start ecosystem.config.cjs   启动后台服务。");
  console.log("然后在微信里给这个机器人发消息即可远程使用 Claude Code。\n");
}

async function promptWorkingDir(): Promise<void> {
  const cfg = loadConfig();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`默认工作目录 [${cfg.workingDirectory}]：`)).trim();
    if (answer) {
      const resolved = path.resolve(answer);
      if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
        saveConfig({ ...cfg, workingDirectory: resolved });
        console.log(`已设置工作目录：${resolved}`);
      } else {
        console.log(`目录不存在，保留默认：${cfg.workingDirectory}`);
      }
    }
  } finally {
    rl.close();
  }
}
