import { SignJWT, jwtVerify } from 'jose';
import type { IncomingMessage } from 'http';
import type { AuthUser, SystemRole } from './types';
import { getUserById } from './userStore';

const JWT_TTL = '7d';

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET || 'dev-insecure-jwt-secret-change-me';
  return new TextEncoder().encode(secret);
}

export async function signAuthToken(user: AuthUser): Promise<string> {
  return new SignJWT({
    sub: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(JWT_TTL)
    .sign(getSecret());
}

export async function verifyAuthToken(token: string): Promise<{
  id: string;
  email: string;
  role: SystemRole;
  name: string;
} | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const id = String(payload.sub || '');
    const email = String(payload.email || '');
    const role = payload.role as SystemRole;
    const name = String(payload.name || '');
    if (!id || (role !== 'SYSTEM_ADMIN' && role !== 'MANAGER')) return null;
    return { id, email, role, name };
  } catch {
    return null;
  }
}

export function extractBearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (!header || typeof header !== 'string') return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1].trim() : null;
}

export async function signOnboardPortalToken(inviteToken: string, phone: string): Promise<string> {
  return new SignJWT({
    purpose: 'onboard',
    inviteToken,
    phone,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(inviteToken)
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(getSecret());
}

export async function verifyOnboardPortalToken(
  token: string,
  expectedInviteToken: string
): Promise<{ phone: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.purpose !== 'onboard') return null;
    if (String(payload.inviteToken || payload.sub || '') !== expectedInviteToken) return null;
    const phone = String(payload.phone || '');
    if (!phone) return null;
    return { phone };
  } catch {
    return null;
  }
}

export async function getOnboardPortalAuth(
  req: IncomingMessage,
  inviteToken: string
): Promise<{ phone: string } | null> {
  const token = extractBearerToken(req);
  if (!token) return null;
  return verifyOnboardPortalToken(token, inviteToken);
}

export async function signSigningPortalToken(
  inviteToken: string,
  phone: string
): Promise<string> {
  return new SignJWT({
    purpose: 'sign',
    inviteToken,
    phone,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(inviteToken)
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(getSecret());
}

export async function verifySigningPortalToken(
  token: string,
  expectedInviteToken: string
): Promise<{ phone: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.purpose !== 'sign') return null;
    if (String(payload.inviteToken || payload.sub || '') !== expectedInviteToken) return null;
    const phone = String(payload.phone || '');
    if (!phone) return null;
    return { phone };
  } catch {
    return null;
  }
}

export async function getSigningPortalAuth(
  req: IncomingMessage,
  inviteToken: string
): Promise<{ phone: string } | null> {
  const token = extractBearerToken(req);
  if (!token) return null;
  return verifySigningPortalToken(token, inviteToken);
}

/** מחזיר משתמש מלא מהמאגר לפי JWT מקומי או Firebase ID token */
export async function getBearerUser(req: IncomingMessage): Promise<AuthUser | null> {
  const token = extractBearerToken(req);
  if (!token) return null;

  // 1) JWT מקומי (מצב ללא Firebase Auth)
  const payload = await verifyAuthToken(token);
  if (payload) {
    const user = getUserById(payload.id);
    if (user) return user;
  }

  // 2) Firebase ID token (מצב VITE_USE_FIREBASE_AUTH)
  try {
    const { ensureFirebaseAdmin, isFirebaseAdminReady, getClubIdServer } = await import(
      './firebaseAdmin'
    );
    if (!isFirebaseAdminReady()) return null;
    ensureFirebaseAdmin();
    const { getAuth } = await import('firebase-admin/auth');
    const decoded = await getAuth().verifyIdToken(token);
    const role = decoded.role as SystemRole | undefined;
    const clubId = decoded.clubId as string | undefined;
    if (role !== 'SYSTEM_ADMIN' && role !== 'MANAGER') return null;
    if (clubId && clubId !== getClubIdServer()) return null;

    const local =
      getUserById(decoded.uid);
    // נסה התאמה לפי אימייל במאגר המקומי
    let byEmail = local;
    if (!byEmail && decoded.email) {
      const { getUserByEmail } = await import('./userStore');
      byEmail = getUserByEmail(decoded.email);
    }
    if (byEmail) {
      return { ...byEmail, id: decoded.uid, role, lastLoginAt: new Date().toISOString() };
    }

    const now = new Date().toISOString();
    return {
      id: decoded.uid,
      email: decoded.email || '',
      name: (decoded.name as string) || decoded.email || 'משתמש',
      picture: decoded.picture as string | undefined,
      googleSub: decoded.sub || decoded.uid,
      phone: typeof decoded.phone === 'string' ? decoded.phone : undefined,
      role,
      createdAt: now,
      lastLoginAt: now,
    };
  } catch {
    return null;
  }
}
