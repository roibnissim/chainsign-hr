import type { EmployeeFileDocument } from '../types';
import { useFirebaseStorage, useFirestore } from '../config/featureFlags';
import { isFirebaseConfigured } from '../lib/firebase';
import { dataUrlToBlob, uploadEmployeeFile } from './storage/clubStorage';
import { upsertFileDocument } from './firestore/hrStore';

/**
 * מעלה קובץ Data-URL ל-Storage (אם פעיל) ושומר את המסמך ב-Firestore
 * לפני סימון synced בשרת — כדי שהתיק האישי של המנהל לא יאבד את המסמך.
 */
export async function persistImportedFileDocument(
  doc: EmployeeFileDocument
): Promise<EmployeeFileDocument> {
  let next: EmployeeFileDocument = { ...doc };
  const storageOn = useFirebaseStorage() && isFirebaseConfigured();
  const firestoreOn = useFirestore() && isFirebaseConfigured();

  if (storageOn && next.fileDataUrl?.startsWith('data:')) {
    try {
      const { blob, contentType } = await dataUrlToBlob(next.fileDataUrl);
      const up = await uploadEmployeeFile({
        employeeId: next.employeeId,
        fileId: next.id,
        fileName: next.fileName || `${next.title || 'document'}.bin`,
        data: blob,
        contentType,
      });
      next = {
        ...next,
        fileDataUrl: up.downloadURL,
        storagePath: up.storagePath,
      };
    } catch (err) {
      console.error('persistImportedFileDocument upload failed', err);
      // ממשיכים עם Data URL מקומי אם אפשר; ב-Firestore הוא ייחתך
    }
  }

  if (firestoreOn) {
    await upsertFileDocument(next);
  }

  return next;
}
