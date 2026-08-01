/** נרמול טלפון ישראלי ל־05xxxxxxxx (10 ספרות) */
export function normalizeIsraeliPhone(input: string): string | null {
  const digits = String(input || '').replace(/\D/g, '');
  if (!digits) return null;
  let local = digits;
  if (local.startsWith('972')) local = `0${local.slice(3)}`;
  if (local.length === 9 && local.startsWith('5')) local = `0${local}`;
  if (!/^05\d{8}$/.test(local)) return null;
  return local;
}

export function maskPhone(phone: string): string {
  const n = normalizeIsraeliPhone(phone) || phone;
  if (n.length < 4) return '****';
  return `${n.slice(0, 3)}****${n.slice(-3)}`;
}
