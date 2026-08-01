import type { Plugin, Connect } from 'vite';
import { getBearerUser } from './auth/jwt';
import { sendJson as authSendJson } from './auth/rbac';
import {
  adminPersistFileDocument,
  adminWriteActivityEvent,
  buildAdminDocumentActivityEvent,
  isFirebaseAdminReady,
} from './hrAdminWrite';
import { getFirestore } from 'firebase-admin/firestore';
import { ensureFirebaseAdmin, getClubIdServer } from './auth/firebaseAdmin';
import { resolveClubBrandingForPortal } from './clubBranding';
import { getEmployeePortalBlockReason } from './employeeAccess';
import { getUploadRequest, saveUploadRequest } from './portalTokenStore';
import type { UploadRequestRecord } from './portalTypes';
import { readHttpBody } from './httpBody';

export type { UploadRequestRecord };

const MAX_BODY = 600 * 1024; // ~600KB JSON


function sendJson(res: import('http').ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(data));
}

function randomToken() {
  return `up_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function uploadApiMiddleware(
  req: import('http').IncomingMessage & { url?: string },
  res: import('http').ServerResponse,
  next: (err?: unknown) => void
) {
        const url = req.url || '';
        if (!url.startsWith('/api/upload-requests')) return next();

        if (req.method === 'OPTIONS') {
          sendJson(res, 204, {});
          return;
        }

        try {
          // POST /api/upload-requests — create (managers only)
          if (req.method === 'POST' && (url === '/api/upload-requests' || url.startsWith('/api/upload-requests?'))) {
            const actor = await getBearerUser(req);
            if (!actor) {
              authSendJson(res, 401, { error: 'unauthorized', message: 'נדרשת התחברות' });
              return;
            }
            const raw = await readHttpBody(req);
            const body = JSON.parse(raw || '{}');
            const token = randomToken();
            const now = new Date();
            const expires = new Date(now.getTime() + 72 * 60 * 60 * 1000);
            const record: UploadRequestRecord = {
              token,
              employeeId: body.employeeId,
              employeeName: body.employeeName,
              category: body.category,
              categoryLabel: body.categoryLabel,
              suggestedTypes: body.suggestedTypes || ['מסמך'],
              createdAt: now.toISOString(),
              expiresAt: expires.toISOString(),
              status: 'pending',
            };
            await saveUploadRequest(record);
            sendJson(res, 201, { token, expiresAt: record.expiresAt, uploadPath: `/?upload=${token}` });
            return;
          }

          // GET /api/upload-requests/completed — deprecated
          if (req.method === 'GET' && url.startsWith('/api/upload-requests/completed')) {
            const actor = await getBearerUser(req);
            if (!actor) {
              authSendJson(res, 401, { error: 'unauthorized', message: 'נדרשת התחברות' });
              return;
            }
            sendJson(res, 200, { items: [] });
            return;
          }

          // POST /api/upload-requests/:token/imported
          const importedMatch = url.match(/^\/api\/upload-requests\/([^/?]+)\/imported/);
          if (req.method === 'POST' && importedMatch) {
            const actor = await getBearerUser(req);
            if (!actor) {
              authSendJson(res, 401, { error: 'unauthorized', message: 'נדרשת התחברות' });
              return;
            }
            const token = decodeURIComponent(importedMatch[1]);
            const record = await getUploadRequest(token);
            if (!record) {
              sendJson(res, 404, { error: 'not_found' });
              return;
            }
            record.imported = true;
            await saveUploadRequest(record);
            sendJson(res, 200, { ok: true });
            return;
          }

          // GET /api/upload-requests/:token
          const getMatch = url.match(/^\/api\/upload-requests\/([^/?]+)/);
          if (req.method === 'GET' && getMatch && !url.includes('/completed')) {
            const token = decodeURIComponent(getMatch[1]);
            const record = await getUploadRequest(token);
            if (!record) {
              sendJson(res, 404, { error: 'not_found' });
              return;
            }
            const inactive = await getEmployeePortalBlockReason(record.employeeId);
            if (inactive === 'employee_inactive') {
              sendJson(res, 403, {
                error: 'employee_inactive',
                message: 'העובד אינו פעיל במערכת — הקישור אינו זמין',
              });
              return;
            }
            if (new Date(record.expiresAt) < new Date() && record.status === 'pending') {
              record.status = 'expired';
              await saveUploadRequest(record);
            }
            const { uploadedDoc, ...meta } = record;
            const branding = await resolveClubBrandingForPortal(null);
            sendJson(res, 200, {
              ...meta,
              hasUpload: Boolean(uploadedDoc),
              uploadedFileName: uploadedDoc?.fileName,
              branding,
            });
            return;
          }

          // POST /api/upload-requests/:token/upload
          const uploadMatch = url.match(/^\/api\/upload-requests\/([^/?]+)\/upload/);
          if (req.method === 'POST' && uploadMatch) {
            const token = decodeURIComponent(uploadMatch[1]);
            const record = await getUploadRequest(token);
            if (!record) {
              sendJson(res, 404, { error: 'not_found' });
              return;
            }
            const inactiveUpload = await getEmployeePortalBlockReason(record.employeeId);
            if (inactiveUpload === 'employee_inactive') {
              sendJson(res, 403, {
                error: 'employee_inactive',
                message: 'העובד אינו פעיל במערכת — הקישור אינו זמין',
              });
              return;
            }
            if (new Date(record.expiresAt) < new Date()) {
              record.status = 'expired';
              await saveUploadRequest(record);
              sendJson(res, 410, { error: 'expired' });
              return;
            }
            if (record.status === 'completed') {
              sendJson(res, 409, { error: 'already_uploaded' });
              return;
            }

            const raw = await readHttpBody(req);
            const body = JSON.parse(raw || '{}');
            if (!body.title || !body.docType) {
              sendJson(res, 400, { error: 'missing_fields' });
              return;
            }

            const uploadedDoc = {
              id: `efd-wa-${Date.now()}`,
              title: String(body.title).trim(),
              docType: String(body.docType).trim(),
              issuedAt: body.issuedAt || new Date().toISOString().split('T')[0],
              notes: body.notes ? String(body.notes).trim() : undefined,
              fileName: body.fileName,
              fileDataUrl: body.fileDataUrl as string | undefined,
              createdAt: new Date().toISOString(),
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
                id: uploadedDoc.id,
                employeeId: record.employeeId,
                category: record.category,
                title: uploadedDoc.title,
                docType: uploadedDoc.docType,
                issuedAt: uploadedDoc.issuedAt,
                notes: uploadedDoc.notes,
                fileName: uploadedDoc.fileName,
                fileDataUrl: uploadedDoc.fileDataUrl,
                createdAt: uploadedDoc.createdAt,
              });

              let employeeName = record.employeeName;
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
                  const data = empSnap.data() || {};
                  employeeName = String(data.name || employeeName);
                  employeeIdNumber = String(data.idNumber || '');
                }
              } catch {
                // ignore profile lookup
              }

              await adminWriteActivityEvent(
                buildAdminDocumentActivityEvent({
                  employeeId: record.employeeId,
                  employeeName,
                  employeeIdNumber,
                  category: record.category,
                  documentId: uploadedDoc.id,
                  documentTitle: uploadedDoc.title,
                  docType: uploadedDoc.docType,
                  createdAt: uploadedDoc.createdAt,
                })
              );

              record.uploadedDoc = {
                ...uploadedDoc,
                fileDataUrl: persisted.fileDataUrl,
              };
              record.status = 'completed';
              record.imported = true;
              await saveUploadRequest(record);
              sendJson(res, 200, { ok: true, message: 'הקובץ התקבל בהצלחה' });
              return;
            } catch (err) {
              console.error('[upload] firestore write failed', err);
              sendJson(res, 500, {
                error: 'firestore_write_failed',
                message: err instanceof Error ? err.message : 'unknown',
              });
              return;
            }
          }

          sendJson(res, 404, { error: 'route_not_found' });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'error';
          sendJson(res, message === 'payload_too_large' ? 413 : 500, { error: message });
        }
      }

export function uploadApiPlugin(): Plugin {
  return {
    name: 'employee-upload-api',
    configureServer(server) {
      server.middlewares.use(uploadApiMiddleware);
    },
  };
}
