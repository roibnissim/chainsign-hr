import type { SalaryAgreement } from '../types';

/** Today as YYYY-MM-DD in local calendar */
export function todayDateIso(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateOnly(iso: string | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso.trim());
  return m ? m[1] : null;
}

/**
 * הסכם חתום ובטווח התאריכים (התחלה ≤ היום ≤ סיום).
 * בלי endDate — לא נספר בהיקף שכר (הסכמים ישנים).
 */
export function isAgreementInForce(
  agreement: Pick<SalaryAgreement, 'status' | 'effectiveDate' | 'endDate'>,
  onDate: string = todayDateIso()
): boolean {
  if (agreement.status !== 'SIGNED') return false;
  const start = dateOnly(agreement.effectiveDate);
  const end = dateOnly(agreement.endDate);
  if (!start || !end) return false;
  const day = dateOnly(onDate) || onDate;
  return start <= day && day <= end;
}

/** אחרי תאריך סיום התוקף (או חסר endDate להסכם חתום) */
export function isAgreementPastEndDate(
  agreement: Pick<SalaryAgreement, 'status' | 'endDate'>,
  onDate: string = todayDateIso()
): boolean {
  if (agreement.status !== 'SIGNED') return false;
  const end = dateOnly(agreement.endDate);
  const day = dateOnly(onDate) || onDate;
  if (!end) return true;
  return day > end;
}

/**
 * חתום אך לא פעיל היום: פג תוקף, עדיין לא התחיל, או חסר endDate.
 */
export function isAgreementExpiredOrInactive(
  agreement: Pick<SalaryAgreement, 'status' | 'effectiveDate' | 'endDate'>,
  onDate: string = todayDateIso()
): boolean {
  if (agreement.status !== 'SIGNED') return false;
  return !isAgreementInForce(agreement, onDate);
}

/** alias לקריאות UI — הסכם לא פעיל */
export const isAgreementInactive = isAgreementExpiredOrInactive;

export function agreementValidityLabel(
  agreement: Pick<SalaryAgreement, 'status' | 'effectiveDate' | 'endDate'>,
  onDate: string = todayDateIso()
): 'פעיל' | 'לא פעיל' | null {
  if (agreement.status !== 'SIGNED') return null;
  return isAgreementInForce(agreement, onDate) ? 'פעיל' : 'לא פעיל';
}
