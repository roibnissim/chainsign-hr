import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  deleteDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { getClubId } from '../../config/club';
import { getFirebaseFirestore } from '../../lib/firebase';
import type {
  AgreementTemplate,
  Employee,
  EmployeeFileDocument,
  ManagerActivityEvent,
  SalaryAgreement,
} from '../../types';
import type { BrandingSettings } from '../../config/branding';

function clubCol(...segments: string[]) {
  return collection(getFirebaseFirestore(), 'clubs', getClubId(), ...segments);
}

function clubDoc(...segments: string[]) {
  return doc(getFirebaseFirestore(), 'clubs', getClubId(), ...segments);
}

function stripUndefinedDeep(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => stripUndefinedDeep(item))
      .filter((item) => item !== undefined);
  }
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined) continue;
    const next = stripUndefinedDeep(v);
    if (next !== undefined) out[key] = next;
  }
  return out;
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  return stripUndefinedDeep(obj) as T;
}

/** מסיר data-URL / base64 כבדים שלא בטוחים לכתיבה ל-Firestore */
function omitHeavyDataUrls(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(omitHeavyDataUrls);
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string' && v.startsWith('data:') && v.length > 2000) {
      continue;
    }
    if (key === 'signatureImageBase64' && typeof v === 'string' && v.length > 500) {
      continue;
    }
    out[key] = omitHeavyDataUrls(v);
  }
  return out;
}

export async function listEmployees(): Promise<Employee[]> {
  const snap = await getDocs(clubCol('employees'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Employee));
}

export function subscribeEmployees(onData: (rows: Employee[]) => void): Unsubscribe {
  return onSnapshot(clubCol('employees'), (snap) => {
    onData(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Employee)));
  });
}

export async function upsertEmployee(employee: Employee): Promise<void> {
  let avatarUrl = employee.avatarUrl;
  let idCardPhotoUrl = employee.idCardPhotoUrl;

  const { useFirebaseStorage } = await import('../../config/featureFlags');
  const { isFirebaseConfigured } = await import('../../lib/firebase');
  const storageOn = useFirebaseStorage() && isFirebaseConfigured();

  if (storageOn) {
    const { dataUrlToBlob, uploadAvatarPhoto, uploadIdPhoto } = await import(
      '../storage/clubStorage'
    );
    if (avatarUrl?.startsWith('data:')) {
      const { blob, contentType } = await dataUrlToBlob(avatarUrl);
      const up = await uploadAvatarPhoto({
        employeeId: employee.id,
        data: blob,
        contentType,
      });
      avatarUrl = up.downloadURL;
    }
    if (idCardPhotoUrl?.startsWith('data:')) {
      const { blob, contentType } = await dataUrlToBlob(idCardPhotoUrl);
      const up = await uploadIdPhoto({
        employeeId: employee.id,
        data: blob,
        contentType,
      });
      idCardPhotoUrl = up.downloadURL;
    }
  } else {
    // Firestore docs can't hold large data-URLs reliably — omit them (merge keeps prior http URL)
    if (avatarUrl?.startsWith('data:')) avatarUrl = undefined;
    if (idCardPhotoUrl?.startsWith('data:')) idCardPhotoUrl = undefined;
  }

  await setDoc(
    clubDoc('employees', employee.id),
    stripUndefined(
      omitHeavyDataUrls({
        ...employee,
        avatarUrl,
        idCardPhotoUrl,
      }) as Record<string, unknown>
    ),
    { merge: true }
  );
}

export async function upsertEmployees(employees: Employee[]): Promise<void> {
  await Promise.all(employees.map((e) => upsertEmployee(e)));
}

export async function removeEmployee(id: string): Promise<void> {
  await deleteDoc(clubDoc('employees', id));
}

export async function listAgreements(): Promise<SalaryAgreement[]> {
  const snap = await getDocs(clubCol('agreements'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SalaryAgreement));
}

