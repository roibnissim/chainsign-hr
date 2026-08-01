import React, { useEffect, useState } from 'react';
import { Bell, Check, FileSignature, Loader2, Mail, UserCircle, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { shouldUseFirebaseAuth } from '../services/authGateway';
import { CameraOrFilePick } from './CameraOrFilePick';
import { PageBanner, fieldClass, primaryBtnClass } from './ui/PageBanner';

const MAX_AVATAR_BYTES = 500 * 1024;

function defaultNotificationEmail(email?: string, notificationEmail?: string): string {
  if (notificationEmail) return notificationEmail;
  if (email && !email.endsWith('@sms.local')) return email;
  return '';
}

export const AccountSettings: React.FC = () => {
  const { user, refreshMe } = useAuth();
  const [picturePreview, setPicturePreview] = useState<string | undefined>();
  const [pendingDataUrl, setPendingDataUrl] = useState<string | undefined>();
  const [notificationEmail, setNotificationEmail] = useState('');
  const [notifyEmployeeUpdates, setNotifyEmployeeUpdates] = useState(true);
  const [notifyAgreementSigned, setNotifyAgreementSigned] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (!user) return;
    setPicturePreview(user.picture);
    setPendingDataUrl(undefined);
    setNotificationEmail(defaultNotificationEmail(user.email, user.notificationEmail));
    setNotifyEmployeeUpdates(user.notifyEmployeeUpdates !== false);
    setNotifyAgreementSigned(user.notifyAgreementSigned !== false);
  }, [user]);

  if (!user) return null;

  const handleAvatarPick = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('נא לבחור קובץ תמונה');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError('גודל התמונה מוגבל ל־500KB');
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      setPendingDataUrl(dataUrl);
      setPicturePreview(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!shouldUseFirebaseAuth()) {
        throw new Error('עדכון חשבון זמין במצב Firebase בלבד');
      }

      const email = notificationEmail.trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error('כתובת המייל אינה תקינה');
      }

      let pictureUrl: string | undefined | null = undefined;
      if (pendingDataUrl?.startsWith('data:')) {
        const { dataUrlToBlob, uploadManagerAvatar } = await import('../services/storage/clubStorage');
        const { useFirebaseStorage } = await import('../config/featureFlags');
        const { isFirebaseConfigured } = await import('../lib/firebase');
        if (!useFirebaseStorage() || !isFirebaseConfigured()) {
          throw new Error('Firebase Storage אינו פעיל');
        }
        const { blob, contentType } = await dataUrlToBlob(pendingDataUrl);
        const up = await uploadManagerAvatar({
          userId: user.id,
          data: blob,
          contentType,
        });
        pictureUrl = up.downloadURL;
      }

      const { updateMyAccount } = await import('../services/firebaseAuth');
      await updateMyAccount({
        ...(pictureUrl !== undefined ? { picture: pictureUrl } : {}),
        notificationEmail: email || null,
        notifyEmployeeUpdates,
        notifyAgreementSigned,
      });
      await refreshMe();
      setPendingDataUrl(undefined);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2200);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'השמירה נכשלה');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl" dir="rtl">
      <PageBanner
        icon={UserCircle}
        title="החשבון שלי"
        subtitle="תמונת פרופיל, מייל להתראות והעדפות דיווח יומי"
      />

      <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
        <div>
          <h3 className="font-bold text-slate-900 mb-1">תמונת פרופיל</h3>
          <p className="text-xs text-slate-500 mb-4">
            התמונה תוצג בכותרת המערכת ובמסכי ניהול המשתמשים
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-5">
            {picturePreview ? (
              <img
                src={picturePreview}
                alt=""
                className="w-24 h-24 rounded-full object-cover ring-4 ring-[var(--brand-light)]"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-[var(--brand-light)] flex items-center justify-center">
                <UserCircle className="w-12 h-12 text-[var(--brand)]" />
              </div>
            )}
            <div className="flex-1 w-full space-y-2">
              <CameraOrFilePick
                accept="image/*"
                capture="user"
                onFile={handleAvatarPick}
                uploadLabel="העלאת תמונה"
                cameraLabel="צילום"
                disabled={busy}
              />
              {pendingDataUrl && (
                <button
                  type="button"
                  className="text-xs font-bold text-slate-500 hover:text-slate-800"
                  onClick={() => {
                    setPendingDataUrl(undefined);
                    setPicturePreview(user.picture);
                  }}
                  disabled={busy}
                >
                  ביטול בחירת תמונה
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-6">
          <label className="block space-y-1.5">
            <span className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
              <Mail className="w-4 h-4 text-[var(--brand)]" />
              מייל להתראות
            </span>
            <p className="text-xs text-slate-500">
              לכתובת זו יישלח סיכום יומי ב־13:00 (שעון ישראל) אם היו אירועים רלוונטיים.
            </p>
            <input
              type="email"
              className={fieldClass}
              value={notificationEmail}
              onChange={(e) => setNotificationEmail(e.target.value)}
              placeholder="name@example.com"
              disabled={busy}
              dir="ltr"
            />
          </label>
          {user.email && !user.email.endsWith('@sms.local') && (
            <p className="text-[11px] text-slate-400 mt-2" dir="ltr">
              מייל התחברות: {user.email}
            </p>
          )}
        </div>

        <div className="border-t border-slate-100 pt-6 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Bell className="w-4 h-4 text-[var(--brand)]" />
            <h3 className="font-bold text-slate-900 text-sm">סוגי דיווח יומי</h3>
          </div>
          <p className="text-xs text-slate-500 mb-2">
            בחרו אילו אירועים מלוג הפעילות ייכללו במייל היומי
          </p>

          <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 w-4 h-4 accent-[var(--brand)]"
              checked={notifyEmployeeUpdates}
              onChange={(e) => setNotifyEmployeeUpdates(e.target.checked)}
              disabled={busy}
            />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
                <Users className="w-3.5 h-3.5 text-[var(--brand)]" />
                עדכוני עובד
              </span>
              <span className="block text-xs text-slate-500 mt-0.5">
                פרופיל שננעל ומסמכים שהועלו לתיק האישי
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 w-4 h-4 accent-[var(--brand)]"
              checked={notifyAgreementSigned}
              onChange={(e) => setNotifyAgreementSigned(e.target.checked)}
              disabled={busy}
            />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
                <FileSignature className="w-3.5 h-3.5 text-[var(--brand)]" />
                הסכם שנחתם
              </span>
              <span className="block text-xs text-slate-500 mt-0.5">
                גילוי נאות, חתימת עובד (ממתין להנהלה) והשלמת הסכם חתום במערכת
              </span>
            </span>
          </label>
        </div>

        {error && (
          <p className="text-sm font-bold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={busy}
            className={`${primaryBtnClass} disabled:opacity-60`}
            style={{ backgroundColor: 'var(--brand)' }}
          >
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 ml-1.5 animate-spin" />
                שומר…
              </>
            ) : savedFlash ? (
              <>
                <Check className="w-4 h-4 ml-1.5" />
                נשמר
              </>
            ) : (
              'שמירת שינויים'
            )}
          </button>
          <p className="text-xs text-slate-500 truncate">{user.name}</p>
        </div>
      </section>
    </div>
  );
};
