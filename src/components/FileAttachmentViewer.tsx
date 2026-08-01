import React, { useEffect, useState } from 'react';
import { Download, Eye, Loader2, X } from 'lucide-react';
import { resolveEmployeeAttachmentUrl } from '../services/storage/clubStorage';

export type AttachmentSource = {
  title: string;
  fileName?: string;
  fileDataUrl?: string;
  storagePath?: string;
};

function isPdfUrl(url: string, fileName?: string): boolean {
  const name = (fileName || '').toLowerCase();
  if (name.endsWith('.pdf')) return true;
  if (url.startsWith('data:application/pdf')) return true;
  if (url.includes('application/pdf')) return true;
  try {
    const path = new URL(url, window.location.origin).pathname.toLowerCase();
    return path.endsWith('.pdf');
  } catch {
    return false;
  }
}

function isImageUrl(url: string, fileName?: string): boolean {
  const name = (fileName || '').toLowerCase();
  if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(name)) return true;
  if (url.startsWith('data:image/')) return true;
  try {
    const path = new URL(url, window.location.origin).pathname.toLowerCase();
    return /\.(png|jpe?g|gif|webp|bmp)$/i.test(path);
  } catch {
    return false;
  }
}

interface FileAttachmentViewerProps {
  attachment: AttachmentSource | null;
  onClose: () => void;
}

export const FileAttachmentViewer: React.FC<FileAttachmentViewerProps> = ({
  attachment,
  onClose,
}) => {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!attachment) {
      setUrl(null);
      setError(null);
      return;
    }
    let cancelled = false;
    let createdObjectUrl: string | null = null;
    setBusy(true);
    setError(null);
    setUrl(null);
    void (async () => {
      const resolved = await resolveEmployeeAttachmentUrl({
        fileDataUrl: attachment.fileDataUrl,
        storagePath: attachment.storagePath,
      });
      if (cancelled) return;
      if (!resolved) {
        setBusy(false);
        setError('לא ניתן לטעון את הקובץ לצפייה');
        return;
      }
      try {
        // Data URL גדול ב-iframe גורם לכשל/הורדה — ממירים ל-Blob URL לתצוגה
        if (resolved.startsWith('data:')) {
          const res = await fetch(resolved);
          const blob = await res.blob();
          createdObjectUrl = URL.createObjectURL(blob);
          if (cancelled) {
            URL.revokeObjectURL(createdObjectUrl);
            createdObjectUrl = null;
            return;
          }
          setUrl(createdObjectUrl);
        } else {
          setUrl(resolved);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) setError('לא ניתן לפתוח את הקובץ לתצוגה');
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
      if (createdObjectUrl) {
        URL.revokeObjectURL(createdObjectUrl);
      }
    };
  }, [attachment]);

  if (!attachment) return null;

  const pdf = Boolean(
    url &&
      (isPdfUrl(url, attachment.fileName) ||
        isPdfUrl(attachment.fileDataUrl || '', attachment.fileName))
  );
  const image = Boolean(
    url &&
      !pdf &&
      (isImageUrl(url, attachment.fileName) ||
        isImageUrl(attachment.fileDataUrl || '', attachment.fileName))
  );

  return (
    <div className="fixed inset-0 z-[60] bg-[var(--navy,#0f172a)]/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
          <div className="min-w-0">
            <h3 className="font-extrabold text-slate-900 text-sm truncate">{attachment.title}</h3>
            {attachment.fileName && (
              <p className="text-[11px] text-slate-500 truncate">{attachment.fileName}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {url && (
              <a
                href={attachment.fileDataUrl || url}
                download={attachment.fileName || attachment.title}
                className="px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 text-slate-700 hover:bg-slate-50 inline-flex items-center"
              >
                <Download className="w-3.5 h-3.5 ml-1" />
                הורדה
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="סגור"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-[50vh] bg-slate-50 flex items-center justify-center p-3 overflow-auto">
          {busy && (
            <div className="flex items-center gap-2 text-sm text-slate-500 font-semibold">
              <Loader2 className="w-5 h-5 animate-spin" />
              טוען קובץ…
            </div>
          )}
          {!busy && error && <p className="text-sm text-rose-600 font-semibold">{error}</p>}
          {!busy && url && image && (
            <img
              src={url}
              alt={attachment.title}
              className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-sm bg-white"
            />
          )}
          {!busy && url && pdf && (
            <iframe
              title={attachment.title}
              src={url}
              className="w-full h-[75vh] rounded-xl border border-slate-200 bg-white"
            />
          )}
          {!busy && url && !image && !pdf && (
            <div className="text-center space-y-3">
              <p className="text-sm text-slate-600 font-semibold">
                סוג הקובץ אינו נתמך לתצוגה מובנית
              </p>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-4 py-2 rounded-xl text-xs font-extrabold text-white"
                style={{ backgroundColor: 'var(--brand)' }}
              >
                <Eye className="w-4 h-4 ml-1.5" />
                פתח בחלון חדש
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface AttachmentActionsProps {
  title: string;
  fileName?: string;
  fileDataUrl?: string;
  storagePath?: string;
  onView: (attachment: AttachmentSource) => void;
  compact?: boolean;
}

export function hasAttachmentFile(params: {
  fileDataUrl?: string;
  storagePath?: string;
}): boolean {
  return Boolean(params.fileDataUrl || params.storagePath);
}

export const AttachmentActions: React.FC<AttachmentActionsProps> = ({
  title,
  fileName,
  fileDataUrl,
  storagePath,
  onView,
  compact = false,
}) => {
  const [downloading, setDownloading] = useState(false);
  const available = hasAttachmentFile({ fileDataUrl, storagePath });
  if (!available) {
    return (
      <span className="text-[10px] text-slate-400 font-semibold px-2">אין קובץ מצורף</span>
    );
  }

  const attachment: AttachmentSource = { title, fileName, fileDataUrl, storagePath };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const url = await resolveEmployeeAttachmentUrl({ fileDataUrl, storagePath });
      if (!url) {
        alert('לא ניתן להוריד את הקובץ');
        return;
      }
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || title;
      a.target = '_blank';
      a.rel = 'noopener';
      a.click();
    } finally {
      setDownloading(false);
    }
  };

  const btn =
    compact
      ? 'p-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100'
      : 'px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 text-slate-700 hover:bg-slate-100 inline-flex items-center';

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onView(attachment)}
        className={
          compact
            ? `${btn} text-[var(--brand)] hover:bg-[var(--brand-light)]`
            : 'px-3 py-1.5 rounded-xl text-xs font-bold text-white inline-flex items-center'
        }
        style={compact ? undefined : { backgroundColor: 'var(--brand)' }}
        title="צפייה בקובץ"
      >
        <Eye className={`w-3.5 h-3.5 ${compact ? '' : 'ml-1'}`} />
        {!compact && 'צפייה'}
      </button>
      <button
        type="button"
        onClick={() => void handleDownload()}
        disabled={downloading}
        className={btn}
        title="הורדת קובץ"
      >
        {downloading ? (
          <Loader2 className={`w-3.5 h-3.5 animate-spin ${compact ? '' : 'ml-1'}`} />
        ) : (
          <Download className={`w-3.5 h-3.5 ${compact ? '' : 'ml-1'}`} />
        )}
        {!compact && (downloading ? 'מוריד…' : 'הורדה')}
      </button>
    </div>
  );
};