export function subscribeAgreements(onData: (rows: SalaryAgreement[]) => void): Unsubscribe {
  return onSnapshot(clubCol('agreements'), (snap) => {
    onData(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SalaryAgreement)));
  });
}

export async function upsertAgreement(agreement: SalaryAgreement): Promise<void> {
  const { pdfUrl, ...rest } = agreement;
  // Avoid storing huge data URLs in Firestore when Storage is used
  const payload = stripUndefined(
    omitHeavyDataUrls({
      ...rest,
      ...(pdfUrl && pdfUrl.startsWith('http') ? { pdfUrl } : {}),
      storagePdfPath: (agreement as SalaryAgreement & { storagePdfPath?: string }).storagePdfPath,
    }) as Record<string, unknown>
  );
  await setDoc(clubDoc('agreements', agreement.id), payload, { merge: true });
}

export async function upsertAgreements(agreements: SalaryAgreement[]): Promise<void> {
  await Promise.all(agreements.map((a) => upsertAgreement(a)));
}

export async function removeAgreement(id: string): Promise<void> {
  await deleteDoc(clubDoc('agreements', id));
}

export async function listFileDocuments(): Promise<EmployeeFileDocument[]> {
  const snap = await getDocs(clubCol('fileDocuments'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as EmployeeFileDocument));
}

export function subscribeFileDocuments(
  onData: (rows: EmployeeFileDocument[]) => void
): Unsubscribe {
  return onSnapshot(clubCol('fileDocuments'), (snap) => {
    onData(snap.docs.map((d) => ({ id: d.id, ...d.data() } as EmployeeFileDocument)));
  });
}

export async function upsertFileDocument(docRow: EmployeeFileDocument): Promise<void> {
  const { fileDataUrl, ...rest } = docRow;
  const payload = stripUndefined({
    ...rest,
    ...(fileDataUrl && fileDataUrl.startsWith('http') ? { fileDataUrl } : {}),
    storagePath: (docRow as EmployeeFileDocument & { storagePath?: string }).storagePath,
  } as Record<string, unknown>);
  await setDoc(clubDoc('fileDocuments', docRow.id), payload, { merge: true });
}

export async function upsertFileDocuments(docs: EmployeeFileDocument[]): Promise<void> {
  await Promise.all(docs.map((d) => upsertFileDocument(d)));
}

export async function removeFileDocument(id: string): Promise<void> {
  await deleteDoc(clubDoc('fileDocuments', id));
}

export async function listActivityEvents(): Promise<ManagerActivityEvent[]> {
  const snap = await getDocs(clubCol('activityEvents'));
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ManagerActivityEvent));
  rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return rows;
}

export async function upsertActivityEvent(event: ManagerActivityEvent): Promise<void> {
  await setDoc(
    clubDoc('activityEvents', event.id),
    stripUndefined({ ...event } as Record<string, unknown>),
    { merge: true }
  );
}

export async function upsertActivityEvents(events: ManagerActivityEvent[]): Promise<void> {
  await Promise.all(events.map((e) => upsertActivityEvent(e)));
}

/** מוחק את כל אירועי הלוג ב-Firestore (איפוס) */
export async function clearAllActivityEventsRemote(): Promise<number> {
  const snap = await getDocs(clubCol('activityEvents'));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  return snap.size;
}

export function subscribeActivityEvents(
  onData: (rows: ManagerActivityEvent[]) => void
): Unsubscribe {
  return onSnapshot(clubCol('activityEvents'), (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ManagerActivityEvent));
    rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    onData(rows);
  });
}

export async function listTemplates(): Promise<AgreementTemplate[]> {
  const snap = await getDocs(clubCol('templates'));
  return snap.docs.map((d) => ({ ...d.data(), id: d.id } as AgreementTemplate));
}

export function subscribeTemplates(onData: (rows: AgreementTemplate[]) => void): Unsubscribe {
  return onSnapshot(clubCol('templates'), (snap) => {
    onData(snap.docs.map((d) => ({ ...d.data(), id: d.id } as AgreementTemplate)));
  });
}

