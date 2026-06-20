# HybridBox

<p align="center">
  <b>Remote-control Claude Code on Windows from WeChat.</b><br>
  通过微信远程操控 Windows 电脑上运行的 Claude Code。
</p>

<p align="center">
  <a href="#english">English</a> | <a href="#中文">中文</a> | <a href="https://github.com/your-username/hybridbox">GitHub</a>
</p>

---

<a id="english"></a>

## 🇺🇸 English

> **⚠️ Important**: HybridBox relies on the WeChat ClawBot `ilink` API, which is a community reverse-engineered protocol. It may change with WeChat updates. Login and message testing require a real WeChat account with ClawBot support.

### What it does

Send a message from your phone (WeChat) → HybridBox daemon (running on your PC) → Claude Code CLI executes → Results stream back to WeChat in real time.

```
Phone WeChat → WeChat ClawBot (ilink API) → HybridBox Daemon → Claude Code CLI
    ^                                                              |
    └────────── Streamed reply / Auto-pushed files ←───────────────┘
```

### Features

- 📱 **WeChat QR login** – Scan to bind your WeChat account as a bot
- 💬 **Text conversations** – Messages forwarded to Claude Code, replies streamed back to WeChat
- 🖼️ **Bidirectional file transfer** – Send images/files to Claude; generated files auto-pushed back to WeChat
- ⌨️ **Typing indicator**, long-task keepalive, auto-split for long replies
- 🧠 **Session resume** (`--resume`), slash commands, switchable working directory & model
- 🔁 **PM2 daemon mode**, auto-reconnect, 30-day log rotation

### Requirements

- **Windows 10/11**
- **Node.js ≥ 18**
- **Claude Code CLI** installed and logged in (run `claude` in terminal)
- A WeChat account with ClawBot support

### Quick Start

```powershell
# 1. Clone & install
cd D:\Claude\proj\HybridBox
npm install
npm run build

# 2. Run self-tests
npm test

# 3. WeChat QR login
npm run setup
# Scan the QR code with WeChat → confirm

# 4. Check status
node dist/cli.js status

# 5. Start daemon (foreground for testing)
npm start
# Keep this terminal open. Send a message from WeChat to the bot!

# 6. Background daemon (recommended for daily use)
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
```

### WeChat Commands

| Command | Description |
|---------|-------------|
| `/help` | Show help |
| `/status` | Current status (working directory, model, session, state) |
| `/clear` | Start a new session (keep working directory & model) |
| `/reset` | Reset all settings to default |
| `/cwd [path]` | View / switch working directory |
| `/model [name]` | View / switch model (e.g. `claude-opus-4-8`) |
| `/prompt [text]` | View / set system prompt (`clear` to remove) |
| `/send <path>` | Send a local file to WeChat |
| `/stop` | Interrupt the current task |
| `/version` | Show version |

### Data & Logs

All data lives in `%USERPROFILE%\.hybridbox\`:

```
.hybridbox\
  accounts\        WeChat credentials
  sessions\        Per-account session state & chat history
  logs\            Daily rolling logs (30 days retention)
  tmp\             Downloaded/generated temporary media
  config.json      Global config
  get_updates_buf.json  Long-polling cursor
```

### Configuration (`config.json`)

| Field | Meaning |
|-------|---------|
| `workingDirectory` | Default working directory for Claude Code |
| `model` | Default model (optional) |
| `systemPrompt` | Extra system prompt appended to every session (optional) |
| `autoApprove` | Auto-approve tool calls (`true` = `--dangerously-skip-permissions`) |

> ⚠️ `autoApprove: true` lets Claude Code run commands and modify files without confirmation. This is required for remote unattended operation, but make sure only you can message the bot.

### Project Structure

```
src/
  cli.ts              CLI entry (setup / start / status)
  setup.ts            QR login wizard
  daemon.ts           Daemon assembly
  engine.ts           Message queue, command dispatch, Claude driver, file push
  stream.ts           Streamed output buffering & splitting
  session.ts          Session & chat history
  config.ts           Config read/write
  constants.ts        Constants
  logger.ts           Logging with redaction
  store.ts            JSON read/write utilities
  claude/
    provider.ts       Spawn Claude Code child process (Windows-aware)
    parser.ts         stream-json (NDJSON) parser
  commands/
    router.ts         Slash command router
    handlers.ts       Command implementations
  wechat/
    api.ts            ilink Bot API client (7 endpoints)
    login.ts          QR login flow
    monitor.ts        Long-polling listener
    sender.ts         Send (split/rate-limit/typing/file)
    upload.ts         Encrypted CDN upload
    cdn.ts            CDN download & decrypt
    media.ts          Inbound media download + type detection
    crypto.ts         AES-128-ECB / MD5 / random helpers
    split.ts          Text splitting
    http.ts           HTTP with timeout
    accounts.ts       Credential persistence
    sync-buf.ts       Cursor persistence
    types.ts          Protocol types
