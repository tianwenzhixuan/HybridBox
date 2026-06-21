import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import qrcodeTerminal from "qrcode-terminal";
import { DEFAULT_BASE_URL } from "./constants.js";
import { ensureOwnerSeeded, loadConfig, saveConfig } from "./config.js";
import { openFile, renderQrPng } from "./qr.js";
import { countAccounts, saveAccount } from "./wechat/accounts.js";
import { startQrLogin, waitForQrScan } from "./wechat/login.js";
import type { Account } from "./wechat/types.js";

/** Shared QR login flow used by both first-time setup and add-user. */
async function doLogin(label: string): Promise<Account> {
  console.log(`\n正在向微信服务器申请${label}二维码…`);
  const { qrContent, qrcodeId } = await startQrLogin(DEFAULT_BASE_URL);

  console.log("\n用微信「扫一扫」扫描下面的二维码：\n");
  qrcodeTerminal.generate(qrContent, { small: true });

  try {
    const png = await renderQrPng(qrContent, "login");
    openFile(png);
    console.log(`\n（已同时生成图片：${png}）`);
  } catch {
    /* terminal QR is enough */
  }

  console.log(`\n如果都扫不了，把这个链接复制到微信打开：\n${qrContent}\n`);
  console.log("等待扫码确认中…（8 分钟内有效）\n");

  const account = await waitForQrScan(qrcodeId, DEFAULT_BASE_URL, {
    onScanned: () => console.log("✅ 已扫描，请在手机上点击「确认」…"),
  });
  saveAccount(account);
  return account;
}

export async function runSetup(): Promise<void> {
  console.log("\n=== HybridBox 微信登录（首位用户 = 机主）===");
  const account = await doLogin("登录");
  ensureOwnerSeeded(account.userId);
  console.log(`\n🎉 绑定成功！你是机主 👑  用户：${account.userId}\n`);

  await promptWorkingDir();

  console.log("\n下一步：运行  npm start  或  pm2 start ecosystem.config.cjs  启动服务。");
  console.log("服务运行后，在微信里发 /adduser 即可邀请更多成员（免重启）。\n");
}

export async function runAddUser(): Promise<void> {
  if (countAccounts() === 0) {
    console.log("还没有机主。请先运行：  npm run setup");
    return;
  }
  console.log("\n=== HybridBox 添加成员 ===");
  const account = await doLogin("邀请");
  console.log(`\n🎉 已添加成员：${account.userId}`);
  console.log("若 HybridBox 正在运行，请重启使其生效；或直接用微信 /adduser 免重启添加。\n");
}

async function promptWorkingDir(): Promise<void> {
  const cfg = loadConfig();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`默认工作根目录 [${cfg.workingDirectory}]：`)).trim();
    if (answer) {
      const resolved = path.resolve(answer);
      if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
        saveConfig({ ...cfg, workingDirectory: resolved });
        console.log(`已设置工作根目录：${resolved}`);
      } else {
        console.log(`目录不存在，保留默认：${cfg.workingDirectory}`);
      }
    }
  } finally {
    rl.close();
  }
}
