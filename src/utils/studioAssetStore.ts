import { createStudioId } from '../engine/sceneEngine';

export const STUDIO_ASSETS_DB_NAME = 'optica_studio_assets_db';
export const STUDIO_ASSETS_DB_VERSION = 1;
export const STUDIO_ASSETS_STORE_NAME = 'assets';
export const STUDIO_ASSET_REF_PREFIX = 'optica-asset:';

interface StoredAssetRecord {
  id: string;
  blob: Blob;
  mimeType: string;
  size: number;
  createdAt: number;
}

const memoryAssetBlobs = new Map<string, Blob>();

export function buildStudioAssetRef(assetId: string): string {
  const clean = assetId.trim() || createStudioId('asset');
  return clean.startsWith(STUDIO_ASSET_REF_PREFIX)
    ? clean
    : `${STUDIO_ASSET_REF_PREFIX}${clean}`;
}

export function isStudioAssetRef(ref: string | null | undefined): boolean {
  return typeof ref === 'string' && ref.startsWith(STUDIO_ASSET_REF_PREFIX);
}

export function parseStudioAssetRef(ref: string | null | undefined): string | null {
  if (!isStudioAssetRef(ref)) return null;
  const id = ref!.slice(STUDIO_ASSET_REF_PREFIX.length).trim();
  return id.length > 0 ? id : null;
}

function openStudioAssetsDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(STUDIO_ASSETS_DB_NAME, STUDIO_ASSETS_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STUDIO_ASSETS_STORE_NAME)) {
          db.createObjectStore(STUDIO_ASSETS_STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveStudioAssetBlob(blob: Blob, preferredId?: string): Promise<string> {
  const rawId =
    parseStudioAssetRef(preferredId) ??
    (preferredId?.trim() || createStudioId('asset'));
  const ref = buildStudioAssetRef(rawId);

  memoryAssetBlobs.set(rawId, blob);

  const db = await openStudioAssetsDb();
  if (!db) {
    return ref;
  }

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STUDIO_ASSETS_STORE_NAME, 'readwrite');
      const store = tx.objectStore(STUDIO_ASSETS_STORE_NAME);
      const record: StoredAssetRecord = {
        id: rawId,
        blob,
        mimeType: blob.type || 'application/octet-stream',
        size: blob.size,
        createdAt: Date.now(),
      };
      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });

  return ref;
}

export async function loadStudioAssetBlob(assetRef: string): Promise<Blob | null> {
  const rawId = parseStudioAssetRef(assetRef);
  if (!rawId) return null;

  const inMem = memoryAssetBlobs.get(rawId);
  if (inMem) {
    return inMem;
  }

  const db = await openStudioAssetsDb();
  if (!db) return null;

  return new Promise<Blob | null>((resolve) => {
    try {
      const tx = db.transaction(STUDIO_ASSETS_STORE_NAME, 'readonly');
      const store = tx.objectStore(STUDIO_ASSETS_STORE_NAME);
      const req = store.get(rawId);
      req.onsuccess = () => {
        const rec = req.result as StoredAssetRecord | undefined;
        if (rec?.blob) {
          memoryAssetBlobs.set(rawId, rec.blob);
          resolve(rec.blob);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function deleteStudioAssetBlob(assetRef: string): Promise<void> {
  const rawId = parseStudioAssetRef(assetRef);
  if (!rawId) return;

  memoryAssetBlobs.delete(rawId);

  const db = await openStudioAssetsDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STUDIO_ASSETS_STORE_NAME, 'readwrite');
      tx.objectStore(STUDIO_ASSETS_STORE_NAME).delete(rawId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}
