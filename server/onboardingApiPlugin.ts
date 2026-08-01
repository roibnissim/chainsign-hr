import type { IncomingMessage, ServerResponse } from 'http';
import type { Plugin } from 'vite';
import { getBearerUser } from './auth/jwt';
import { getOnboardPortalAuth, signOnboardPortalToken } from './auth/jwt';
import { sendJson as authSendJson } from './auth/rbac';
import { createOrRefreshOtp, verifyOtp } from './auth/otpStore';
import { isSmsTestMode, sendOtpSms } from './auth/smsProvider';
import { maskPhone, normalizeIsraeliPhone } from './auth/phone';
import { isFirebaseAdminReady } from './auth/firebaseAdmin';
import {
  adminPersistFileDocument,
  adminUpsertEmployeeFromPortal,
  adminWriteActivityEvent,
  buildAdminDocumentActivityEvent,
  buildAdminProfileActivityEvent,
} from './hrAdminWrite';
import { resolveClubBrandingForPortal } from './clubBranding';
import { getEmployeePortalBlockReason } from './employeeAccess';
import {
  findOpenInviteByEmployeeId,
  getInvite,
  mapInvites,
  saveInvite,
} from './portalTokenStore';
import type {
  OnboardingAgreementView,
  OnboardingDocCategory,
  OnboardingDocument,
  OnboardingInviteRecord,
  OnboardingProfile,
} from './portalTypes';
import { readHttpBody } from './httpBody';

export type {
  OnboardingAgreementView,
  OnboardingDocCategory,
  OnboardingDocument,
  OnboardingInviteRecord,
  OnboardingProfile,
};

const MAX_BODY = 8 * 1024 * 1024;
const ALLOWED_DOC_CATEGORIES: OnboardingDocCategory[] = [
  'recruitment',
  'tax',
  'absences',
  'pension',
];


function formatDocDatePart(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDate || '').trim());
  if (!m) return String(isoDate || '');
  return `${m[3]}-${m[2]}-${m[1].slice(-2)}`;
}

function buildAutoDocumentTitle(
  docType: string,
  issuedAt: string,
  existingTitles: string[]
): string {
  const base = `${String(docType).trim()} ${formatDocDatePart(issuedAt)}`;
  const related = existingTitles.filter((t) => t === base || t.startsWith(`${base} -`));
  if (related.length === 0) return base;
  return `${base} -${related.length}`;
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.end(JSON.stringify(data));
}

