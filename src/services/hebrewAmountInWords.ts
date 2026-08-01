/**
 * Converts a numeric ILS amount to Hebrew words, e.g. 1200 → "אלף מאתיים ₪"
 */

const ONES = [
  '',
  'אחד',
  'שניים',
  'שלושה',
  'ארבעה',
  'חמישה',
  'שישה',
  'שבעה',
  'שמונה',
  'תשעה',
];
const ONES_FEM = [
  '',
  'אחת',
  'שתיים',
  'שלוש',
  'ארבע',
  'חמש',
  'שש',
  'שבע',
  'שמונה',
  'תשע',
];
const TENS = [
  '',
  'עשר',
  'עשרים',
  'שלושים',
  'ארבעים',
  'חמישים',
  'שישים',
  'שבעים',
  'שמונים',
  'תשעים',
];
const TEENS = [
  'עשר',
  'אחד עשר',
  'שניים עשר',
  'שלושה עשר',
  'ארבעה עשר',
  'חמישה עשר',
  'שישה עשר',
  'שבעה עשר',
  'שמונה עשר',
  'תשעה עשר',
];
const TEENS_FEM = [
  'עשר',
  'אחת עשרה',
  'שתים עשרה',
  'שלוש עשרה',
  'ארבע עשרה',
  'חמש עשרה',
  'שש עשרה',
  'שבע עשרה',
  'שמונה עשרה',
  'תשע עשרה',
];

function underHundred(n: number, feminine = false): string {
  if (n <= 0) return '';
  if (n < 10) return feminine ? ONES_FEM[n] : ONES[n];
  if (n < 20) return feminine ? TEENS_FEM[n - 10] : TEENS[n - 10];
  const t = Math.floor(n / 10);
  const o = n % 10;
  if (!o) return TENS[t];
  const ones = feminine ? ONES_FEM[o] : ONES[o];
  return `${TENS[t]} ו${ones}`;
}

function underThousand(n: number): string {
  if (n <= 0) return '';
  if (n < 100) return underHundred(n);
  const h = Math.floor(n / 100);
  const rest = n % 100;
  let hundreds = '';
  if (h === 1) hundreds = 'מאה';
  else if (h === 2) hundreds = 'מאתיים';
  else hundreds = `${ONES_FEM[h]} מאות`;
  if (!rest) return hundreds;
  return `${hundreds} ו${underHundred(rest)}`;
}

/** Parse user-entered salary strings like "1,200", "1200 ₪", "₪1,200.50" */
export function parseSalaryAmount(raw: string): number | null {
  if (!raw || !String(raw).trim()) return null;
  const cleaned = String(raw)
    .replace(/[₪\s]/g, '')
    .replace(/,/g, '')
    .replace(/[^\d.]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function numberToHebrewWords(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) return '';
  const whole = Math.floor(amount);
  const agorot = Math.round((amount - whole) * 100);

  if (whole === 0 && agorot === 0) return 'אפס';

  const parts: string[] = [];

  const millions = Math.floor(whole / 1_000_000);
  const thousands = Math.floor((whole % 1_000_000) / 1000);
  const rest = whole % 1000;

  if (millions > 0) {
    if (millions === 1) parts.push('מיליון');
    else if (millions === 2) parts.push('שני מיליון');
    else parts.push(`${underThousand(millions)} מיליון`);
  }

  if (thousands > 0) {
    if (thousands === 1) parts.push('אלף');
    else if (thousands === 2) parts.push('אלפיים');
    else if (thousands < 11) parts.push(`${ONES_FEM[thousands]} אלפים`);
    else parts.push(`${underThousand(thousands)} אלף`);
  }

  if (rest > 0) {
    const restWords = underThousand(rest);
    if (parts.length > 0) parts.push(`ו${restWords}`);
    else parts.push(restWords);
  }

  let result = parts.join(' ');

  if (agorot > 0) {
    const agWords = underHundred(agorot, true);
    result = result
      ? `${result} ו${agWords} אגורות`
      : `${agWords} אגורות`;
  }

  return result;
}

/** e.g. 1200 → "אלף מאתיים ₪" */
export function salaryAmountInWords(rawOrNumber: string | number): string {
  const n =
    typeof rawOrNumber === 'number'
      ? rawOrNumber
      : parseSalaryAmount(rawOrNumber);
  if (n == null) return '';
  const words = numberToHebrewWords(n);
  if (!words) return '';
  return `${words} ₪`;
}