```

### Security Notes

- Credentials are stored locally at `%USERPROFILE%\.hybridbox\accounts\`. Never share them.
- The bot runs Claude Code as **you**. Anyone who can message the bot can operate your PC.
- Use only with trusted WeChat contacts.
- Logs automatically redact Bearer tokens and bot credentials.

### License

MIT © 2025

---

<a id="中文"></a>

## 🇨🇳 中文

> **⚠️ 重要说明**：HybridBox 依赖微信 ClawBot 的 `ilink` 接口。该接口是从社区开源项目逆向得到的非官方协议，可能随微信更新而变化。登录与收发消息请在你自己的设备上实测验证。

### 功能

从手机微信发送一句话，HybridBox 就会在你的 Windows 电脑上跑 Claude Code，并把结果（含流式输出、生成的文件）实时发回微信。无需公网 IP、无需域名、无需服务器——本机主动连出。

```
手机微信  ──>  微信 ClawBot (ilink API)  ──>  HybridBox 守护进程  ──>  Claude Code CLI
   ^                                                                        |
   └────────────────────  流式回复 / 文件推送 ◀──────────────────────────────┘
```

- 📱 **微信扫码登录**（ClawBot），绑定后像加了个好友
- 💬 **文字对话**：消息转发给 Claude Code，回复流式推回微信
- 🖼️ **文件双向传输**：你能发图片/文件给 Claude；Claude 生成的文件自动推回微信
- ⌨️ **"正在输入"指示**、长任务保活提示、超长回复自动分段
- 🧠 **会话续接**（`--resume`）、多斜杠命令、可切换工作目录与模型
- 🔁 **PM2 常驻**、断线自动重连、30 天日志轮转

### 环境要求

- **Windows 10/11**
- **Node.js ≥ 18**
- **Claude Code CLI** 已安装并完成登录（命令行能直接运行 `claude`）
- 一个支持 ClawBot 的微信账号

### 快速开始

```powershell
# 1. 安装依赖
cd D:\Claude\proj\HybridBox
npm install
npm run build

# 2. 跑自测
npm test

# 3. 微信扫码登录
npm run setup
# 终端显示二维码 → 用微信扫 → 确认

# 4. 检查状态
node dist/cli.js status

# 5. 前台启动（测试用）
npm start
# 保持终端开启，在手机微信里给机器人发消息即可！

# 6. 后台常驻（日常推荐）
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
```

### 微信端命令

| 命令 | 说明 |
|------|------|
| `/help` | 显示帮助 |
| `/status` | 查看当前状态（工作目录、模型、会话、运行状态） |
| `/clear` | 开启新会话（保留工作目录与模型） |
| `/reset` | 重置全部设置为默认 |
| `/cwd [路径]` | 查看 / 切换工作目录 |
| `/model [名称]` | 查看 / 切换模型（如 `claude-opus-4-8`） |
| `/prompt [文本]` | 查看 / 设置系统提示（`clear` 清除） |
| `/send <路径>` | 把本地文件发送到微信 |
| `/stop` | 中断当前正在执行的任务 |
| `/version` | 查看版本 |

### 数据与日志

所有数据存放在 `%USERPROFILE%\.hybridbox\`：

```
.hybridbox\
  accounts\        微信凭证
  sessions\        每个账号的会话状态与聊天历史
  logs\            按天滚动的日志（保留 30 天）
  tmp\             下载/生成的临时媒体
  config.json      全局配置
  get_updates_buf.json  长轮询游标
```

### 配置（`config.json`）

| 字段 | 含义 |
|------|------|
| `workingDirectory` | Claude Code 的默认工作目录 |
| `model` | 默认模型（可空） |
| `systemPrompt` | 追加的系统提示（可空） |
| `autoApprove` | 是否自动批准工具调用（默认 `true`，对应 `--dangerously-skip-permissions`） |

> ⚠️ `autoApprove: true` 会让 Claude Code 在你的电脑上**无需确认地执行命令与改文件**。这是远程无人值守的前提，但请确保只有你本人能给机器人发消息。

### 项目结构

```
src/
  cli.ts              命令行入口（setup / start / status）
  setup.ts            扫码登录向导
  daemon.ts           守护进程装配
  engine.ts           消息队列、命令分发、Claude 驱动、文件推送
  stream.ts           流式输出缓冲与分段
  session.ts          会话与聊天历史
  config.ts           配置读写
  constants.ts        常量
  logger.ts           日志（自动脱敏）
  store.ts            JSON 读写工具
  claude/
    provider.ts       spawn Claude Code 子进程（含 Windows 处理）
    parser.ts         stream-json (NDJSON) 解析
  commands/
    router.ts         斜杠命令路由
    handlers.ts       各命令实现
  wechat/
    api.ts            ilink Bot API 封装（7 个端点）
    login.ts          二维码登录
    monitor.ts        长轮询监听
    sender.ts         发送（分段/限流/typing/文件）
    upload.ts         加密上传到 CDN
    cdn.ts            CDN 下载解密
    media.ts          入站媒体下载 + 类型识别
    crypto.ts         AES-128-ECB / MD5 / 随机
    split.ts          文本分段
    http.ts           带超时的 HTTP
    accounts.ts       凭证持久化
    sync-buf.ts       游标持久化
    types.ts          协议类型
```

### 安全提示

- 凭证保存在本机 `%USERPROFILE%\.hybridbox\accounts\`，请勿外泄。
- 机器人会以你的身份执行 Claude Code，**任何能给它发消息的人都等同于能操作你的电脑**。
- 建议仅在受信任的微信账号间使用。
- 日志自动脱敏 Bearer token 和 bot 凭证。

### 致谢

架构参考自社区开源项目 `wechat-claude-code` 与 `claude-code-wechat-channel`（均为 macOS/Linux）。HybridBox 为 Windows 重新实现。

### License

MIT © 2025
