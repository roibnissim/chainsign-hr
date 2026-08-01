import { authHeadersAsync } from './authGateway';
import { useFirestore } from '../config/featureFlags';
import { isFirebaseConfigured } from '../lib/firebase';
import { removeFileDocument } from './firestore/hrStore';

/** מוחק מסמך מתיק המנהל + מפורטל העובד (הזמנת onboarding) */
export async function deleteEmployeeFileDocument(docId: string): Promise<void> {
  if (useFirestore() && isFirebaseConfigured()) {
    try {
      await removeFileDocument(docId);
    } catch (err) {
      console.error('removeFileDocument failed', err);
    }
  }

  try {
    const headers = await authHeadersAsync({ 'Content-Type': 'application/json' });
    await fetch('/api/onboarding-invites/remove-documents', {
      method: 'POST',
      headers,
      body: JSON.stringify({ documentIds: [docId] }),
    });
  } catch (err) {
    console.error('remove from onboarding portal failed', err);
  }
}
