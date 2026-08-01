/** תפקיד תעסוקתי (רשימה ניתנת לניהול במועדון) */
export type RoleType = string;

export interface BankAccountDetails {
  bankName: string;
  branchNumber: string;
  accountNumber: string;
  accountHolderName: string;
}

export interface Employee {
  id: string;
  name: string;
  idNumber: string; // ת.ז.
  email: string;
  phone?: string;
  address?: string;
  bankAccount?: BankAccountDetails;
  role: RoleType;
  department: string;
  avatarUrl?: string;
  /** צילום תעודת זהות (Data URL) */
  idCardPhotoUrl?: string;
  /**
   * לאחר שמירה ראשונה של העובד בפורטל ההזנה העצמית —
   * פרטי הזהות ננעלים; ניתן רק להוסיף קבצים בכרטיסיות המסמכים.
   */
  profileLockedAt?: string;
  /**
   * עובד פעיל במערכת. ברירת מחדל: true (גם אם השדה חסר).
   * כש־false — קישורי הפורטל נחסמים.
   */
  isActive?: boolean;
  startDate: string;
  agreementsCount: number;
}

/** עובדים ללא השדה נחשבים פעילים */
export function isEmployeeActive(employee: Pick<Employee, 'isActive'>): boolean {
  return employee.isActive !== false;
}

/** תיקיות בתיק האישי (חוץ מהסכמי שכר שנשלפים מהמערכת) */
export type PersonalFileCategory =
  | 'recruitment'
  | 'tax'
  | 'employment'
  | 'absences'
  | 'pension'
  | 'evaluations';

export interface EmployeeFileDocument {
  id: string;
  employeeId: string;
  category: PersonalFileCategory;
  title: string;
  docType: string;
  issuedAt: string;
  notes?: string;
  fileName?: string;
  /** Data URL — רק לקבצים קטנים / מצב מקומי; בפרודקשן עדיף storagePath */
  fileDataUrl?: string;
  /** נתיב Cloud Storage (Firebase) */
  storagePath?: string;
  createdAt: string;
}

export interface SignatureData {
  signedBy: string;
  signerEmail: string;
  signerIdNumber: string;
  signatureDate: string;
  signatureImageBase64?: string;
  signatureType: 'draw' | 'type' | 'crypto_key';
  ipAddress: string;
  deviceInfo: string;
  signatureHash: string;
}

/** חתימה במיקום ספציפי על פורמט PDF */
export interface FieldSignature {
  fieldId: string;
  signature: SignatureData;
  signerRole?: 'employee' | 'club';
}

export interface BlockchainRecord {
  txHash: string;
  blockNumber: number;
  blockHash: string;
  merkleRoot: string;
  timestamp: string;
  smartContractAddress: string;
  gasUsed: number;
  network: 'Ethereum Enterprise Mainnet' | 'Polygon Private Node' | 'Hyperledger Fabric';
  status: 'CONFIRMED' | 'PENDING' | 'REJECTED';
}

export interface SalaryAgreement {
  id: string;
  docNumber: string; // e.g. SAL-2026-089
  title: string;
  employeeId: string;
  employeeName: string;
  role: RoleType;
  department: string;
  monthlySalary: number;
  bonusDetails?: string;
  /** תאריך התחלת החוזה YYYY-MM-DD */
  effectiveDate: string;
  /** תאריך סיום החוזה YYYY-MM-DD */
  endDate?: string;
  createdAt: string;
  status: 'SIGNED' | 'PENDING_SIGNATURE' | 'DRAFT' | 'REVOKED';
  fileHash: string; // SHA-256 of the original/signed PDF
  pdfUrl?: string; // Data URL or object URL of filled/signed PDF
  signature?: SignatureData;
  /** חתימות לפי שדה בפורמט (נספחים וכו') */
  fieldSignatures?: FieldSignature[];
  blockchain?: BlockchainRecord;
  tags: string[];
  version: number;
  notes?: string;
  /** קישור לפורמט PDF */
  templateId?: string;
  /** ערכי שדות שמילאו על הפורמט */
  fieldValues?: Record<string, string>;
  /** אישור גילוי נאות בפורטל החתימה */
  disclosureAcceptedAt?: string;
  /** מועד חתימת העובד בפורטל (לפני מנהלים) */
  employeeSignedAt?: string;
  storagePdfPath?: string | null;
}

export interface AuditLogEvent {
  id: string;
  documentId: string;
  documentTitle: string;
  employeeName: string;
  action: 'CREATED' | 'SENT' | 'VIEWED' | 'SIGNED' | 'ANCHORED_TO_BLOCKCHAIN' | 'VERIFIED' | 'DOWNLOADED';
  timestamp: string;
  actor: string;
  details: string;
  ipAddress: string;
}

/** לוג פעילות למנהל — עדכוני תיק על ידי העובד */
export type ManagerActivityStatus = 'active' | 'archived';

export interface ManagerActivityEvent {
  id: string;
  createdAt: string;
  status: ManagerActivityStatus;
  archivedAt?: string;
  employeeId: string;
  employeeName: string;
  employeeIdNumber: string;
  /** כרטיסייה בתיק האישי לפתיחה בלחיצה */
  fileSection: string;
  categoryLabel: string;
  description: string;
  docType?: string;
  documentTitle?: string;
  documentId?: string;
  /** מפתח למניעת כפילויות (למשל doc:xyz) */
  sourceKey: string;
}

export type TemplateFieldKind =
  | 'employee_name'
  | 'id_number'
  | 'phone'
  | 'address'
  | 'email'
  | 'salary'
  | 'salary_words'
  | 'date_day'
  | 'date_month'
  | 'date_year'
  | 'text'
  | 'signature';

export type TemplateSignerRole = 'employee' | 'club';

export interface TemplateField {
  id: string;
  kind: TemplateFieldKind;
  label: string;
  /** עמוד ב-PDF, 0-based */
  pageIndex: number;
  /** קואורדינטות PDF בנקודות — מקור בפינה השמאלית-תחתונה */
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  /** רק ל-signature */
  signerRole?: TemplateSignerRole;
  /** ל-salary_words: מזהה שדה סכום מספרי שממנו נגזר הטקסט */
  linkedSalaryFieldId?: string;
  /** ל-date_month: תצוגת חודש בעברית (ברירת מחדל) או מספר */
  monthFormat?: 'hebrew' | 'number';
}

export interface AgreementTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  recommendedRole: RoleType;
  createdAt: string;
  sourceFileName: string;
  pageCount: number;
  fields: TemplateField[];
}

export interface FilterState {
  searchQuery: string;
  employeeId: string;
  role: string;
  status: string;
  blockchainVerifiedOnly: boolean;
  dateRange: 'ALL' | 'THIS_MONTH' | 'THIS_YEAR' | 'CUSTOM';
}

export const TEMPLATE_FIELD_KIND_LABELS: Record<TemplateFieldKind, string> = {
  employee_name: 'שם העובד',
  id_number: 'תעודת זהות',
  phone: 'טלפון',
  address: 'כתובת',
  email: 'אימייל',
  salary: 'סכום שכר',
  salary_words: 'סכום במילים',
  date_day: 'יום בחודש (תאריך הסכם)',
  date_month: 'חודש (תאריך הסכם)',
  date_year: 'שנה (תאריך הסכם)',
  text: 'טקסט חופשי',
  signature: 'מקום חתימה',
};
