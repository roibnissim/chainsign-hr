import type { SalaryAgreement } from '../types';

/** Today as YYYY-MM-DD in local calendar */
export function todayDateIso(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** מנרמל תאריך מ־string / Date / Firestore Timestamp ל־YYYY-MM-DD */
function dateOnly(value: unknown): string | null {
  if (value == null || value === '') return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : todayDateIso(value);
  }

  if (typeof value === 'object') {
    const maybeTs = value as { toDate?: () => Date; seconds?: number };
    if (typeof maybeTs.toDate === 'function') {
      try {
        const d = maybeTs.toDate();
        return d instanceof Date && !Number.isNaN(d.getTime()) ? todayDateIso(d) : null;
      } catch {
        return null;
      }
    }
    if (typeof maybeTs.seconds === 'number') {
      const d = new Date(maybeTs.seconds * 1000);
      return Number.isNaN(d.getTime()) ? null : todayDateIso(d);
    }
  }

  const s = String(value).trim();
  if (!s) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (m) return m[1];
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : todayDateIso(d);
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
