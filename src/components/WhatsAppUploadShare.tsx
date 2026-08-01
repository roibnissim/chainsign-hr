import React, { useEffect, useState } from 'react';
import { MessageCircle, Copy, Check, ExternalLink, Phone } from 'lucide-react';
import { fieldClassXs } from './ui/PageBanner';
import { buildWhatsAppShareUrl } from '../services/whatsappUpload';
import { authHeadersAsync } from '../services/authGateway';
import { FileSectionMeta } from '../config/employeeFile';

interface WhatsAppUploadShareProps {
  employeeName: string;
  employeeId: string;
  phone?: string;
  section: FileSectionMeta;
  onClose: () => void;
}

export const WhatsAppUploadShare: React.FC<WhatsAppUploadShareProps> = ({
  employeeName,
  employeeId,
  phone,
  section,
  onClose,
}) => {
  const identityPhone = (phone || '').trim();
  const [phoneInput, setPhoneInput] = useState(identityPhone);
  const [creating, setCreating] = useState(false);
  const [uploadUrl, setUploadUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // תמיד מסנכרן את המספר מהפרטים המזהים כשנפתח/מתעדכן הכרטיס
  useEffect(() => {
    if (identityPhone) {
      setPhoneInput(identityPhone);
    }
  }, [identityPhone]);

  const createAndPrepare = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/upload-requests', {
        method: 'POST',
        headers: await authHeadersAsync({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          employeeId,
          employeeName,
          category: section.id,
          categoryLabel: section.label,
          suggestedTypes: section.suggestedTypes || ['מסמך'],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError('יצירת הקישור נכשלה. ודא ששרת הפיתוח רץ.');
        return null;
      }
      const fullUrl = `${window.location.origin}${data.uploadPath}`;
      setUploadUrl(fullUrl);
      return fullUrl;
    } catch {
      setError('לא ניתן ליצור קישור — בדוק חיבור לשרת.');
      return null;
    } finally {
      setCreating(false);
    }
  };

  const openWhatsAppSafely = (waUrl: string) => {
    // פתיחה בחלון/טאב חדש בלי לנווט את תיק העובד
    const opened = window.open(waUrl, '_blank', 'noopener,noreferrer');
    if (!opened) {
      // חסימת פופאפ — קישור זמני עם target=_blank
      const a = document.createElement('a');
      a.href = waUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  };

  const handleSendWhatsApp = async () => {
    const url = uploadUrl || (await createAndPrepare());
    if (!url) return;

    const message =
      `שלום ${employeeName},\n\n` +
      `נדרש להעלות מסמך לתיק האישי שלך תחת: ${section.label}.\n\n` +
      `לחץ על הקישור והעלה את הקובץ:\n${url}\n\n` +
      `הקישור בתוקף ל־72 שעות.`;

    const waUrl = buildWhatsAppShareUrl(phoneInput, message);
    if (!waUrl) {
      setError('מספר טלפון לא תקין. הזן מספר נייד ישראלי.');
      return;
    }

    // שמירת התיק הפתוח לפני מעבר לווטסאפ (למקרה של רענון/חזרה)
    try {
      sessionStorage.setItem('club_open_employee_file', employeeId);
      sessionStorage.setItem('club_active_tab', 'employees');
    } catch {
      // ignore
    }

    openWhatsAppSafely(waUrl);
    setSent(true);
    // נשארים בתיק — לא סוגרים את המודל אוטומטית ולא מנווטים
  };

  const handleCopy = async () => {
    const url = uploadUrl || (await createAndPrepare());
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('לא ניתן להעתיק — העתק ידנית מהשדה.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-[var(--navy)]/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div>
          <h3 className="font-black text-slate-900 text-lg flex items-center gap-2">
            <MessageCircle className="w-5 h-5" style={{ color: '#25D366' }} />
            שליחת קישור העלאה בווטסאפ
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            העובד יקבל קישור ייעודי ל־«{section.label}». לאחר ההעלאה המסמך יישמר אוטומטית בכרטיסייה.
          </p>
        </div>

        {sent && (
          <div
            className="rounded-xl p-3 text-xs font-bold text-white"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            ווטסאפ נפתח בחלון נפרד. התיק האישי של {employeeName} נשאר פתוח כאן.
          </div>
        )}

        <label className="block text-xs">
          <span className="font-bold text-slate-600 flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-[var(--brand)]" />
            מספר נייד של העובד
          </span>
          <input
            className={`${fieldClassXs} mt-1`}
            value={phoneInput}
            onChange={e => setPhoneInput(e.target.value)}
            placeholder="05X-XXXXXXX"
            dir="ltr"
          />
          {identityPhone ? (
            <p className="text-[11px] text-[var(--accent)] font-semibold mt-1.5">
              נטען אוטומטית מהפרטים המזהים בתיק
            </p>
          ) : (
            <p className="text-[11px] text-amber-700 mt-1.5">
              לא הוזן טלפון בפרטים המזהים — הזן מספר כאן, או עדכן בכרטיסיית הפרטים
            </p>
          )}
        </label>

        {uploadUrl && (
          <div className="bg-[var(--brand-light)] rounded-xl p-3 border border-sky-100">
            <div className="text-[11px] font-bold text-slate-500 mb-1">קישור להעלאה (לעובד בלבד)</div>
            <p className="text-xs text-[var(--brand)] break-all font-medium flex items-start gap-1">
              <ExternalLink className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {uploadUrl}
            </p>
            <p className="text-[10px] text-slate-500 mt-2">
              אל תפתח את הקישור במחשב המנהל — הוא מיועד לטלפון של העובד.
            </p>
          </div>
        )}

        {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}

        <div className="flex flex-col gap-2 pt-1">
          <button
            type="button"
            disabled={creating || !phoneInput.trim()}
            onClick={handleSendWhatsApp}
            className="w-full py-2.5 rounded-xl text-white font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ backgroundColor: '#25D366' }}
          >
            <MessageCircle className="w-4 h-4" />
            {creating ? 'יוצר קישור...' : sent ? 'פתח ווטסאפ שוב' : 'פתח ווטסאפ ושלח'}
          </button>
          <button
            type="button"
            disabled={creating}
            onClick={handleCopy}
            className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-2 hover:bg-slate-50"
          >
            {copied ? <Check className="w-4 h-4 text-[var(--accent)]" /> : <Copy className="w-4 h-4" />}
            {copied ? 'הועתק!' : 'העתק קישור בלבד'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-white font-bold text-xs"
            style={{ backgroundColor: 'var(--brand)' }}
          >
            חזרה לתיק האישי
          </button>
        </div>
      </div>
    </div>
  );
};
