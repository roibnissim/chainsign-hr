import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { normalizeIsraeliPhone } from './phone';

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

function ensureStore(): Record<string, OtpRecord> {
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

function saveStore(store: Record<string, OtpRecord>) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

function keyFor(purpose: OtpPurpose, phone: string, ref?: string) {
  return `${purpose}:${phone}${ref ? `:${ref}` : ''}`;
}

function hashCode(code: string): string {
  const secret = process.env.JWT_SECRET || 'otp-dev-secret';
  return crypto.createHmac('sha256', secret).update(code).digest('hex');
}

export function generateOtpCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function createOrRefreshOtp(params: {
  phone: string;
  purpose: OtpPurpose;
  ref?: string;
}): { code: string; cooldownMs?: number } | { error: 'invalid_phone' | 'cooldown'; cooldownMs?: number } {
  const phone = normalizeIsraeliPhone(params.phone);
  if (!phone) return { error: 'invalid_phone' };

  const store = ensureStore();
  const key = keyFor(params.purpose, phone, params.ref);
  const existing = store[key];
  const now = Date.now();

  if (existing && now - existing.lastSentAt < RESEND_COOLDOWN_MS) {
    return {
      error: 'cooldown',
      cooldownMs: RESEND_COOLDOWN_MS - (now - existing.lastSentAt),
    };
  }

  const code = generateOtpCode();
  store[key] = {
    phone,
    purpose: params.purpose,
    ref: params.ref,
    codeHash: hashCode(code),
    expiresAt: now + OTP_TTL_MS,
    attempts: 0,
    lastSentAt: now,
  };
  saveStore(store);
  return { code };
}

export function verifyOtp(params: {
  phone: string;
  purpose: OtpPurpose;
  code: string;
  ref?: string;
}): { ok: true; phone: string } | { ok: false; error: string } {
  const phone = normalizeIsraeliPhone(params.phone);
  if (!phone) return { ok: false, error: 'invalid_phone' };

  const store = ensureStore();
  const key = keyFor(params.purpose, phone, params.ref);
  const record = store[key];
  if (!record) return { ok: false, error: 'not_found' };
  if (Date.now() > record.expiresAt) {
    delete store[key];
    saveStore(store);
    return { ok: false, error: 'expired' };
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    delete store[key];
    saveStore(store);
    return { ok: false, error: 'too_many_attempts' };
  }

  record.attempts += 1;
  if (record.codeHash !== hashCode(String(params.code).trim())) {
    saveStore(store);
    return { ok: false, error: 'invalid_code' };
  }

  delete store[key];
  saveStore(store);
  return { ok: true, phone };
}
