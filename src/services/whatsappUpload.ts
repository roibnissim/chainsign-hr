import { PersonalFileCategory } from '../types';

/** כרטיסיות שבהן המנהל יכול לשלוח קישור העלאה בווטסאפ */
export const WHATSAPP_UPLOAD_CATEGORIES: PersonalFileCategory[] = [
  'recruitment',
  'tax',
  'employment',
  'absences',
  'pension',
];

export function supportsWhatsAppUpload(category: string): category is PersonalFileCategory {
  return (WHATSAPP_UPLOAD_CATEGORIES as string[]).includes(category);
}

/** נרמול מספר ישראלי לפורמט wa.me (972…) */
export function toWhatsAppNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('972') && digits.length >= 11) return digits;
  if (digits.startsWith('0') && digits.length >= 9) return `972${digits.slice(1)}`;
  if (digits.length === 9) return `972${digits}`;
  return digits.length >= 10 ? digits : null;
}

export function buildWhatsAppShareUrl(phone: string, message: string): string | null {
  const wa = toWhatsAppNumber(phone);
  if (!wa) return null;
  return `https://wa.me/${wa}?text=${encodeURIComponent(message)}`;
}
