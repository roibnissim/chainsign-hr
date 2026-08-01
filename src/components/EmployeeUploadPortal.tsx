import React, { useEffect, useState } from 'react';
import { CheckCircle2, FileUp, Loader2, Paperclip, ShieldAlert } from 'lucide-react';
import { fieldClassXs } from './ui/PageBanner';
import { ClubLogo } from './ClubLogo';
import { applyDocumentBranding, DEFAULT_BRANDING, type BrandingSettings } from '../config/branding';

interface UploadMeta {
  token: string;
  employeeName: string;
  categoryLabel: string;
  suggestedTypes: string[];
  status: 'pending' | 'completed' | 'expired';
  expiresAt: string;
  hasUpload?: boolean;
  branding?: {
    clubName: string;
    clubNameEn?: string;
    logoDataUrl?: string | null;
    primaryColor?: string;
    accentColor?: string;
  } | null;
}

interface EmployeeUploadPortalProps {
  token: string;
}

const MAX_BYTES = 400 * 1024;

export const EmployeeUploadPortal: React.FC<EmployeeUploadPortalProps> = ({ token }) => {
  const [meta, setMeta] = useState<UploadMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const [docType, setDocType] = useState('');
  const [title, setTitle] = useState('');
  const [issuedAt, setIssuedAt] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [fileName, setFileName] = useState<string | undefined>();
  const [fileDataUrl, setFileDataUrl] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/upload-requests/${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok) {
          setError(
            data.error === 'not_found'
              ? 'הקישור אינו תקף או שפג תוקפו.'
              : data.error === 'employee_inactive'
                ? 'העובד אינו פעיל במערכת — לא ניתן להיכנס לפורטל.'
                : 'שגיאה בטעינת הקישור.'
          );
          return;
        }
        if (cancelled) return;
        setMeta(data);
        if (data.branding) {
          applyDocumentBranding({
            ...DEFAULT_BRANDING,
            ...data.branding,
            logoDataUrl: data.branding.logoDataUrl ?? null,
          } as BrandingSettings);
        }
        setDocType(data.suggestedTypes?.[0] || 'מסמך');
        setTitle(data.suggestedTypes?.[0] || '');
        if (data.status === 'completed') setDone(true);
        if (data.status === 'expired') setError('פג תוקף הקישור. פנה למנהל לקבלת קישור חדש.');
      } catch {
        if (!cancelled) setError('לא ניתן להתחבר לשרת. ודא שהמערכת פועלת.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleFile = (file: File | null) => {
    if (!file) return;
    setFileName(file.name);
    if (file.size > MAX_BYTES) {
      setFileDataUrl(undefined);
      alert('הקובץ גדול מ־400KB — יישמר רק שם הקובץ. להעלאת תוכן מלא בחר קובץ קטן יותר.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setFileDataUrl(String(reader.result));
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !docType.trim()) return;
    if (!fileName && !fileDataUrl) {
      alert('נא לצרף קובץ לפני השליחה.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/upload-requests/${encodeURIComponent(token)}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          docType: docType.trim(),
          issuedAt,
          notes: notes.trim() || undefined,
          fileName,
          fileDataUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'expired') setError('פג תוקף הקישור.');
        else if (data.error === 'already_uploaded') {
          setDone(true);
        } else if (data.error === 'payload_too_large') {
          setError('הקובץ גדול מדי. נסה קובץ קטן יותר.');
        } else {
          setError('ההעלאה נכשלה. נסה שוב.');
        }
        return;
      }
      setDone(true);
    } catch {
      setError('שגיאת רשת בהעלאה.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen app-shell flex items-center justify-center p-6" dir="rtl">
        <div className="text-center text-slate-600">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-[var(--brand)]" />
          <p className="text-sm font-medium">טוען קישור העלאה...</p>
        </div>
      </div>
    );
  }

  const clubName = meta?.branding?.clubName || DEFAULT_BRANDING.clubName;
  const logoSrc = meta?.branding?.logoDataUrl || null;

  return (
    <div className="min-h-screen app-shell flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-3xl shadow-xl border border-slate-200 max-w-md w-full overflow-hidden">
        <div
          className="p-5 text-white"
          style={{ background: 'linear-gradient(105deg, var(--brand-dark), var(--brand))' }}
        >
          <div className="flex items-center gap-3">
            <ClubLogo src={logoSrc} size="lg" alt={`לוגו ${clubName}`} />
            <div className="min-w-0">
              <p className="text-xs text-white/80 font-bold">{clubName}</p>
              <h1 className="text-xl font-black">העלאת מסמך לתיק האישי</h1>
              {meta && (
                <p className="text-sm text-white/85 mt-1">
                  שלום {meta.employeeName} · {meta.categoryLabel}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="p-5">
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {done ? (
            <div className="text-center py-8 space-y-3">
              <CheckCircle2 className="w-14 h-14 mx-auto" style={{ color: 'var(--accent)' }} />
              <h2 className="text-lg font-black text-slate-900">המסמך התקבל בהצלחה</h2>
              <p className="text-xs text-slate-500">
                המסמך יישמר בתיק האישי שלך תחת «{meta?.categoryLabel}». ניתן לסגור את הדף.
              </p>
            </div>
          ) : meta?.status === 'pending' ? (
            <form onSubmit={handleSubmit} className="space-y-3">
              <label className="block text-xs">
                <span className="font-bold text-slate-600">סוג מסמך</span>
                <select
                  className={`${fieldClassXs} mt-1`}
                  value={docType}
                  onChange={e => {
                    setDocType(e.target.value);
                    if (!title || meta.suggestedTypes.includes(title)) setTitle(e.target.value);
                  }}
                >
                  {(meta.suggestedTypes || ['מסמך']).map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </label>

              <label className="block text-xs">
                <span className="font-bold text-slate-600">כותרת</span>
                <input
                  className={`${fieldClassXs} mt-1`}
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  required
                />
              </label>

              <label className="block text-xs">
                <span className="font-bold text-slate-600">תאריך המסמך</span>
                <input
                  type="date"
                  className={`${fieldClassXs} mt-1`}
                  value={issuedAt}
                  onChange={e => setIssuedAt(e.target.value)}
                  required
                />
              </label>

              <label className="block text-xs">
                <span className="font-bold text-slate-600">הערות (אופציונלי)</span>
                <input
                  className={`${fieldClassXs} mt-1`}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </label>

              <label className="block text-xs">
                <span className="font-bold text-slate-600 flex items-center gap-1">
                  <Paperclip className="w-3.5 h-3.5" />
                  צירוף קובץ (חובה · עד 400KB)
                </span>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.webp"
                  required
                  className="mt-1 block w-full text-xs"
                  onChange={e => handleFile(e.target.files?.[0] ?? null)}
                />
                {fileName && <span className="text-[11px] text-slate-500 mt-1 block">{fileName}</span>}
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-xl text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
                {submitting ? 'שולח...' : 'שלח מסמך לתיק'}
              </button>

              <p className="text-[10px] text-slate-400 text-center">
                הקישור בתוקף עד {meta ? new Date(meta.expiresAt).toLocaleString('he-IL') : ''}
              </p>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
};
