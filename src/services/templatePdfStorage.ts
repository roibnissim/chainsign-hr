const DB_NAME = 'club_template_pdfs';
const DB_VERSION = 1;
const STORE_TEMPLATES = 'templates';
const STORE_AGREEMENTS = 'agreements';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_TEMPLATES)) {
        db.createObjectStore(STORE_TEMPLATES);
      }
      if (!db.objectStoreNames.contains(STORE_AGREEMENTS)) {
        db.createObjectStore(STORE_AGREEMENTS);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

function idbReq<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

async function useRemoteStorage(): Promise<boolean> {
  const { useFirebaseStorage } = await import('../config/featureFlags');
  const { isFirebaseConfigured } = await import('../lib/firebase');
  return useFirebaseStorage() && isFirebaseConfigured();
}

export async function saveTemplatePdf(templateId: string, data: ArrayBuffer | Uint8Array): Promise<void> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const localCopy = new Uint8Array(bytes.byteLength);
  localCopy.set(bytes);

  // תמיד שומרים מקומית — גם אם העלאה לענן נכשלת
  const db = await openDb();
  const tx = db.transaction(STORE_TEMPLATES, 'readwrite');
  await idbReq(tx.objectStore(STORE_TEMPLATES).put(localCopy, templateId));
  db.close();

  if (await useRemoteStorage()) {
    try {
      const { uploadTemplatePdf } = await import('./storage/clubStorage');
      await uploadTemplatePdf(templateId, localCopy);
    } catch (err) {
      console.error('uploadTemplatePdf failed', err);
      throw err;
    }
  }
}

export async function getTemplatePdf(templateId: string): Promise<Uint8Array | null> {
  const toCopy = (raw: ArrayBuffer | Uint8Array): Uint8Array => {
    const src = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    const copy = new Uint8Array(src.byteLength);
    copy.set(src);
    return copy;
  };

  // קודם מטמון מקומי — חוסך הורדה חוזרת מ-Storage
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_TEMPLATES, 'readonly');
    const result = await idbReq(tx.objectStore(STORE_TEMPLATES).get(templateId));
    db.close();
    if (result) {
      const copy = toCopy(result as ArrayBuffer | Uint8Array);
      if (copy.byteLength > 0) return copy;
    }
  } catch (err) {
    console.warn('getTemplatePdf idb miss', err);
  }

  if (await useRemoteStorage()) {
    const { getFirebaseStorage } = await import('../lib/firebase');
    const { getClubId } = await import('../config/club');
    const path = `clubs/${getClubId()}/templates/${templateId}.pdf`;
    const storage = getFirebaseStorage();

    try {
      const { getBytes, ref } = await import('firebase/storage');
      const bytes = await getBytes(ref(storage, path));
      const copy = toCopy(bytes);
      try {
        const db = await openDb();
        const tx = db.transaction(STORE_TEMPLATES, 'readwrite');
        await idbReq(tx.objectStore(STORE_TEMPLATES).put(copy, templateId));
        db.close();
      } catch {
        // ignore cache write
      }
      return copy;
    } catch (err) {
      console.warn('getTemplatePdf getBytes failed, trying downloadURL', err);
      try {
        const { getDownloadURL, ref } = await import('firebase/storage');
        const url = await getDownloadURL(ref(storage, path));
        const res = await fetch(url);
        if (!res.ok) throw new Error(`download ${res.status}`);
        const buf = await res.arrayBuffer();
        const copy = toCopy(buf);
        try {
          const db = await openDb();
          const tx = db.transaction(STORE_TEMPLATES, 'readwrite');
          await idbReq(tx.objectStore(STORE_TEMPLATES).put(copy, templateId));
          db.close();
        } catch {
          // ignore
        }
        return copy;
      } catch (err2) {
        console.warn('getTemplatePdf remote miss', err2);
      }
    }
  }
  return null;
}

export async function deleteTemplatePdf(templateId: string): Promise<void> {
  if (await useRemoteStorage()) {
    const { deleteStoragePath } = await import('./storage/clubStorage');
    const { getClubId } = await import('../config/club');
    await deleteStoragePath(`clubs/${getClubId()}/templates/${templateId}.pdf`);
  }
  const db = await openDb();
  const tx = db.transaction(STORE_TEMPLATES, 'readwrite');
  const store = tx.objectStore(STORE_TEMPLATES);
  await idbReq(store.delete(templateId));
  db.close();
}

export async function saveAgreementPdf(agreementId: string, data: ArrayBuffer | Uint8Array): Promise<void> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (await useRemoteStorage()) {
    const { uploadAgreementPdf } = await import('./storage/clubStorage');
    await uploadAgreementPdf(agreementId, bytes);
  }
  const db = await openDb();
  const tx = db.transaction(STORE_AGREEMENTS, 'readwrite');
  const store = tx.objectStore(STORE_AGREEMENTS);
  await idbReq(store.put(bytes, agreementId));
  db.close();
}

export async function getAgreementPdf(agreementId: string): Promise<Uint8Array | null> {
  if (await useRemoteStorage()) {
    try {
      const { getFirebaseStorage } = await import('../lib/firebase');
      const { getClubId } = await import('../config/club');
      const { getBytes, ref } = await import('firebase/storage');
      const path = `clubs/${getClubId()}/agreements/${agreementId}.pdf`;
      const bytes = await getBytes(ref(getFirebaseStorage(), path));
      return new Uint8Array(bytes);
    } catch {
      // fall through
    }
  }
  const db = await openDb();
  const tx = db.transaction(STORE_AGREEMENTS, 'readonly');
  const store = tx.objectStore(STORE_AGREEMENTS);
  const result = await idbReq(store.get(agreementId));
  db.close();
  if (!result) return null;
  return result instanceof Uint8Array ? result : new Uint8Array(result);
}

export async function deleteAgreementPdf(agreementId: string): Promise<void> {
  if (await useRemoteStorage()) {
    const { deleteStoragePath } = await import('./storage/clubStorage');
    const { getClubId } = await import('../config/club');
    await deleteStoragePath(`clubs/${getClubId()}/agreements/${agreementId}.pdf`);
  }
  const db = await openDb();
  const tx = db.transaction(STORE_AGREEMENTS, 'readwrite');
  const store = tx.objectStore(STORE_AGREEMENTS);
  await idbReq(store.delete(agreementId));
  db.close();
}

export function uint8ToBlob(bytes: Uint8Array, type = 'application/pdf'): Blob {
  return new Blob([bytes as BlobPart], { type });
}

export async function fileToUint8Array(file: File): Promise<Uint8Array> {
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
}
