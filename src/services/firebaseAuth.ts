import {
  onAuthStateChanged,
  signInWithCredential,
  signInWithCustomToken,
  signOut,
  GoogleAuthProvider,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  deleteDoc,
  updateDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getClubId } from '../config/club';
import type { AuthUser, SystemRole } from '../services/authApi';
import { getFirebaseAuth, getFirebaseFirestore, getFirebaseFunctions, isFirebaseConfigured } from '../lib/firebase';

export async function mapFirebaseUser(user: User): Promise<AuthUser | null> {
  const token = await user.getIdTokenResult(true);
  const role = (token.claims.role as SystemRole | undefined) || null;
  const clubId = token.claims.clubId as string | undefined;

  if (!role || (role !== 'SYSTEM_ADMIN' && role !== 'MANAGER')) {
    return null;
  }
  if (clubId && clubId !== getClubId()) {
    return null;
  }

  let profile: Partial<AuthUser> | null = null;
  try {
    profile = await getUserProfile(user.uid);
  } catch {
    // Rules/profile doc may be missing on first login — claims are enough
    profile = null;
  }

  return {
    id: user.uid,
    email: profile?.email || user.email || '',
    name: profile?.name || user.displayName || user.email || 'משתמש',
    picture: profile?.picture || user.photoURL || undefined,
    phone: profile?.phone || (typeof token.claims.phone === 'string' ? token.claims.phone : undefined),
    notificationEmail: profile?.notificationEmail || undefined,
    notifyEmployeeUpdates: profile?.notifyEmployeeUpdates !== false,
    notifyAgreementSigned: profile?.notifyAgreementSigned !== false,
    role,
    createdAt: profile?.createdAt || user.metadata.creationTime || new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  };
}

