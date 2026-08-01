import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';
import { getBearerUser } from './auth/jwt';
import { getSigningPortalAuth, signSigningPortalToken } from './auth/jwt';
import { sendJson as authSendJson } from './auth/rbac';
import { createOrRefreshOtp, verifyOtp } from './auth/otpStore';
import { isSmsTestMode, sendOtpSms } from './auth/smsProvider';
import { maskPhone, normalizeIsraeliPhone } from './auth/phone';
import { resolveClubBrandingForPortal } from './clubBranding';
import { getEmployeePortalBlockReason } from './employeeAccess';
import {
  findOpenSigningInviteByAgreementId,
  getSigningInvite,
  saveSigningInvite,
} from './portalTokenStore';
import type { SigningInviteRecord } from './portalTypes';
import {
  adminEmbedEmployeeSignatures,
  adminGetAgreement,
  adminGetAgreementPdfBytes,
  adminMergeAgreement,
  adminWriteActivityEvent,
  buildAdminDisclosureActivityEvent,
  buildAdminEmployeeSignedPendingActivityEvent,
  isFirebaseAdminReady,
} from './hrAdminWrite';
import { getFirestore } from 'firebase-admin/firestore';
import { ensureFirebaseAdmin, getClubIdServer } from './auth/firebaseAdmin';
import { readHttpBody } from './httpBody';

const MAX_BODY = 2 * 1024 * 1024;

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.end(JSON.stringify(data));
}


