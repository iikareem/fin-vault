import { api, AUTH_REQUIRED } from "./api";
import type { Space } from "./space";

const DB_NAME = "fin-vault-offline";
const DB_VERSION = 2;
const QUEUE_STORE = "tx-queue";
const SNAPSHOT_STORE = "add-snapshots";
const HOME_STORE = "home-snapshots";
const SESSION_KEY = "fb_me_cache";

export const OFFLINE_QUEUE_CHANGED = "fb-offline-queue-changed";

export type QueuedTx = {
  id: string;
  path: string;
  body: string;
  createdAt: number;
};

export type AddSnapshot = {
  householdId: string;
  accounts: unknown[];
  categories: unknown[];
  savedAt: number;
};

export type HomeSnapshot = {
  householdId: string;
  kind: "PERSONAL" | "HOUSE";
  accounts: unknown[];
  txs: unknown[];
  summary: unknown | null;
  savedAt: number;
};

export type SessionCache = {
  id: string;
  name: string;
  nameAr?: string;
  preferredCurrency?: string;
  theme?: string;
  budgetMonthStartDay?: number;
  spaces: Space[];
  space: Space | null;
  personalOnly?: boolean;
  savedAt: number;
};

function notifyQueueChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OFFLINE_QUEUE_CHANGED));
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        db.createObjectStore(SNAPSHOT_STORE, { keyPath: "householdId" });
      }
      if (!db.objectStoreNames.contains(HOME_STORE)) {
        db.createObjectStore(HOME_STORE, { keyPath: "householdId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

function storeTx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        let request: IDBRequest<T> | undefined;
        try {
          const result = run(store);
          if (result) request = result;
        } catch (e) {
          reject(e);
          return;
        }
        tx.oncomplete = () => resolve(request?.result);
        tx.onerror = () => reject(tx.error ?? new Error("IndexedDB tx failed"));
        if (request) {
          request.onerror = () =>
            reject(request!.error ?? new Error("IndexedDB request failed"));
        }
      }),
  );
}

export function isOfflineNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message === "NETWORK_ERROR" || message === "REQUEST_TIMEOUT";
}

export function isLikelyOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function saveSessionCache(me: Omit<SessionCache, "savedAt">): void {
  if (typeof window === "undefined") return;
  try {
    const payload: SessionCache = { ...me, savedAt: Date.now() };
    localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function loadSessionCache(): SessionCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionCache;
    if (!parsed?.id || !Array.isArray(parsed.spaces)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function enqueueTransaction(
  path: string,
  body: unknown,
): Promise<QueuedTx> {
  const item: QueuedTx = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    path,
    body: typeof body === "string" ? body : JSON.stringify(body),
    createdAt: Date.now(),
  };
  await storeTx(QUEUE_STORE, "readwrite", (store) => store.put(item));
  notifyQueueChanged();
  return item;
}

export async function listQueuedTransactions(): Promise<QueuedTx[]> {
  const items = (await storeTx<QueuedTx[]>(QUEUE_STORE, "readonly", (store) =>
    store.getAll(),
  )) as QueuedTx[] | undefined;
  return (items ?? []).sort((a, b) => a.createdAt - b.createdAt);
}

export async function pendingCount(): Promise<number> {
  const items = await listQueuedTransactions();
  return items.length;
}

async function removeQueued(id: string): Promise<void> {
  await storeTx(QUEUE_STORE, "readwrite", (store) => store.delete(id));
  notifyQueueChanged();
}

export type FlushResult = {
  synced: number;
  remaining: number;
  stoppedForAuth: boolean;
};

/** Posts queued wallet transactions in order. Safe to call often. */
export async function flushOfflineQueue(): Promise<FlushResult> {
  if (isLikelyOffline()) {
    const remaining = await pendingCount();
    return { synced: 0, remaining, stoppedForAuth: false };
  }

  const items = await listQueuedTransactions();
  let synced = 0;
  let stoppedForAuth = false;

  for (const item of items) {
    try {
      await api(item.path, {
        method: "POST",
        body: item.body,
      });
      await removeQueued(item.id);
      synced += 1;
    } catch (error) {
      if (error instanceof Error && error.message === AUTH_REQUIRED) {
        stoppedForAuth = true;
        break;
      }
      if (isOfflineNetworkError(error)) {
        break;
      }
      // Drop permanent client/server validation failures so the queue cannot stall.
      await removeQueued(item.id);
    }
  }

  const remaining = await pendingCount();
  return { synced, remaining, stoppedForAuth };
}

export async function saveAddSnapshot(
  householdId: string,
  accounts: unknown[],
  categories: unknown[],
): Promise<void> {
  const snapshot: AddSnapshot = {
    householdId,
    accounts,
    categories,
    savedAt: Date.now(),
  };
  await storeTx(SNAPSHOT_STORE, "readwrite", (store) => store.put(snapshot));
}

export async function loadAddSnapshot(
  householdId: string,
): Promise<AddSnapshot | null> {
  const snapshot = (await storeTx<AddSnapshot>(
    SNAPSHOT_STORE,
    "readonly",
    (store) => store.get(householdId),
  )) as AddSnapshot | undefined;
  return snapshot ?? null;
}

export async function saveHomeSnapshot(
  snapshot: Omit<HomeSnapshot, "savedAt">,
): Promise<void> {
  await storeTx(HOME_STORE, "readwrite", (store) =>
    store.put({ ...snapshot, savedAt: Date.now() }),
  );
}

export async function loadHomeSnapshot(
  householdId: string,
): Promise<HomeSnapshot | null> {
  const snapshot = (await storeTx<HomeSnapshot>(
    HOME_STORE,
    "readonly",
    (store) => store.get(householdId),
  )) as HomeSnapshot | undefined;
  return snapshot ?? null;
}