async function getUserProfile(uid: string): Promise<Partial<AuthUser> | null> {
  const ref = doc(getFirebaseFirestore(), 'clubs', getClubId(), 'users', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as Partial<AuthUser>;
}

export function subscribeFirebaseAuth(
  onUser: (user: AuthUser | null) => void
): () => void {
  if (!isFirebaseConfigured()) {
    onUser(null);
    return () => undefined;
  }
  return onAuthStateChanged(getFirebaseAuth(), async (fbUser) => {
    if (!fbUser) {
      onUser(null);
      return;
    }
    try {
      const mapped = await mapFirebaseUser(fbUser);
      if (!mapped) {
        await signOut(getFirebaseAuth());
        onUser(null);
        return;
      }
      onUser(mapped);
    } catch {
      onUser(null);
    }
  });
}

export async function firebaseLoginWithGoogle(idToken: string): Promise<AuthUser> {
  // Server verifies Google token, ensures Auth user + claims, returns customToken
  const local = await fetch('/api/auth/firebase/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  const data = await local.json();
  if (!local.ok) {
    throw new Error(data.message || data.error || 'google_login_failed');
  }
  if (data.customToken) {
    await signInWithCustomToken(getFirebaseAuth(), data.customToken);
  } else {
    const credential = GoogleAuthProvider.credential(idToken);
    await signInWithCredential(getFirebaseAuth(), credential);
    await getFirebaseAuth().currentUser?.getIdToken(true);
  }
  const mapped = await mapFirebaseUser(getFirebaseAuth().currentUser!);
  if (!mapped) throw new Error('not_registered');
  try {
    await touchUserLastLogin(mapped);
  } catch {
    // profile write may fail before rules/deploy — non-fatal for login
  }
  return mapped;
}

export async function firebaseRequestSmsOtp(phone: string): Promise<{
  phone: string;
  expiresInSec: number;
  testMode?: boolean;
  testCode?: string;
  message?: string;
}> {
  try {
    const fn = httpsCallable<{ phone: string }, {
      phone: string;
      expiresInSec: number;
      testMode?: boolean;
      testCode?: string;
      message?: string;
    }>(getFirebaseFunctions(), 'requestManagerOtp');
    const res = await fn({ phone });
    return res.data;
  } catch {
    const res = await fetch('/api/auth/sms/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || 'sms_request_failed');
    return data;
  }
}

export async function firebaseVerifySmsOtp(phone: string, code: string): Promise<AuthUser> {
  let customToken: string | undefined;
  try {
    const fn = httpsCallable<{ phone: string; code: string }, { customToken: string; user: AuthUser }>(
      getFirebaseFunctions(),
      'verifyManagerOtp'
    );
    const res = await fn({ phone, code });
    customToken = res.data.customToken;
  } catch {
    const res = await fetch('/api/auth/sms/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code, firebase: true }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || 'sms_verify_failed');
    customToken = data.customToken || data.token;
  }

  if (!customToken) throw new Error('firebase_custom_token_missing');
  await signInWithCustomToken(getFirebaseAuth(), customToken);
  const mapped = await mapFirebaseUser(getFirebaseAuth().currentUser!);
  if (!mapped) throw new Error('not_registered');
  return mapped;
}

export async function firebaseLogout(): Promise<void> {
  if (!isFirebaseConfigured()) return;
  await signOut(getFirebaseAuth());
}

export async function firebaseListUsers(): Promise<AuthUser[]> {
  const col = collection(getFirebaseFirestore(), 'clubs', getClubId(), 'users');
  const snap = await getDocs(col);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      email: String(data.email || ''),
      name: String(data.name || ''),
      picture: data.picture as string | undefined,
      phone: data.phone as string | undefined,
      notificationEmail:
        typeof data.notificationEmail === 'string' ? data.notificationEmail : undefined,
      notifyEmployeeUpdates: data.notifyEmployeeUpdates !== false,
      notifyAgreementSigned: data.notifyAgreementSigned !== false,
      role: (data.role as SystemRole) || 'MANAGER',
      createdAt: String(data.createdAt || ''),
      lastLoginAt: String(data.lastLoginAt || ''),
    };
  });
}

export async function firebaseCreateUser(params: {
  name: string;
  email?: string;
  phone?: string;
  role?: SystemRole;
}): Promise<AuthUser> {
  try {
    const fn = httpsCallable<typeof params, { user: AuthUser }>(
      getFirebaseFunctions(),
      'createClubUser'
    );
    const res = await fn(params);
    return res.data.user;
  } catch {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await getFirebaseAuth().currentUser?.getIdToken()}`,
      },
      body: JSON.stringify({ ...params, firebase: true }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || 'create_failed');
    return data.user as AuthUser;
  }
}

export async function firebaseUpdateUserRole(
  userId: string,
  role: SystemRole
): Promise<AuthUser> {
  try {
    const fn = httpsCallable<{ userId: string; role: SystemRole }, { user: AuthUser }>(
      getFirebaseFunctions(),
      'updateClubUserRole'
    );
    const res = await fn({ userId, role });
    return res.data.user;
  } catch {
    const res = await fetch(`/api/users/${encodeURIComponent(userId)}/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await getFirebaseAuth().currentUser?.getIdToken()}`,
      },
      body: JSON.stringify({ role, firebase: true }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || 'update_failed');
    return data.user as AuthUser;
  }
}

export async function firebaseDeleteUser(userId: string): Promise<void> {
  try {
    const fn = httpsCallable<{ userId: string }, { ok: boolean }>(
      getFirebaseFunctions(),
      'deleteClubUser'
    );
    await fn({ userId });
  } catch {
    const res = await fetch(`/api/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${await getFirebaseAuth().currentUser?.getIdToken()}`,
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error || 'delete_failed');
  }
}

export async function touchUserLastLogin(user: AuthUser): Promise<void> {
  const ref = doc(getFirebaseFirestore(), 'clubs', getClubId(), 'users', user.id);
  // לא דורסים notificationEmail / picture שנשמרו בדף החשבון אם אין ערך חדש במפה
  const payload: Record<string, unknown> = {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone || null,
    role: user.role,
    lastLoginAt: new Date().toISOString(),
  };
  if (user.picture) payload.picture = user.picture;
  if (user.notificationEmail) payload.notificationEmail = user.notificationEmail;
  await setDoc(ref, payload, { merge: true });
}

export async function writeUserProfile(user: AuthUser): Promise<void> {
  const ref = doc(getFirebaseFirestore(), 'clubs', getClubId(), 'users', user.id);
  await setDoc(
    ref,
    {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture || null,
      phone: user.phone || null,
      notificationEmail: user.notificationEmail || null,
      notifyEmployeeUpdates: user.notifyEmployeeUpdates !== false,
      notifyAgreementSigned: user.notifyAgreementSigned !== false,
      role: user.role,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    },
    { merge: true }
  );
}

/** עדכון עצמי של תמונה / מייל התראות / העדפות דיווח */
export async function updateMyAccount(params: {
  picture?: string | null;
  notificationEmail?: string | null;
  notifyEmployeeUpdates?: boolean;
  notifyAgreementSigned?: boolean;
}): Promise<AuthUser> {
  const fbUser = getFirebaseAuth().currentUser;
  if (!fbUser) throw new Error('not_authenticated');

  const ref = doc(getFirebaseFirestore(), 'clubs', getClubId(), 'users', fbUser.uid);
  const patch: Record<string, unknown> = {
    lastLoginAt: new Date().toISOString(),
  };
  if (params.picture !== undefined) {
    patch.picture = params.picture || null;
  }
  if (params.notificationEmail !== undefined) {
    const email = (params.notificationEmail || '').trim();
    patch.notificationEmail = email || null;
  }
  if (params.notifyEmployeeUpdates !== undefined) {
    patch.notifyEmployeeUpdates = Boolean(params.notifyEmployeeUpdates);
  }
  if (params.notifyAgreementSigned !== undefined) {
    patch.notifyAgreementSigned = Boolean(params.notifyAgreementSigned);
  }
  await setDoc(ref, patch, { merge: true });

  const mapped = await mapFirebaseUser(fbUser);
  if (!mapped) throw new Error('not_registered');
  return mapped;
}

export async function removeUserProfile(userId: string): Promise<void> {
  await deleteDoc(doc(getFirebaseFirestore(), 'clubs', getClubId(), 'users', userId));
}

export async function patchUserRoleDoc(userId: string, role: SystemRole): Promise<void> {
  await updateDoc(doc(getFirebaseFirestore(), 'clubs', getClubId(), 'users', userId), { role });
}
