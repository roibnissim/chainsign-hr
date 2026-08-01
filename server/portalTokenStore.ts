import fs from 'fs';
import path from 'path';
import { getFirestore } from 'firebase-admin/firestore';
import { ensureFirebaseAdmin, getClubIdServer, isFirebaseAdminReady } from './auth/firebaseAdmin';
import type {
  OnboardingInviteRecord,
  OnboardingDocument,
  OnboardingAgreementView,
  UploadRequestRecord,
  SigningInviteRecord,
} from './portalTypes';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const INVITES_FILE = path.join(DATA_DIR, 'onboarding-invites.json');
const UPLOADS_FILE = path.join(DATA_DIR, 'upload-requests.json');
const SIGNING_FILE = path.join(DATA_DIR, 'signing-invites.json');

const MAX_STRING = 2000;

function clubCol(name: string) {
  ensureFirebaseAdmin();
  return getFirestore().collection('clubs').doc(getClubIdServer()).collection(name);
}

/** שומר רק URL יציב (http/https) — לא data URL כבדים */
export function keepHttpUrl(value?: string | null): string | undefined {
  if (!value || typeof value !== 'string') return undefined;
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value.length > 4000 ? value.slice(0, 4000) : value;
  }
  return undefined;
}

function stripHeavyStrings<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (value.startsWith('data:') && value.length > MAX_STRING) return undefined as T;
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripHeavyStrings(item)) as T;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      const next = stripHeavyStrings(v);
      if (next !== undefined) out[k] = next;
    }
    return out as T;
  }
  return value;
}

function sanitizeInvite(record: OnboardingInviteRecord): OnboardingInviteRecord {
  const documents: OnboardingDocument[] = (record.documents || []).map((d) => ({
    ...d,
    fileDataUrl: keepHttpUrl(d.fileDataUrl),
  }));
  const signedAgreements: OnboardingAgreementView[] = (record.signedAgreements || []).map(
    (a) => ({
      ...a,
      pdfDataUrl: keepHttpUrl(a.pdfDataUrl),
    })
  );
  const profile = {
    ...record.profile,
    avatarUrl: keepHttpUrl(record.profile?.avatarUrl),
    idCardPhotoUrl: keepHttpUrl(record.profile?.idCardPhotoUrl),
  };
  const branding = record.branding
    ? {
        ...record.branding,
        logoDataUrl: keepHttpUrl(record.branding.logoDataUrl) ?? null,
      }
    : undefined;

  return stripHeavyStrings({
    ...record,
    profile,
    documents,
    signedAgreements,
    branding,
  });
}

function sanitizeUpload(record: UploadRequestRecord): UploadRequestRecord {
  const uploadedDoc = record.uploadedDoc
    ? {
        ...record.uploadedDoc,
        fileDataUrl: keepHttpUrl(record.uploadedDoc.fileDataUrl),
      }
    : undefined;
  return stripHeavyStrings({
    ...record,
    uploadedDoc,
  });
}

function readLocalJson<T>(file: string): Record<string, T> {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, '{}', 'utf-8');
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, T>;
  } catch {
    return {};
  }
}

function writeLocalJson<T>(file: string, store: Record<string, T>) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(store, null, 2), 'utf-8');
}

let invitesMigrated = false;
let uploadsMigrated = false;

async function migrateLocalInvitesOnce() {
  if (invitesMigrated || !isFirebaseAdminReady()) return;
  invitesMigrated = true;
  const local = readLocalJson<OnboardingInviteRecord>(INVITES_FILE);
  const entries = Object.values(local);
  if (!entries.length) return;
  try {
    const col = clubCol('invites');
    const existing = await col.limit(1).get();
    if (!existing.empty) return;
    const batchSize = 40;
    for (let i = 0; i < entries.length; i += batchSize) {
      const slice = entries.slice(i, i + batchSize);
      const batch = getFirestore().batch();
      for (const rec of slice) {
        batch.set(col.doc(rec.token), sanitizeInvite(rec), { merge: true });
      }
      await batch.commit();
    }
    console.info(`[portalTokenStore] migrated ${entries.length} invites → Firestore`);
  } catch (err) {
    console.warn('[portalTokenStore] invite migration failed', err);
  }
}

