import { migrate, type SaveData } from './schema';

/**
 * IndexedDB 存档。
 * - profiles: 每个角色一条，key = 角色 id
 * - backups:  每次保存同时写一份快照，每个角色保留最近 MAX_BACKUPS 份，存档损坏时可回滚
 */
const DB_NAME = 'nce-dungeon';
const DB_VER = 1;
const MAX_BACKUPS = 10;

export interface BackupEntry {
  key?: number;
  profileId: string;
  at: number;
  data: SaveData;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('profiles')) db.createObjectStore('profiles', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('backups')) {
        const b = db.createObjectStore('backups', { keyPath: 'key', autoIncrement: true });
        b.createIndex('profileId', 'profileId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function done(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function result<T>(req: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** 请求浏览器不要在空间紧张时清理本站数据 */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      return await navigator.storage.persist();
    }
    return true;
  } catch {
    return false;
  }
}

export async function listProfiles(): Promise<SaveData[]> {
  const db = await open();
  const all = await result(db.transaction('profiles').objectStore('profiles').getAll());
  const out: SaveData[] = [];
  for (const raw of all) {
    try {
      out.push(migrate(raw));
    } catch (e) {
      console.warn('跳过无法读取的存档', e);
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProfile(id: string): Promise<SaveData | null> {
  const db = await open();
  const raw = await result(db.transaction('profiles').objectStore('profiles').get(id));
  if (!raw) return null;
  try {
    return migrate(raw);
  } catch {
    return null;
  }
}

/** keepTime：从云端拉下来的存档保留原来的修改时间（不当作“刚刚改过”） */
export async function saveProfile(data: SaveData, keepTime = false) {
  if (!keepTime) data.updatedAt = Date.now();
  const snapshot = structuredClone(data);
  const db = await open();
  const tx = db.transaction(['profiles', 'backups'], 'readwrite');
  tx.objectStore('profiles').put(snapshot);
  const backups = tx.objectStore('backups');
  backups.add({ profileId: data.id, at: data.updatedAt, data: snapshot } satisfies BackupEntry);
  // 只保留最近 MAX_BACKUPS 份
  const keysReq = backups.index('profileId').getAllKeys(IDBKeyRange.only(data.id));
  keysReq.onsuccess = () => {
    const keys = keysReq.result as number[];
    keys.sort((a, b) => a - b);
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_BACKUPS))) backups.delete(k);
  };
  await done(tx);
}

export async function deleteProfile(id: string) {
  const db = await open();
  const tx = db.transaction(['profiles', 'backups'], 'readwrite');
  tx.objectStore('profiles').delete(id);
  const backups = tx.objectStore('backups');
  const keysReq = backups.index('profileId').getAllKeys(IDBKeyRange.only(id));
  keysReq.onsuccess = () => keysReq.result.forEach((k) => backups.delete(k));
  await done(tx);
}

export async function listBackups(profileId: string): Promise<BackupEntry[]> {
  const db = await open();
  const idx = db.transaction('backups').objectStore('backups').index('profileId');
  const all = (await result(idx.getAll(IDBKeyRange.only(profileId)))) as BackupEntry[];
  return all.sort((a, b) => (b.key ?? 0) - (a.key ?? 0));
}

/** 导出为 JSON 文本（用于下载备份文件） */
export function exportSave(data: SaveData) {
  return JSON.stringify({ app: 'nce-dungeon', exportedAt: Date.now(), save: data }, null, 2);
}

/** 从备份文件导入；同 id 的角色会被覆盖 */
export function parseImport(text: string): SaveData {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error('文件不是有效的存档');
  }
  const wrapped = obj as { app?: string; save?: unknown };
  return migrate(wrapped.app === 'nce-dungeon' ? wrapped.save : obj);
}

/** 测试用：重置连接 */
export function _resetForTests() {
  dbPromise = null;
}
