import fs from "node:fs";
import path from "node:path";
import { MAX_SEND_FILE_BYTES, VERSION } from "../constants.js";
import { loadConfig, updateConfig } from "../config.js";
import type { SessionStore } from "../session.js";

export interface CommandContext {
  store: SessionStore;
  args: string;
  /** The WeChat user ID of the sender. */
  userId: string;
  /** True when the sender is the bot owner (may manage the whitelist). */
  isOwner: boolean;
  /** Abort the active Claude query, if any. Returns true if something stopped. */
  requestStop: () => boolean;
  /** Upload + send a local file to the user. */
  sendLocalFile: (filePath: string) => Promise<void>;
}

/** Returns reply text, or null when the handler already responded itself. */
export type CommandHandler = (ctx: CommandContext) => Promise<string | null>;

const HELP = `🤖 HybridBox 命令列表
/help            显示本帮助
/status          查看当前状态
/clear           开启新会话（保留工作目录与模型）
/reset           重置全部设置为默认
/cwd [路径]       查看 / 切换工作目录
/model [名称]     查看 / 切换模型
/prompt [文本]    查看 / 设置系统提示（"clear" 清除）
/send <路径>      把本地文件发送到微信
/stop            中断当前正在执行的任务
/whitelist       管理白名单（add/remove/list/myid）
/version         查看版本

💡 直接发送文字、图片或文件，即可与这台电脑上的 Claude Code 对话。`;

export const handleHelp: CommandHandler = async () => HELP;

export const handleVersion: CommandHandler = async () => `HybridBox v${VERSION}`;

export const handleStatus: CommandHandler = async ({ store }) => {
  const s = store.get();
  return [
    "📊 当前状态",
    `工作目录：${s.workingDirectory}`,
    `模型：${s.model || "(默认)"}`,
    `系统提示：${s.systemPrompt ? "已自定义" : "(默认)"}`,
    `会话：${s.sdkSessionId ? s.sdkSessionId.slice(0, 8) + "…" : "(新会话)"}`,
    `状态：${s.state === "processing" ? "执行中" : "空闲"}`,
    `历史消息：${s.chatHistory.length} 条`,
  ].join("\n");
};

export const handleClear: CommandHandler = async ({ store }) => {
  store.clear();
  return "✅ 已开启新会话（保留工作目录与模型设置）。";
};

export const handleReset: CommandHandler = async ({ store }) => {
  store.reset();
  return "✅ 已重置全部设置为默认。";
};

export const handleStop: CommandHandler = async ({ requestStop }) => {
  const stopped = requestStop();
  return stopped ? "🛑 已中断当前任务。" : "当前没有正在执行的任务。";
};

export const handleCwd: CommandHandler = async ({ store, args }) => {
  const p = args.trim();
  if (!p) return `📁 当前工作目录：${store.get().workingDirectory}`;
  const resolved = path.resolve(p);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    return `❌ 目录不存在：${resolved}`;
  }
  store.patch({ workingDirectory: resolved });
  updateConfig({ workingDirectory: resolved });
  return `✅ 工作目录已切换到：${resolved}`;
};

export const handleModel: CommandHandler = async ({ store, args }) => {
  const m = args.trim();
  if (!m) return `🧠 当前模型：${store.get().model || "(默认)"}`;
  store.patch({ model: m });
  updateConfig({ model: m });
  return `✅ 模型已切换为：${m}`;
};

export const handlePrompt: CommandHandler = async ({ store, args }) => {
  const t = args.trim();
  if (!t) return `📝 当前系统提示：${store.get().systemPrompt || "(默认)"}`;
  if (t === "clear" || t === "清除") {
    store.patch({ systemPrompt: undefined });
    updateConfig({ systemPrompt: undefined });
    return "✅ 已清除自定义系统提示。";
  }
  store.patch({ systemPrompt: t });
  updateConfig({ systemPrompt: t });
  return "✅ 已设置自定义系统提示。";
};

export const handleWhitelist: CommandHandler = async ({ args, userId, isOwner }) => {
  const cfg = loadConfig();
  const wl = cfg.whitelist ?? [];
  const parts = args.trim().split(/\s+/);
  const sub = parts[0]?.toLowerCase();

  if (!sub || sub === "list") {
    if (wl.length === 0) return "📋 白名单为空（允许所有人使用）。";
    return `📋 白名单（${wl.length} 人）：\n${wl
      .map((id, i) => `${i + 1}. ${id}${id === cfg.owner ? "（机主）" : ""}`)
      .join("\n")}`;
  }

  if (sub === "myid") {
    return `🆔 你的用户 ID：${userId}`;
  }

  if (sub === "add" || sub === "remove" || sub === "rm") {
    if (!isOwner) return "⛔ 仅机主可修改白名单。";

    if (sub === "add") {
      const id = parts[1];
      if (!id) return "用法：/whitelist add <用户ID>\n提示：发 /whitelist myid 查看自己的 ID";
      if (wl.includes(id)) return `⚠️ ${id} 已在白名单中。`;
      updateConfig({ whitelist: [...wl, id] });
      return `✅ 已添加 ${id} 到白名单。`;
    }

    const id = parts[1];
    if (!id) return "用法：/whitelist remove <用户ID>";
    if (id === cfg.owner) return "⛔ 不能把机主移出白名单。";
    if (!wl.includes(id)) return `⚠️ ${id} 不在白名单中。`;
    updateConfig({ whitelist: wl.filter((x) => x !== id) });
    return `✅ 已将 ${id} 从白名单移除。`;
  }

  return "用法：/whitelist [list|add|remove|myid]";
};

export const handleSend: CommandHandler = async ({ store, args, sendLocalFile }) => {
  const p = args.trim();
  if (!p) return "用法：/send <文件路径>";
  const resolved = path.isAbsolute(p) ? p : path.resolve(store.get().workingDirectory, p);
  if (!fs.existsSync(resolved)) return `❌ 文件不存在：${resolved}`;
  const size = fs.statSync(resolved).size;
  if (size > MAX_SEND_FILE_BYTES) {
    return `❌ 文件过大（${(size / 1048576).toFixed(1)}MB），上限 25MB。`;
  }
  await sendLocalFile(resolved);
  return null;
};
