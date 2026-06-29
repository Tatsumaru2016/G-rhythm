const DB_NAME = 'g-rhythm-storage';
const STORE_NAME = 'handles';
const FILE_HANDLE_KEY = 'custom-music-last-file';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet<T>(key: string): Promise<T | null> {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
    req.onerror = () => reject(req.error);
  }));
}

function idbSet(key: string, value: unknown): Promise<void> {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

async function ensureReadPermission(handle: FileSystemHandle): Promise<boolean> {
  const opts: FileSystemHandlePermissionDescriptor = { mode: 'read' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  if ((await handle.requestPermission(opts)) === 'granted') return true;
  return false;
}

export async function loadLastCustomMusicFileHandle(): Promise<FileSystemFileHandle | null> {
  try {
    const handle = await idbGet<FileSystemFileHandle>(FILE_HANDLE_KEY);
    if (!handle || handle.kind !== 'file') return null;
    if (!(await ensureReadPermission(handle))) return null;
    return handle;
  } catch {
    return null;
  }
}

export async function saveLastCustomMusicFileHandle(handle: FileSystemFileHandle): Promise<void> {
  try {
    await idbSet(FILE_HANDLE_KEY, handle);
  } catch { /* ignore */ }
}