function randomToken() {
  return `ob_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function publicView(record: OnboardingInviteRecord) {
  const branding = await resolveClubBrandingForPortal(record.branding || null);
  return {
    token: record.token,
    employeeId: record.employeeId,
    employeeName: record.employeeName,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    profileLocked: record.profileLocked,
    profileLockedAt: record.profileLockedAt,
    profile: record.profile,
    branding,
    documents: record.documents.map((d) => ({
      id: d.id,
      category: d.category,
      title: d.title,
      docType: d.docType,
      issuedAt: d.issuedAt,
      notes: d.notes,
      fileName: d.fileName,
      createdAt: d.createdAt,
      hasFile: Boolean(d.fileDataUrl),
      fileDataUrl: d.fileDataUrl,
    })),
    signedAgreements: record.signedAgreements,
  };
}

async function rejectIfEmployeeInactive(
  res: ServerResponse,
  employeeId: string
): Promise<boolean> {
  const reason = await getEmployeePortalBlockReason(employeeId);
  if (reason === 'employee_inactive') {
    sendJson(res, 403, {
      error: 'employee_inactive',
      message: 'העובד אינו פעיל במערכת — הקישור אינו זמין',
    });
    return true;
  }
  return false;
}

export async function onboardingApiMiddleware(
  req: import('http').IncomingMessage & { url?: string },
  res: import('http').ServerResponse,
  next: (err?: unknown) => void
) {
        const url = req.url || '';
        if (!url.startsWith('/api/onboarding-invites')) return next();

        if (req.method === 'OPTIONS') {
          sendJson(res, 204, {});
          return;
        }

        try {
          // POST /api/onboarding-invites — create / refresh invite (managers only)
          if (
            req.method === 'POST' &&
            (url === '/api/onboarding-invites' || url.startsWith('/api/onboarding-invites?'))
          ) {
            const actor = await getBearerUser(req);
            if (!actor) {
              authSendJson(res, 401, { error: 'unauthorized', message: 'נדרשת התחברות' });
              return;
            }

            const raw = await readHttpBody(req);
            const body = JSON.parse(raw || '{}');
            if (!body.employeeId || !body.profile?.name) {
              sendJson(res, 400, { error: 'missing_fields' });
              return;
            }

            const existing = await findOpenInviteByEmployeeId(body.employeeId);

            const now = new Date();
            const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

            if (existing) {
              existing.expiresAt = expires.toISOString();
              existing.signedAgreements = body.signedAgreements || existing.signedAgreements;
              if (!existing.profileLocked && body.profile) {
                existing.profile = { ...existing.profile, ...body.profile };
              }
              existing.employeeName = body.employeeName || existing.employeeName;
              if (body.branding) {
                existing.branding = body.branding;
              }
              await saveInvite(existing);
              sendJson(res, 200, {
                token: existing.token,
                expiresAt: existing.expiresAt,
                onboardPath: `/?onboard=${existing.token}`,
                reused: true,
              });
              return;
            }

            const token = randomToken();
            const record: OnboardingInviteRecord = {
              token,
              employeeId: body.employeeId,
              employeeName: body.employeeName || body.profile.name,
              createdAt: now.toISOString(),
              expiresAt: expires.toISOString(),
              profileLocked: Boolean(body.profileLocked),
              profileLockedAt: body.profileLockedAt,
              profile: body.profile,
              documents: body.documents || [],
              signedAgreements: body.signedAgreements || [],
              needsSync: false,
              branding: body.branding || undefined,
            };
            await saveInvite(record);
            sendJson(res, 201, {
              token,
              expiresAt: record.expiresAt,
              onboardPath: `/?onboard=${token}`,
              reused: false,
            });
            return;
          }

          // GET או POST /api/onboarding-invites/pending-sync
          // Deprecated: הפורטל כותב ישירות ל-Firestore — אין יותר תור ייבוא
          if (
            (req.method === 'GET' || req.method === 'POST') &&
            url.startsWith('/api/onboarding-invites/pending-sync')
          ) {
            const actor = await getBearerUser(req);
            if (!actor) {
              authSendJson(res, 401, { error: 'unauthorized', message: 'נדרשת התחברות' });
              return;
            }
            // גוף POST נזרק אם קיים — תאימות לאחור בלבד
            if (req.method === 'POST') {
              try {
                await readHttpBody(req);
              } catch {
                // ignore
              }
            }
            sendJson(res, 200, { items: [] });
            return;
          }

          // POST /api/onboarding-invites/remove-documents — מנהל מוחק מסמך → נמחק גם מפורטל העובד
          if (
            req.method === 'POST' &&
            (url === '/api/onboarding-invites/remove-documents' ||
              url.startsWith('/api/onboarding-invites/remove-documents?'))
          ) {
            const actor = await getBearerUser(req);
            if (!actor) {
              authSendJson(res, 401, { error: 'unauthorized', message: 'נדרשת התחברות' });
              return;
            }
            const raw = await readHttpBody(req);
            const body = JSON.parse(raw || '{}');
            const documentIds: string[] = Array.isArray(body.documentIds)
              ? body.documentIds.filter((id: unknown): id is string => typeof id === 'string')
              : typeof body.documentId === 'string'
                ? [body.documentId]
                : [];
            if (!documentIds.length) {
              sendJson(res, 400, { error: 'missing_document_ids' });
              return;
            }
            const idSet = new Set(documentIds);
            let removed = 0;
            await mapInvites((record) => {
              const before = record.documents.length;
              const documents = record.documents.filter((d) => !idSet.has(d.id));
              const delta = before - documents.length;
              if (delta === 0) return null;
              removed += delta;
              return {
                ...record,
                documents,
                needsSync: documents.some((d) => !d.synced),
              };
            });
            sendJson(res, 200, { ok: true, removed });
            return;
          }

          // POST /api/onboarding-invites/:token/synced
          const syncedMatch = url.match(/^\/api\/onboarding-invites\/([^/?]+)\/synced/);
          if (req.method === 'POST' && syncedMatch) {
            const actor = await getBearerUser(req);
            if (!actor) {
              authSendJson(res, 401, { error: 'unauthorized', message: 'נדרשת התחברות' });
              return;
            }
            const token = decodeURIComponent(syncedMatch[1]);
            const record = await getInvite(token);
            if (!record) {
              sendJson(res, 404, { error: 'not_found' });
              return;
            }
            const raw = await readHttpBody(req);
            const body = JSON.parse(raw || '{}');
            const syncedIds: string[] = body.documentIds || [];
            const profileSynced = body.profileSynced === true;
            record.documents = record.documents.map((d) =>
              syncedIds.includes(d.id)
                ? { ...d, synced: true, fileDataUrl: d.fileDataUrl?.startsWith('http') ? d.fileDataUrl : undefined }
                : d
            );
            const hasUnsyncedDocs = record.documents.some((d) => !d.synced);
            record.needsSync = hasUnsyncedDocs;
            if (profileSynced && !hasUnsyncedDocs) {
              record.needsSync = false;
            }
            record.lastSyncedAt = new Date().toISOString();
            await saveInvite(record);
            sendJson(res, 200, { ok: true });
            return;
          }

          // GET /api/onboarding-invites/:token
          const getMatch = url.match(/^\/api\/onboarding-invites\/([^/?]+)/);
          if (
            req.method === 'GET' &&
            getMatch &&
            !url.includes('pending-sync') &&
            !url.includes('/profile') &&
            !url.includes('/documents') &&
            !url.includes('/otp')
          ) {
            const token = decodeURIComponent(getMatch[1]);
            const record = await getInvite(token);
            if (!record) {
              sendJson(res, 404, { error: 'not_found' });
              return;
            }
            if (new Date(record.expiresAt) < new Date()) {
              sendJson(res, 410, { error: 'expired' });
              return;
            }
            if (await rejectIfEmployeeInactive(res, record.employeeId)) return;

            const portal = await getOnboardPortalAuth(req, token);
            const phone = normalizeIsraeliPhone(record.profile.phone || '');
            if (!portal) {
              sendJson(res, 200, {
                requiresOtp: true,
                token: record.token,
                employeeName: record.employeeName,
                phoneMasked: phone ? maskPhone(phone) : null,
                hasPhone: Boolean(phone),
                expiresAt: record.expiresAt,
                branding: await resolveClubBrandingForPortal(record.branding || null),
              });
              return;
            }

            sendJson(res, 200, { ...(await publicView(record)), requiresOtp: false });
            return;
          }

          // POST /api/onboarding-invites/:token/otp/request
          const otpReqMatch = url.match(/^\/api\/onboarding-invites\/([^/?]+)\/otp\/request/);
          if (req.method === 'POST' && otpReqMatch) {
            const token = decodeURIComponent(otpReqMatch[1]);
            const record = await getInvite(token);
            if (!record) {
              sendJson(res, 404, { error: 'not_found' });
              return;
            }
            if (new Date(record.expiresAt) < new Date()) {
              sendJson(res, 410, { error: 'expired' });
              return;
            }
            if (await rejectIfEmployeeInactive(res, record.employeeId)) return;
            const phone = normalizeIsraeliPhone(record.profile.phone || '');
            if (!phone) {
              sendJson(res, 400, {
                error: 'no_phone',
                message: 'לא הוגדר טלפון להזמנה — פנה למנהל',
              });
              return;
            }

            const otp = createOrRefreshOtp({
              phone,
              purpose: 'employee_onboard',
              ref: token,
            });
            if ('error' in otp) {
              if (otp.error === 'cooldown') {
                sendJson(res, 429, {
                  error: 'cooldown',
                  message: 'יש להמתין לפני שליחה חוזרת',
                  cooldownMs: otp.cooldownMs,
                });
                return;
              }
              sendJson(res, 400, { error: otp.error });
              return;
            }

            const club =
              record.branding?.clubName || process.env.SMS_BRAND_NAME || 'ChainSign';
            const sms = await sendOtpSms(phone, otp.code, club);
            if (!sms.ok && !isSmsTestMode()) {
              sendJson(res, 502, { error: 'sms_failed', message: sms.message });
              return;
            }
            const exposeCode = isSmsTestMode() || sms.testMode === true;
            sendJson(res, 200, {
              ok: true,
              phoneMasked: maskPhone(phone),
              expiresInSec: 300,
              testMode: exposeCode,
              testCode: exposeCode ? otp.code : undefined,
              message: exposeCode
                ? 'מצב בדיקה: הקוד מוצג במסך (SMS אמיתי לא נשלח)'
                : 'הקוד נשלח ב־SMS',
            });
            return;
          }

          // POST /api/onboarding-invites/:token/otp/verify
          const otpVerifyMatch = url.match(/^\/api\/onboarding-invites\/([^/?]+)\/otp\/verify/);
          if (req.method === 'POST' && otpVerifyMatch) {
            const token = decodeURIComponent(otpVerifyMatch[1]);
            const record = await getInvite(token);
            if (!record) {
              sendJson(res, 404, { error: 'not_found' });
              return;
            }
            if (await rejectIfEmployeeInactive(res, record.employeeId)) return;
            const phone = normalizeIsraeliPhone(record.profile.phone || '');
            if (!phone) {
              sendJson(res, 400, { error: 'no_phone', message: 'לא הוגדר טלפון להזמנה' });
              return;
            }
            const raw = await readHttpBody(req);
            const body = JSON.parse(raw || '{}');
            const code = String(body.code || '').trim();
            const result = verifyOtp({
              phone,
              purpose: 'employee_onboard',
              code,
              ref: token,
            });
            if (result.ok === false) {
              sendJson(res, 401, {
                error: result.error,
                message: 'קוד שגוי או פג תוקף',
              });
              return;
            }
            const portalToken = await signOnboardPortalToken(token, result.phone);
            sendJson(res, 200, {
              portalToken,
              invite: { ...(await publicView(record)), requiresOtp: false },
            });
            return;
          }

          // PUT /api/onboarding-invites/:token/profile — first save locks
          const profileMatch = url.match(/^\/api\/onboarding-invites\/([^/?]+)\/profile/);
          if (req.method === 'PUT' && profileMatch) {
            const token = decodeURIComponent(profileMatch[1]);
            const portal = await getOnboardPortalAuth(req, token);
            if (!portal) {
              authSendJson(res, 401, {
                error: 'unauthorized',
                message: 'נדרש אימות SMS לפני עדכון הפרטים',
              });
              return;
            }
            const record = await getInvite(token);
            if (!record) {
              sendJson(res, 404, { error: 'not_found' });
              return;
            }
            if (await rejectIfEmployeeInactive(res, record.employeeId)) return;
            if (new Date(record.expiresAt) < new Date()) {
              sendJson(res, 410, { error: 'expired' });
              return;
            }
            if (record.profileLocked) {
              sendJson(res, 403, { error: 'profile_locked' });
              return;
            }

            const raw = await readHttpBody(req);
            const body = JSON.parse(raw || '{}');
            const bank = body.bankAccount || {};
            const missing =
              !body.name?.trim() ||
              !body.idNumber?.trim() ||
              !body.email?.trim() ||
              !body.phone?.trim() ||
              !body.address?.trim() ||
              !body.avatarUrl ||
              !body.idCardPhotoUrl ||
              !bank.bankName?.trim() ||
              !bank.branchNumber?.trim() ||
              !bank.accountNumber?.trim() ||
              !bank.accountHolderName?.trim();
            if (missing) {
              sendJson(res, 400, { error: 'missing_fields' });
              return;
            }

            record.profile = {
              name: String(body.name).trim(),
              idNumber: String(body.idNumber).trim(),
              phone: String(body.phone).trim(),
              address: String(body.address).trim(),
              email: String(body.email).trim(),
              bankAccount: {
                bankName: String(bank.bankName).trim(),
                branchNumber: String(bank.branchNumber).trim(),
                accountNumber: String(bank.accountNumber).trim(),
                accountHolderName: String(bank.accountHolderName).trim(),
              },
              avatarUrl: body.avatarUrl || record.profile.avatarUrl,
              idCardPhotoUrl: body.idCardPhotoUrl,
            };
            record.employeeName = record.profile.name;
            record.profileLocked = true;
            record.profileLockedAt = new Date().toISOString();

            if (!isFirebaseAdminReady()) {
              sendJson(res, 503, {
                error: 'firebase_admin_unavailable',
                message: 'Firebase Admin לא מוגדר — לא ניתן לשמור ל-Firestore',
              });
              return;
            }
            try {
              const saved = await adminUpsertEmployeeFromPortal({
                id: record.employeeId,
                name: record.profile.name,
                idNumber: record.profile.idNumber,
                email: record.profile.email,
                phone: record.profile.phone,
                address: record.profile.address,
                bankAccount: record.profile.bankAccount,
                avatarUrl: record.profile.avatarUrl,
                idCardPhotoUrl: record.profile.idCardPhotoUrl,
                profileLockedAt: record.profileLockedAt,
              });
              // שומרים ב-.data רק URL קצרים (לא data URL)
              if (typeof saved.avatarUrl === 'string') {
                record.profile.avatarUrl = saved.avatarUrl;
              }
              if (typeof saved.idCardPhotoUrl === 'string') {
                record.profile.idCardPhotoUrl = saved.idCardPhotoUrl;
              }
              await adminWriteActivityEvent(
                buildAdminProfileActivityEvent({
                  employeeId: record.employeeId,
                  employeeName: record.profile.name,
                  employeeIdNumber: record.profile.idNumber,
                  createdAt: record.profileLockedAt,
                })
              );
              record.needsSync = false;
            } catch (err) {
              console.error('[onboarding] profile firestore write failed', err);
              sendJson(res, 500, {
                error: 'firestore_write_failed',
                message: err instanceof Error ? err.message : 'unknown',
              });
              return;
            }

            await saveInvite(record);
            sendJson(res, 200, { ...(await publicView(record)), requiresOtp: false });
            return;
          }

          // POST /api/onboarding-invites/:token/documents — always allowed (locked or not)
          const docsMatch = url.match(/^\/api\/onboarding-invites\/([^/?]+)\/documents/);
          if (req.method === 'POST' && docsMatch) {
            const token = decodeURIComponent(docsMatch[1]);
            const portal = await getOnboardPortalAuth(req, token);
            if (!portal) {
              authSendJson(res, 401, {
                error: 'unauthorized',
                message: 'נדרש אימות SMS לפני העלאת מסמכים',
              });
              return;
            }
            const record = await getInvite(token);
            if (!record) {
              sendJson(res, 404, { error: 'not_found' });
              return;
            }
            if (await rejectIfEmployeeInactive(res, record.employeeId)) return;
            if (new Date(record.expiresAt) < new Date()) {
              sendJson(res, 410, { error: 'expired' });
              return;
            }

            const raw = await readHttpBody(req);
            const body = JSON.parse(raw || '{}');
            if (!ALLOWED_DOC_CATEGORIES.includes(body.category)) {
              sendJson(res, 400, { error: 'invalid_category' });
              return;
            }
            if (!body.docType?.trim()) {
              sendJson(res, 400, { error: 'missing_fields' });
              return;
            }

            const issuedAt = body.issuedAt || new Date().toISOString().split('T')[0];
            const docType = String(body.docType).trim();
            const existingTitles = record.documents
              .filter((d) => d.category === body.category)
              .map((d) => d.title);
            const title =
              body.title?.trim() ||
              buildAutoDocumentTitle(docType, issuedAt, existingTitles);

            const doc: OnboardingDocument = {
              id: `obdoc-${Date.now()}`,
              category: body.category,
              title,
              docType,
              issuedAt,
              notes: body.notes ? String(body.notes).trim() : undefined,
              fileName: body.fileName,
              fileDataUrl: body.fileDataUrl,
              createdAt: new Date().toISOString(),
              synced: false,
            };

            if (!isFirebaseAdminReady()) {
              sendJson(res, 503, {
                error: 'firebase_admin_unavailable',
                message: 'Firebase Admin לא מוגדר — לא ניתן לשמור ל-Firestore',
              });
              return;
            }
            try {
              const persisted = await adminPersistFileDocument({
                id: doc.id,
                employeeId: record.employeeId,
                category: doc.category,
                title: doc.title,
                docType: doc.docType,
                issuedAt: doc.issuedAt,
                notes: doc.notes,
                fileName: doc.fileName,
                fileDataUrl: doc.fileDataUrl,
                createdAt: doc.createdAt,
              });
              doc.fileDataUrl = persisted.fileDataUrl;
              doc.synced = true;
              await adminWriteActivityEvent(
                buildAdminDocumentActivityEvent({
                  employeeId: record.employeeId,
                  employeeName: record.profile.name || record.employeeName,
                  employeeIdNumber: record.profile.idNumber || '',
                  category: doc.category,
                  documentId: doc.id,
                  documentTitle: doc.title,
                  docType: doc.docType,
                  createdAt: doc.createdAt,
                })
              );
            } catch (err) {
              console.error('[onboarding] document firestore write failed', err);
              sendJson(res, 500, {
                error: 'firestore_write_failed',
                message: err instanceof Error ? err.message : 'unknown',
              });
              return;
            }

            record.documents = [doc, ...record.documents];
            record.needsSync = false;
            await saveInvite(record);
            sendJson(res, 201, { document: doc, invite: await publicView(record) });
            return;
          }

          sendJson(res, 404, { error: 'not_found' });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'error';
          if (msg === 'payload_too_large') {
            sendJson(res, 413, { error: 'payload_too_large' });
            return;
          }
          console.error('[onboarding-api]', err);
          sendJson(res, 500, { error: 'server_error' });
        }
      }

export function onboardingApiPlugin(): Plugin {
  return {
    name: 'employee-onboarding-api',
    configureServer(server) {
      server.middlewares.use(onboardingApiMiddleware);
    },
  };
}
