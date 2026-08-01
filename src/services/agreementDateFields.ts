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

export function parseIsoDate(iso: string): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) {
    const d = new Date(iso);
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
