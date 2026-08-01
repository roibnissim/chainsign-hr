import { getDownloadURL, ref, uploadBytes, deleteObject } from 'firebase/storage';
import { getClubId } from '../../config/club';
import { getFirebaseStorage } from '../../lib/firebase';

function path(...parts: string[]): string {
  return ['clubs', getClubId(), ...parts].join('/');
}

async function upload(
  storagePath: string,
  data: Blob | ArrayBuffer | Uint8Array,
  contentType: string
): Promise<{ storagePath: string; downloadURL: string }> {
  const r = ref(getFirebaseStorage(), storagePath);
  const body =
    data instanceof Uint8Array
      ? data
      : data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : data;
  await uploadBytes(r, body, { contentType });
  const downloadURL = await getDownloadURL(r);
  return { storagePath, downloadURL };
}

export async function uploadEmployeeFile(params: {
  employeeId: string;
  fileId: string;
  fileName: string;
  data: Blob | ArrayBuffer | Uint8Array;
  contentType?: string;
}): Promise<{ storagePath: string; downloadURL: string }> {
  const safeName = params.fileName.replace(/[^\w.\-א-ת]+/g, '_');
  const storagePath = path(
    'employees',
    params.employeeId,
    'files',
    `${params.fileId}_${safeName}`
  );
  return upload(storagePath, params.data, params.contentType || 'application/octet-stream');
}

export async function uploadIdPhoto(params: {
  employeeId: string;
  data: Blob | ArrayBuffer | Uint8Array;
  contentType?: string;
}): Promise<{ storagePath: string; downloadURL: string }> {
  const storagePath = path('employees', params.employeeId, 'id-photo');
  return upload(storagePath, params.data, params.contentType || 'image/jpeg');
}

export async function uploadAvatarPhoto(params: {
  employeeId: string;
  data: Blob | ArrayBuffer | Uint8Array;
  contentType?: string;
}): Promise<{ storagePath: string; downloadURL: string }> {
  const storagePath = path('employees', params.employeeId, 'avatar');
  return upload(storagePath, params.data, params.contentType || 'image/jpeg');
}

/** תמונת פרופיל למנהל/משתמש מערכת */
export async function uploadManagerAvatar(params: {
  userId: string;
  data: Blob | ArrayBuffer | Uint8Array;
  contentType?: string;
}): Promise<{ storagePath: string; downloadURL: string }> {
  const storagePath = path('users', params.userId, 'avatar');
  return upload(storagePath, params.data, params.contentType || 'image/jpeg');
}

export async function uploadTemplatePdf(
  templateId: string,
  data: ArrayBuffer | Uint8Array
): Promise<{ storagePath: string; downloadURL: string }> {
  const storagePath = path('templates', `${templateId}.pdf`);
  return upload(storagePath, data, 'application/pdf');
}

export async function uploadAgreementPdf(
  agreementId: string,
  data: ArrayBuffer | Uint8Array
): Promise<{ storagePath: string; downloadURL: string }> {
  const storagePath = path('agreements', `${agreementId}.pdf`);
  return upload(storagePath, data, 'application/pdf');
}

export async function uploadBrandingLogo(
  data: Blob | ArrayBuffer | Uint8Array,
  contentType: string
): Promise<{ storagePath: string; downloadURL: string }> {
  const storagePath = path('branding', 'logo');
  return upload(storagePath, data, contentType);
}

export async function deleteStoragePath(storagePath: string): Promise<void> {
  try {
    await deleteObject(ref(getFirebaseStorage(), storagePath));
  } catch {
    // ignore missing
  }
}

/** מחזיר URL לצפייה/הורדה — Data URL, HTTP, או מ־Storage לפי storagePath */
export async function resolveEmployeeAttachmentUrl(params: {
  fileDataUrl?: string;
  storagePath?: string;
}): Promise<string | null> {
  if (params.fileDataUrl) return params.fileDataUrl;
  if (!params.storagePath) return null;
  try {
    return await getDownloadURL(ref(getFirebaseStorage(), params.storagePath));
  } catch (err) {
    console.error('resolveEmployeeAttachmentUrl', err);
    return null;
  }
}

export async function dataUrlToBlob(dataUrl: string): Promise<{ blob: Blob; contentType: string }> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return { blob, contentType: blob.type || 'application/octet-stream' };
}
