import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';
import { getFirestore } from 'firebase-admin/firestore';
import { getBearerUser } from './auth/jwt';
import { sendJson as authSendJson } from './auth/rbac';
import { ensureFirebaseAdmin, getClubIdServer, isFirebaseAdminReady } from './auth/firebaseAdmin';
import { readHttpBody } from './httpBody';

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}


function activityCol() {
  ensureFirebaseAdmin();
  return getFirestore().collection('clubs').doc(getClubIdServer()).collection('activityEvents');
}

/**
 * API ללוג פעילות דרך Admin SDK — נשמר ב-Firestore בלי תלות ב-Rules של הלקוח.
 */
export async function activityLogApiMiddleware(
  req: import('http').IncomingMessage & { url?: string },
  res: import('http').ServerResponse,
  next: (err?: unknown) => void
) {
        const url = req.url || '';
        if (!url.startsWith('/api/activity-events')) return next();

        if (req.method === 'OPTIONS') {
          sendJson(res, 204, {});
          return;
        }

        try {
          if (!isFirebaseAdminReady()) {
            sendJson(res, 503, {
              error: 'firebase_admin_unavailable',
              message: 'Firebase Admin לא מוגדר (service-account.json)',
            });
            return;
          }

          const actor = await getBearerUser(req);
          if (!actor) {
            authSendJson(res, 401, { error: 'unauthorized', message: 'נדרשת התחברות' });
            return;
          }

          // GET /api/activity-events
          if (req.method === 'GET' && (url === '/api/activity-events' || url.startsWith('/api/activity-events?'))) {
            const snap = await activityCol().get();
            const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            rows.sort((a, b) => {
              const ta = String((a as { createdAt?: string }).createdAt || '');
              const tb = String((b as { createdAt?: string }).createdAt || '');
              return tb.localeCompare(ta);
            });
            sendJson(res, 200, { events: rows });
            return;
          }

          // POST /api/activity-events — יצירה/עדכון אירוע אחד או כמה
          if (req.method === 'POST' && (url === '/api/activity-events' || url.startsWith('/api/activity-events?'))) {
            const raw = await readHttpBody(req);
            const body = JSON.parse(raw || '{}');
            const events = Array.isArray(body.events)
              ? body.events
              : body.event
                ? [body.event]
                : [];
            if (!events.length) {
              sendJson(res, 400, { error: 'missing_events' });
              return;
            }
            const col = activityCol();
            const batch = getFirestore().batch();
            for (const event of events) {
              if (!event?.id) continue;
              const { id, ...rest } = event;
              batch.set(col.doc(String(id)), { ...rest, id: String(id) }, { merge: true });
            }
            await batch.commit();
            sendJson(res, 200, { ok: true, count: events.length });
            return;
          }

          // DELETE /api/activity-events — איפוס כל הלוג
          if (
            req.method === 'DELETE' &&
            (url === '/api/activity-events' || url.startsWith('/api/activity-events?'))
          ) {
            const col = activityCol();
            const snap = await col.get();
            let batch = getFirestore().batch();
            let ops = 0;
            let deleted = 0;
            for (const doc of snap.docs) {
              batch.delete(doc.ref);
              ops += 1;
              deleted += 1;
              if (ops >= 400) {
                await batch.commit();
                batch = getFirestore().batch();
                ops = 0;
              }
            }
            if (ops > 0) await batch.commit();
            sendJson(res, 200, { ok: true, deleted });
            return;
          }

          sendJson(res, 404, { error: 'not_found' });
        } catch (err) {
          console.error('[activity-log-api]', err);
          sendJson(res, 500, {
            error: 'server_error',
            message: err instanceof Error ? err.message : 'unknown',
          });
        }
      }

export function activityLogApiPlugin(): Plugin {
  return {
    name: 'activity-log-api',
    configureServer(server) {
      server.middlewares.use(activityLogApiMiddleware);
    },
  };
}
