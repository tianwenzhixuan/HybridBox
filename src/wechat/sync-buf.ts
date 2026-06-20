import { SYNC_BUF_FILE } from "../constants.js";
import { readJson, writeJson } from "../store.js";

interface SyncBufState {
  buf: string;
}

export function loadSyncBuf(): string {
  return readJson<SyncBufState>(SYNC_BUF_FILE, { buf: "" }).buf;
}

export function saveSyncBuf(buf: string): void {
  writeJson(SYNC_BUF_FILE, { buf });
}
