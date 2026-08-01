import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { ensureFirebaseAdmin, getClubIdServer, isFirebaseAdminReady } from './auth/firebaseAdmin';

const SECTION_LABELS: Record<string, string> = {
  identity: 'פרטים מזהים',
  salary: 'הסכמי שכר (בלוקצ׳יין)',
  recruitment: 'תעודות והסמכות',
  tax: 'אישורי מס',
  employment: 'מסמכים שוטפים וניהול העסקה',
  absences: 'היעדרויות ואישורים',
  pension: 'פנסיה וגמל',
  evaluations: 'הערכות ומשמעת',
};

function stripUndefinedDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripUndefinedDeep);
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[key] = stripUndefinedDeep(v);
    }
    return out;
  }
  return value;
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  return stripUndefinedDeep(obj) as T;
}

function clubCol(name: string) {
  ensureFirebaseAdmin();
  return getFirestore().collection('clubs').doc(getClubIdServer()).collection(name);
}

export function parseDataUrl(dataUrl: string): { buffer: Buffer; contentType: string } | null {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!m) return null;
  const contentType = m[1] || 'application/octet-stream';
  const isBase64 = Boolean(m[2]);
  const data = m[3] || '';
  try {
    const buffer = isBase64
      ? Buffer.from(data, 'base64')
      : Buffer.from(decodeURIComponent(data), 'utf8');
    return { buffer, contentType };
  } catch {
    return null;
  }
}

async function uploadBuffer(params: {
  storagePath: string;
  buffer: Buffer;
  contentType: string;
}): Promise<{ storagePath: string; downloadURL: string }> {
  ensureFirebaseAdmin();
  const bucket = getStorage().bucket();
  const file = bucket.file(params.storagePath);
  await file.save(params.buffer, {
    metadata: { contentType: params.contentType },
    resumable: false,
  });
  try {
    await file.makePublic();
  } catch {
    // bucket may block public ACL — fall through to signed URL
  }
  const downloadURL = `https://storage.googleapis.com/${bucket.name}/${params.storagePath}`;
  try {
    const [signed] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000,
    });
    return { storagePath: params.storagePath, downloadURL: signed };
  } catch {
    return { storagePath: params.storagePath, downloadURL };
  }
}

export async function uploadDataUrlToEmployeeFile(params: {
  employeeId: string;
  fileId: string;
  fileName: string;
  dataUrl: string;
}): Promise<{ storagePath: string; downloadURL: string } | null> {
  if (!params.dataUrl.startsWith('data:')) {
    return null;
  }
  const parsed = parseDataUrl(params.dataUrl);
  if (!parsed) return null;
  const safeName = params.fileName.replace(/[^\w.\-א-ת]+/g, '_') || 'file.bin';
  const storagePath = [
    'clubs',
    getClubIdServer(),
    'employees',
    params.employeeId,
    'files',
    `${params.fileId}_${safeName}`,
  ].join('/');
  return uploadBuffer({
    storagePath,
    buffer: parsed.buffer,
    contentType: parsed.contentType,
  });
}

async function uploadEmployeePhoto(params: {
  employeeId: string;
  kind: 'avatar' | 'id-photo';
  dataUrl: string;
}): Promise<string | undefined> {
  if (!params.dataUrl.startsWith('data:')) return params.dataUrl;
  const parsed = parseDataUrl(params.dataUrl);
  if (!parsed) return undefined;
  const storagePath = [
    'clubs',
    getClubIdServer(),
    'employees',
    params.employeeId,
    params.kind,
  ].join('/');
  const up = await uploadBuffer({
    storagePath,
    buffer: parsed.buffer,
    contentType: parsed.contentType,
  });
  return up.downloadURL;
}

export type AdminEmployeePatch = {
  id: string;
  name: string;
  idNumber: string;
  email: string;
  phone?: string;
  address?: string;
  bankAccount?: {
    bankName: string;
    branchNumber: string;
    accountNumber: string;
    accountHolderName: string;
  };
  avatarUrl?: string;
  idCardPhotoUrl?: string;
  profileLockedAt?: string;
  role?: string;
  department?: string;
  startDate?: string;
  agreementsCount?: number;
};

