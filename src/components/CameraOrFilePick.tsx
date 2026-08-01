import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, SwitchCamera, X } from 'lucide-react';

interface CameraOrFilePickProps {
  accept: string;
  /** מצלמה קדמית (user) לתמונת פנים, אחורית (environment) לת״ז */
  capture?: 'user' | 'environment';
  onFile: (file: File | null) => void;
  uploadLabel?: string;
  cameraLabel?: string;
  disabled?: boolean;
  className?: string;
}

function isSecureCameraContext(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.isSecureContext ||
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1'
  );
}

function canUseMediaDevices(): boolean {
  return Boolean(navigator.mediaDevices?.getUserMedia);
}

/**
 * העלאת קובץ + צילום במצלמה אמיתי (getUserMedia) — עובד ב-Windows/macOS/Linux/מובייל.
 * הערת capture ב־input לבדה לא נתמכת בדסקטופ (Chrome/Edge פותחים סייר קבצים).
 */
export const CameraOrFilePick: React.FC<CameraOrFilePickProps> = ({
  accept,
  capture = 'environment',
  onFile,
  uploadLabel = 'העלאת קובץ',
  cameraLabel = 'צילום במצלמה',
  disabled = false,
  className = '',
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [open, setOpen] = useState(false);
  const [facing, setFacing] = useState<'user' | 'environment'>(capture);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startStream = useCallback(
    async (mode: 'user' | 'environment') => {
      setStarting(true);
      setError(null);
      stopStream();
      try {
        if (!canUseMediaDevices()) {
          throw new Error('no_media_devices');
        }
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              facingMode: { ideal: mode },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          });
        } catch {
          // fallback — כל מצלמה זמינה (נפוץ בדסקטופ עם מצלמה אחת)
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: true,
          });
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch (err) {
        const name = err instanceof DOMException ? err.name : '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setError('הגישה למצלמה נחסמה. אשר הרשאה בדפדפן ונסה שוב.');
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setError('לא נמצאה מצלמה במכשיר.');
        } else if (!isSecureCameraContext()) {
          setError('צילום דורש HTTPS או localhost.');
        } else {
          setError('לא ניתן לפתוח את המצלמה. נסה העלאת קובץ מהגלריה.');
        }
      } finally {
        setStarting(false);
      }
    },
    [stopStream]
  );

  useEffect(() => {
    if (!open) return;
    void startStream(facing);
    return () => stopStream();
  }, [open, facing, startStream, stopStream]);

  const closeCamera = () => {
    stopStream();
    setOpen(false);
    setError(null);
  };

  const openCamera = () => {
    if (disabled) return;
    if (!isSecureCameraContext() || !canUseMediaDevices()) {
      setError(null);
      // fallback למובייל ישן: input עם capture
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = capture;
      input.onchange = () => {
        onFile(input.files?.[0] ?? null);
      };
      input.click();
      return;
    }
    setFacing(capture);
    setOpen(true);
  };

  const takePhoto = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setCapturing(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas');
      // מצלמה קדמית — שיקוף אופקי לנוחות
      if (facing === 'user') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.92)
      );
      if (!blob) throw new Error('blob');
      const file = new File([blob], `camera-${Date.now()}.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });
      onFile(file);
      closeCamera();
    } catch {
      setError('צילום נכשל. נסה שוב.');
    } finally {
      setCapturing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFile(e.target.files?.[0] ?? null);
    e.target.value = '';
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => fileRef.current?.click()}
        className="inline-flex items-center px-3.5 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-40 hover:opacity-95"
        style={{ backgroundColor: 'var(--brand, #0088CC)' }}
      >
        <ImagePlus className="w-3.5 h-3.5 ml-1.5" />
        {uploadLabel}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={openCamera}
        className="inline-flex items-center px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-200 bg-white text-slate-700 disabled:opacity-40 hover:bg-slate-50"
      >
        <Camera className="w-3.5 h-3.5 ml-1.5" />
        {cameraLabel}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept={accept}
        className="hidden"
        disabled={disabled}
        onChange={handleFileChange}
      />

      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
          dir="rtl"
          role="dialog"
          aria-modal="true"
          aria-label="צילום במצלמה"
        >
          <div className="w-full max-w-lg bg-white rounded-3xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-900">צילום במצלמה</h3>
              <button
                type="button"
                onClick={closeCamera}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                aria-label="סגור"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-black aspect-[4/3] relative flex items-center justify-center">
              {starting && (
                <p className="absolute z-10 text-white text-xs font-bold">פותח מצלמה…</p>
              )}
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className={`w-full h-full object-cover ${facing === 'user' ? 'scale-x-[-1]' : ''}`}
              />
            </div>

            {error && (
              <p className="px-4 pt-3 text-xs font-bold text-rose-600">{error}</p>
            )}

            <div className="p-4 flex flex-wrap gap-2 justify-between items-center">
              <button
                type="button"
                onClick={() =>
                  setFacing((prev) => (prev === 'user' ? 'environment' : 'user'))
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                <SwitchCamera className="w-3.5 h-3.5" />
                החלף מצלמה
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeCamera}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-200 text-slate-600"
                >
                  ביטול
                </button>
                <button
                  type="button"
                  disabled={starting || Boolean(error) || capturing}
                  onClick={() => void takePhoto()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-extrabold text-white disabled:opacity-40"
                  style={{ backgroundColor: 'var(--brand, #0088CC)' }}
                >
                  <Camera className="w-3.5 h-3.5" />
                  {capturing ? 'מצלם…' : 'צלם'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
