import React, { useEffect, useState } from 'react';
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';
import { Loader2, MessageSquare, Shield } from 'lucide-react';
import { ClubLogo } from './ClubLogo';
import { fieldClassXs } from './ui/PageBanner';
import { applyDocumentBranding, loadBranding } from '../config/branding';
import { useAuth } from '../context/AuthContext';
import { authRequestSms } from '../services/authGateway';

type LoginMode = 'google' | 'sms';

export const LoginPage: React.FC = () => {
  const branding = loadBranding();
  const { loginWithGoogle, loginWithSms } = useAuth();
  const [mode, setMode] = useState<LoginMode>('google');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    applyDocumentBranding(branding);
  }, [branding]);

  const handleGoogleSuccess = async (cred: CredentialResponse) => {
    if (!cred.credential) {
      setError('לא התקבל אסימון מגוגל');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await loginWithGoogle(cred.credential);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'ההתחברות נכשלה. ודא ש־Google Client ID מוגדר ב־.env'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSendOtp = async () => {
    setBusy(true);
    setError(null);
    setHint(null);
    try {
      const res = await authRequestSms(phone);
      setOtpSent(true);
      if (res.testCode) {
        setCode(res.testCode);
        setHint(`מצב בדיקה — הקוד שלך: ${res.testCode}`);
      } else if (res.message) {
        setHint(res.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שליחת הקוד נכשלה');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await loginWithSms(phone, code);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'אימות הקוד נכשל');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      dir="rtl"
      style={{
        background:
          'radial-gradient(900px 400px at 100% 0%, color-mix(in srgb, var(--brand) 18%, transparent), transparent), linear-gradient(180deg, #f0f7fb, #eef2f6)',
      }}
    >
      <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
        <div
          className="px-6 py-8 text-white text-center"
          style={{ background: 'linear-gradient(105deg, var(--brand-dark), var(--brand))' }}
        >
          <div className="flex justify-center mb-4">
            <ClubLogo src={branding.logoDataUrl} size="xl" className="ring-4 ring-white/30" />
          </div>
          <h1 className="text-2xl font-black tracking-tight">{branding.clubName}</h1>
          <p className="text-sm text-white/85 mt-1">{branding.clubNameEn}</p>
          <p className="text-xs text-white/70 mt-3">{branding.tagline}</p>
        </div>

        <div className="p-6 space-y-5">
          <div className="text-center space-y-1">
            <h2 className="text-lg font-extrabold text-slate-900 flex items-center justify-center gap-2">
              <Shield className="w-5 h-5 text-[var(--brand)]" />
              התחברות מנהלים
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              התחברות למנהלים רשומים בלבד (Google או SMS). עובדים נכנסים לתיק אישי דרך קישור ייעודי.
            </p>
          </div>

          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setMode('google');
                setError(null);
              }}
              className={`flex-1 py-2 rounded-lg text-xs font-extrabold transition-all ${
                mode === 'google' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              Google
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('sms');
                setError(null);
              }}
              className={`flex-1 py-2 rounded-lg text-xs font-extrabold transition-all flex items-center justify-center gap-1 ${
                mode === 'sms' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              SMS
            </button>
          </div>

          {mode === 'google' ? (
            <div className="flex flex-col items-center gap-3 min-h-[48px]">
              {!import.meta.env.VITE_GOOGLE_CLIENT_ID ? (
                <p className="text-xs text-amber-800 font-bold bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-center leading-relaxed">
                  חסר VITE_GOOGLE_CLIENT_ID בקובץ .env
                </p>
              ) : busy ? (
                <div className="flex items-center gap-2 text-sm text-slate-600 font-bold">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  מאמת מול השרת…
                </div>
              ) : (
                <GoogleLogin
                  onSuccess={(c) => void handleGoogleSuccess(c)}
                  onError={() =>
                    setError(
                      'התחברות גוגל נכשלה. ודאו שב־Google Cloud → Credentials נוספו Authorized JavaScript origins: https://chainsign-hr.web.app'
                    )
                  }
                  useOneTap={false}
                  theme="outline"
                  size="large"
                  text="signin_with"
                  shape="rectangular"
                  width="320"
                  ux_mode="popup"
                />
              )}
            </div>
          ) : (
            <form onSubmit={(e) => void handleVerifyOtp(e)} className="space-y-3">
              <label className="block space-y-1">
                <span className="text-xs font-bold text-slate-600">מספר נייד</span>
                <input
                  className={fieldClassXs}
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setOtpSent(false);
                    setCode('');
                  }}
                  placeholder="05X-XXXXXXX"
                  inputMode="tel"
                  required
                />
              </label>

              {otpSent && (
                <label className="block space-y-1">
                  <span className="text-xs font-bold text-slate-600">קוד אימות (6 ספרות)</span>
                  <input
                    className={`${fieldClassXs} font-mono tracking-widest text-center`}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="______"
                    inputMode="numeric"
                    required
                    autoFocus
                  />
                </label>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy || !phone.trim()}
                  onClick={() => void handleSendOtp()}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-800 font-bold text-xs disabled:opacity-40"
                >
                  {otpSent ? 'שלח קוד מחדש' : 'שלח קוד ב־SMS'}
                </button>
                {otpSent && (
                  <button
                    type="submit"
                    disabled={busy || code.length < 6}
                    className="flex-1 py-2.5 rounded-xl text-white font-extrabold text-xs disabled:opacity-40"
                    style={{ backgroundColor: 'var(--brand, #0088CC)' }}
                  >
                    {busy ? 'מאמת…' : 'התחבר'}
                  </button>
                )}
              </div>
            </form>
          )}

          {hint && (
            <p className="text-[11px] text-amber-800 font-bold bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 text-center">
              {hint}
            </p>
          )}

          {error && (
            <p className="text-xs text-rose-600 font-bold text-center bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <p className="text-[11px] text-slate-400 text-center leading-relaxed">
            משתמש שאינו רשום במערכת לא יוכל להתחבר כמנהל. השלמת תיק אישי לעובדים מתבצעת בקישור + אימות SMS.
          </p>
        </div>
      </div>
    </div>
  );
};
