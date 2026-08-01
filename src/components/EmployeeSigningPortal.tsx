import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Eraser,
  FileText,
  Keyboard,
  Loader2,
  PenTool,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { ClubLogo } from './ClubLogo';
import { fieldClassXs } from './ui/PageBanner';
import {
  applyDocumentBranding,
  DEFAULT_BRANDING,
  type BrandingSettings,
} from '../config/branding';
import { signingPortalHeaders } from '../services/signingInvite';

interface EmployeeSigningPortalProps {
  token: string;
}

type Phase = 'otp' | 'disclosure' | 'preview' | 'sign' | 'done';

function typedSignatureToDataUrl(text: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 140;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#0f172a';
  ctx.font = 'italic 42px "Segoe Script", "Comic Sans MS", cursive';
  ctx.fillText(text || 'חתימה', canvas.width / 2, canvas.height / 2);
  return canvas.toDataURL('image/png');
}

function DisclosureBody({ clubName }: { clubName: string }) {
  return (
    <div className="space-y-4 text-sm text-slate-700 leading-relaxed">
      <h2 className="font-black text-slate-900 text-base">
        אישור תהליך חתימה דיגיטלי וגילוי נאות
      </h2>
      <p>
        עובד/ת יקר/ה,
        <br />
        ברוך/ה הבא/ה למערכת החתימה הדיגיטלית של {clubName}.
      </p>
      <p>
        כדי להבטיח את פרטיותך, שקיפות מלאה ושמירה על זכויותיך על פי דין, להלן עיקרי
        התהליך והתנאים המשפטיים בנוגע לחתימה על הסכם ההעסקה/השכר:
      </p>
      <div>
        <h3 className="font-extrabold text-slate-900 mb-1">1. אימות ופרטיות</h3>
        <ul className="list-disc pr-5 space-y-1">
          <li>הגישה למסמך זה אובטחה באמצעות קוד חד-פעמי (OTP) שנשלח למכשירך הנייד.</li>
          <li>
            כל הפעולות במערכת מתועדות לצורכי אבטחת מידע, הגנת הפרטיות ותוקף משפטי.
          </li>
        </ul>
      </div>
      <div>
        <h3 className="font-extrabold text-slate-900 mb-1">
          2. עיון, התייעצות וזמן לבחינת ההסכם
        </h3>
        <ul className="list-disc pr-5 space-y-1">
          <li>אינך חייב/ת לחתום על ההסכם באופן מיידי.</li>
          <li>
            עומדת בזכותך הזכות לקרוא את ההסכם בעיון, להתייעץ עם כל גורם שתמצא/י לנכון,
            ולחזור למערכת במועד מאוחר יותר כדי להשלים את החתימה.
          </li>
          <li>
            במידה ויש לך שאלות או הבהרות בנוגע לתנאי ההסכם, ניתן לפנות למנהל האגודה.
          </li>
        </ul>
      </div>
      <div>
        <h3 className="font-extrabold text-slate-900 mb-1">3. תוקף חתימה אלקטרונית</h3>
        <ul className="list-disc pr-5 space-y-1">
          <li>
            החתימה שתבצע/י במערכת זו הינה חתימה אלקטרונית תקפה משפטית על פי חוק חתימה
            אלקטרונית, התשס&quot;א-2001.
          </li>
          <li>
            חתימתך במערכת מהווה הסכמה מלאה וקבילה לכל תנאי ההסכם, בדיוק כמו חתימה
            ידנית בכתב יד.
          </li>
        </ul>
      </div>
      <div>
        <h3 className="font-extrabold text-slate-900 mb-1">
          4. שלבי התהליך ונגישות למסמך החתום
        </h3>
        <ol className="list-decimal pr-5 space-y-1">
          <li>עיון וחתימה: קריאת ההסכם וחתימה עליו מצידך.</li>
          <li>אישור הנהלה: העברת ההסכם לחתימת מורשי החתימה מטעם החברה.</li>
          <li>
            סיום ותיוק: לאחר שייחתם על ידי שני הצדדים, העתק מלא וחתום של ההסכם יישמר
            בפורטל העובד האישי שלך, ותהיה לך גישה לצפות בו ולהורידו בכל עת (בהתאם לחוק
            הודעה לעובד).
          </li>
        </ol>
      </div>
    </div>
  );
}

