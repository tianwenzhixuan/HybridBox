import { log } from "./logger.js";
import { createApi, type IlinkApi } from "./wechat/api.js";
import { createMonitor, type Monitor } from "./wechat/monitor.js";
import { Sender } from "./wechat/sender.js";
import { listAccounts, removeAccount } from "./wechat/accounts.js";
import type { Account } from "./wechat/types.js";
import type { Engine } from "./engine.js";

export interface AccountRuntime {
  account: Account;
  api: IlinkApi;
  sender: Sender;
  monitor: Monitor;
}

/**
 * Owns the per-account runtime (api + sender + long-poll monitor) for every
 * bound WeChat user, and lets us add/remove accounts at runtime — no daemon
 * restart needed (restarting would kill the active process).
 */
export class AccountManager {
  private runtimes = new Map<string, AccountRuntime>();

  constructor(private engine: Engine) {}

  private keyOf(account: Account): string {
    return account.userId || account.accountId;
  }

  /** Start monitors for every account currently on disk. */
  startAll(): void {
    const accounts = listAccounts();
    if (accounts.length === 0) {
      log.warn("No accounts bound yet — run `hybridbox setup` first.");
      return;
    }
    for (const account of accounts) this.start(account);
    log.info(`AccountManager: ${this.runtimes.size} account(s) online.`);
  }

  /** Bring one account online. Idempotent by userId. */
  start(account: Account): void {
    const key = this.keyOf(account);
    if (this.runtimes.has(key)) {
      log.warn(`Account already online: ${key}`);
      return;
    }
    const api = createApi(account);
    const sender = new Sender(api);
    const monitor = createMonitor(api, {
      onMessage: (m) => this.engine.enqueue(account, sender, m),
    });
    this.runtimes.set(key, { account, api, sender, monitor });
    void monitor.run();
    log.info(`Account online: ${key}`);
  }

  /** Take one account offline and delete its credentials. */
  remove(userId: string): boolean {
    const rt = this.runtimes.get(userId);
    if (rt) {
      rt.monitor.stop();
      this.runtimes.delete(userId);
    }
    const deleted = removeAccount(userId);
    return Boolean(rt) || deleted;
  }

  stopAll(): void {
    for (const rt of this.runtimes.values()) rt.monitor.stop();
    this.runtimes.clear();
  }

  list(): Account[] {
    return [...this.runtimes.values()].map((r) => r.account);
  }

  count(): number {
    return this.runtimes.size;
  }

  isOnline(userId: string): boolean {
    return this.runtimes.has(userId);
  }
}
