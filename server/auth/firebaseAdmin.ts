import fs from 'fs';
import path from 'path';
import { initializeApp, getApps, cert, type App, type ServiceAccount } from 'firebase-admin/app';
import { getAuth, type UserRecord } from 'firebase-admin/auth';

const DEFAULT_CLUB_ID = 'asa-tlv';
/** Named app with private key — needed for createCustomToken without IAM signBlob */
const SA_APP_NAME = 'chainsignAdminSa';

let app: App | null = null;

export function getClubIdServer(): string {
  return process.env.CLUB_ID || process.env.VITE_CLUB_ID || DEFAULT_CLUB_ID;
}

function resolveServiceAccountPath(): string | null {
  const candidates = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    './service-account.json',
    'service-account.json',
    path.join(process.cwd(), 'service-account.json'),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const resolved = path.isAbsolute(candidate)
      ? candidate
      : path.resolve(process.cwd(), candidate);
    if (fs.existsSync(resolved)) return resolved;
  }
  return null;
}

function loadServiceAccount(): ServiceAccount | null {
  const saJson =
    process.env.SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (saJson) {
    try {
      return JSON.parse(saJson) as ServiceAccount;
    } catch {
      return null;
    }
  }
  const saPath = resolveServiceAccountPath();
  if (!saPath) return null;
  try {
    return JSON.parse(fs.readFileSync(saPath, 'utf-8')) as ServiceAccount;
  } catch {
    return null;
  }
}

export function isFirebaseAdminReady(): boolean {
  if (loadServiceAccount()) return true;
  if (
    process.env.FUNCTION_TARGET ||
    process.env.K_SERVICE ||
    process.env.FIREBASE_CONFIG ||
    process.env.GCLOUD_PROJECT
  ) {
    return true;
  }
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST) {
    return true;
  }
  return false;
}

function projectIdOf(): string {
  return (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    'chainsign-hr'
  );
}

function storageBucketOf(projectId: string): string | undefined {
  return (
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.VITE_FIREBASE_STORAGE_BUCKET ||
    `${projectId}.appspot.com`
  );
}

/** Admin Auth bound to the SA-keyed app when available */
export function adminAuth() {
  return getAuth(ensureFirebaseAdmin());
}

export function ensureFirebaseAdmin(): App {
  if (app) return app;

  const named = getApps().find((a) => a.name === SA_APP_NAME);
  if (named) {
    app = named;
    return app;
  }

  const projectId = projectIdOf();
  const cred = loadServiceAccount();

  // Prefer explicit service-account key (local file or FIREBASE_SERVICE_ACCOUNT_JSON secret)
  if (cred) {
    const credRecord = cred as ServiceAccount & { project_id?: string };
    app = initializeApp(
      {
        credential: cert(cred),
        projectId: credRecord.project_id || projectId,
        storageBucket: storageBucketOf(credRecord.project_id || projectId),
      },
      SA_APP_NAME
    );
    return app;
  }

  if (process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST) {
    app = getApps()[0] || initializeApp({ projectId });
    return app;
  }

  // Cloud Functions ADC fallback (createCustomToken may need IAM Token Creator)
  if (getApps().length) {
    app = getApps()[0]!;
    return app;
  }

  if (
    process.env.FUNCTION_TARGET ||
    process.env.K_SERVICE ||
    process.env.FIREBASE_CONFIG
  ) {
    app = initializeApp({
      projectId,
      storageBucket: storageBucketOf(projectId),
    });
    return app;
  }

  throw new Error(
    'Firebase Admin not configured: place service-account.json in project root or set SERVICE_ACCOUNT_JSON'
  );
}

export type ManagerClaims = {
  role: 'SYSTEM_ADMIN' | 'MANAGER';
  clubId: string;
  phone?: string;
};

export async function setManagerClaims(uid: string, claims: ManagerClaims) {
  await adminAuth().setCustomUserClaims(uid, {
    role: claims.role,
    clubId: claims.clubId,
    ...(claims.phone ? { phone: claims.phone } : {}),
  });
}

export async function createManagerCustomToken(
  uid: string,
  claims: ManagerClaims
): Promise<string> {
  await setManagerClaims(uid, claims);
  return adminAuth().createCustomToken(uid, {
    role: claims.role,
    clubId: claims.clubId,
    ...(claims.phone ? { phone: claims.phone } : {}),
  });
}

export async function upsertAuthUserByEmail(params: {
  email: string;
  name: string;
  picture?: string;
}): Promise<UserRecord> {
  const auth = adminAuth();
  const email = params.email.trim().toLowerCase();
  try {
    return await auth.getUserByEmail(email);
  } catch {
    try {
      return await auth.createUser({
        email,
        displayName: params.name,
        photoURL: params.picture?.startsWith('https://') ? params.picture : undefined,
        emailVerified: true,
      });
    } catch (err) {
      console.warn('[auth] createUser with photo failed, retrying', err);
      return auth.createUser({
        email,
        displayName: params.name,
        emailVerified: true,
      });
    }
  }
}

