import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';
import dotenv from 'dotenv';
import { verifyGoogleIdToken } from './auth/googleVerify';
import { signAuthToken } from './auth/jwt';
import {
  canCreateUsers,
  canDeleteUser,
  requireAuth,
  requireRole,
  sendJson,
} from './auth/rbac';
import { toPublicUser, type SystemRole } from './auth/types';
import {
  canRequestManagerOtp,
  countSystemAdmins,
  createManualUser,
  deleteUser,
  getUserById,
  listUsers,
  updateUserRole,
  upsertGoogleUser,
  resolveGoogleManager,
  upsertSmsUser,
} from './auth/userStore';
import { createOrRefreshOtp, verifyOtp } from './auth/otpStore';
import { isSmsTestMode, sendOtpSms } from './auth/smsProvider';
import { normalizeIsraeliPhone } from './auth/phone';
import { readHttpBody } from './httpBody';

dotenv.config({ override: true });

const MAX_BODY = 64 * 1024;


export async function authApiMiddleware(
  req: import('http').IncomingMessage & { url?: string },
  res: import('http').ServerResponse,
  next: (err?: unknown) => void
) {
        const url = req.url || '';
        if (!url.startsWith('/api/auth') && !url.startsWith('/api/users')) {
          return next();
        }

        if (req.method === 'OPTIONS') {
          sendJson(res as ServerResponse, 204, {});
          return;
        }

        try {
          // POST /api/auth/google
          if (
            req.method === 'POST' &&
            (url === '/api/auth/google' || url.startsWith('/api/auth/google?'))
          ) {
            const raw = await readHttpBody(req as IncomingMessage);
            const body = JSON.parse(raw || '{}');
            const idToken = body.idToken as string | undefined;
            if (!idToken) {
              sendJson(res as ServerResponse, 400, { error: 'missing_id_token' });
              return;
            }

            let googleProfile;
            try {
              googleProfile = await verifyGoogleIdToken(idToken);
            } catch (err) {
              console.error('[auth] google verify failed', err);
              sendJson(res as ServerResponse, 401, {
                error: 'invalid_google_token',
                message: 'אימות גוגל נכשל',
              });
              return;
            }

            if (!googleProfile.emailVerified) {
              sendJson(res as ServerResponse, 403, {
                error: 'email_not_verified',
                message: 'כתובת האימייל בגוגל אינה מאומתת',
              });
              return;
            }

            const user = upsertGoogleUser({
              googleSub: googleProfile.sub,
              email: googleProfile.email,
              name: googleProfile.name,
              picture: googleProfile.picture,
            });
            if (!user) {
              sendJson(res as ServerResponse, 403, {
                error: 'not_registered',
                message:
                  'המשתמש אינו רשום במערכת. פנה למנהל המערכת להוספה בדף משתמשים והרשאות.',
              });
              return;
            }
            const token = await signAuthToken(user);
            sendJson(res as ServerResponse, 200, {
              token,
              user: toPublicUser(user),
            });
            return;
          }

          // POST /api/auth/sms/request — שליחת OTP למנהל
          if (
            req.method === 'POST' &&
            (url === '/api/auth/sms/request' || url.startsWith('/api/auth/sms/request?'))
          ) {
            const raw = await readHttpBody(req as IncomingMessage);
            const body = JSON.parse(raw || '{}');
            const phone = normalizeIsraeliPhone(String(body.phone || ''));
            if (!phone) {
              sendJson(res as ServerResponse, 400, {
                error: 'invalid_phone',
                message: 'מספר טלפון לא תקין',
              });
              return;
            }

            if (!(await canRequestManagerOtp(phone))) {
              sendJson(res as ServerResponse, 403, {
                error: 'not_registered',
                message:
                  'מספר זה אינו רשום כמשתמש מערכת. פנה למנהל להוספה בדף משתמשים והרשאות. לתיק אישי השתמש בקישור שנשלח אליך.',
              });
              return;
            }

            const otp = await createOrRefreshOtp({ phone, purpose: 'manager_login' });
            if ('error' in otp) {
              if (otp.error === 'cooldown') {
                sendJson(res as ServerResponse, 429, {
                  error: 'cooldown',
                  message: 'יש להמתין לפני שליחה חוזרת',
                  cooldownMs: otp.cooldownMs,
                });
                return;
              }
              sendJson(res as ServerResponse, 400, {
                error: otp.error,
                message: 'מספר טלפון לא תקין',
              });
              return;
            }

            const sms = await sendOtpSms(phone, otp.code, process.env.SMS_BRAND_NAME || 'ChainSign');
            if (!sms.ok) {
              // גם בכשל ספק — במצב בדיקה נמשיך ונציג קוד
              if (!isSmsTestMode()) {
                sendJson(res as ServerResponse, 502, {
                  error: 'sms_failed',
                  message: sms.message,
                });
                return;
              }
            }

            const exposeCode = isSmsTestMode() || sms.testMode === true;
            sendJson(res as ServerResponse, 200, {
              ok: true,
              phone,
              expiresInSec: 300,
              testMode: exposeCode,
              testCode: exposeCode ? otp.code : undefined,
              message: exposeCode
                ? 'מצב בדיקה: הקוד מוצג במסך (SMS אמיתי לא נשלח)'
                : 'הקוד נשלח ב־SMS',
            });
            return;
          }

          // POST /api/auth/sms/verify — אימות OTP והנפקת JWT
          if (
            req.method === 'POST' &&
            (url === '/api/auth/sms/verify' || url.startsWith('/api/auth/sms/verify?'))
          ) {
            const raw = await readHttpBody(req as IncomingMessage);
            const body = JSON.parse(raw || '{}');
            const phone = normalizeIsraeliPhone(String(body.phone || ''));
            const code = String(body.code || '').trim();
            if (!phone || !code) {
              sendJson(res as ServerResponse, 400, {
                error: 'missing_fields',
                message: 'נא להזין טלפון וקוד',
              });
              return;
            }

            const result = await verifyOtp({ phone, purpose: 'manager_login', code });
            if (result.ok === false) {
              const messages: Record<string, string> = {
                invalid_code: 'קוד שגוי',
                expired: 'הקוד פג תוקף — בקש קוד חדש',
                too_many_attempts: 'יותר מדי ניסיונות — בקש קוד חדש',
                not_found: 'לא נמצא קוד פעיל — שלח קוד מחדש',
                invalid_phone: 'מספר טלפון לא תקין',
              };
              sendJson(res as ServerResponse, 401, {
                error: result.error,
                message: messages[result.error] || 'אימות נכשל',
              });
              return;
            }

            const user = await upsertSmsUser({ phone: result.phone });
            if (!user) {
              sendJson(res as ServerResponse, 403, {
                error: 'not_registered',
                message:
                  'המשתמש אינו רשום במערכת. פנה למנהל המערכת להוספה בדף משתמשים והרשאות.',
              });
              return;
            }

            const wantFirebase =
              body.firebase === true ||
              process.env.USE_FIREBASE_AUTH === 'true' ||
              process.env.VITE_USE_FIREBASE_AUTH === 'true' ||
              process.env.VITE_USE_FIREBASE === 'true';

            if (wantFirebase) {
              try {
                const {
                  createManagerCustomToken,
                  getClubIdServer,
                  isFirebaseAdminReady,
                  isSyntheticSmsEmail,
                  resolveManagerFirebaseUser,
                  writeCanonicalClubUser,
                } = await import('./auth/firebaseAdmin');
                if (!isFirebaseAdminReady()) {
                  sendJson(res as ServerResponse, 503, {
                    error: 'firebase_admin_not_configured',
                    message:
                      'Firebase Admin לא מוגדר. הוסף SERVICE_ACCOUNT_JSON או הפעל Emulators.',
                  });
                  return;
                }
                const phone = user.phone || result.phone;
                const fbUser = await resolveManagerFirebaseUser({
                  phone,
                  email: user.email,
                  name: user.name,
                  picture: user.picture,
                });
                const profileEmail =
                  user.email && !isSyntheticSmsEmail(user.email)
                    ? user.email
                    : fbUser.email || `${phone}@sms.local`;
                await writeCanonicalClubUser({
                  uid: fbUser.uid,
                  email: profileEmail,
                  name: user.name,
                  role: user.role,
                  phone,
                  picture: user.picture || null,
                  createdAt: user.createdAt,
                });
                const customToken = await createManagerCustomToken(fbUser.uid, {
                  role: user.role,
                  clubId: getClubIdServer(),
                  phone,
                });
                sendJson(res as ServerResponse, 200, {
                  customToken,
                  token: customToken,
                  user: toPublicUser({
                    ...user,
                    id: fbUser.uid,
                    email: profileEmail,
                    phone,
                  }),
                });
                return;
              } catch (err) {
                console.error('[auth] firebase sms token failed', err);
                sendJson(res as ServerResponse, 500, {
                  error: 'firebase_token_failed',
                  message: 'יצירת Firebase token נכשלה',
                });
                return;
              }
            }

            const token = await signAuthToken(user);
            sendJson(res as ServerResponse, 200, {
              token,
              user: toPublicUser(user),
            });
            return;
          }

          // POST /api/auth/firebase/google — Google → Firebase custom token
          if (
            req.method === 'POST' &&
            (url === '/api/auth/firebase/google' ||
              url.startsWith('/api/auth/firebase/google?'))
          ) {
            const raw = await readHttpBody(req as IncomingMessage);
            const body = JSON.parse(raw || '{}');
            const idToken = body.idToken as string | undefined;
            if (!idToken) {
              sendJson(res as ServerResponse, 400, { error: 'missing_id_token' });
              return;
            }

            let googleProfile;
            try {
              googleProfile = await verifyGoogleIdToken(idToken);
            } catch (err) {
              console.error('[auth] google verify failed', err);
              sendJson(res as ServerResponse, 401, {
                error: 'invalid_google_token',
                message: 'אימות גוגל נכשל',
              });
              return;
            }

            if (!googleProfile.emailVerified) {
              sendJson(res as ServerResponse, 403, {
                error: 'email_not_verified',
                message: 'כתובת האימייל בגוגל אינה מאומתת',
              });
              return;
            }

            const user = await resolveGoogleManager({
              googleSub: googleProfile.sub,
              email: googleProfile.email,
              name: googleProfile.name,
              picture: googleProfile.picture,
            });
            if (!user) {
              sendJson(res as ServerResponse, 403, {
                error: 'not_registered',
                message:
                  'המשתמש אינו רשום במערכת. פנה למנהל המערכת להוספה בדף משתמשים והרשאות.',
              });
              return;
            }

            try {
              const {
                createManagerCustomToken,
                getClubIdServer,
                isFirebaseAdminReady,
                resolveManagerFirebaseUser,
                writeCanonicalClubUser,
              } = await import('./auth/firebaseAdmin');
              if (!isFirebaseAdminReady()) {
                sendJson(res as ServerResponse, 503, {
                  error: 'firebase_admin_not_configured',
                  message:
                    'Firebase Admin לא מוגדר. הוסף SERVICE_ACCOUNT_JSON או הפעל Emulators.',
                });
                return;
              }
              const fbUser = await resolveManagerFirebaseUser({
                email: user.email,
                phone: user.phone,
                name: user.name,
                picture: user.picture,
              });
              await writeCanonicalClubUser({
                uid: fbUser.uid,
                email: user.email,
                name: user.name,
                role: user.role,
                phone: user.phone || null,
                picture: user.picture || null,
                createdAt: user.createdAt,
              });
              // Custom token — works with any Google OAuth client (no Firebase IdP audience check)
              const customToken = await createManagerCustomToken(fbUser.uid, {
                role: user.role,
                clubId: getClubIdServer(),
                phone: user.phone,
              });
              sendJson(res as ServerResponse, 200, {
                customToken,
                user: toPublicUser({ ...user, id: fbUser.uid }),
              });
            } catch (err) {
              console.error('[auth] firebase google token failed', err);
              const detail = err instanceof Error ? err.message : String(err);
              sendJson(res as ServerResponse, 500, {
                error: 'firebase_token_failed',
                message: 'יצירת Firebase token נכשלה',
                detail,
              });
            }
            return;
          }

          // GET /api/auth/me
          if (
            req.method === 'GET' &&
            (url === '/api/auth/me' || url.startsWith('/api/auth/me?'))
          ) {
            const user = await requireAuth(req as IncomingMessage, res as ServerResponse);
            if (!user) return;
            sendJson(res as ServerResponse, 200, { user: toPublicUser(user) });
            return;
          }

          // POST /api/auth/logout
          if (
            req.method === 'POST' &&
            (url === '/api/auth/logout' || url.startsWith('/api/auth/logout?'))
          ) {
            sendJson(res as ServerResponse, 200, { ok: true });
            return;
          }

          // GET /api/users
          if (
            req.method === 'GET' &&
            (url === '/api/users' || url.startsWith('/api/users?'))
          ) {
            const user = await requireAuth(req as IncomingMessage, res as ServerResponse);
            if (!user) return;
            sendJson(res as ServerResponse, 200, {
              users: listUsers().map(toPublicUser),
            });
            return;
          }

          // POST /api/users — הוספת משתמש ידנית (SYSTEM_ADMIN בלבד)
          if (
            req.method === 'POST' &&
            (url === '/api/users' || url.startsWith('/api/users?'))
          ) {
            const actor = await requireAuth(req as IncomingMessage, res as ServerResponse);
            if (!actor) return;
            if (!canCreateUsers(actor)) {
              sendJson(res as ServerResponse, 403, {
                error: 'forbidden',
                message: 'רק מנהל מערכת יכול להוסיף משתמשים',
              });
              return;
            }

            const raw = await readHttpBody(req as IncomingMessage);
            const body = JSON.parse(raw || '{}');
            const name = String(body.name || '').trim();
            const email = String(body.email || '').trim();
            const phoneRaw = String(body.phone || '').trim();
            let role = (body.role as SystemRole) || 'MANAGER';

            if (!name) {
              sendJson(res as ServerResponse, 400, {
                error: 'missing_name',
                message: 'נא להזין שם',
              });
              return;
            }
            if (!email && !phoneRaw) {
              sendJson(res as ServerResponse, 400, {
                error: 'missing_contact',
                message: 'נא להזין אימייל או טלפון',
              });
              return;
            }

            let phone: string | undefined;
            if (phoneRaw) {
              const normalized = normalizeIsraeliPhone(phoneRaw);
              if (!normalized) {
                sendJson(res as ServerResponse, 400, {
                  error: 'invalid_phone',
                  message: 'מספר טלפון לא תקין',
                });
                return;
              }
              phone = normalized;
            }

            if (role === 'SYSTEM_ADMIN' && actor.role !== 'SYSTEM_ADMIN') {
              sendJson(res as ServerResponse, 403, {
                error: 'forbidden',
                message: 'רק מנהל מערכת יכול ליצור מנהל מערכת',
              });
              return;
            }
            if (role !== 'SYSTEM_ADMIN' && role !== 'MANAGER') {
              role = 'MANAGER';
            }

            try {
              const created = createManualUser({
                name,
                email: email || undefined,
                phone,
                role,
              });
              sendJson(res as ServerResponse, 201, { user: toPublicUser(created) });
            } catch (err) {
              const code = err instanceof Error ? err.message : 'create_failed';
              const messages: Record<string, string> = {
                email_exists: 'כבר קיים משתמש עם אימייל זה',
                phone_exists: 'כבר קיים משתמש עם טלפון זה',
                missing_name: 'נא להזין שם',
                missing_contact: 'נא להזין אימייל או טלפון',
              };
              sendJson(res as ServerResponse, 409, {
                error: code,
                message: messages[code] || 'יצירת משתמש נכשלה',
              });
            }
            return;
          }

          // PATCH /api/users/:id/role
          const roleMatch = url.match(/^\/api\/users\/([^/?]+)\/role\/?/);
          if (req.method === 'PATCH' && roleMatch) {
            const actor = await requireRole(
              req as IncomingMessage,
              res as ServerResponse,
              'SYSTEM_ADMIN'
            );
            if (!actor) return;

            const targetId = decodeURIComponent(roleMatch[1]);
            const raw = await readHttpBody(req as IncomingMessage);
            const body = JSON.parse(raw || '{}');
            const role = body.role as SystemRole;
            if (role !== 'SYSTEM_ADMIN' && role !== 'MANAGER') {
              sendJson(res as ServerResponse, 400, { error: 'invalid_role' });
              return;
            }
            if (actor.id === targetId && role !== 'SYSTEM_ADMIN') {
              sendJson(res as ServerResponse, 400, {
                error: 'cannot_demote_self',
                message: 'לא ניתן להסיר מעצמך את תפקיד מנהל המערכת',
              });
              return;
            }

            const updated = updateUserRole(targetId, role);
            if (!updated) {
              sendJson(res as ServerResponse, 404, { error: 'not_found' });
              return;
            }
            sendJson(res as ServerResponse, 200, { user: toPublicUser(updated) });
            return;
          }

          // DELETE /api/users/:id
          const deleteMatch = url.match(/^\/api\/users\/([^/?]+)\/?$/);
          if (req.method === 'DELETE' && deleteMatch && !url.includes('/role')) {
            const actor = await requireAuth(req as IncomingMessage, res as ServerResponse);
            if (!actor) return;

            const targetId = decodeURIComponent(deleteMatch[1]);
            const target = getUserById(targetId);
            if (!target) {
              sendJson(res as ServerResponse, 404, { error: 'not_found' });
              return;
            }
            if (!canDeleteUser(actor, target)) {
              sendJson(res as ServerResponse, 403, {
                error: 'forbidden',
                message:
                  actor.id === target.id
                    ? 'לא ניתן למחוק את עצמך'
                    : 'רק מנהל מערכת יכול למחוק משתמשים',
              });
              return;
            }
            if (target.role === 'SYSTEM_ADMIN' && countSystemAdmins() <= 1) {
              sendJson(res as ServerResponse, 400, {
                error: 'last_admin',
                message: 'לא ניתן למחוק את מנהל המערכת האחרון',
              });
              return;
            }
            deleteUser(targetId);
            sendJson(res as ServerResponse, 200, { ok: true });
            return;
          }

          sendJson(res as ServerResponse, 404, { error: 'not_found' });
        } catch (err) {
          console.error('[auth-api]', err);
          sendJson(res as ServerResponse, 500, { error: 'server_error' });
        }
      }

export function authApiPlugin(): Plugin {
  return {
    name: 'auth-api',
    configureServer(server) {
      server.middlewares.use(authApiMiddleware);
    },
  };
}

/** ייצוא לשימוש בפלאגינים אחרים */
export { getBearerUser } from './auth/jwt';
export { requireAuth, sendJson } from './auth/rbac';