async function migrateLocalUploadsOnce() {
  if (uploadsMigrated || !isFirebaseAdminReady()) return;
  uploadsMigrated = true;
  const local = readLocalJson<UploadRequestRecord>(UPLOADS_FILE);
  const entries = Object.values(local);
  if (!entries.length) return;
  try {
    const col = clubCol('uploadRequests');
    const existing = await col.limit(1).get();
    if (!existing.empty) return;
    const batchSize = 40;
    for (let i = 0; i < entries.length; i += batchSize) {
      const slice = entries.slice(i, i + batchSize);
      const batch = getFirestore().batch();
      for (const rec of slice) {
        batch.set(col.doc(rec.token), sanitizeUpload(rec), { merge: true });
      }
      await batch.commit();
    }
    console.info(`[portalTokenStore] migrated ${entries.length} upload requests → Firestore`);
  } catch (err) {
    console.warn('[portalTokenStore] upload migration failed', err);
  }
}

export async function getInvite(token: string): Promise<OnboardingInviteRecord | null> {
  if (isFirebaseAdminReady()) {
    await migrateLocalInvitesOnce();
    try {
      const snap = await clubCol('invites').doc(token).get();
      if (snap.exists) return snap.data() as OnboardingInviteRecord;
    } catch (err) {
      console.warn('[portalTokenStore] getInvite firestore failed', err);
    }
  }
  const local = readLocalJson<OnboardingInviteRecord>(INVITES_FILE);
  return local[token] || null;
}

export async function saveInvite(record: OnboardingInviteRecord): Promise<void> {
  const clean = sanitizeInvite(record);
  if (isFirebaseAdminReady()) {
    await migrateLocalInvitesOnce();
    try {
      await clubCol('invites').doc(clean.token).set(clean, { merge: true });
      return;
    } catch (err) {
      console.warn('[portalTokenStore] saveInvite firestore failed, falling back to disk', err);
    }
  }
  const local = readLocalJson<OnboardingInviteRecord>(INVITES_FILE);
  local[clean.token] = clean;
  writeLocalJson(INVITES_FILE, local);
}

export async function findOpenInviteByEmployeeId(
  employeeId: string
): Promise<OnboardingInviteRecord | null> {
  const now = Date.now();
  if (isFirebaseAdminReady()) {
    await migrateLocalInvitesOnce();
    try {
      const snap = await clubCol('invites').where('employeeId', '==', employeeId).get();
      const open = snap.docs
        .map((d) => d.data() as OnboardingInviteRecord)
        .filter((r) => new Date(r.expiresAt).getTime() > now)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return open[0] || null;
    } catch (err) {
      console.warn('[portalTokenStore] findOpenInvite failed', err);
    }
  }
  const local = readLocalJson<OnboardingInviteRecord>(INVITES_FILE);
  return (
    Object.values(local).find(
      (r) => r.employeeId === employeeId && new Date(r.expiresAt).getTime() > now
    ) || null
  );
}

export async function mapInvites(
  mapper: (record: OnboardingInviteRecord) => OnboardingInviteRecord | null
): Promise<number> {
  let changed = 0;
  if (isFirebaseAdminReady()) {
    await migrateLocalInvitesOnce();
    try {
      const snap = await clubCol('invites').get();
      for (const doc of snap.docs) {
        const prev = doc.data() as OnboardingInviteRecord;
        const next = mapper(prev);
        if (!next) continue;
        if (JSON.stringify(sanitizeInvite(prev)) === JSON.stringify(sanitizeInvite(next))) {
          continue;
        }
        await doc.ref.set(sanitizeInvite(next), { merge: true });
        changed += 1;
      }
      return changed;
    } catch (err) {
      console.warn('[portalTokenStore] mapInvites firestore failed', err);
    }
  }
  const local = readLocalJson<OnboardingInviteRecord>(INVITES_FILE);
  for (const token of Object.keys(local)) {
    const next = mapper(local[token]);
    if (!next) continue;
    if (JSON.stringify(local[token]) === JSON.stringify(next)) continue;
    local[token] = sanitizeInvite(next);
    changed += 1;
  }
  if (changed) writeLocalJson(INVITES_FILE, local);
  return changed;
}

