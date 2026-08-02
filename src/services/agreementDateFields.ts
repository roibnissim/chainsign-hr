/** Parts of the line: "ביום ____ לחודש _______ שנת _______" */

const HEBREW_MONTHS = [
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
];

export function parseIsoDate(iso: unknown): Date | null {
  if (iso == null || iso === '') return null;
  if (iso instanceof Date) {
    return Number.isNaN(iso.getTime()) ? null : iso;
  }
  if (typeof iso === 'object') {
    const maybeTs = iso as { toDate?: () => Date; seconds?: number };
    if (typeof maybeTs.toDate === 'function') {
      try {
        const d = maybeTs.toDate();
        return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
      } catch {
        return null;
      }
    }
    if (typeof maybeTs.seconds === 'number') {
      const d = new Date(maybeTs.seconds * 1000);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  const raw = String(iso).trim();
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!m) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatAgreementDateDay(iso: string): string {
  const d = parseIsoDate(iso);
  if (!d) return '';
  return String(d.getDate());
}

export function formatAgreementDateMonth(iso: string, style: 'hebrew' | 'number' = 'hebrew'): string {
  const d = parseIsoDate(iso);
  if (!d) return '';
  if (style === 'number') return String(d.getMonth() + 1);
  return HEBREW_MONTHS[d.getMonth()] || '';
}

export function formatAgreementDateYear(iso: string): string {
  const d = parseIsoDate(iso);
  if (!d) return '';
  return String(d.getFullYear());
}

/** תצוגת תאריך מלא לחוזה: DD/MM/YYYY */
export function formatContractDateDisplay(iso: string): string {
  const d = parseIsoDate(iso);
  if (!d) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getFullYear()}`;
}

export type AgreementDatePart = 'day' | 'month' | 'year';

export function formatAgreementDatePart(
  iso: string,
  part: AgreementDatePart,
  monthStyle: 'hebrew' | 'number' = 'hebrew'
): string {
  switch (part) {
    case 'day':
      return formatAgreementDateDay(iso);
    case 'month':
      return formatAgreementDateMonth(iso, monthStyle);
    case 'year':
      return formatAgreementDateYear(iso);
  }
}
