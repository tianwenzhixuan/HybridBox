import fs from "node:fs";
import path from "node:path";
import { ACCOUNTS_DIR } from "../constants.js";
import { readJson, writeJson } from "../store.js";
import type { Account } from "./types.js";

function accountFile(accountId: string): string {
  return path.join(ACCOUNTS_DIR, `${accountId}.json`);
}

export function saveAccount(account: Account): void {
  writeJson(accountFile(account.accountId), account);
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

/** Load the single active account (first one found). */
export function loadAccount(): Account | null {
  const all = listAccounts();
  return all[0] ?? null;
}

export function hasAccount(): boolean {
  return loadAccount() !== null;
}