function randomToken() {
  return `sg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function rejectIfInactive(res: ServerResponse, employeeId: string): Promise<boolean> {
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

function inviteExpired(record: SigningInviteRecord): boolean {
  return new Date(record.expiresAt).getTime() <= Date.now() || record.status === 'expired';
}

export async function signingApiMiddleware(
  req: import('http').IncomingMessage & { url?: string },
  res: import('http').ServerResponse,
  next: (err?: unknown) => void
) {
        const url = req.url || '';
        if (!url.startsWith('/api/signing-invites')) return next();

        if (req.method === 'OPTIONS') {
          sendJson(res, 204, {});
          return;
        }

        try {
          // POST /api/signing-invites — create (managers)
          if (
            req.method === 'POST' &&
            (url === '/api/signing-invites' || url.startsWith('/api/signing-invites?'))
          ) {
            const actor = await getBearerUser(req);
            if (!actor) {
              authSendJson(res, 401, { error: 'unauthorized', message: 'נדרשת התחברות' });
              return;
            }
            const raw = await readHttpBody(req);
            const body = JSON.parse(raw || '{}');
            if (!body.agreementId || !body.employeeId) {
              sendJson(res, 400, { error: 'missing_fields' });
              return;
            }

            const existing = await findOpenSigningInviteByAgreementId(body.agreementId);
            const now = new Date();
            const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

            if (existing) {
              existing.expiresAt = expires.toISOString();
              existing.employeeName = body.employeeName || existing.employeeName;
              existing.phone = body.phone || existing.phone;
              existing.docNumber = body.docNumber || existing.docNumber;
              existing.title = body.title || existing.title;
              await saveSigningInvite(existing);
              sendJson(res, 200, {
                token: existing.token,
                expiresAt: existing.expiresAt,
                signPath: `/?sign=${existing.token}`,
                reused: true,
              });
              return;
            }

            const token = randomToken();
            const record: SigningInviteRecord = {
              token,
              agreementId: body.agreementId,
              employeeId: body.employeeId,
              employeeName: body.employeeName || '',
              phone: body.phone,
              docNumber: body.docNumber || '',
              title: body.title || '',
              createdAt: now.toISOString(),
              expiresAt: expires.toISOString(),
              status: 'pending',
            };
            await saveSigningInvite(record);
            sendJson(res, 201, {
              token,
              expiresAt: record.expiresAt,
              signPath: `/?sign=${token}`,
              reused: false,
            });
            return;
          }

          // GET /api/signing-invites/:token
          const getMatch = url.match(/^\/api\/signing-invites\/([^/?]+)$/);
          if (req.method === 'GET' && getMatch && !url.includes('/pdf')) {
            const token = decodeURIComponent(getMatch[1]);
            const record = await getSigningInvite(token);
            if (!record) {
              sendJson(res, 404, { error: 'not_found' });
              return;
            }
            if (record.status === 'completed') {
              sendJson(res, 410, {
                error: 'already_signed',
                message: 'ההסכם כבר נחתם על ידי העובד — הקישור אינו פעיל',
              });
              return;
            }
            if (inviteExpired(record)) {
              if (record.status === 'pending') {
                record.status = 'expired';
                await saveSigningInvite(record);
              }
              sendJson(res, 410, { error: 'expired', message: 'פג תוקף הקישור' });
              return;
            }
            if (await rejectIfInactive(res, record.employeeId)) return;

            const branding = await resolveClubBrandingForPortal(null);
            const portal = await getSigningPortalAuth(req, token);
            const phone = normalizeIsraeliPhone(record.phone || '');

            if (!portal) {
              sendJson(res, 200, {
                requiresOtp: true,
                token: record.token,
                employeeName: record.employeeName,
                phoneMasked: phone ? maskPhone(phone) : null,
                hasPhone: Boolean(phone),
                expiresAt: record.expiresAt,
                title: record.title,
                docNumber: record.docNumber,
                branding,
              });
              return;
            }

            const agreement = await adminGetAgreement(record.agreementId);
            sendJson(res, 200, {
              requiresOtp: false,
              token: record.token,
              agreementId: record.agreementId,
              employeeId: record.employeeId,
              employeeName: record.employeeName,
              title: record.title,
              docNumber: record.docNumber,
              expiresAt: record.expiresAt,
              requiresDisclosure: !record.disclosureAcceptedAt,
              disclosureAcceptedAt: record.disclosureAcceptedAt || null,
              agreementStatus: agreement?.status || null,
              branding,
            });
            return;
          }

          // POST …/otp/request
          const otpReqMatch = url.match(/^\/api\/signing-invites\/([^/?]+)\/otp\/request/);
          if (req.method === 'POST' && otpReqMatch) {
            const token = decodeURIComponent(otpReqMatch[1]);
            const record = await getSigningInvite(token);
            if (!record) {
              sendJson(res, 404, { error: 'not_found' });
              return;
            }
            if (record.status === 'completed' || inviteExpired(record)) {
              sendJson(res, 410, { error: record.status === 'completed' ? 'already_signed' : 'expired' });
              return;
            }
            if (await rejectIfInactive(res, record.employeeId)) return;
            const phone = normalizeIsraeliPhone(record.phone || '');
            if (!phone) {
              sendJson(res, 400, { error: 'no_phone', message: 'לא הוגדר טלפון לעובד' });
              return;
            }
            const otp = await createOrRefreshOtp({
              phone,
              purpose: 'employee_sign',
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
            const brand =
              (await resolveClubBrandingForPortal(null)).clubName ||
              process.env.SMS_BRAND_NAME ||
              'ChainSign';
            const exposeCode = isSmsTestMode();
            if (!exposeCode) {
              await sendOtpSms(phone, otp.code, brand);
            }
            sendJson(res, 200, {
              ok: true,
              phoneMasked: maskPhone(phone),
              testMode: exposeCode,
              testCode: exposeCode ? otp.code : undefined,
              message: exposeCode
                ? 'מצב בדיקה: הקוד מוצג במסך'
                : 'הקוד נשלח ב־SMS',
            });
            return;
          }

          // POST …/otp/verify
          const otpVerifyMatch = url.match(/^\/api\/signing-invites\/([^/?]+)\/otp\/verify/);
          if (req.method === 'POST' && otpVerifyMatch) {
            const token = decodeURIComponent(otpVerifyMatch[1]);
            const record = await getSigningInvite(token);
            if (!record) {
              sendJson(res, 404, { error: 'not_found' });
              return;
            }
            if (await rejectIfInactive(res, record.employeeId)) return;
            const phone = normalizeIsraeliPhone(record.phone || '');
            if (!phone) {
              sendJson(res, 400, { error: 'no_phone' });
              return;
            }
            const raw = await readHttpBody(req);
            const body = JSON.parse(raw || '{}');
            const result = await verifyOtp({
              phone,
              purpose: 'employee_sign',
              code: String(body.code || '').trim(),
              ref: token,
            });
            if (result.ok === false) {
              sendJson(res, 401, { error: result.error, message: 'קוד שגוי או פג תוקף' });
              return;
            }
            const portalToken = await signSigningPortalToken(token, result.phone);
            const branding = await resolveClubBrandingForPortal(null);
            sendJson(res, 200, {
              portalToken,
              invite: {
                requiresOtp: false,
                token: record.token,
                agreementId: record.agreementId,
                employeeId: record.employeeId,
                employeeName: record.employeeName,
                title: record.title,
                docNumber: record.docNumber,
                expiresAt: record.expiresAt,
                requiresDisclosure: !record.disclosureAcceptedAt,
                disclosureAcceptedAt: record.disclosureAcceptedAt || null,
                branding,
              },
            });
            return;
          }

          // POST …/disclosure
          const disclosureMatch = url.match(/^\/api\/signing-invites\/([^/?]+)\/disclosure/);
          if (req.method === 'POST' && disclosureMatch) {
            const token = decodeURIComponent(disclosureMatch[1]);
            const portal = await getSigningPortalAuth(req, token);
            if (!portal) {
              authSendJson(res, 401, { error: 'unauthorized', message: 'נדרש אימות SMS' });
              return;
            }
            const record = await getSigningInvite(token);
            if (!record) {
              sendJson(res, 404, { error: 'not_found' });
              return;
            }
            if (record.status === 'completed' || inviteExpired(record)) {
              sendJson(res, 410, { error: 'expired' });
              return;
            }
            if (await rejectIfInactive(res, record.employeeId)) return;

            const acceptedAt = new Date().toISOString();
            record.disclosureAcceptedAt = acceptedAt;
            await saveSigningInvite(record);

            try {
              await adminMergeAgreement(record.agreementId, {
                disclosureAcceptedAt: acceptedAt,
              });
            } catch (err) {
              console.warn('[signing] disclosure agreement merge failed', err);
            }

            let employeeIdNumber = '';
            try {
              ensureFirebaseAdmin();
              const empSnap = await getFirestore()
                .collection('clubs')
                .doc(getClubIdServer())
                .collection('employees')
                .doc(record.employeeId)
                .get();
              if (empSnap.exists) {
                employeeIdNumber = String(empSnap.data()?.idNumber || '');
              }
            } catch {
              // ignore
            }

            if (isFirebaseAdminReady()) {
              await adminWriteActivityEvent(
                buildAdminDisclosureActivityEvent({
                  employeeId: record.employeeId,
                  employeeName: record.employeeName,
                  employeeIdNumber,
                  agreementId: record.agreementId,
                  docNumber: record.docNumber,
                  title: record.title,
                  createdAt: acceptedAt,
                })
              );
            }

            sendJson(res, 200, { ok: true, disclosureAcceptedAt: acceptedAt });
            return;
          }

          // GET …/pdf
          const pdfMatch = url.match(/^\/api\/signing-invites\/([^/?]+)\/pdf/);
          if (req.method === 'GET' && pdfMatch) {
            const token = decodeURIComponent(pdfMatch[1]);
            const portal = await getSigningPortalAuth(req, token);
            if (!portal) {
              authSendJson(res, 401, { error: 'unauthorized' });
              return;
            }
            const record = await getSigningInvite(token);
            if (!record || record.status === 'completed' || inviteExpired(record)) {
              sendJson(res, record?.status === 'completed' ? 410 : 404, {
                error: record?.status === 'completed' ? 'already_signed' : 'not_found',
              });
              return;
            }
            if (!record.disclosureAcceptedAt) {
              sendJson(res, 403, { error: 'disclosure_required' });
              return;
            }
            const buf = await adminGetAgreementPdfBytes(record.agreementId);
            if (!buf) {
              sendJson(res, 404, { error: 'pdf_missing' });
              return;
            }
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(buf);
            return;
          }

          // POST …/sign
          const signMatch = url.match(/^\/api\/signing-invites\/([^/?]+)\/sign/);
          if (req.method === 'POST' && signMatch) {
            const token = decodeURIComponent(signMatch[1]);
            const portal = await getSigningPortalAuth(req, token);
            if (!portal) {
              authSendJson(res, 401, { error: 'unauthorized', message: 'נדרש אימות SMS' });
              return;
            }
            const record = await getSigningInvite(token);
            if (!record) {
              sendJson(res, 404, { error: 'not_found' });
              return;
            }
            if (record.status === 'completed') {
              sendJson(res, 410, { error: 'already_signed' });
              return;
            }
            if (inviteExpired(record)) {
              sendJson(res, 410, { error: 'expired' });
              return;
            }
            if (!record.disclosureAcceptedAt) {
              sendJson(res, 403, { error: 'disclosure_required' });
              return;
            }
            if (await rejectIfInactive(res, record.employeeId)) return;

            const raw = await readHttpBody(req);
            const body = JSON.parse(raw || '{}');
            const signatureImage = String(body.signatureImageBase64 || '');
            if (!signatureImage.startsWith('data:image')) {
              sendJson(res, 400, { error: 'missing_signature' });
              return;
            }

            const agreement = await adminGetAgreement(record.agreementId);
            if (!agreement) {
              sendJson(res, 404, { error: 'agreement_not_found' });
              return;
            }
            const templateId = String(agreement.templateId || '');
            if (!templateId) {
              sendJson(res, 400, { error: 'missing_template' });
              return;
            }

            const embedded = await adminEmbedEmployeeSignatures({
              agreementId: record.agreementId,
              templateId,
              signatureImageDataUrl: signatureImage,
            });

            const employeeSignedAt = new Date().toISOString();
            const prevFieldSigs = Array.isArray(agreement.fieldSignatures)
              ? (agreement.fieldSignatures as Record<string, unknown>[])
              : [];
            const withoutEmployee = prevFieldSigs.filter(
              (fs) => fs.signerRole === 'club'
            );

            await adminMergeAgreement(record.agreementId, {
              status: 'PENDING_SIGNATURE',
              employeeSignedAt,
              fieldSignatures: [...withoutEmployee, ...embedded.fieldSignatures],
              signature: {
                signedBy: record.employeeName,
                signatureDate: employeeSignedAt,
                signatureType: body.signatureType || 'draw',
                deviceInfo: 'Employee Signing Portal',
                signedVia: 'employee_portal',
              },
              pdfUrl: embedded.downloadURL,
              storagePdfPath: embedded.storagePath,
              version: Number(agreement.version || 0) + 1,
            });

            record.status = 'completed';
            record.completedAt = employeeSignedAt;
            await saveSigningInvite(record);

            let employeeIdNumber = '';
            try {
              ensureFirebaseAdmin();
              const empSnap = await getFirestore()
                .collection('clubs')
                .doc(getClubIdServer())
                .collection('employees')
                .doc(record.employeeId)
                .get();
              if (empSnap.exists) {
                employeeIdNumber = String(empSnap.data()?.idNumber || '');
              }
            } catch {
              // ignore
            }

            await adminWriteActivityEvent(
              buildAdminEmployeeSignedPendingActivityEvent({
                employeeId: record.employeeId,
                employeeName: record.employeeName,
                employeeIdNumber,
                agreementId: record.agreementId,
                docNumber: record.docNumber,
                title: record.title,
                createdAt: employeeSignedAt,
              })
            );

            sendJson(res, 200, {
              ok: true,
              message: 'החתימה נקלטה — ממתין לחתימת הנהלה',
              employeeSignedAt,
            });
            return;
          }

          sendJson(res, 404, { error: 'route_not_found' });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'error';
          if (msg === 'payload_too_large') {
            sendJson(res, 413, { error: 'payload_too_large' });
            return;
          }
          console.error('[signing-api]', err);
          sendJson(res, 500, { error: 'server_error', message: msg });
        }
      }

export function signingApiPlugin(): Plugin {
  return {
    name: 'employee-signing-api',
    configureServer(server) {
      server.middlewares.use(signingApiMiddleware);
    },
  };
}
