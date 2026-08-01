import fs from 'fs';
import path from 'path';
import type { AuthUser, SystemRole } from './types';
import { ensureFirebaseAdmin, getClubIdServer, isFirebaseAdminReady } from './firebaseAdmin';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const STORE_FILE = path.join(DATA_DIR, 'users.json');

function ensureStore(): Record<string, AuthUser> {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(STORE_FILE, '{}', 'utf-8');
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8')) as Record<string, AuthUser>;
  } catch {
    return {};
  }
}

function saveStore(store: Record<string, AuthUser>) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

export function listUsers(): AuthUser[] {
  return Object.values(ensureStore()).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  );
}

export function getUserById(id: string): AuthUser | null {
  return ensureStore()[id] || null;
}

export function getUserByEmail(email: string): AuthUser | null {
  const normalized = email.trim().toLowerCase();
  return (
    Object.values(ensureStore()).find((u) => u.email.toLowerCase() === normalized) || null
  );
}

export function getUserByGoogleSub(sub: string): AuthUser | null {
  return Object.values(ensureStore()).find((u) => u.googleSub === sub) || null;
}

function adminEmailsFromEnv(): Set<string> {
  const raw = process.env.GOOGLE_ADMIN_EMAILS || '';
  return new Set(
    raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

function adminPhonesFromEnv(): Set<string> {
  const raw = process.env.SMS_ADMIN_PHONES || '';
  return new Set(
    raw
      .split(',')
      .map((e) => e.trim().replace(/\D/g, ''))
      .filter(Boolean)
      .map((d) => {
        if (d.startsWith('972')) return `0${d.slice(3)}`;
        if (d.length === 9 && d.startsWith('5')) return `0${d}`;
        return d;
      })
  );
}

export function getUserByPhone(phone: string): AuthUser | null {
  const digits = phone.replace(/\D/g, '');
  let local = digits;
  if (local.startsWith('972')) local = `0${local.slice(3)}`;
  if (local.length === 9 && local.startsWith('5')) local = `0${local}`;
  return (
    Object.values(ensureStore()).find((u) => {
      if (!u.phone) return false;
      const p = u.phone.replace(/\D/g, '');
      let pl = p;
      if (pl.startsWith('972')) pl = `0${pl.slice(3)}`;
      return pl === local;
    }) || null
  );
}

export function upsertGoogleUser(params: {
  googleSub: string;
  email: string;
  name: string;
  picture?: string;
}): AuthUser | null {
  const store = ensureStore();
  const email = params.email.trim().toLowerCase();
  const existing =
    getUserByGoogleSub(params.googleSub) || getUserByEmail(email);

  const now = new Date().toISOString();

  if (existing) {
    // התחברות לא דורסת שם — רק מזהים, אימייל, תמונה וזמן כניסה
    const updated: AuthUser = {
      ...existing,
      googleSub: params.googleSub,
      email,
      picture: params.picture || existing.picture,
      lastLoginAt: now,
    };
    store[updated.id] = updated;
    saveStore(store);
    return updated;
  }

  // יצירה אוטומטית רק לאימיילים ב־GOOGLE_ADMIN_EMAILS (bootstrap)
  if (!adminEmailsFromEnv().has(email)) {
    return null;
  }

  const id = `USR-${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const created: AuthUser = {
    id,
    googleSub: params.googleSub,
    email,
    name: params.name || email,
    picture: params.picture,
    role: 'SYSTEM_ADMIN',
    createdAt: now,
    lastLoginAt: now,
  };
  store[id] = created;
  saveStore(store);
  return created;
}

/** Production: resolve manager from Firestore users (or admin-email bootstrap). */
export async function resolveGoogleManager(params: {
  googleSub: string;
  email: string;
  name: string;
  picture?: string;
}): Promise<AuthUser | null> {
  const email = params.email.trim().toLowerCase();

  if (isFirebaseAdminReady()) {
    try {
      ensureFirebaseAdmin();
      const { getFirestore } = await import('firebase-admin/firestore');
      const col = getFirestore().collection('clubs').doc(getClubIdServer()).collection('users');
      const byEmail = await col.where('email', '==', email).limit(1).get();
      if (!byEmail.empty) {
        const doc = byEmail.docs[0]!;
        const data = doc.data();
        const role = data.role === 'SYSTEM_ADMIN' ? 'SYSTEM_ADMIN' : 'MANAGER';
        return {
          id: doc.id,
          googleSub: params.googleSub,
          email,
          name: String(data.name || params.name || email),
          picture: params.picture || (data.picture as string | undefined),
          phone: (data.phone as string | undefined) || undefined,
          role,
          createdAt: String(data.createdAt || new Date().toISOString()),
          lastLoginAt: new Date().toISOString(),
        };
      }
    } catch (err) {
      console.warn('[userStore] firestore lookup failed', err);
    }
  }

  return upsertGoogleUser(params);
}

export function upsertSmsUser(params: {
  phone: string;
}): AuthUser | null {
  const store = ensureStore();
  const phone = params.phone;
  const existing = getUserByPhone(phone);
  const now = new Date().toISOString();

  if (existing) {
    // התחברות OTP לא דורסת שם / אימייל — רק טלפון מנורמל וזמן כניסה
    const updated: AuthUser = {
      ...existing,
      phone,
      lastLoginAt: now,
    };
    store[updated.id] = updated;
    saveStore(store);
    return updated;
  }

  // יצירה אוטומטית רק לטלפונים ב־SMS_ADMIN_PHONES (bootstrap)
  if (!adminPhonesFromEnv().has(phone)) {
    return null;
  }

  const id = `USR-${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const created: AuthUser = {
    id,
    googleSub: `sms:${phone}`,
    email: `${phone}@sms.local`,
    phone,
    name: `מנהל ${phone.slice(-4)}`,
    role: 'SYSTEM_ADMIN',
    createdAt: now,
    lastLoginAt: now,
  };
  store[id] = created;
  saveStore(store);
  return created;
}

/** האם מותר לשלוח OTP התחברות מנהל למספר זה */
export function canRequestManagerOtp(phone: string): boolean {
  if (getUserByPhone(phone)) return true;
  if (adminPhonesFromEnv().has(phone)) return true;
  return false;
}

export function countSystemAdmins(): number {
  return listUsers().filter((u) => u.role === 'SYSTEM_ADMIN').length;
}

export function createManualUser(params: {
  name: string;
  email?: string;
  phone?: string;
  role?: SystemRole;
}): AuthUser {
  const store = ensureStore();
  const name = params.name.trim();
  const email = params.email?.trim().toLowerCase() || '';
  const phone = params.phone?.trim() || '';
  const role = params.role === 'SYSTEM_ADMIN' ? 'SYSTEM_ADMIN' : 'MANAGER';

  if (!name) throw new Error('missing_name');
  if (!email && !phone) throw new Error('missing_contact');

  if (email && getUserByEmail(email)) throw new Error('email_exists');
  if (phone && getUserByPhone(phone)) throw new Error('phone_exists');

  const now = new Date().toISOString();
  const id = `USR-${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const created: AuthUser = {
    id,
    name,
    email: email || (phone ? `${phone}@sms.local` : `${id}@pending.local`),
    phone: phone || undefined,
    googleSub: phone ? `sms:${phone}` : `pending:${id}`,
    role,
    createdAt: now,
    lastLoginAt: now,
  };
  store[id] = created;
  saveStore(store);
  return created;
}

export function updateUserRole(id: string, role: SystemRole): AuthUser | null {
  const store = ensureStore();
  const user = store[id];
  if (!user) return null;
  const updated = { ...user, role };
  store[id] = updated;
  saveStore(store);
  return updated;
}

export function deleteUser(id: string): boolean {
  const store = ensureStore();
  if (!store[id]) return false;
  delete store[id];
  saveStore(store);
  return true;
}