export async function upsertTemplate(template: AgreementTemplate): Promise<void> {
  const { id, ...rest } = template;
  await setDoc(
    clubDoc('templates', id),
    stripUndefined(omitHeavyDataUrls({ ...rest, id }) as Record<string, unknown>),
    { merge: true }
  );
}

export async function upsertTemplates(templates: AgreementTemplate[]): Promise<void> {
  await Promise.all(templates.map((t) => upsertTemplate(t)));
}

export async function removeTemplate(id: string): Promise<void> {
  await deleteDoc(clubDoc('templates', id));
}

export async function loadBrandingRemote(): Promise<BrandingSettings | null> {
  const { getDoc } = await import('firebase/firestore');
  const brandSnap = await getDoc(doc(getFirebaseFirestore(), 'clubs', getClubId()));
  if (!brandSnap.exists()) return null;
  const data = brandSnap.data();
  if (!data.branding) return null;
  return data.branding as BrandingSettings;
}

export async function saveBrandingRemote(branding: BrandingSettings): Promise<void> {
  let logoDataUrl = branding.logoDataUrl;
  let logoStoragePath =
    (branding as BrandingSettings & { logoStoragePath?: string | null }).logoStoragePath || null;

  // data URL → Storage, כדי שהלוגו יישמר ב-Firestore ויופיע בכותרת/פביקון
  if (logoDataUrl?.startsWith('data:')) {
    const { useFirebaseStorage } = await import('../../config/featureFlags');
    const { isFirebaseConfigured } = await import('../../lib/firebase');
    if (useFirebaseStorage() && isFirebaseConfigured()) {
      const { dataUrlToBlob, uploadBrandingLogo } = await import('../storage/clubStorage');
      const { blob, contentType } = await dataUrlToBlob(logoDataUrl);
      const up = await uploadBrandingLogo(blob, contentType);
      logoDataUrl = up.downloadURL;
      logoStoragePath = up.storagePath;
    } else {
      // בלי Storage — לא שומרים data URL ענק ב-Firestore
      logoDataUrl = null;
    }
  } else if (logoDataUrl && !logoDataUrl.startsWith('http') && !logoDataUrl.startsWith('/')) {
    logoDataUrl = null;
  }

  const { logoDataUrl: _drop, logoStoragePath: _dropPath, ...rest } = branding;
  await setDoc(
    doc(getFirebaseFirestore(), 'clubs', getClubId()),
    {
      id: getClubId(),
      branding: {
        ...rest,
        logoDataUrl: logoDataUrl || null,
        logoStoragePath: logoStoragePath || null,
      },
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

export function subscribeBranding(onData: (b: BrandingSettings | null) => void): Unsubscribe {
  return onSnapshot(doc(getFirebaseFirestore(), 'clubs', getClubId()), (snap) => {
    if (!snap.exists()) {
      onData(null);
      return;
    }
    onData((snap.data().branding as BrandingSettings) || null);
  });
}

export async function saveRolesRemote(roles: string[]): Promise<void> {
  await setDoc(
    doc(getFirebaseFirestore(), 'clubs', getClubId()),
    {
      id: getClubId(),
      jobRoles: roles,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

export function subscribeRoles(onData: (roles: string[] | null) => void): Unsubscribe {
  return onSnapshot(doc(getFirebaseFirestore(), 'clubs', getClubId()), (snap) => {
    if (!snap.exists()) {
      onData(null);
      return;
    }
    const raw = snap.data().jobRoles;
    if (!Array.isArray(raw)) {
      onData(null);
      return;
    }
    const cleaned = raw
      .filter((r: unknown): r is string => typeof r === 'string')
      .map((r) => r.trim())
      .filter(Boolean);
    onData(cleaned.length > 0 ? cleaned : null);
  });
}

