export interface BrandingSettings {
  clubName: string;
  clubNameEn: string;
  tagline: string;
  logoDataUrl: string | null;
  /** נתיב Storage ללוגו (אופציונלי) */
  logoStoragePath?: string | null;
  primaryColor: string;
  accentColor: string;
  contactWhatsapp: string;
}

export const DEFAULT_BRANDING: BrandingSettings = {
  clubName: 'אסא תל אביב',
  clubNameEn: 'ASA Tel Aviv',
  tagline: 'מערכת ניהול מסמכים וחתימות לאגודת הספורט',
  logoDataUrl: null,
  logoStoragePath: null,
  primaryColor: '#0088CC',
  accentColor: '#2ECC71',
  contactWhatsapp: '',
};

export const BRANDING_STORAGE_KEY = 'club_branding_settings';
export const DEFAULT_LOGO_HREF = '/logo-placeholder.svg';

export function loadBranding(): BrandingSettings {
  try {
    const raw = localStorage.getItem(BRANDING_STORAGE_KEY);
    if (!raw) return DEFAULT_BRANDING;
    return { ...DEFAULT_BRANDING, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_BRANDING;
  }
}

export function saveBranding(settings: BrandingSettings): void {
  localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(settings));
}

/** מעדכן title + favicon לפי מיתוג האגודה */
export function applyDocumentBranding(branding: BrandingSettings): void {
  if (typeof document === 'undefined') return;
  document.title = `${branding.clubName} · מערכת ניהול`;

  const href =
    branding.logoDataUrl &&
    (branding.logoDataUrl.startsWith('http') ||
      branding.logoDataUrl.startsWith('data:') ||
      branding.logoDataUrl.startsWith('/'))
      ? branding.logoDataUrl
      : DEFAULT_LOGO_HREF;

  const ensureLink = (rel: string) => {
    let link = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.rel = rel;
      document.head.appendChild(link);
    }
    link.href = href;
    if (href.startsWith('data:image/svg') || href.endsWith('.svg')) {
      link.type = 'image/svg+xml';
    } else if (href.startsWith('data:image/png') || href.includes('.png')) {
      link.type = 'image/png';
    } else {
      link.removeAttribute('type');
    }
  };

  ensureLink('icon');
  ensureLink('shortcut icon');
  ensureLink('apple-touch-icon');
}
