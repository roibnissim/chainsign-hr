import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { normalizeIsraeliPhone } from './phone';
import { ensureFirebaseAdmin, getClubIdServer, isFirebaseAdminReady } from './firebaseAdmin';

export type OtpPurpose = 'manager_login' | 'employee_onboard' | 'employee_sign';

interface OtpRecord {
  phone: string;
  purpose: OtpPurpose;
  /** מזהה נוסף — למשל onboard token */
  ref?: string;
  codeHash: string;
  expiresAt: number;
  attempts: number;
  lastSentAt: number;
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const STORE_FILE = path.join(DATA_DIR, 'otp-store.json');
const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

function useFirestore(): boolean {
  return isFirebaseAdminReady();
}

/** מזהה מסמך — תואם ל־Cloud Functions עבור כניסת מנהל */
function docIdFor(purpose: OtpPurpose, phone: string, ref?: string): string {
  if (purpose === 'manager_login') return `manager_${phone}`;
  const safeRef = String(ref || 'none')
    .replace(/[/\\]/g, '_')
    .slice(0, 200);
  if (purpose === 'employee_onboard') return `onboard_${safeRef}`;
  if (purpose === 'employee_sign') return `sign_${safeRef}`;
  return `${purpose}_${phone}_${safeRef}`;
}

function keyFor(purpose: OtpPurpose, phone: string, ref?: string) {
  return `${purpose}:${phone}${ref ? `:${ref}` : ''}`;
}

/** sha256 — תואם ל־requestManagerOtp / verifyManagerOtp ב־functions */
function hashCode(code: string): string {
  return crypto.createHash('sha256').update(String(code).trim()).digest('hex');
}

function ensureLocalStore(): Record<string, OtpRecord> {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(STORE_FILE, '{}', 'utf-8');
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8')) as Record<string, OtpRecord>;
  } catch {
    return {};
  }
}

function saveLocalStore(store: Record<string, OtpRecord>) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

function otpCollection() {
  ensureFirebaseAdmin();
  return getFirestore().collection('clubs').doc(getClubIdServer()).collection('otp');
}

export function generateOtpCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function createOrRefreshOtp(params: {
  phone: string;
  purpose: OtpPurpose;
  ref?: string;
}): Promise<{ code: string; cooldownMs?: number } | { error: 'invalid_phone' | 'cooldown'; cooldownMs?: number }> {
  const phone = normalizeIsraeliPhone(params.phone);
  if (!phone) return { error: 'invalid_phone' };

  const now = Date.now();
  const code = generateOtpCode();
  const record: OtpRecord = {
    phone,
    purpose: params.purpose,
    codeHash: hashCode(code),
    expiresAt: now + OTP_TTL_MS,
    attempts: 0,
    lastSentAt: now,
  };
  if (params.ref) record.ref = params.ref;

  if (useFirestore()) {
    const docRef = otpCollection().doc(docIdFor(params.purpose, phone, params.ref));
    const existing = await docRef.get();
    if (existing.exists) {
      const prev = existing.data() as OtpRecord;
      if (now - Number(prev.lastSentAt || 0) < RESEND_COOLDOWN_MS) {
        return {
          error: 'cooldown',
          cooldownMs: RESEND_COOLDOWN_MS - (now - Number(prev.lastSentAt || 0)),
        };
      }
    }
    await docRef.set(record);
    return { code };
  }

  const store = ensureLocalStore();
  const key = keyFor(params.purpose, phone, params.ref);
  const existing = store[key];
  if (existing && now - existing.lastSentAt < RESEND_COOLDOWN_MS) {
    return {
      error: 'cooldown',
      cooldownMs: RESEND_COOLDOWN_MS - (now - existing.lastSentAt),
    };
  }
  store[key] = record;
  saveLocalStore(store);
  return { code };
}

export async function verifyOtp(params: {
  phone: string;
  purpose: OtpPurpose;
  code: string;
  ref?: string;
}): Promise<{ ok: true; phone: string } | { ok: false; error: string }> {
  const phone = normalizeIsraeliPhone(params.phone);
  if (!phone) return { ok: false, error: 'invalid_phone' };

  const code = String(params.code || '').trim();
  const expectedHash = hashCode(code);

  if (useFirestore()) {
    const ref = otpCollection().doc(docIdFor(params.purpose, phone, params.ref));
    const snap = await ref.get();
    if (!snap.exists) return { ok: false, error: 'not_found' };
    const record = snap.data() as OtpRecord;
    if (Date.now() > Number(record.expiresAt)) {
      await ref.delete();
      return { ok: false, error: 'expired' };
    }
    if (Number(record.attempts || 0) >= MAX_ATTEMPTS) {
      await ref.delete();
      return { ok: false, error: 'too_many_attempts' };
    }
    if (record.codeHash !== expectedHash) {
      await ref.update({ attempts: Number(record.attempts || 0) + 1 });
      return { ok: false, error: 'invalid_code' };
    }
    await ref.delete();
    return { ok: true, phone };
  }

  const store = ensureLocalStore();
  const key = keyFor(params.purpose, phone, params.ref);
  const record = store[key];
  if (!record) return { ok: false, error: 'not_found' };
  if (Date.now() > record.expiresAt) {
    delete store[key];
    saveLocalStore(store);
    return { ok: false, error: 'expired' };
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    delete store[key];
    saveLocalStore(store);
    return { ok: false, error: 'too_many_attempts' };
  }

  record.attempts += 1;
  if (record.codeHash !== expectedHash) {
    saveLocalStore(store);
    return { ok: false, error: 'invalid_code' };
  }

  delete store[key];
  saveLocalStore(store);
  return { ok: true, phone };
}
