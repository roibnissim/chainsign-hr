import React, { useEffect, useRef, useState } from 'react';
import { Employee, EmployeeFileDocument, SalaryAgreement } from '../types';
import { Copy, ExternalLink, Loader2, MessageCircle, X } from 'lucide-react';
import { fieldClassXs } from './ui/PageBanner';
import {
  createOnboardingInvite,
  buildOnboardingWhatsAppUrl,
  OnboardingDocCategory,
} from '../services/onboardingInvite';

interface WhatsAppOnboardingShareProps {
  employee: Employee;
  agreements: SalaryAgreement[];
  documents: EmployeeFileDocument[];
  onClose: () => void;
}

export const WhatsAppOnboardingShare: React.FC<WhatsAppOnboardingShareProps> = ({
  employee,
  agreements,
  documents,
  onClose,
}) => {
  const [phone, setPhone] = useState(employee.phone || '');
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoSentRef = useRef(false);

  const absoluteUrl = (path: string) => {
    const origin = window.location.origin;
    return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
  };

  const createLink = async () => {
    setBusy(true);
    setError(null);
    try {
      const existingDocs = documents
        .filter((d) =>
          ['recruitment', 'tax', 'absences', 'pension'].includes(d.category)
        )
        .map((d) => ({
          id: d.id,
          category: d.category as OnboardingDocCategory,
          title: d.title,
          docType: d.docType,
          issuedAt: d.issuedAt,
          notes: d.notes,
          fileName: d.fileName,
          fileDataUrl: d.fileDataUrl,
          createdAt: d.createdAt,
        }));

      const result = await createOnboardingInvite({
        employee,
        signedAgreements: agreements.filter((a) => a.employeeId === employee.id),
        existingDocuments: existingDocs,
      });

      const url = absoluteUrl(result.onboardPath);
      setLink(url);

      try {
        sessionStorage.setItem('club_open_employee_file', employee.id);
        sessionStorage.setItem('club_active_tab', 'employees');
      } catch {
        // ignore
      }

      return url;
    } catch (err) {
      console.error(err);
      setError('לא ניתן ליצור קישור. ודא ש־npm run dev רץ.');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const handleWhatsApp = async () => {
    if (!phone.trim()) {
      alert('נא להזין מספר טלפון לשליחה בווטסאפ');
      return;
    }
    const url = link || (await createLink());
    if (!url) return;
    const wa = buildOnboardingWhatsAppUrl(phone, employee.name, url);
    if (!wa) {
      alert('מספר הטלפון אינו תקין לווטסאפ');
      return;
    }
    window.open(wa, '_blank');
  };

  useEffect(() => {
    // יצירת הקישור מראש בלי לפתוח ווטסאפ — מוכן להעתקה / שליחה
    if (autoSentRef.current) return;
    autoSentRef.current = true;
    void createLink();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopy = async () => {
    const url = link || (await createLink());
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      alert('הקישור הועתק');
    } catch {
      prompt('העתק את הקישור:', url);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[var(--navy,#0f172a)]/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-extrabold text-slate-900 text-lg flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-emerald-600" />
              הזמנה להשלמת תיק אישי
            </h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              שלח ל־{employee.name} קישור להזנת פרטים ומסמכים (פרטים, שכר, תעודות והסמכות, אישורי מס,
              היעדרויות, פנסיה).
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-bold text-slate-600">מספר ווטסאפ</span>
          <input
            className={fieldClassXs}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="05x-xxxxxxx"
          />
        </label>

        {link && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] break-all font-mono text-slate-600">
            {link}
          </div>
        )}

        {error && (
          <p className="text-xs text-rose-600 font-bold">{error}</p>
        )}

        <div className="flex flex-col gap-2 pt-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleWhatsApp()}
            className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
            שלח בווטסאפ
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleCopy()}
            className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Copy className="w-3.5 h-3.5" />
            העתק קישור בלבד
          </button>
        </div>
      </div>
    </div>
  );
};