/** מיזוג פרופיל עובד ל-Firestore (Admin). מחזיר את המסמך אחרי המיזוג. */
export async function adminUpsertEmployeeFromPortal(
  patch: AdminEmployeePatch
): Promise<Record<string, unknown>> {
  if (!isFirebaseAdminReady()) {
    throw new Error('firebase_admin_unavailable');
  }
  const ref = clubCol('employees').doc(patch.id);
  const existing = await ref.get();
  const prev = existing.exists ? (existing.data() as Record<string, unknown>) : {};

  let avatarUrl = patch.avatarUrl ?? (prev.avatarUrl as string | undefined);
  let idCardPhotoUrl = patch.idCardPhotoUrl ?? (prev.idCardPhotoUrl as string | undefined);
  if (avatarUrl?.startsWith('data:')) {
    avatarUrl = await uploadEmployeePhoto({
      employeeId: patch.id,
      kind: 'avatar',
      dataUrl: avatarUrl,
    });
  }
  if (idCardPhotoUrl?.startsWith('data:')) {
    idCardPhotoUrl = await uploadEmployeePhoto({
      employeeId: patch.id,
      kind: 'id-photo',
      dataUrl: idCardPhotoUrl,
    });
  }

  const next = stripUndefined({
    id: patch.id,
    name: patch.name,
    idNumber: patch.idNumber,
    email: patch.email,
    phone: patch.phone,
    address: patch.address,
    bankAccount: patch.bankAccount,
    avatarUrl,
    idCardPhotoUrl,
    profileLockedAt: patch.profileLockedAt || (prev.profileLockedAt as string | undefined),
    role: (prev.role as string) || patch.role || 'ספורטאי/ת',
    department: (prev.department as string) || patch.department || '',
    startDate:
      (prev.startDate as string) ||
      patch.startDate ||
      new Date().toISOString().slice(0, 10),
    agreementsCount:
      typeof prev.agreementsCount === 'number'
        ? prev.agreementsCount
        : patch.agreementsCount ?? 0,
  });

  await ref.set(next, { merge: true });
  return next;
}

export type AdminFileDocument = {
  id: string;
  employeeId: string;
  category: string;
  title: string;
  docType: string;
  issuedAt: string;
  notes?: string;
  fileName?: string;
  fileDataUrl?: string;
  storagePath?: string;
  createdAt: string;
};

/** מעלה קובץ ל-Storage (אם data URL) ושומר fileDocuments ב-Firestore. */
export async function adminPersistFileDocument(
  doc: AdminFileDocument
): Promise<AdminFileDocument> {
  if (!isFirebaseAdminReady()) {
    throw new Error('firebase_admin_unavailable');
  }
  let next: AdminFileDocument = { ...doc };
  if (next.fileDataUrl?.startsWith('data:')) {
    const up = await uploadDataUrlToEmployeeFile({
      employeeId: next.employeeId,
      fileId: next.id,
      fileName: next.fileName || `${next.title || 'document'}.bin`,
      dataUrl: next.fileDataUrl,
    });
    if (up) {
      next = {
        ...next,
        fileDataUrl: up.downloadURL,
        storagePath: up.storagePath,
      };
    } else {
      // לא שומרים data URL גדול ב-Firestore
      const { fileDataUrl: _drop, ...rest } = next;
      next = rest;
    }
  }

  const { id, ...rest } = next;
  await clubCol('fileDocuments')
    .doc(id)
    .set(stripUndefined({ id, ...rest } as Record<string, unknown>), { merge: true });
  return next;
}

export async function adminWriteActivityEvent(event: Record<string, unknown>): Promise<void> {
  if (!isFirebaseAdminReady()) {
    throw new Error('firebase_admin_unavailable');
  }
  const id = String(event.id || '');
  if (!id) return;
  await clubCol('activityEvents')
    .doc(id)
    .set(stripUndefined({ ...event, id }), { merge: true });
}

