import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Eye,
  FilePlus2,
  FileText,
  Loader2,
  Lock,
  Paperclip,
  Save,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  User,
} from 'lucide-react';
import { fieldClassXs } from './ui/PageBanner';
import {
  buildAutoDocumentTitle,
  ONBOARDING_DOC_CATEGORIES,
  OnboardingDocCategory,
} from '../services/onboardingInvite';
import { isAgreementExpiredOrInactive } from '../services/agreementValidity';
import { ClubLogo } from './ClubLogo';
import { CameraOrFilePick } from './CameraOrFilePick';
import {
  AttachmentSource,
  FileAttachmentViewer,
} from './FileAttachmentViewer';
import { DEFAULT_BRANDING, applyDocumentBranding, loadBranding } from '../config/branding';

interface OnboardingPortalProps {
  token: string;
}

interface PortalDoc {
  id: string;
  category: OnboardingDocCategory;
  title: string;
  docType: string;
  issuedAt: string;
  notes?: string;
  fileName?: string;
  fileDataUrl?: string;
  createdAt: string;
  hasFile?: boolean;
}

interface PortalAgreement {
  id: string;
  docNumber: string;
  title: string;
  monthlySalary: number;
  effectiveDate: string;
  endDate?: string;
  signedAt?: string;
  pdfDataUrl?: string;
}

interface PortalState {
  employeeName: string;
  profileLocked: boolean;
  requiresOtp?: boolean;
  phoneMasked?: string | null;
  hasPhone?: boolean;
  profile: {
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
  };
  documents: PortalDoc[];
  signedAgreements: PortalAgreement[];
  branding?: {
    clubName: string;
    logoDataUrl?: string | null;
    primaryColor?: string;
    accentColor?: string;
  } | null;
}

type TabId = 'identity' | 'salary' | OnboardingDocCategory;

const MAX_BYTES = 450 * 1024;

const TABS: { id: TabId; label: string }[] = [
  { id: 'identity', label: 'פרטים' },
  { id: 'salary', label: 'שכר' },
  { id: 'recruitment', label: 'תעודות והסמכות' },
  { id: 'tax', label: 'אישורי מס' },
  { id: 'absences', label: 'היעדרויות' },
  { id: 'pension', label: 'פנסיה' },
];