export async function getUploadRequest(token: string): Promise<UploadRequestRecord | null> {
  if (isFirebaseAdminReady()) {
    await migrateLocalUploadsOnce();
    try {
      const snap = await clubCol('uploadRequests').doc(token).get();
      if (snap.exists) return snap.data() as UploadRequestRecord;
    } catch (err) {
      console.warn('[portalTokenStore] getUploadRequest firestore failed', err);
    }
  }
  const local = readLocalJson<UploadRequestRecord>(UPLOADS_FILE);
  return local[token] || null;
}

export async function saveUploadRequest(record: UploadRequestRecord): Promise<void> {
  const clean = sanitizeUpload(record);
  if (isFirebaseAdminReady()) {
    await migrateLocalUploadsOnce();
    try {
      await clubCol('uploadRequests').doc(clean.token).set(clean, { merge: true });
      return;
    } catch (err) {
      console.warn('[portalTokenStore] saveUploadRequest firestore failed, falling back to disk', err);
    }
  }
  const local = readLocalJson<UploadRequestRecord>(UPLOADS_FILE);
  local[clean.token] = clean;
  writeLocalJson(UPLOADS_FILE, local);
}

function sanitizeSigning(record: SigningInviteRecord): SigningInviteRecord {
  return stripHeavyStrings({ ...record });
}

export async function getSigningInvite(token: string): Promise<SigningInviteRecord | null> {
  if (isFirebaseAdminReady()) {
    try {
      const snap = await clubCol('signingInvites').doc(token).get();
      if (snap.exists) return snap.data() as SigningInviteRecord;
    } catch (err) {
      console.warn('[portalTokenStore] getSigningInvite firestore failed', err);
    }
  }
  const local = readLocalJson<SigningInviteRecord>(SIGNING_FILE);
  return local[token] || null;
}

export async function saveSigningInvite(record: SigningInviteRecord): Promise<void> {
  const clean = sanitizeSigning(record);
  if (isFirebaseAdminReady()) {
    try {
      await clubCol('signingInvites').doc(clean.token).set(clean, { merge: true });
      return;
    } catch (err) {
      console.warn('[portalTokenStore] saveSigningInvite firestore failed, falling back to disk', err);
    }
  }
  const local = readLocalJson<SigningInviteRecord>(SIGNING_FILE);
  local[clean.token] = clean;
  writeLocalJson(SIGNING_FILE, local);
}

export async function findOpenSigningInviteByAgreementId(
  agreementId: string
): Promise<SigningInviteRecord | null> {
  const now = Date.now();
  if (isFirebaseAdminReady()) {
    try {
      const snap = await clubCol('signingInvites')
        .where('agreementId', '==', agreementId)
        .get();
      const open = snap.docs
        .map((d) => d.data() as SigningInviteRecord)
        .filter(
          (r) =>
            r.status === 'pending' && new Date(r.expiresAt).getTime() > now
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return open[0] || null;
    } catch (err) {
      console.warn('[portalTokenStore] findOpenSigningInvite failed', err);
    }
  }
  const local = readLocalJson<SigningInviteRecord>(SIGNING_FILE);
  return (
    Object.values(local).find(
      (r) =>
        r.agreementId === agreementId &&
        r.status === 'pending' &&
        new Date(r.expiresAt).getTime() > now
    ) || null
  );
}
