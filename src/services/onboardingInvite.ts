import { Employee, SalaryAgreement } from '../types';
import { buildWhatsAppShareUrl } from './whatsappUpload';
import { loadBranding } from '../config/branding';
import { authHeadersAsync } from './authGateway';

export type OnboardingDocCategory = 'recruitment' | 'tax' | 'absences' | 'pension';

export const ONBOARDING_DOC_CATEGORIES: {
  id: OnboardingDocCategory;
  label: string;
  suggestedTypes: string[];
  hint: string;
}[] = [
  {
    id: 'recruitment',
    label: 'תעודות והסמכות',
    suggestedTypes: ['תעודה מקצועית', 'קורות חיים', 'המלצה', 'תעודת הסמכה'],
    hint: 'העלה תעודות מקצועיות והסמכות וצפה בהן',
  },
  {
    id: 'tax',
    label: 'אישורי מס',
    suggestedTypes: ['תיאום מס', 'טופס 101', 'צילום מס ישן'],
    hint: 'העלה אישור תיאום מס וצפה בצילומי מס ישנים',
  },
  {
    id: 'absences',
    label: 'היעדרויות',
    suggestedTypes: ['אישור מחלה', 'ימי חופשה', 'אישור מילואים'],
    hint: 'העלה אישורי מחלה ומסמכי היעדרות',
  },
  {
    id: 'pension',
    label: 'פנסיה',
    suggestedTypes: ['טופס קוביות', 'בחירת קרן פנסיה', 'קופת גמל', 'קרן השתלמות'],
    hint: 'העלה טפסי קופת פנסיה/גמל (טופס קוביות)',
  },
];

/** הסכמים מלאים (עובד + כל חותמי המועדון) להצגה בפורטל העובד */
export function isAgreementSignedByBothParties(
  agreement: SalaryAgreement,
  templateFields?: { id: string; kind: string; signerRole?: string }[]
): boolean {
  if (agreement.status !== 'SIGNED') return false;
  if (!templateFields?.length) return true;
  const sigFields = templateFields.filter((f) => f.kind === 'signature');
  if (!sigFields.length) return true;
  const signedIds = new Set((agreement.fieldSignatures || []).map((fs) => fs.fieldId));
  return sigFields.every((f) => signedIds.has(f.id));
}

/** DD-MM-YY מתאריך ISO */
export function formatDocDatePart(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (!m) {
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return isoDate;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    return `${dd}-${mm}-${yy}`;
  }
  return `${m[3]}-${m[2]}-${m[1].slice(-2)}`;
}

/**
 * שם אוטומטי: "תיאום מס 01-01-27"
 * אם כבר קיים באותו יום: "תיאום מס 01-01-27 -1"
 */
export function buildAutoDocumentTitle(
  docType: string,
  issuedAt: string,
  existingTitles: string[]
): string {
  const base = `${docType.trim()} ${formatDocDatePart(issuedAt)}`;
  const related = existingTitles.filter(
    (t) => t === base || t.startsWith(`${base} -`)
  );
  if (related.length === 0) return base;
  return `${base} -${related.length}`;
}

export async function buildSignedAgreementsSnapshot(agreements: SalaryAgreement[]) {
  const signed = agreements.filter((a) => isAgreementSignedByBothParties(a));
  const result = [];
  for (const a of signed) {
    let pdfDataUrl: string | undefined;
    try {
      // מעדיפים URL יציב מ-Storage — לא משבצים PDF כ-data URL להזמנה
      if (a.pdfUrl?.startsWith('http')) {
        pdfDataUrl = a.pdfUrl;
      } else {
        const { useFirebaseStorage } = await import('../config/featureFlags');
        if (useFirebaseStorage()) {
          const { getDownloadURL, ref } = await import('firebase/storage');
          const { getFirebaseStorage } = await import('../lib/firebase');
          const { getClubId } = await import('../config/club');
          pdfDataUrl = await getDownloadURL(
            ref(getFirebaseStorage(), `clubs/${getClubId()}/agreements/${a.id}.pdf`)
          );
        }
      }
    } catch {
      // PDF חסר — הפורטל יציג בלי קישור צפייה
    }
    result.push({
      id: a.id,
      docNumber: a.docNumber,
      title: a.title,
      monthlySalary: a.monthlySalary,
      effectiveDate: a.effectiveDate,
      endDate: a.endDate,
      signedAt: a.signature?.signatureDate,
      pdfDataUrl,
    });
  }
  return result;
}

export function buildOnboardingProfileFromEmployee(emp: Employee) {
  const idNumber = emp.idNumber?.trim() === 'טרם הוזן' ? '' : (emp.idNumber || '');
  const email =
    emp.email?.trim().endsWith('@pending.local') ? '' : (emp.email || '');
  const httpOnly = (url?: string) =>
    url?.startsWith('http') || url?.startsWith('https') ? url : undefined;
  return {
    name: emp.name,
    idNumber,
    phone: emp.phone,
    address: emp.address,
    email,
    bankAccount: emp.bankAccount,
    avatarUrl: httpOnly(emp.avatarUrl),
    idCardPhotoUrl: httpOnly(emp.idCardPhotoUrl),
  };
}

export async function createOnboardingInvite(params: {
  employee: Employee;
  signedAgreements: SalaryAgreement[];
  existingDocuments?: Array<{
    id: string;
    category: OnboardingDocCategory;
    title: string;
    docType: string;
    issuedAt: string;
    notes?: string;
    fileName?: string;
    fileDataUrl?: string;
    createdAt: string;
  }>;
}) {
  const signedAgreements = await buildSignedAgreementsSnapshot(params.signedAgreements);
  const branding = loadBranding();
  const res = await fetch('/api/onboarding-invites', {
    method: 'POST',
    headers: await authHeadersAsync({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      employeeId: params.employee.id,
      employeeName: params.employee.name,
      profileLocked: Boolean(params.employee.profileLockedAt),
      profileLockedAt: params.employee.profileLockedAt,
      profile: buildOnboardingProfileFromEmployee(params.employee),
      signedAgreements,
      documents: (params.existingDocuments || []).map((d) => ({
        ...d,
        // רק קישורי Storage יציבים — לא data URL
        fileDataUrl:
          d.fileDataUrl?.startsWith('http') || d.fileDataUrl?.startsWith('https')
            ? d.fileDataUrl
            : undefined,
        synced: true,
      })),
      branding: {
        clubName: branding.clubName,
        logoDataUrl: branding.logoDataUrl?.startsWith('http')
          ? branding.logoDataUrl
          : null,
        primaryColor: branding.primaryColor,
        accentColor: branding.accentColor,
      },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'create_failed');
  return data as {
    token: string;
    expiresAt: string;
    onboardPath: string;
    reused?: boolean;
  };
}

export function buildOnboardingWhatsAppUrl(phone: string, employeeName: string, absoluteUrl: string) {
  const message =
    `שלום ${employeeName},\n` +
    `התקבלה הזמנה להשלמת התיק האישי שלך במועדון.\n` +
    `נא למלא את הפרטים ולהעלות מסמכים בקישור:\n${absoluteUrl}\n` +
    `לאחר השמירה הראשונה הפרטים האישיים יינעלו; ניתן יהיה להמשיך ולהוסיף קבצים בלבד.`;
  return buildWhatsAppShareUrl(phone, message);
}
