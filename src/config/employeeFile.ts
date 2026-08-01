import { PersonalFileCategory } from '../types';
import {
  User,
  UserPlus,
  Receipt,
  FolderOpen,
  CalendarOff,
  PiggyBank,
  Scale,
  ShieldCheck,
  LucideIcon,
} from 'lucide-react';

export type FileSectionId = 'identity' | 'salary' | PersonalFileCategory;

export interface FileSectionMeta {
  id: FileSectionId;
  label: string;
  shortLabel: string;
  description: string;
  icon: LucideIcon;
  /** סוגי מסמך מוצעים להוספה מהירה */
  suggestedTypes?: string[];
}

export const FILE_SECTIONS: FileSectionMeta[] = [
  {
    id: 'identity',
    label: 'פרטים מזהים',
    shortLabel: 'פרטים',
    description: 'תמונה, שם, ת.ז., כתובת, טלפון וחשבון בנק',
    icon: User,
  },
  {
    id: 'salary',
    label: 'הסכמי שכר (בלוקצ׳יין)',
    shortLabel: 'שכר',
    description: 'הסכמים חתומים ומאומתים במערכת',
    icon: ShieldCheck,
  },
  {
    id: 'recruitment',
    label: 'תעודות והסמכות',
    shortLabel: 'תעודות והסמכות',
    description: 'תעודות מקצועיות, הסמכות, קורות חיים והמלצות',
    icon: UserPlus,
    suggestedTypes: ['תעודה מקצועית', 'תעודת הסמכה', 'קורות חיים', 'המלצה', 'תוצאות מבחן מיון', 'סיכום ראיון'],
  },
  {
    id: 'tax',
    label: 'אישורי מס',
    shortLabel: 'אישורי מס',
    description: 'טופס 101 ואישורי תיאום מס',
    icon: Receipt,
    suggestedTypes: ['תיאום מס', 'טופס 101', 'צילום מס ישן', 'אישור רשות המסים'],
  },
  {
    id: 'employment',
    label: 'מסמכים שוטפים וניהול העסקה',
    shortLabel: 'העסקה',
    description: 'מסמכי העסקה שוטפים ועדכוני תנאים',
    icon: FolderOpen,
    suggestedTypes: ['עדכון תנאי העסקה', 'נספח תפקיד', 'אישור העסקה', 'מסמך כללי'],
  },
  {
    id: 'absences',
    label: 'היעדרויות ואישורים',
    shortLabel: 'היעדרויות',
    description: 'מחלה, חופשה, מילואים וחופשת לידה',
    icon: CalendarOff,
    suggestedTypes: ['אישור מחלה', 'ימי חופשה', 'אישור מילואים', 'חופשת לידה'],
  },
  {
    id: 'pension',
    label: 'פנסיה וגמל',
    shortLabel: 'פנסיה',
    description: 'בחירת קרנות ואישורי הפקדה',
    icon: PiggyBank,
    suggestedTypes: ['טופס קוביות', 'בחירת קרן פנסיה', 'קופת גמל', 'קרן השתלמות', 'אישור הפקדה'],
  },
  {
    id: 'evaluations',
    label: 'הערכות ומשמעת',
    shortLabel: 'הערכות',
    description: 'שימועים, הערכות, משובים והליכי משמעת',
    icon: Scale,
    suggestedTypes: ['מכתב הערכה', 'משוב מקצועי', 'שימוע', 'תיעוד משמעת'],
  },
];

export const PERSONAL_FILE_CATEGORIES = FILE_SECTIONS
  .filter((s): s is FileSectionMeta & { id: PersonalFileCategory } =>
    !['identity', 'salary'].includes(s.id)
  )
  .map(s => s.id);