export const EmployeeSigningPortal: React.FC<EmployeeSigningPortalProps> = ({
  token,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('otp');
  const [portalToken, setPortalToken] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(`club_sign_portal_${token}`);
    } catch {
      return null;
    }
  });

  const [employeeName, setEmployeeName] = useState('');
  const [title, setTitle] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [clubName, setClubName] = useState(DEFAULT_BRANDING.clubName);
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  const [phoneMasked, setPhoneMasked] = useState<string | null>(null);
  const [hasPhone, setHasPhone] = useState(false);

  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpHint, setOtpHint] = useState<string | null>(null);

  const [disclosureChecked, setDisclosureChecked] = useState(false);
  const [disclosureBusy, setDisclosureBusy] = useState(false);

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const pdfUrlRef = useRef<string | null>(null);

  const [signatureType, setSignatureType] = useState<'draw' | 'type'>('draw');
  const [typedSignature, setTypedSignature] = useState('');
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [signBusy, setSignBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const applyBrand = (branding?: {
    clubName?: string;
    logoDataUrl?: string | null;
    primaryColor?: string;
    accentColor?: string;
  } | null) => {
    if (!branding) return;
    const name = branding.clubName || DEFAULT_BRANDING.clubName;
    setClubName(name);
    setLogoSrc(branding.logoDataUrl || null);
    if (branding.primaryColor) {
      document.documentElement.style.setProperty('--brand', branding.primaryColor);
      document.documentElement.style.setProperty('--brand-dark', branding.primaryColor);
    }
    if (branding.accentColor) {
      document.documentElement.style.setProperty('--accent', branding.accentColor);
    }
    applyDocumentBranding({
      ...DEFAULT_BRANDING,
      clubName: name,
      logoDataUrl: branding.logoDataUrl ?? null,
      primaryColor: branding.primaryColor || DEFAULT_BRANDING.primaryColor,
      accentColor: branding.accentColor || DEFAULT_BRANDING.accentColor,
    } as BrandingSettings);
  };

  const persistPortalToken = (t: string | null) => {
    setPortalToken(t);
    try {
      if (t) sessionStorage.setItem(`club_sign_portal_${token}`, t);
      else sessionStorage.removeItem(`club_sign_portal_${token}`);
    } catch {
      // ignore
    }
  };

  const loadMeta = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/signing-invites/${encodeURIComponent(token)}`, {
        headers: signingPortalHeaders(portalToken),
      });
      const data = await res.json();
      if (res.status === 410) {
        setError(
          data.error === 'already_signed'
            ? 'ההסכם כבר נחתם מצידך — הקישור אינו פעיל.'
            : data.message || 'פג תוקף הקישור.'
        );
        return;
      }
      if (res.status === 403 && data.error === 'employee_inactive') {
        setError('העובד אינו פעיל במערכת — לא ניתן להיכנס לפורטל.');
        return;
      }
      if (!res.ok) {
        setError('הקישור אינו תקף.');
        return;
      }
      applyBrand(data.branding);
      setEmployeeName(data.employeeName || '');
      setTitle(data.title || '');
      setDocNumber(data.docNumber || '');

      if (data.requiresOtp) {
        setPhase('otp');
        setPhoneMasked(data.phoneMasked || null);
        setHasPhone(Boolean(data.hasPhone));
        return;
      }

      if (data.requiresDisclosure) setPhase('disclosure');
      else setPhase('preview');
    } catch {
      setError('לא ניתן להתחבר לשרת.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, portalToken]);

  useEffect(() => {
    return () => {
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
    };
  }, []);

  useEffect(() => {
    if (phase !== 'preview' || !portalToken) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/signing-invites/${encodeURIComponent(token)}/pdf`, {
          headers: { Authorization: `Bearer ${portalToken}` },
        });
        if (!res.ok) {
          if (res.status === 403) {
            setPhase('disclosure');
            return;
          }
          throw new Error('pdf_failed');
        }
        const buf = await res.arrayBuffer();
        if (cancelled) return;
        if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
        const url = URL.createObjectURL(new Blob([buf], { type: 'application/pdf' }));
        pdfUrlRef.current = url;
        setPdfUrl(url);
      } catch {
        if (!cancelled) setError('לא ניתן לטעון את ההסכם לתצוגה.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, portalToken, token]);

  const sendOtp = async () => {
    setOtpBusy(true);
    setOtpError(null);
    setOtpHint(null);
    try {
      const res = await fetch(
        `/api/signing-invites/${encodeURIComponent(token)}/otp/request`,
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
      }
    } catch {
      setOtpError('שגיאת רשת');
    } finally {
      setOtpBusy(false);
    }
  };

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpBusy(true);
    setOtpError(null);
    try {
      const res = await fetch(
        `/api/signing-invites/${encodeURIComponent(token)}/otp/verify`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: otpCode.trim() }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setOtpError(data.message || 'קוד שגוי');
        return;
      }
      persistPortalToken(data.portalToken);
      applyBrand(data.invite?.branding);
      setEmployeeName(data.invite?.employeeName || employeeName);
      setTitle(data.invite?.title || title);
      setDocNumber(data.invite?.docNumber || docNumber);
      setPhase(data.invite?.requiresDisclosure ? 'disclosure' : 'preview');
    } catch {
      setOtpError('שגיאת רשת');
    } finally {
      setOtpBusy(false);
    }
  };

  const acceptDisclosure = async () => {
    if (!disclosureChecked || !portalToken) return;
    setDisclosureBusy(true);
    try {
      const res = await fetch(
        `/api/signing-invites/${encodeURIComponent(token)}/disclosure`,
        {
          method: 'POST',
          headers: signingPortalHeaders(portalToken),
          body: '{}',
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'אישור ההודעה נכשל');
        return;
      }
      setPhase('preview');
    } catch {
      setError('שגיאת רשת באישור ההודעה');
    } finally {
      setDisclosureBusy(false);
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const startDrawing = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const draw = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0F172A';
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
    setHasDrawn(true);
  };

  const submitSignature = async () => {
    let img: string | null = null;
    if (signatureType === 'draw' && canvasRef.current && hasDrawn) {
      img = canvasRef.current.toDataURL('image/png');
    } else if (signatureType === 'type' && typedSignature.trim()) {
      img = typedSignatureToDataUrl(typedSignature.trim());
    }
    if (!img || !portalToken) {
      alert('נא לחתום לפני השליחה');
      return;
    }
    setSignBusy(true);
    try {
      const res = await fetch(`/api/signing-invites/${encodeURIComponent(token)}/sign`, {
        method: 'POST',
        headers: signingPortalHeaders(portalToken),
        body: JSON.stringify({
          signatureImageBase64: img,
          signatureType,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.message || 'החתימה נכשלה');
        return;
      }
      setPhase('done');
    } catch {
      alert('שגיאת רשת בשמירת החתימה');
    } finally {
      setSignBusy(false);
    }
  };

  const shell = (children: React.ReactNode) => (
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
              <p className="text-xs text-white/80 font-bold">חתימה דיגיטלית · {clubName}</p>
              <h1 className="text-lg font-black truncate">{title || 'הסכם לחתימה'}</h1>
              {employeeName && (
                <p className="text-sm text-white/85 mt-0.5">
                  {employeeName}
                  {docNumber ? ` · ${docNumber}` : ''}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-600">
        <Loader2 className="w-6 h-6 animate-spin ml-2" />
        טוען פורטל חתימה...
      </div>
    );
  }

  if (error && phase !== 'done') {
    return shell(
      <div className="text-center space-y-3 py-6">
        <ShieldAlert className="w-10 h-10 text-rose-500 mx-auto" />
        <h2 className="font-extrabold text-slate-900">לא ניתן לפתוח את הקישור</h2>
        <p className="text-sm text-slate-600">{error}</p>
      </div>
    );
  }

  if (phase === 'otp') {
    return shell(
      <form onSubmit={(e) => void verifyOtp(e)} className="space-y-4">
        <p className="text-sm text-slate-600 leading-relaxed">
          לשמירה על פרטיותך נדרש אימות באמצעות קוד SMS למספר{' '}
          <strong className="font-mono">{phoneMasked || 'המוגדר בתיק'}</strong>.
        </p>
        {!hasPhone ? (
          <p className="text-xs text-rose-600 font-bold">
            לא הוגדר טלפון. פנה למנהל לעדכון המספר ושליחת קישור מחדש.
          </p>
        ) : (
          <>
            {otpSent && (
              <label className="block space-y-1">
                <span className="text-xs font-bold text-slate-600">קוד אימות</span>
                <input
                  className={`${fieldClassXs} font-mono tracking-widest`}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  inputMode="numeric"
                  required
                />
              </label>
            )}
            {otpHint && <p className="text-xs text-emerald-700 font-bold">{otpHint}</p>}
            {otpError && <p className="text-xs text-rose-600 font-bold">{otpError}</p>}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={otpBusy}
                onClick={() => void sendOtp()}
                className="px-4 py-2.5 rounded-xl text-white text-xs font-bold disabled:opacity-50"
                style={{ backgroundColor: 'var(--brand)' }}
              >
                {otpSent ? 'שלח קוד שוב' : 'שלח קוד SMS'}
              </button>
              {otpSent && (
                <button
                  type="submit"
                  disabled={otpBusy || !otpCode.trim()}
                  className="px-4 py-2.5 rounded-xl text-white text-xs font-bold disabled:opacity-50"
                  style={{ backgroundColor: 'var(--accent)' }}
                >
                  אמת והמשך
                </button>
              )}
            </div>
          </>
        )}
      </form>
    );
  }

  if (phase === 'disclosure') {
    return shell(
      <div className="space-y-4">
        <div className="max-h-[50vh] overflow-y-auto pr-1">
          <DisclosureBody clubName={clubName} />
        </div>
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1"
            checked={disclosureChecked}
            onChange={(e) => setDisclosureChecked(e.target.checked)}
          />
          <span className="text-xs font-bold text-slate-800 leading-relaxed">
            קראתי והבנתי את התנאים המפורטים לעיל. אני מאשר/ת כי ניתנה לי ההזדמנות לעיין
            בהסכם, ואני מסכים/ה להמשיך בתהליך החתימה האלקטרונית.
          </span>
        </label>
        <button
          type="button"
          disabled={!disclosureChecked || disclosureBusy}
          onClick={() => void acceptDisclosure()}
          className="w-full py-3 rounded-xl text-white font-extrabold text-sm disabled:opacity-40"
          style={{ backgroundColor: 'var(--brand)' }}
        >
          {disclosureBusy ? 'שומר...' : 'אישור והמשך'}
        </button>
      </div>
    );
  }

  if (phase === 'preview') {
    return shell(
      <div className="space-y-4">
        <h2 className="font-black text-slate-900 flex items-center gap-2 text-base">
          <FileText className="w-5 h-5 text-[var(--brand)]" />
          תצוגה מקדימה של ההסכם
        </h2>
        {pdfUrl ? (
          <iframe title="הסכם" src={pdfUrl} className="w-full h-[50vh] rounded-xl border border-slate-200" />
        ) : (
          <p className="text-sm text-slate-500 py-8 text-center flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            טוען מסמך...
          </p>
        )}
        <button
          type="button"
          disabled={!pdfUrl}
          onClick={() => setPhase('sign')}
          className="w-full py-3 rounded-xl text-white font-extrabold text-sm disabled:opacity-40"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          אישור והמשך לחתימה
        </button>
      </div>
    );
  }

  if (phase === 'sign') {
    return shell(
      <div className="space-y-4">
        <h2 className="font-black text-slate-900 flex items-center gap-2 text-base">
          <PenTool className="w-5 h-5 text-[var(--brand)]" />
          חתימה על ההסכם
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSignatureType('draw')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold border ${
              signatureType === 'draw' ? 'text-white' : 'bg-slate-50 text-slate-700'
            }`}
            style={
              signatureType === 'draw' ? { backgroundColor: 'var(--brand)' } : undefined
            }
          >
            <PenTool className="w-3.5 h-3.5 inline ml-1" />
            ציור
          </button>
          <button
            type="button"
            onClick={() => setSignatureType('type')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold border ${
              signatureType === 'type' ? 'text-white' : 'bg-slate-50 text-slate-700'
            }`}
            style={
              signatureType === 'type' ? { backgroundColor: 'var(--brand)' } : undefined
            }
          >
            <Keyboard className="w-3.5 h-3.5 inline ml-1" />
            הקלדה
          </button>
        </div>
        {signatureType === 'draw' ? (
          <div className="space-y-2">
            <canvas
              ref={canvasRef}
              width={560}
              height={180}
              className="w-full border border-slate-300 rounded-xl bg-white touch-none"
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={() => setIsDrawing(false)}
              onMouseLeave={() => setIsDrawing(false)}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={() => setIsDrawing(false)}
            />
            <button
              type="button"
              onClick={clearCanvas}
              className="text-xs font-bold text-slate-500 flex items-center gap-1"
            >
              <Eraser className="w-3.5 h-3.5" />
              נקה
            </button>
          </div>
        ) : (
          <input
            className={fieldClassXs}
            placeholder="הקלד את שמך לחתימה"
            value={typedSignature}
            onChange={(e) => setTypedSignature(e.target.value)}
          />
        )}
        <button
          type="button"
          disabled={signBusy}
          onClick={() => void submitSignature()}
          className="w-full py-3 rounded-xl text-white font-extrabold text-sm disabled:opacity-50"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          {signBusy ? 'שולח חתימה...' : 'אשר חתימה ושלח'}
        </button>
      </div>
    );
  }

  return shell(
    <div className="text-center py-8 space-y-3">
      <CheckCircle2 className="w-14 h-14 mx-auto text-emerald-500" />
      <ShieldCheck className="w-6 h-6 mx-auto text-[var(--brand)]" />
      <h2 className="text-lg font-black text-slate-900">החתימה נקלטה בהצלחה</h2>
      <p className="text-sm text-slate-600 leading-relaxed">
        נחתם מצידך — ממתין לחתימת הנהלה. ניתן לסגור את הדף.
      </p>
    </div>
  );
};
