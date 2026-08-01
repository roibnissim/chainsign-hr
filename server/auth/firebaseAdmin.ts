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