export async function upsertAuthUserByPhone(params: {
  phone: string;
  name: string;
}): Promise<UserRecord> {
  const auth = adminAuth();
  const phone = params.phone;
  const email = `${phone}@sms.local`;
  try {
    return await auth.getUserByEmail(email);
  } catch {
    try {
      const e164 = phone.startsWith('0') ? `+972${phone.slice(1)}` : `+${phone}`;
      return await auth.getUserByPhoneNumber(e164);
    } catch {
      return auth.createUser({
        email,
        displayName: params.name,
        phoneNumber: phone.startsWith('0') ? `+972${phone.slice(1)}` : undefined,
      });
    }
  }
}

export function isSyntheticSmsEmail(email: string | undefined | null): boolean {
  return String(email || '')
    .trim()
    .toLowerCase()
    .endsWith('@sms.local');
}

export function toE164Israeli(phone: string): string | undefined {
  const digits = phone.replace(/\D/g, '');
  let local = digits;
  if (local.startsWith('972')) local = `0${local.slice(3)}`;
  if (local.length === 9 && local.startsWith('5')) local = `0${local}`;
  if (!/^05\d{8}$/.test(local)) return undefined;
  return `+972${local.slice(1)}`;
}

/**
 * בוחר Firebase Auth אחד למשתמש מנהל:
 * אם יש אימייל אמיתי — משתמשים בו (Google / ידני),
 * אחרת נופלים ל־phone@sms.local.
 * מונע כפילות כשאותו אדם מתחבר גם בגוגל וגם ב־SMS.
 */
export async function resolveManagerFirebaseUser(params: {
  name: string;
  email?: string;
  phone?: string;
  picture?: string;
}): Promise<UserRecord> {
  const email = (params.email || '').trim().toLowerCase();
  const phone = (params.phone || '').trim();
  const auth = adminAuth();

  let user: UserRecord;
  if (email && !isSyntheticSmsEmail(email)) {
    user = await upsertAuthUserByEmail({
      email,
      name: params.name,
      picture: params.picture,
    });
  } else if (phone) {
    user = await upsertAuthUserByPhone({ phone, name: params.name });
  } else {
    throw new Error('missing_contact_for_auth_user');
  }

  const e164 = phone ? toE164Israeli(phone) : undefined;
  if (e164 && user.phoneNumber !== e164) {
    try {
      user = await auth.updateUser(user.uid, { phoneNumber: e164 });
    } catch {
      try {
        const other = await auth.getUserByPhoneNumber(e164);
        if (other.uid !== user.uid) {
          await auth.updateUser(other.uid, { phoneNumber: null });
          user = await auth.updateUser(user.uid, { phoneNumber: e164 });
        }
      } catch (err) {
        console.warn('[auth] could not attach phone to manager auth user', err);
      }
    }
  }

  return user;
}

function normalizePhoneDigits(raw: string): string {
  let pl = String(raw || '').replace(/\D/g, '');
  if (pl.startsWith('972')) pl = `0${pl.slice(3)}`;
  if (pl.length === 9 && pl.startsWith('5')) pl = `0${pl}`;
  return pl;
}

/**
 * כותב פרופיל קנוני ב־users/{uid} ומוחק כפילויות לפי אימייל/טלפון.
 */
export async function writeCanonicalClubUser(params: {
  uid: string;
  email: string;
  name: string;
  role: 'SYSTEM_ADMIN' | 'MANAGER';
  phone?: string | null;
  picture?: string | null;
  createdAt?: string;
}): Promise<void> {
  const { getFirestore } = await import('firebase-admin/firestore');
  const col = getFirestore().collection('clubs').doc(getClubIdServer()).collection('users');
  const now = new Date().toISOString();
  const email = params.email.trim().toLowerCase();
  const phone = params.phone || null;

  await col.doc(params.uid).set(
    {
      id: params.uid,
      email,
      name: params.name,
      picture: params.picture || null,
      phone,
      role: params.role,
      lastLoginAt: now,
      createdAt: params.createdAt || now,
    },
    { merge: true }
  );

  const snap = await col.get();
  const phoneNorm = phone ? normalizePhoneDigits(phone) : '';
  for (const doc of snap.docs) {
    if (doc.id === params.uid) continue;
    const data = doc.data();
    const docEmail = String(data.email || '')
      .trim()
      .toLowerCase();
    const docPhone = normalizePhoneDigits(String(data.phone || ''));
    const sameEmail = Boolean(email) && docEmail === email;
    const samePhone = Boolean(phoneNorm) && docPhone === phoneNorm;
    const syntheticDup =
      samePhone &&
      (isSyntheticSmsEmail(docEmail) || isSyntheticSmsEmail(email) || sameEmail);
    if (sameEmail || syntheticDup) {
      await doc.ref.delete().catch((err) => {
        console.warn('[auth] failed deleting duplicate user doc', doc.id, err);
      });
    }
  }
}
