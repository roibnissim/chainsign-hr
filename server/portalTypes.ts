export type OnboardingDocCategory = 'recruitment' | 'tax' | 'absences' | 'pension';

export interface OnboardingProfile {
  name: string;
  idNumber: string;
  phone?: string;
  address?: string;
  email: string;
  bankAccount?: {
    bankName: string;
    branchNumber: string;
    accountNumber: string;
    accountHolderName: string;
  };
  avatarUrl?: string;
  idCardPhotoUrl?: string;
}

export interface OnboardingDocument {
  id: string;
  category: OnboardingDocCategory;
  title: string;
  docType: string;
  issuedAt: string;
  notes?: string;
  fileName?: string;
  fileDataUrl?: string;
  createdAt: string;
  synced?: boolean;
}

export interface OnboardingAgreementView {
  id: string;
  docNumber: string;
  title: string;
  monthlySalary: number;
  effectiveDate: string;
  signedAt?: string;
  /** PDF לצפייה בפורטל — רק URL יציב (http), לא data URL */
  pdfDataUrl?: string;
}

export interface OnboardingInviteRecord {
  token: string;
  employeeId: string;
  employeeName: string;
  createdAt: string;
  expiresAt: string;
  profileLocked: boolean;
  profileLockedAt?: string;
  profile: OnboardingProfile;
  documents: OnboardingDocument[];
  signedAgreements: OnboardingAgreementView[];
  needsSync: boolean;
  lastSyncedAt?: string;
  branding?: {
    clubName: string;
    logoDataUrl?: string | null;
    primaryColor?: string;
    accentColor?: string;
  };
}

export interface UploadRequestRecord {
  token: string;
  employeeId: string;
  employeeName: string;
  category: string;
  categoryLabel: string;
  suggestedTypes: string[];
  createdAt: string;
  expiresAt: string;
  status: 'pending' | 'completed' | 'expired';
  uploadedDoc?: {
    id: string;
    title: string;
    docType: string;
    issuedAt: string;
    notes?: string;
    fileName?: string;
    fileDataUrl?: string;
    createdAt: string;
  };
  imported?: boolean;
}

/** הזמנת חתימת עובד על הסכם (OTP + גילוי נאות) */
export interface SigningInviteRecord {
  token: string;
  agreementId: string;
  employeeId: string;
  employeeName: string;
  phone?: string;
  docNumber: string;
  title: string;
  createdAt: string;
  expiresAt: string;
  status: 'pending' | 'completed' | 'expired';
  disclosureAcceptedAt?: string;
  completedAt?: string;
}
