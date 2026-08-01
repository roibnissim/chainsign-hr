import React, { useEffect, useRef, useState } from 'react';
import { Upload, Image as ImageIcon, RotateCcw, Check, Palette } from 'lucide-react';
import { BrandingSettings, DEFAULT_BRANDING } from '../config/branding';
import { ClubLogo } from './ClubLogo';

interface BrandSettingsProps {
  branding: BrandingSettings;
  onSave: (next: BrandingSettings) => void | Promise<void>;
}

export const BrandSettings: React.FC<BrandSettingsProps> = ({ branding, onSave }) => {
  const [draft, setDraft] = useState<BrandingSettings>(branding);
  const [savedFlash, setSavedFlash] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(branding);
  }, [branding]);

  const handleLogoFile = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('נא לבחור קובץ תמונה (PNG, JPG, SVG או WebP)');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert('גודל הקובץ מוגבל ל־2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setDraft((prev) => ({ ...prev, logoDataUrl: String(reader.result) }));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setDraft(DEFAULT_BRANDING);
  };

  return (
    <div className="space-y-6">
      <div
        className="brand-hero rounded-3xl p-6 sm:p-8 shadow-lg overflow-hidden relative"
        style={{
          background: `linear-gradient(105deg, ${draft.primaryColor}, ${draft.primaryColor}dd)`,
        }}
      >
        <div className="relative z-10 flex flex-col sm:flex-row items-center gap-6">
          <ClubLogo src={draft.logoDataUrl} size="xl" className="ring-4 ring-white/40" />
          <div className="text-center sm:text-right">
            <p className="text-sm text-white/80 mb-1">תצוגה מקדימה</p>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight">{draft.clubName}</h2>
            <p className="text-white/90 mt-1 font-medium">{draft.clubNameEn}</p>
            <p className="text-white/75 text-sm mt-2 max-w-xl">{draft.tagline}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Logo upload */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-xl bg-[var(--brand-light)] text-[var(--brand)]">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">לוגו האגודה</h3>
              <p className="text-xs text-slate-500">החלף את הלוגו הקיים בתמונת האגודה שלך</p>
            </div>
          </div>

          <div className="flex items-center gap-5 mb-5">
            <ClubLogo src={draft.logoDataUrl} size="lg" />
            <div className="text-sm text-slate-600 space-y-1">
              <p>מומלץ: תמונה עגולה / ריבועית, רקע שקוף</p>
              <p className="text-xs text-slate-400">PNG · JPG · SVG · WebP · עד 2MB</p>
            </div>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => handleLogoFile(e.target.files?.[0] ?? null)}
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white font-semibold text-sm transition-colors"
            >
              <Upload className="w-4 h-4" />
              העלאת לוגו
            </button>
            {draft.logoDataUrl && (
              <button
                type="button"
                onClick={() => setDraft((p) => ({ ...p, logoDataUrl: null }))}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium text-sm"
              >
                הסר לוגו מותאם
              </button>
            )}
          </div>
        </section>

        {/* Texts & colors */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 rounded-xl bg-[var(--brand-light)] text-[var(--brand)]">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">פרטי האגודה</h3>
              <p className="text-xs text-slate-500">שם, סיסמה וצבעי מותג</p>
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-slate-500">שם האגודה (עברית)</span>
            <input
              value={draft.clubName}
              onChange={(e) => setDraft((p) => ({ ...p, clubName: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/40"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-500">שם באנגלית</span>
            <input
              value={draft.clubNameEn}
              onChange={(e) => setDraft((p) => ({ ...p, clubNameEn: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/40"
              dir="ltr"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-500">תיאור קצר / סיסמה</span>
            <textarea
              value={draft.tagline}
              onChange={(e) => setDraft((p) => ({ ...p, tagline: e.target.value }))}
              rows={2}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/40 resize-none"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-slate-500">צבע ראשי</span>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={draft.primaryColor}
                  onChange={(e) => setDraft((p) => ({ ...p, primaryColor: e.target.value }))}
                  className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer"
                />
                <input
                  value={draft.primaryColor}
                  onChange={(e) => setDraft((p) => ({ ...p, primaryColor: e.target.value }))}
                  className="flex-1 rounded-xl border border-slate-200 px-2 py-2 text-xs font-mono"
                  dir="ltr"
                />
              </div>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-500">צבע הדגשה</span>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={draft.accentColor}
                  onChange={(e) => setDraft((p) => ({ ...p, accentColor: e.target.value }))}
                  className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer"
                />
                <input
                  value={draft.accentColor}
                  onChange={(e) => setDraft((p) => ({ ...p, accentColor: e.target.value }))}
                  className="flex-1 rounded-xl border border-slate-200 px-2 py-2 text-xs font-mono"
                  dir="ltr"
                />
              </div>
            </label>
          </div>
        </section>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium text-sm"
        >
          <RotateCcw className="w-4 h-4" />
          איפוס לברירת מחדל
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm text-white shadow-md transition-all disabled:opacity-60"
          style={{ backgroundColor: draft.accentColor }}
        >
          {savedFlash ? <Check className="w-4 h-4" /> : null}
          {saving ? 'שומר…' : savedFlash ? 'נשמר!' : 'שמירת מיתוג'}
        </button>
      </div>
    </div>
  );
};
