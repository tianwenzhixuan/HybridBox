import fs from "node:fs";
import path from "node:path";
import { ACCOUNTS_DIR } from "../constants.js";
import { readJson, writeJson } from "../store.js";
import type { Account } from "./types.js";

/** Sanitize an id for safe use as a Windows filename. */
function sanitize(id: string): string {
  return id.replace(/[^A-Za-z0-9_.-]/g, "_") || "unknown";
}

/**
 * Accounts are keyed by the WeChat userId (the scanner's identity). In the
 * multi-account model each user scans their own QR, so userId is what makes
 * them unique — not the bot/app id, which may be shared across users.
 */
function accountFile(userId: string): string {
  return path.join(ACCOUNTS_DIR, `${sanitize(userId)}.json`);
}

export function saveAccount(account: Account): void {
  writeJson(accountFile(account.userId || account.accountId), account);
}

export function listAccounts(): Account[] {
  try {
    return fs
      .readdirSync(ACCOUNTS_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => readJson<Account | null>(path.join(ACCOUNTS_DIR, f), null))
      .filter((a): a is Account => a !== null);
  } catch {
    return [];
  }
}

export function getAccount(userId: string): Account | null {
  return listAccounts().find((a) => a.userId === userId) ?? null;
}

/** Delete an account by userId. Returns true if a file was removed. */
export function removeAccount(userId: string): boolean {
  let removed = false;
  const f = accountFile(userId);
  if (fs.existsSync(f)) {
    fs.unlinkSync(f);
    removed = true;
  }
  // Fallback: legacy files named by accountId.
  for (const acc of listAccounts()) {
    if (acc.userId === userId) {
      const legacy = path.join(ACCOUNTS_DIR, `${sanitize(acc.accountId)}.json`);
      if (fs.existsSync(legacy)) {
        fs.unlinkSync(legacy);
        removed = true;
      }
    }
  }
  return removed;
}

/** First account on disk — used as owner fallback only. */
export function loadAccount(): Account | null {
  return listAccounts()[0] ?? null;
}

export function hasAccount(): boolean {
  return listAccounts().length > 0;
}

export function countAccounts(): number {
  return listAccounts().length;
}
