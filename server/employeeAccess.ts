import { getFirestore } from 'firebase-admin/firestore';
import { ensureFirebaseAdmin, getClubIdServer, isFirebaseAdminReady } from './auth/firebaseAdmin';

/** עובדים ללא השדה נחשבים פעילים (תאימות לאחור) */
export function isEmployeeActiveFlag(value: unknown): boolean {
  return value !== false;
}

/**
 * בודק ב-Firestore אם העובד פעיל לגישת פורטל.
 * מחזיר null אם מותר; אחרת קוד שגיאה.
 * עובד חסר / Admin לא זמין — לא חוסמים (תאימות מקומית).
 */
export async function getEmployeePortalBlockReason(
  employeeId: string
): Promise<'employee_inactive' | null> {
  if (!employeeId || !isFirebaseAdminReady()) {
    return null;
  }
  try {
    ensureFirebaseAdmin();
    const snap = await getFirestore()
      .collection('clubs')
      .doc(getClubIdServer())
      .collection('employees')
      .doc(employeeId)
      .get();
    if (!snap.exists) {
      return null;
    }
    const data = snap.data() || {};
    if (!isEmployeeActiveFlag(data.isActive)) {
      return 'employee_inactive';
    }
    return null;
  } catch (err) {
    console.warn('[employeeAccess] check failed', err);
    return null;
  }
}
