import type { CapturedMediaItem, FilterPresetId, VisualEffectId } from '../types/camera';

const DB_NAME = 'optica_studio_db';
const DB_VERSION = 1;
const STORE_NAME = 'media_items';

interface StoredRecord {
  id: string;
  type: CapturedMediaItem['type'];
  blob: Blob;
  mimeType: string;
  createdAt: number;
  width: number;
  height: number;
  durationSec?: number;
  filterId: FilterPresetId;
  effectId: VisualEffectId;
  label: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveMediaItem(item: CapturedMediaItem): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record: StoredRecord = {
        id: item.id,
        type: item.type,
        blob: item.blob,
        mimeType: item.mimeType,
        createdAt: item.createdAt,
        width: item.width,
        height: item.height,
        durationSec: item.durationSec,
        filterId: item.filterId,
        effectId: item.effectId,
        label: item.label,
      };
      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Graceful fallback: session state remains active even if storage is restricted
  }
}

export async function loadAllMediaItems(): Promise<CapturedMediaItem[]> {
  try {
    const db = await openDB();
    const records = await new Promise<StoredRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as StoredRecord[]) || []);
      req.onerror = () => reject(req.error);
    });

    return records
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((rec) => ({
        ...rec,
        url: URL.createObjectURL(rec.blob),
      }));
  } catch {
    return [];
  }
}

export async function deleteMediaItemFromDB(id: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore storage error
  }
}

export async function clearAllMediaFromDB(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore storage error
  }
}