export function buildAdminProfileActivityEvent(params: {
  employeeId: string;
  employeeName: string;
  employeeIdNumber: string;
  createdAt?: string;
}): Record<string, unknown> {
  const createdAt = params.createdAt || new Date().toISOString();
  return {
    id: `act-profile-${params.employeeId}`,
    createdAt,
    status: 'active',
    employeeId: params.employeeId,
    employeeName: params.employeeName,
    employeeIdNumber: params.employeeIdNumber || '',
    fileSection: 'identity',
    categoryLabel: SECTION_LABELS.identity,
    description: `${params.employeeName} עדכן/ה את הפרטים המזהים בתיק האישי`,
    sourceKey: `profile:${params.employeeId}`,
  };
}

export function buildAdminDocumentActivityEvent(params: {
  employeeId: string;
  employeeName: string;
  employeeIdNumber: string;
  category: string;
  documentId: string;
  documentTitle: string;
  docType: string;
  createdAt?: string;
}): Record<string, unknown> {
  const categoryLabel = SECTION_LABELS[params.category] || params.category;
  const createdAt = params.createdAt || new Date().toISOString();
  return {
    id: `act-${params.documentId}`,
    createdAt,
    status: 'active',
    employeeId: params.employeeId,
    employeeName: params.employeeName,
    employeeIdNumber: params.employeeIdNumber || '',
    fileSection: params.category,
    categoryLabel,
    description: `${params.employeeName} הוסיף/ה מסמך «${params.documentTitle}»${
      params.docType ? ` (${params.docType})` : ''
    } בכרטיסיית ${categoryLabel}`,
    docType: params.docType,
    documentTitle: params.documentTitle,
    documentId: params.documentId,
    sourceKey: `doc:${params.documentId}`,
  };
}

