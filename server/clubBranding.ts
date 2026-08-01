import { getFirestore } from 'firebase-admin/firestore';
import { ensureFirebaseAdmin, getClubIdServer, isFirebaseAdminReady } from './auth/firebaseAdmin';

export type PortalBranding = {
  clubName: string;
  clubNameEn?: string;
  logoDataUrl?: string | null;
  primaryColor?: string;
  accentColor?: string;
};

const FALLBACK: PortalBranding = {
  clubName: process.env.SMS_BRAND_NAME || 'אסא תל אביב',
  clubNameEn: 'ASA Tel Aviv',
  logoDataUrl: null,
  primaryColor: '#0088CC',
  accentColor: '#2ECC71',
};

/** מיתוג מועדון לפורטלים — קודם Firestore, אחרת ברירת מחדל */
export async function resolveClubBrandingForPortal(
  inviteBranding?: PortalBranding | null
): Promise<PortalBranding> {
  let remote: PortalBranding | null = null;
  if (isFirebaseAdminReady()) {
    try {
      ensureFirebaseAdmin();
      const snap = await getFirestore().collection('clubs').doc(getClubIdServer()).get();
      const raw = snap.exists ? (snap.data()?.branding as Record<string, unknown> | undefined) : null;
      if (raw) {
        const logo =
          typeof raw.logoDataUrl === 'string' &&
          (raw.logoDataUrl.startsWith('http') || raw.logoDataUrl.startsWith('data:'))
            ? raw.logoDataUrl
            : null;
        remote = {
          clubName: String(raw.clubName || FALLBACK.clubName),
          clubNameEn: typeof raw.clubNameEn === 'string' ? raw.clubNameEn : FALLBACK.clubNameEn,
          logoDataUrl: logo,
          primaryColor:
            typeof raw.primaryColor === 'string' ? raw.primaryColor : FALLBACK.primaryColor,
          accentColor: typeof raw.accentColor === 'string' ? raw.accentColor : FALLBACK.accentColor,
        };
      }
    } catch (err) {
      console.warn('[clubBranding] load failed', err);
    }
  }

  const base = remote || FALLBACK;
  const inviteLogo =
    inviteBranding?.logoDataUrl &&
    (inviteBranding.logoDataUrl.startsWith('http') ||
      inviteBranding.logoDataUrl.startsWith('data:'))
      ? inviteBranding.logoDataUrl
      : null;

  return {
    clubName: inviteBranding?.clubName || base.clubName,
    clubNameEn: inviteBranding?.clubNameEn || base.clubNameEn,
    // Firestore is source of truth for the live site logo
    logoDataUrl: base.logoDataUrl || inviteLogo || null,
    primaryColor: inviteBranding?.primaryColor || base.primaryColor,
    accentColor: inviteBranding?.accentColor || base.accentColor,
  };
}
