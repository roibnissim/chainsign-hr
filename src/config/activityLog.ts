import type { ManagerActivityEvent, PersonalFileCategory } from '../types';
import { FILE_SECTIONS, type FileSectionId } from './employeeFile';

export const ACTIVITY_LOG_STORAGE_KEY = 'club_manager_activity_log';
/** דגל אחרי איפוס מלא + מעבר ל-Firestore בלבד (v3 — מאלץ איפוס נוסף אחרי תיקון שחזור לוג) */
export const ACTIVITY_LOG_FIRESTORE_ONLY_FLAG = 'club_activity_log_firestore_only_v5';

export function fileSectionLabel(sectionId: string): string {
  return FILE_SECTIONS.find((s) => s.id === sectionId)?.label || sectionId;
}

export function clearActivityLogLocal(): void {
  try {
    localStorage.removeItem(ACTIVITY_LOG_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** הלוג נשמר רק ב-Firestore — לא טוענים מ-localStorage */
export function loadActivityEvents(): ManagerActivityEvent[] {
  clearActivityLogLocal();
  return [];
}

/** אין כתיבה ל-localStorage */
export function saveActivityEvents(_events: ManagerActivityEvent[]): void {
  clearActivityLogLocal();
}

export function buildDocumentActivityEvent(params: {
  employeeId: string;
  employeeName: string;
  employeeIdNumber: string;
  category: PersonalFileCategory;
  documentId: string;
  documentTitle: string;
  docType: string;
  createdAt?: string;
}): ManagerActivityEvent {
  const categoryLabel = fileSectionLabel(params.category);
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

export function buildProfileActivityEvent(params: {
  employeeId: string;
  employeeName: string;
  employeeIdNumber: string;
  createdAt?: string;
}): ManagerActivityEvent {
  const createdAt = params.createdAt || new Date().toISOString();
  return {
    id: `act-profile-${params.employeeId}`,
    createdAt,
    status: 'active',
    employeeId: params.employeeId,
    employeeName: params.employeeName,
    employeeIdNumber: params.employeeIdNumber || '',
    fileSection: 'identity' satisfies FileSectionId,
    categoryLabel: fileSectionLabel('identity'),
    description: `${params.employeeName} עדכן/ה את הפרטים המזהים בתיק האישי`,
    sourceKey: `profile:${params.employeeId}`,
  };
}

export function buildAgreementSignedActivityEvent(params: {
  employeeId: string;
  employeeName: string;
  employeeIdNumber?: string;
  agreementId: string;
  docNumber: string;
  title: string;
  createdAt?: string;
}): ManagerActivityEvent {
  const createdAt = params.createdAt || new Date().toISOString();
  return {
    id: `act-agreement-${params.agreementId}`,
    createdAt,
    status: 'active',
    employeeId: params.employeeId,
    employeeName: params.employeeName,
    employeeIdNumber: params.employeeIdNumber || '',
    fileSection: 'salary' satisfies FileSectionId,
    categoryLabel: fileSectionLabel('salary'),
    description: `נחתם הסכם «${params.title}» (${params.docNumber}) עבור ${params.employeeName}`,
    documentTitle: params.title,
    documentId: params.agreementId,
    docType: 'הסכם שכר',
    sourceKey: `agreement:${params.agreementId}`,
  };
}

export function buildDisclosureAcceptedActivityEvent(params: {
  employeeId: string;
  employeeName: string;
  employeeIdNumber?: string;
  agreementId: string;
  docNumber: string;
  title: string;
  createdAt?: string;
}): ManagerActivityEvent {
  const createdAt = params.createdAt || new Date().toISOString();
  return {
    id: `act-disclosure-${params.agreementId}`,
    createdAt,
    status: 'active',
    employeeId: params.employeeId,
    employeeName: params.employeeName,
    employeeIdNumber: params.employeeIdNumber || '',
    fileSection: 'salary' satisfies FileSectionId,
    categoryLabel: fileSectionLabel('salary'),
    description: `${params.employeeName} אישר/ה את הודעת הכניסה וגילוי הנאות לפני חתימה על «${params.title}» (${params.docNumber})`,
    documentTitle: params.title,
    documentId: params.agreementId,
    docType: 'גילוי נאות',
    sourceKey: `disclosure:${params.agreementId}`,
  };
}

export function buildEmployeeSignedPendingActivityEvent(params: {
  employeeId: string;
  employeeName: string;
  employeeIdNumber?: string;
  agreementId: string;
  docNumber: string;
  title: string;
  createdAt?: string;
}): ManagerActivityEvent {
  const createdAt = params.createdAt || new Date().toISOString();
  return {
    id: `act-emp-signed-${params.agreementId}`,
    createdAt,
    status: 'active',
    employeeId: params.employeeId,
    employeeName: params.employeeName,
    employeeIdNumber: params.employeeIdNumber || '',
    fileSection: 'salary' satisfies FileSectionId,
    categoryLabel: fileSectionLabel('salary'),
    description: `${params.employeeName} חתם/ה על «${params.title}» (${params.docNumber}) — נדרשת חתימת מנהלים`,
    documentTitle: params.title,
    documentId: params.agreementId,
    docType: 'הסכם שכר',
    sourceKey: `agreement-emp-signed:${params.agreementId}`,
  };
}

export function mergeActivityEvents(
  existing: ManagerActivityEvent[],
  incoming: ManagerActivityEvent[]
): ManagerActivityEvent[] {
  const keys = new Set(existing.map((e) => e.sourceKey));
  const additions: ManagerActivityEvent[] = [];
  for (const event of incoming) {
    if (!event?.sourceKey || keys.has(event.sourceKey)) continue;
    keys.add(event.sourceKey);
    additions.push(event);
  }
  if (!additions.length) return existing;
  return [...additions, ...existing].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/** מסיר כפילויות קיימות לפי sourceKey (שומר את הראשונה — בדרך כלל החדשה יותר) */
export function dedupeActivityEvents(events: ManagerActivityEvent[]): ManagerActivityEvent[] {
  const seen = new Set<string>();
  const out: ManagerActivityEvent[] = [];
  const sorted = [...events].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  for (const event of sorted) {
    const key = event.sourceKey || event.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(event);
  }
  return out;
}

export function archiveActivityEvent(
  events: ManagerActivityEvent[],
  eventId: string
): ManagerActivityEvent[] {
  const now = new Date().toISOString();
  return events.map((e) =>
    e.id === eventId && e.status === 'active'
      ? { ...e, status: 'archived' as const, archivedAt: now }
      : e
  );
}

export function matchesActivitySearch(event: ManagerActivityEvent, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    event.employeeName,
    event.employeeIdNumber,
    event.employeeId,
    event.description,
    event.categoryLabel,
    event.docType,
    event.documentTitle,
    event.fileSection,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

/** עדכוני עובד — פרופיל / מסמכים בתיק (צ׳קבוקס «עדכוני עובד» בדיגסט) */
export function isEmployeeUpdateActivitySourceKey(sourceKey: string): boolean {
  const key = String(sourceKey || '');
  return key.startsWith('profile:') || key.startsWith('doc:');
}

/**
 * אירועי חתימת הסכם (צ׳קבוקס «הסכם שנחתם» בדיגסט):
 * השלמה מלאה, חתימת עובד שממתינה להנהלה, ואישור גילוי נאות.
 */
export function isAgreementSigningActivitySourceKey(sourceKey: string): boolean {
  const key = String(sourceKey || '');
  return (
    key.startsWith('agreement:') ||
    key.startsWith('agreement-emp-signed:') ||
    key.startsWith('disclosure:')
  );
}

export function filterActivityEventsForDigestPrefs(
  events: { sourceKey?: string }[],
  prefs: { notifyEmployeeUpdates: boolean; notifyAgreementSigned: boolean }
): typeof events {
  return events.filter((e) => {
    const key = String(e.sourceKey || '');
    if (prefs.notifyEmployeeUpdates && isEmployeeUpdateActivitySourceKey(key)) return true;
    if (prefs.notifyAgreementSigned && isAgreementSigningActivitySourceKey(key)) return true;
    return false;
  });
}