export const EmployeeOnboardingPortal: React.FC<OnboardingPortalProps> = ({ token }) => {
  const portalTokenKey = `club_onboard_portal_${token}`;
  const getPortalToken = () => {
    try {
      return sessionStorage.getItem(portalTokenKey);
    } catch {
      return null;
    }
  };
  const setPortalToken = (value: string | null) => {
    try {
      if (value) sessionStorage.setItem(portalTokenKey, value);
      else sessionStorage.removeItem(portalTokenKey);
    } catch {
      // ignore
    }
  };
  const portalHeaders = (extra?: HeadersInit): HeadersInit => {
    const pt = getPortalToken();
    return {
      ...(extra || {}),
      ...(pt ? { Authorization: `Bearer ${pt}` } : {}),
    };
  };

  const [state, setState] = useState<PortalState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [otpRequired, setOtpRequired] = useState(false);
  const [viewingAttachment, setViewingAttachment] = useState<AttachmentSource | null>(null);
  const [otpMeta, setOtpMeta] = useState<{
    employeeName: string;
    phoneMasked: string | null;
    hasPhone: boolean;
    branding?: PortalState['branding'];
  } | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpHint, setOtpHint] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('identity');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [consentChecked, setConsentChecked] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);

  const [name, setName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const [bankName, setBankName] = useState('');
  const [branchNumber, setBranchNumber] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>();
  const [idCardPhotoUrl, setIdCardPhotoUrl] = useState<string | undefined>();

  const [docType, setDocType] = useState('');
  const [docDate, setDocDate] = useState(new Date().toISOString().split('T')[0]);
  const [docNotes, setDocNotes] = useState('');
  const [docFileName, setDocFileName] = useState<string | undefined>();
  const [docFileDataUrl, setDocFileDataUrl] = useState<string | undefined>();

  const applyPortalBranding = (brand: PortalState['branding']) => {
    if (!brand) return;
    if (brand.primaryColor) {
      const root = document.documentElement;
      root.style.setProperty('--brand', brand.primaryColor);
      root.style.setProperty('--brand-dark', brand.primaryColor);
    }
    if (brand.accentColor) {
      document.documentElement.style.setProperty('--accent', brand.accentColor);
    }
    applyDocumentBranding({
      ...DEFAULT_BRANDING,
      clubName: brand.clubName || DEFAULT_BRANDING.clubName,
      logoDataUrl: brand.logoDataUrl ?? null,
      primaryColor: brand.primaryColor || DEFAULT_BRANDING.primaryColor,
      accentColor: brand.accentColor || DEFAULT_BRANDING.accentColor,
    });
  };

  const applyState = (data: PortalState, opts?: { preserveForm?: boolean }) => {
    setState(data);
    setOtpRequired(false);

    applyPortalBranding(data.branding);

    if (data.profileLocked) {
      setConsentAccepted(true);
    }

    // רענון שקט / סנכרון — מעדכן מסמכים והסכמים בלבד, בלי לדרוס שדות שהעובד מקליד
    if (opts?.preserveForm) {
      return;
    }

    setName(data.profile?.name || '');
    const rawId = data.profile?.idNumber || '';
    setIdNumber(rawId.trim() === 'טרם הוזן' ? '' : rawId);
    setPhone(data.profile?.phone || '');
    setAddress(data.profile?.address || '');
    const rawEmail = data.profile?.email || '';
    setEmail(rawEmail.trim().endsWith('@pending.local') ? '' : rawEmail);
    setBankName(data.profile?.bankAccount?.bankName || '');
    setBranchNumber(data.profile?.bankAccount?.branchNumber || '');
    setAccountNumber(data.profile?.bankAccount?.accountNumber || '');
    setAccountHolderName(data.profile?.bankAccount?.accountHolderName || data.profile?.name || '');
    setAvatarUrl(data.profile?.avatarUrl);
    setIdCardPhotoUrl(data.profile?.idCardPhotoUrl);
  };

  const load = async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await fetch(`/api/onboarding-invites/${encodeURIComponent(token)}`, {
        headers: portalHeaders(),
      });
      const data = await res.json();
      if (res.status === 410) {
        setError('פג תוקף הקישור. פנה למנהל לקבלת קישור חדש.');
        return;
      }
      if (res.status === 403 && data.error === 'employee_inactive') {
        setError('העובד אינו פעיל במערכת — לא ניתן להיכנס לפורטל.');
        return;
      }
      if (!res.ok) {
        if (!opts?.silent) setError('הקישור אינו תקף.');
        return;
      }
      if (data.requiresOtp) {
        if (opts?.silent) return;
        setOtpRequired(true);
        setOtpMeta({
          employeeName: data.employeeName,
          phoneMasked: data.phoneMasked,
          hasPhone: Boolean(data.hasPhone),
          branding: data.branding,
        });
        applyPortalBranding(data.branding);
        return;
      }
      applyState(data, { preserveForm: Boolean(opts?.silent) });
    } catch {
      if (!opts?.silent) {
        setError('לא ניתן להתחבר לשרת. ודא שהמערכת פועלת (npm run dev).');
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // סנכרון מסמכים ברקע — בלי לאפס את טופס הפרטים
  useEffect(() => {
    if (!state || otpRequired) return;
    // בזמן מילוי פרטים (לפני נעילה) אין צורך ברענון תכוף של זהות
    const intervalMs = state.profileLocked ? 8000 : 15000;
    const tick = () => {
      void load({ silent: true });
    };
    const interval = window.setInterval(tick, intervalMs);
    return () => {
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.token, state?.profileLocked, otpRequired, token]);

  const handleSendEmployeeOtp = async () => {
    setOtpBusy(true);
    setOtpError(null);
    setOtpHint(null);
    try {
      const res = await fetch(
        `/api/onboarding-invites/${encodeURIComponent(token)}/otp/request`,
        { method: 'POST' }
      );
      const data = await res.json();
      if (!res.ok) {
        setOtpError(data.message || 'שליחת הקוד נכשלה');
        return;
      }
      setOtpSent(true);
      if (data.testCode) {
        setOtpCode(data.testCode);
        setOtpHint(`מצב בדיקה — הקוד שלך: ${data.testCode}`);
      } else if (data.message) {
        setOtpHint(data.message);
      }
    } catch {
      setOtpError('שגיאת רשת');
    } finally {
      setOtpBusy(false);
    }
  };

  const handleVerifyEmployeeOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpBusy(true);
    setOtpError(null);
    try {
      const res = await fetch(
        `/api/onboarding-invites/${encodeURIComponent(token)}/otp/verify`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: otpCode }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setOtpError(data.message || 'קוד שגוי');
        return;
      }
      setPortalToken(data.portalToken);
      applyState(data.invite);
    } catch {
      setOtpError('שגיאת רשת');
    } finally {
      setOtpBusy(false);
    }
  };

  useEffect(() => {
    if (tab === 'identity' || tab === 'salary') return;
    const meta = ONBOARDING_DOC_CATEGORIES.find((c) => c.id === tab);
    setDocType(meta?.suggestedTypes[0] || 'מסמך');
    setDocFileName(undefined);
    setDocFileDataUrl(undefined);
    setDocNotes('');
  }, [tab]);

  const locked = Boolean(state?.profileLocked);

  const categoryDocs = useMemo(() => {
    if (!state || !state.documents || tab === 'identity' || tab === 'salary') return [];
    return state.documents
      .filter((d) => d.category === tab)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [state, tab]);

  const previewDocTitle = useMemo(() => {
    if (!docType || tab === 'identity' || tab === 'salary') return '';
    const existing = categoryDocs.map((d) => d.title);
    return buildAutoDocumentTitle(docType, docDate, existing);
  }, [docType, docDate, categoryDocs, tab]);

  const pickAvatar = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('נא לבחור קובץ תמונה (JPG, PNG או WebP)');
      return;
    }
    if (file.size > MAX_BYTES) {
      alert('גודל התמונה מוגבל לכ־450KB. נסה תמונה קטנה יותר.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatarUrl(String(reader.result));
    reader.readAsDataURL(file);
  };

  const pickIdCard = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/') && !file.type.includes('pdf')) {
      alert('נא לבחור תמונה או PDF');
      return;
    }
    if (file.size > MAX_BYTES) {
      alert('גודל הקובץ מוגבל לכ־450KB. נסה קובץ קטן יותר.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setIdCardPhotoUrl(String(reader.result));
    reader.readAsDataURL(file);
  };

  const handleAcceptConsent = () => {
    if (!consentChecked) {
      alert('יש לאשר את ההצהרה כדי להמשיך');
      return;
    }
    setConsentAccepted(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (locked) return;
    if (
      !name.trim() ||
      !idNumber.trim() ||
      !email.trim() ||
      !phone.trim() ||
      !address.trim() ||
      !avatarUrl ||
      !idCardPhotoUrl ||
      !bankName.trim() ||
      !branchNumber.trim() ||
      !accountNumber.trim() ||
      !accountHolderName.trim()
    ) {
      alert('נא למלא את כל השדות החובה, כולל תמונת פנים, צילום תעודת זהות ופרטי בנק.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/onboarding-invites/${encodeURIComponent(token)}/profile`, {
        method: 'PUT',
        headers: portalHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          name,
          idNumber,
          phone,
          address,
          email,
          avatarUrl,
          idCardPhotoUrl,
          bankAccount: {
            bankName,
            branchNumber,
            accountNumber,
            accountHolderName,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(
          data.error === 'profile_locked'
            ? 'הפרטים כבר נשמרו וננעלו.'
            : data.error === 'missing_fields'
              ? 'נא למלא את כל השדות החובה.'
              : 'שגיאה בשמירת הפרטים'
        );
        return;
      }
      applyState(data);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    } catch {
      alert('שגיאת רשת בשמירה');
    } finally {
      setSaving(false);
    }
  };

  const handleUploadDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tab === 'identity' || tab === 'salary') return;
    if (!docType.trim()) return;
    if (!docFileName && !docFileDataUrl) {
      alert('נא לצרף קובץ');
      return;
    }
    setUploading(true);
    try {
      const title = buildAutoDocumentTitle(
        docType,
        docDate,
        categoryDocs.map((d) => d.title)
      );
      const res = await fetch(`/api/onboarding-invites/${encodeURIComponent(token)}/documents`, {
        method: 'POST',
        headers: portalHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          category: tab,
          title,
          docType,
          issuedAt: docDate,
          notes: docNotes,
          fileName: docFileName,
          fileDataUrl: docFileDataUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert('שגיאה בהעלאת המסמך');
        return;
      }
      if (data.invite) applyState(data.invite);
      setDocNotes('');
      setDocFileName(undefined);
      setDocFileDataUrl(undefined);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch {
      alert('שגיאת רשת בהעלאה');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-600">
        <Loader2 className="w-6 h-6 animate-spin ml-2" />
        טוען טופס הזנה...
      </div>
    );
  }

  if (otpRequired && otpMeta) {
    const clubName =
      otpMeta.branding?.clubName || loadBranding().clubName || DEFAULT_BRANDING.clubName;
    const logoSrc = otpMeta.branding?.logoDataUrl || loadBranding().logoDataUrl || null;
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-50 to-slate-100 p-4" dir="rtl">
        <div className="max-w-md mx-auto my-8 bg-white rounded-3xl border border-slate-200 shadow-lg overflow-hidden">
          <div
            className="px-6 py-5 text-white"
            style={{
              background:
                'linear-gradient(105deg, var(--brand-dark, #006699), var(--brand, #0088CC))',
            }}
          >
            <div className="flex items-center gap-3">
              <ClubLogo src={logoSrc} size="lg" alt={`לוגו ${clubName}`} />
              <div>
                <p className="text-xs text-white/80 font-bold">אימות זהות · {clubName}</p>
                <h1 className="text-lg font-black">{otpMeta.employeeName}</h1>
              </div>
            </div>
          </div>
          <form onSubmit={(e) => void handleVerifyEmployeeOtp(e)} className="p-6 space-y-4">
            <p className="text-sm text-slate-600 leading-relaxed">
              לשמירה על פרטיותך נדרש אימות באמצעות קוד SMS למספר{' '}
              <strong className="font-mono">{otpMeta.phoneMasked || 'המוגדר בתיק'}</strong>.
            </p>
            {!otpMeta.hasPhone ? (
              <p className="text-xs text-rose-600 font-bold">
                לא הוגדר טלפון בהזמנה. פנה למנהל לעדכון מספר הטלפון ושליחת קישור מחדש.
              </p>
            ) : (
              <>
                {otpSent && (
                  <label className="block space-y-1">
                    <span className="text-xs font-bold text-slate-600">קוד אימות</span>
                    <input
                      className={`${fieldClassXs} font-mono tracking-widest text-center`}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="______"
                      inputMode="numeric"
                      required
                    />
                  </label>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={otpBusy}
                    onClick={() => void handleSendEmployeeOtp()}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 font-bold text-xs disabled:opacity-40"
                  >
                    {otpSent ? 'שלח קוד מחדש' : 'שלח קוד ב־SMS'}
                  </button>
                  {otpSent && (
                    <button
                      type="submit"
                      disabled={otpBusy || otpCode.length < 6}
                      className="flex-1 py-2.5 rounded-xl text-white font-extrabold text-xs disabled:opacity-40"
                      style={{ backgroundColor: 'var(--brand, #0088CC)' }}
                    >
                      {otpBusy ? 'מאמת…' : 'אימות והמשך'}
                    </button>
                  )}
                </div>
              </>
            )}
            {otpHint && (
              <p className="text-[11px] text-amber-800 font-bold bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                {otpHint}
              </p>
            )}
            {otpError && (
              <p className="text-xs text-rose-600 font-bold">{otpError}</p>
            )}
          </form>
        </div>
      </div>
    );
  }

  if (error || !state) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="bg-white border border-rose-200 rounded-3xl p-8 max-w-md text-center space-y-3 shadow-sm">
          <ShieldAlert className="w-10 h-10 text-rose-500 mx-auto" />
          <h1 className="font-extrabold text-slate-900 text-lg">לא ניתן לפתוח את הקישור</h1>
          <p className="text-sm text-slate-600">{error}</p>
        </div>
      </div>
    );
  }

  const localBranding = loadBranding();
  const clubName =
    state.branding?.clubName || localBranding.clubName || DEFAULT_BRANDING.clubName;
  const logoSrc =
    state.branding?.logoDataUrl || localBranding.logoDataUrl || null;

  if (!consentAccepted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-50 to-slate-100 p-4" dir="rtl">
        <div className="max-w-2xl mx-auto my-6 bg-white rounded-3xl border border-slate-200 shadow-lg overflow-hidden">
          <div
            className="px-6 py-5 text-white"
            style={{
              background:
                'linear-gradient(105deg, var(--brand-dark, #006699), var(--brand, #0088CC))',
            }}
          >
            <div className="flex items-center gap-3">
              <ClubLogo src={logoSrc} size="lg" alt={`לוגו ${clubName}`} />
              <div className="min-w-0">
                <h1 className="text-xl font-black">ברוך הבא למערכת כוח האדם של {clubName}</h1>
                <p className="text-sm text-white/85 mt-1">אישור והצהרה לפני כניסה לטופס</p>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-4 text-sm text-slate-700 leading-relaxed max-h-[65vh] overflow-y-auto">
            <p>
              כחלק מתהליך קליטתך לעבודה, אנו מזמינים אותך לפתוח את תיק העובד האישי שלך ולעדכן את
              הפרטים הנדרשים לצורך העסקתך.
            </p>
            <h2 className="font-extrabold text-slate-900 text-base">מה כולל התהליך?</h2>
            <ol className="list-decimal pr-5 space-y-2">
              <li>
                <strong>מילוי פרטים אישיים:</strong> עדכון פרטי קשר, תמונת פנים, פרטי חשבון בנק
                לצורך תשלום שכר, ופרטים מזהים נוספים.
              </li>
              <li>
                <strong>העלאת מסמכים ותעודות:</strong> צירוף צילום תעודת זהות, אישורי מס (כגון
                טופס 101, תיאום מס וכדומה) ותעודות מקצועיות הרלוונטיות לתפקידך.
              </li>
            </ol>
            <h2 className="font-extrabold text-slate-900 text-base">
              אבטחת מידע ושמירה על הפרטיות שלך
            </h2>
            <p>
              אנו מייחסים חשיבות עליונה לאבטחת המידע האישי שלך. המערכת פועלת בהתאם לתקנות הגנת
              הפרטיות המחמירות ביותר:
            </p>
            <ul className="list-disc pr-5 space-y-2">
              <li>
                המידע והמסמכים שתעלה יישמרו בסביבה דיגיטלית מוצפנת ומאובטחת, ויהיו נגישים אך ורק
                לגורמי משאבי האנוש והשכר המוסמכים בארגון.
              </li>
              <li>הפרטים האישיים והמסמכים שלך אינם נחשפים או נשמרים ברשתות פומביות.</li>
              <li>
                המערכת משתמשת בטכנולוגיית אימות מתקדמת המבטיחה כי המידע שתמסור יישאר מוגן, שלם
                ומאובטח מפני שינויים או גישה בלתי מורשית.
              </li>
            </ul>
            <h2 className="font-extrabold text-slate-900 text-base">הצהרה ואישור:</h2>
            <p>בלחיצה על &quot;אישור והמשך&quot;, אני מצהיר/ה כי:</p>
            <ul className="list-disc pr-5 space-y-2">
              <li>הפרטים שאמסור והמסמכים שאעלה במערכת הם נכונים, מדויקים ומעודכנים.</li>
              <li>
                ידוע לי כי המידע נמסר מרצוני החופשי לצורך השלמת תהליך קליטתי לעבודה והפקת תלושי
                השכר שלי.
              </li>
              <li>אני מסכים/ה לשמירת הנתונים במאגר המידע המאובטח של המערכת עבור המעסיק.</li>
            </ul>

            <label className="flex items-start gap-3 p-4 rounded-2xl bg-[var(--brand-light,#e8f6fc)] border border-slate-200 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 w-4 h-4"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
              />
              <span className="text-xs font-bold text-slate-800 leading-relaxed">
                קראתי ואני מאשר/ת את ההצהרה ואת תנאי השימוש במערכת כוח האדם של {clubName}.
              </span>
            </label>
          </div>
          <div className="px-6 pb-6">
            <button
              type="button"
              onClick={handleAcceptConsent}
              disabled={!consentChecked}
              className="w-full py-3 rounded-xl text-white font-extrabold text-sm disabled:opacity-40"
              style={{ backgroundColor: 'var(--brand, #0088CC)' }}
            >
              אישור והמשך
            </button>
          </div>
        </div>
      </div>
    );
  }

  const catMeta = ONBOARDING_DOC_CATEGORIES.find((c) => c.id === tab);

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-slate-100" dir="rtl">
      <header
        className="text-white px-4 py-5 shadow-md"
        style={{
          background:
            'linear-gradient(105deg, var(--brand-dark, #006699), var(--brand, #0088CC))',
        }}
      >
        <div className="max-w-3xl mx-auto flex items-start gap-3">
          <ClubLogo src={logoSrc} size="lg" alt={`לוגו ${clubName}`} />
          <div className="min-w-0 space-y-1 flex-1">
            <p className="text-xs font-bold text-white/80">השלמת תיק אישי · {clubName}</p>
            <h1 className="text-xl font-black">{state.employeeName}</h1>
            <p className="text-xs text-white/75">
              {locked
                ? 'הפרטים נשמרו וננעלו — ניתן להוסיף קבצים בכרטיסיות תעודות והסמכות / אישורי מס / היעדרויות / פנסיה'
                : 'מלא את כל השדות החובה ולחץ שמירה. לאחר השמירה הראשונה השדות יינעלו.'}
            </p>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-3 py-4 space-y-4">
        {savedFlash && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl px-4 py-3 text-sm font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            נשמר בהצלחה
          </div>
        )}

        {locked && (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl px-4 py-3 text-xs font-bold flex items-center gap-2">
            <Lock className="w-4 h-4" />
            מצב תצוגה לפרטים אישיים — העלאת קבצים עדיין פתוחה
          </div>
        )}

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                tab === t.id
                  ? 'text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200'
              }`}
              style={tab === t.id ? { backgroundColor: 'var(--brand, #0088CC)' } : undefined}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-4">
          {tab === 'identity' && (
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <h2 className="font-extrabold text-slate-900 flex items-center gap-2">
                <User className="w-5 h-5 text-[var(--brand)]" />
                פרטים מזהים
                <span className="text-[11px] font-bold text-rose-600">כל השדות חובה</span>
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2 flex flex-col sm:flex-row items-center gap-4 p-4 rounded-2xl bg-[var(--brand-light,#E8F6FC)]/80 border border-sky-100">
                  <img
                    src={
                      avatarUrl &&
                      (avatarUrl.startsWith('data:image') || avatarUrl.startsWith('http'))
                        ? avatarUrl
                        : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'
                    }
                    alt="תמונת עובד"
                    className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-md"
                  />
                  <div className="flex-1 text-center sm:text-right space-y-2">
                    <div>
                      <h4 className="text-sm font-black text-slate-900">תמונת העובד *</h4>
                      <p className="text-[11px] text-slate-500">
                        תמונת פנים ברורה לתיק האישי · JPG / PNG / WebP · עד כ־450KB
                      </p>
                    </div>
                    {!locked && (
                      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                        <CameraOrFilePick
                          accept="image/jpeg,image/png,image/webp"
                          capture="user"
                          onFile={pickAvatar}
                          uploadLabel={avatarUrl ? 'החלפת קובץ' : 'העלאת קובץ'}
                          cameraLabel="צילום במצלמה"
                        />
                        {avatarUrl && (
                          <button
                            type="button"
                            onClick={() => setAvatarUrl(undefined)}
                            className="inline-flex items-center px-3.5 py-2 rounded-xl text-xs font-bold text-rose-600 border border-rose-200 hover:bg-rose-50"
                          >
                            <Trash2 className="w-3.5 h-3.5 ml-1.5" />
                            הסר תמונה
                          </button>
                        )}
                      </div>
                    )}
                    {locked && !avatarUrl && (
                      <p className="text-[11px] font-bold text-slate-500">לא הועלתה תמונת עובד</p>
                    )}
                  </div>
                </div>

                <label className="space-y-1 block sm:col-span-2">
                  <span className="text-xs font-bold text-slate-600">צילום תעודת זהות *</span>
                  {idCardPhotoUrl ? (
                    <div className="space-y-2">
                      {idCardPhotoUrl.startsWith('data:image') ||
                      (idCardPhotoUrl.startsWith('http') &&
                        !idCardPhotoUrl.toLowerCase().includes('.pdf')) ? (
                        <img
                          src={idCardPhotoUrl}
                          alt="תעודת זהות"
                          className="max-h-48 rounded-xl border border-slate-200 object-contain bg-slate-50"
                        />
                      ) : (
                        <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-600">
                          קובץ תעודת זהות מצורף
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setViewingAttachment({
                              title: 'צילום תעודת זהות',
                              fileName: 'teudat-zehut',
                              fileDataUrl: idCardPhotoUrl,
                            })
                          }
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--brand)] px-3 py-1.5 rounded-xl border border-[var(--brand)]/30"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          צפייה בקובץ
                        </button>
                        {!locked && (
                          <button
                            type="button"
                            className="text-xs text-rose-600 font-bold"
                            onClick={() => setIdCardPhotoUrl(undefined)}
                          >
                            הסר צילום
                          </button>
                        )}
                        {!locked && (
                          <CameraOrFilePick
                            accept="image/*,application/pdf"
                            capture="environment"
                            onFile={pickIdCard}
                            uploadLabel="החלפת קובץ"
                            cameraLabel="צילום מחדש"
                          />
                        )}
                      </div>
                    </div>
                  ) : (
                    !locked && (
                      <CameraOrFilePick
                        accept="image/*,application/pdf"
                        capture="environment"
                        onFile={pickIdCard}
                        uploadLabel="העלאת קובץ"
                        cameraLabel="צילום במצלמה"
                      />
                    )
                  )}
                </label>

                <label className="space-y-1 block">
                  <span className="text-xs font-bold text-slate-600">שם מלא *</span>
                  <input className={fieldClassXs} value={name} disabled={locked} onChange={(e) => setName(e.target.value)} required />
                </label>
                <label className="space-y-1 block">
                  <span className="text-xs font-bold text-slate-600">תעודת זהות *</span>
                  <input className={fieldClassXs} value={idNumber} disabled={locked} onChange={(e) => setIdNumber(e.target.value)} required />
                </label>
                <label className="space-y-1 block">
                  <span className="text-xs font-bold text-slate-600">טלפון *</span>
                  <input className={fieldClassXs} value={phone} disabled={locked} onChange={(e) => setPhone(e.target.value)} required />
                </label>
                <label className="space-y-1 block">
                  <span className="text-xs font-bold text-slate-600">אימייל *</span>
                  <input type="email" className={fieldClassXs} value={email} disabled={locked} onChange={(e) => setEmail(e.target.value)} required />
                </label>
                <label className="space-y-1 block sm:col-span-2">
                  <span className="text-xs font-bold text-slate-600">כתובת *</span>
                  <input className={fieldClassXs} value={address} disabled={locked} onChange={(e) => setAddress(e.target.value)} required />
                </label>
              </div>

              <div className="border-t border-slate-100 pt-4 space-y-3">
                <h3 className="text-xs font-extrabold text-slate-800">חשבון בנק *</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input className={fieldClassXs} placeholder="שם בנק *" value={bankName} disabled={locked} onChange={(e) => setBankName(e.target.value)} required />
                  <input className={fieldClassXs} placeholder="מס׳ סניף *" value={branchNumber} disabled={locked} onChange={(e) => setBranchNumber(e.target.value)} required />
                  <input className={fieldClassXs} placeholder="מס׳ חשבון *" value={accountNumber} disabled={locked} onChange={(e) => setAccountNumber(e.target.value)} required />
                  <input className={fieldClassXs} placeholder="שם בעל החשבון *" value={accountHolderName} disabled={locked} onChange={(e) => setAccountHolderName(e.target.value)} required />
                </div>
              </div>

              {!locked && (
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-3 rounded-xl text-white font-extrabold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ backgroundColor: 'var(--brand, #0088CC)' }}
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  שמירה
                </button>
              )}
            </form>
          )}

          {tab === 'salary' && (
            <div className="space-y-3">
              <h2 className="font-extrabold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[var(--brand)]" />
                הסכמי שכר חתומים
              </h2>
              <p className="text-xs text-slate-500">
                מוצגים הסכמים שנחתמו. לחץ על צפייה כדי לפתוח את קובץ ה-PDF.
              </p>
              {state.signedAgreements.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">
                  אין עדיין הסכמים חתומים להצגה. אם נחתם הסכם לאחרונה — בקש מהמנהל לשלוח שוב את
                  הקישור.
                </p>
              ) : (
                state.signedAgreements.map((a) => (
                  <div
                    key={a.id}
                    className="border border-slate-200 rounded-2xl p-4 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="font-bold text-slate-900 text-sm">{a.title}</div>
                      <div className="text-xs text-slate-500 font-mono">{a.docNumber}</div>
                      <div className="text-xs text-slate-700">
                        שכר: ₪{a.monthlySalary.toLocaleString()} · התחלה: {a.effectiveDate}
                        {a.endDate ? ` · סיום: ${a.endDate}` : ''}
                      </div>
                      {isAgreementExpiredOrInactive({
                        status: 'SIGNED',
                        effectiveDate: a.effectiveDate,
                        endDate: a.endDate,
                      }) && (
                        <span className="inline-flex mt-1 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-slate-200 text-slate-700">
                          לא פעיל
                        </span>
                      )}
                    </div>
                    {a.pdfDataUrl ? (
                      <button
                        type="button"
                        onClick={() =>
                          setViewingAttachment({
                            title: a.title,
                            fileName: `${a.docNumber}.pdf`,
                            fileDataUrl: a.pdfDataUrl,
                          })
                        }
                        className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white"
                        style={{ backgroundColor: 'var(--brand, #0088CC)' }}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        צפייה בהסכם
                      </button>
                    ) : (
                      <span className="text-[11px] text-amber-700 font-bold">
                        קובץ PDF לא זמין בקישור — בקש מהמנהל לרענן את ההזמנה
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {tab !== 'identity' && tab !== 'salary' && catMeta && (
            <div className="space-y-4">
              <div>
                <h2 className="font-extrabold text-slate-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[var(--brand)]" />
                  {catMeta.label}
                </h2>
                <p className="text-xs text-slate-500 mt-1">{catMeta.hint}</p>
              </div>

              <form
                onSubmit={handleUploadDoc}
                className="bg-[var(--brand-light,#e8f6fc)] rounded-2xl p-4 border border-slate-200 space-y-3"
              >
                <h3 className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                  <FilePlus2 className="w-4 h-4" />
                  העלאת מסמך חדש
                </h3>
                <label className="block space-y-1">
                  <span className="text-[11px] font-bold text-slate-600">סוג הטופס</span>
                  <select
                    className={fieldClassXs}
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                    required
                  >
                    {catMeta.suggestedTypes.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] font-bold text-slate-600">תאריך העלאה</span>
                  <input
                    type="date"
                    className={fieldClassXs}
                    value={docDate}
                    onChange={(e) => setDocDate(e.target.value)}
                    required
                  />
                </label>
                {previewDocTitle && (
                  <p className="text-[11px] text-slate-600 bg-white/80 rounded-lg px-3 py-2 border border-slate-100">
                    שם המסמך יישמר כ־
                    <strong className="text-slate-900"> {previewDocTitle}</strong>
                  </p>
                )}
                <textarea
                  className={fieldClassXs}
                  rows={2}
                  placeholder="הערות (אופציונלי)"
                  value={docNotes}
                  onChange={(e) => setDocNotes(e.target.value)}
                />
                <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
                  <Paperclip className="w-4 h-4" />
                  <input
                    type="file"
                    accept="image/*,application/pdf,.doc,.docx"
                    className="text-xs"
                    required
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      setDocFileName(f.name);
                      if (f.size > MAX_BYTES) {
                        setDocFileDataUrl(undefined);
                        alert(
                          'הקובץ גדול — יישמר שם הקובץ בלבד. להעלאת תוכן בחר קובץ קטן יותר.'
                        );
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => setDocFileDataUrl(String(reader.result));
                      reader.readAsDataURL(f);
                    }}
                  />
                </label>
                {docFileName && (
                  <p className="text-[11px] text-slate-500">קובץ: {docFileName}</p>
                )}
                <button
                  type="submit"
                  disabled={uploading}
                  className="w-full py-2.5 rounded-xl text-white font-bold text-xs disabled:opacity-50"
                  style={{ backgroundColor: 'var(--brand, #0088CC)' }}
                >
                  {uploading ? 'מעלה...' : 'העלה מסמך'}
                </button>
              </form>

              <div className="space-y-2">
                <h3 className="text-xs font-extrabold text-slate-700">
                  מסמכים שהועלו ({categoryDocs.length})
                </h3>
                {categoryDocs.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-4">אין מסמכים עדיין</p>
                )}
                {categoryDocs.map((d) => (
                  <div
                    key={d.id}
                    className="border border-slate-200 rounded-2xl p-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-slate-900 truncate">{d.title}</div>
                      <div className="text-[11px] text-slate-500">
                        {d.docType} · {d.issuedAt}
                        {d.fileName ? ` · ${d.fileName}` : ''}
                      </div>
                    </div>
                    {d.fileDataUrl && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setViewingAttachment({
                              title: d.title,
                              fileName: d.fileName || d.title,
                              fileDataUrl: d.fileDataUrl,
                            })
                          }
                          className="p-2 rounded-xl border border-slate-200 text-[var(--brand)] hover:bg-[var(--brand-light)]"
                          title="צפייה"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <a
                          href={d.fileDataUrl}
                          download={d.fileName || d.title}
                          className="p-2 rounded-xl border border-slate-200 text-[var(--brand)] hover:bg-[var(--brand-light)]"
                          title="הורדה"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <FileAttachmentViewer
        attachment={viewingAttachment}
        onClose={() => setViewingAttachment(null)}
      />
    </div>
  );
};
