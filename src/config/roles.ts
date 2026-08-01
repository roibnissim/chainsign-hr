import type { RoleType } from '../types';

export const ROLES_STORAGE_KEY = 'club_job_roles';

/** רשימת ברירת מחדל — ניתנת לעריכה בממשק */
export const DEFAULT_ROLES: RoleType[] = [
  'שחקן/ית כדורמים',
  'ספורטאי/ת התעמלות',
  'ספורטאי/ת',
  'מאמן/ת',
  'מנהל/ת משאבי אנוש',
  'מנהל/ת כספים',
  'מפתח תוכנה בכיר',
  'מפתח Fullstack',
  'מנהל/ת מוצר',
  'מנהל/ת צוות פיתוח',
  'איש/אשת מכירות',
  'אנליסט/ית נתונים',
  'מעצב/ת UI/UX',
  'בודק/ת תוכנה QA',
];

export function loadRoles(): RoleType[] {
  try {
    const raw = localStorage.getItem(ROLES_STORAGE_KEY);
    if (!raw) return [...DEFAULT_ROLES];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_ROLES];
    const cleaned = parsed
      .filter((r): r is string => typeof r === 'string')
      .map((r) => r.trim())
      .filter(Boolean);
    return cleaned.length > 0 ? cleaned : [...DEFAULT_ROLES];
  } catch {
    return [...DEFAULT_ROLES];
  }
}

export function saveRoles(roles: RoleType[]): void {
  localStorage.setItem(ROLES_STORAGE_KEY, JSON.stringify(roles));
}