export async function adminGetAgreement(
  agreementId: string
): Promise<Record<string, unknown> | null> {
  if (!isFirebaseAdminReady()) throw new Error('firebase_admin_unavailable');
  const snap = await clubCol('agreements').doc(agreementId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

export async function adminGetTemplate(
  templateId: string
): Promise<Record<string, unknown> | null> {
  if (!isFirebaseAdminReady()) throw new Error('firebase_admin_unavailable');
  const snap = await clubCol('templates').doc(templateId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

export async function adminGetAgreementPdfBytes(
  agreementId: string
): Promise<Buffer | null> {
  if (!isFirebaseAdminReady()) throw new Error('firebase_admin_unavailable');
  ensureFirebaseAdmin();
  const clubId = getClubIdServer();
  const storagePath = `clubs/${clubId}/agreements/${agreementId}.pdf`;
  try {
    const [buf] = await getStorage().bucket().file(storagePath).download();
    return buf;
  } catch {
    return null;
  }
}

export async function adminUploadAgreementPdf(
  agreementId: string,
  pdfBytes: Uint8Array | Buffer
): Promise<{ storagePath: string; downloadURL: string }> {
  const clubId = getClubIdServer();
  const storagePath = `clubs/${clubId}/agreements/${agreementId}.pdf`;
  const buffer = Buffer.isBuffer(pdfBytes) ? pdfBytes : Buffer.from(pdfBytes);
  return uploadBuffer({
    storagePath,
    buffer,
    contentType: 'application/pdf',
  });
}

export async function adminMergeAgreement(
  agreementId: string,
  patch: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!isFirebaseAdminReady()) throw new Error('firebase_admin_unavailable');
  const ref = clubCol('agreements').doc(agreementId);
  const clean = stripUndefined(patch);
  await ref.set(clean, { merge: true });
  const snap = await ref.get();
  return { id: snap.id, ...snap.data() };
}

/** מטמיע חתימת עובד בכל שדות החתימה שאינם club */
export async function adminEmbedEmployeeSignatures(params: {
  agreementId: string;
  templateId: string;
  signatureImageDataUrl: string;
}): Promise<{
  fieldSignatures: Array<Record<string, unknown>>;
  storagePath: string;
  downloadURL: string;
}> {
  const { PDFDocument } = await import('pdf-lib');
  const pdfBuf = await adminGetAgreementPdfBytes(params.agreementId);
  if (!pdfBuf) throw new Error('agreement_pdf_missing');
  const template = await adminGetTemplate(params.templateId);
  if (!template) throw new Error('template_missing');

  const fields = (Array.isArray(template.fields) ? template.fields : []) as Array<{
    id: string;
    kind: string;
    signerRole?: string;
    pageIndex: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  const employeeSigFields = fields.filter(
    (f) => f.kind === 'signature' && f.signerRole !== 'club'
  );
  if (!employeeSigFields.length) throw new Error('no_employee_signature_fields');

  const parsed = parseDataUrl(params.signatureImageDataUrl);
  if (!parsed) throw new Error('invalid_signature_image');

  const pdfDoc = await PDFDocument.load(pdfBuf, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  const isJpg =
    parsed.contentType.includes('jpeg') || parsed.contentType.includes('jpg');
  const image = isJpg
    ? await pdfDoc.embedJpg(parsed.buffer)
    : await pdfDoc.embedPng(parsed.buffer);

  for (const field of employeeSigFields) {
    const page = pages[field.pageIndex];
    if (!page) continue;
    const scale = Math.min(field.width / image.width, field.height / image.height);
    const drawW = image.width * scale;
    const drawH = image.height * scale;
    const x = field.x + (field.width - drawW) / 2;
    const y = field.y + (field.height - drawH) / 2;
    page.drawImage(image, { x, y, width: drawW, height: drawH });
  }

  const saved = await pdfDoc.save({ useObjectStreams: true });
  const up = await adminUploadAgreementPdf(params.agreementId, saved);

  const signatureDate = new Date().toISOString();
  // Full image stays in PDF on Storage — Firestore keeps metadata only (no undefined fields)
  const fieldSignatures = employeeSigFields.map((f) => ({
    fieldId: f.id,
    signerRole: 'employee' as const,
    signature: {
      signedBy: '',
      signerEmail: '',
      signerIdNumber: '',
      signatureDate,
      signatureType: 'draw' as const,
      ipAddress: '',
      deviceInfo: 'Employee Signing Portal',
      signatureHash: '',
      signedVia: 'employee_portal',
    },
  }));

  return {
    fieldSignatures,
    storagePath: up.storagePath,
    downloadURL: up.downloadURL,
  };
}

export function buildAdminDisclosureActivityEvent(params: {
  employeeId: string;
  employeeName: string;
  employeeIdNumber: string;
  agreementId: string;
  docNumber: string;
  title: string;
  createdAt?: string;
}): Record<string, unknown> {
  const createdAt = params.createdAt || new Date().toISOString();
  return {
    id: `act-disclosure-${params.agreementId}`,
    createdAt,
    status: 'active',
    employeeId: params.employeeId,
    employeeName: params.employeeName,
    employeeIdNumber: params.employeeIdNumber || '',
    fileSection: 'salary',
    categoryLabel: SECTION_LABELS.salary,
    description: `${params.employeeName} אישר/ה את הודעת הכניסה וגילוי הנאות לפני חתימה על «${params.title}» (${params.docNumber})`,
    documentTitle: params.title,
    documentId: params.agreementId,
    docType: 'גילוי נאות',
    sourceKey: `disclosure:${params.agreementId}`,
  };
}

export function buildAdminEmployeeSignedPendingActivityEvent(params: {
  employeeId: string;
  employeeName: string;
  employeeIdNumber: string;
  agreementId: string;
  docNumber: string;
  title: string;
  createdAt?: string;
}): Record<string, unknown> {
  const createdAt = params.createdAt || new Date().toISOString();
  return {
    id: `act-emp-signed-${params.agreementId}`,
    createdAt,
    status: 'active',
    employeeId: params.employeeId,
    employeeName: params.employeeName,
    employeeIdNumber: params.employeeIdNumber || '',
    fileSection: 'salary',
    categoryLabel: SECTION_LABELS.salary,
    description: `${params.employeeName} חתם/ה על «${params.title}» (${params.docNumber}) — נדרשת חתימת מנהלים`,
    documentTitle: params.title,
    documentId: params.agreementId,
    docType: 'הסכם שכר',
    sourceKey: `agreement-emp-signed:${params.agreementId}`,
  };
}

export { isFirebaseAdminReady };
