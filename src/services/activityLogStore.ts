import {
  clearActivityLogLocal,
  ACTIVITY_LOG_FIRESTORE_ONLY_FLAG,
  mergeActivityEvents,
  dedupeActivityEvents,
  archiveActivityEvent as archiveLocal,
} from '../config/activityLog';
import { useFirestore } from '../config/featureFlags';
import { isFirebaseConfigured } from '../lib/firebase';
import type { ManagerActivityEvent } from '../types';
import { authHeadersAsync } from './authGateway';

/**
 * לוג דאשבורד — מקור האמת Firestore.
 * עם Firebase: קריאה/כתיבה ישירות מהלקוח (כמו עובדים/הסכמים).
 * בלי Firebase: fallback ל-Admin API.
 */

function useClientFirestore(): boolean {
  return useFirestore() && isFirebaseConfigured();
}

export async function fetchActivityEventsRemote(): Promise<ManagerActivityEvent[]> {
  if (useClientFirestore()) {
    const { listActivityEvents } = await import('./firestore/hrStore');
    return dedupeActivityEvents(await listActivityEvents());
  }
  const headers = await authHeadersAsync();
  const res = await fetch('/api/activity-events', { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `activity_events_fetch_${res.status}`);
  }
  const data = await res.json();
  const rows = Array.isArray(data.events) ? (data.events as ManagerActivityEvent[]) : [];
  return dedupeActivityEvents(rows);
}

export async function persistActivityEvent(event: ManagerActivityEvent): Promise<void> {
  if (useClientFirestore()) {
    const { upsertActivityEvent } = await import('./firestore/hrStore');
    await upsertActivityEvent(event);
    return;
  }
  const headers = await authHeadersAsync({ 'Content-Type': 'application/json' });
  const res = await fetch('/api/activity-events', {
    method: 'POST',
    headers,
    body: JSON.stringify({ event }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `activity_event_persist_${res.status}`);
  }
}

export async function persistActivityEvents(events: ManagerActivityEvent[]): Promise<void> {
  if (!events.length) return;
  if (useClientFirestore()) {
    const { upsertActivityEvents } = await import('./firestore/hrStore');
    await upsertActivityEvents(events);
    return;
  }
  const headers = await authHeadersAsync({ 'Content-Type': 'application/json' });
  const res = await fetch('/api/activity-events', {
    method: 'POST',
    headers,
    body: JSON.stringify({ events }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `activity_events_persist_${res.status}`);
  }
}

export async function archiveActivityEventRemote(
  events: ManagerActivityEvent[],
  eventId: string
): Promise<ManagerActivityEvent[]> {
  const next = archiveLocal(events, eventId);
  const updated = next.find((e) => e.id === eventId);
  if (updated) await persistActivityEvent(updated);
  return next;
}

/**
 * איפוס לוג ב-Firestore — רק עם force=true (פעולה מפורשת).
 */
export async function purgeActivityLogCompletely(force = false): Promise<boolean> {
  clearActivityLogLocal();
  try {
    localStorage.removeItem('club_activity_log_firestore_only_v1');
    localStorage.removeItem('club_activity_log_firestore_only_v2');
    localStorage.removeItem(ACTIVITY_LOG_FIRESTORE_ONLY_FLAG);
  } catch {
    // ignore
  }
  if (!force) return false;
  try {
    if (useClientFirestore()) {
      const { clearAllActivityEventsRemote } = await import('./firestore/hrStore');
      await clearAllActivityEventsRemote();
      return true;
    }
    const headers = await authHeadersAsync();
    const res = await fetch('/api/activity-events', { method: 'DELETE', headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `activity_events_purge_${res.status}`);
    }
    return true;
  } catch (err) {
    console.error('purgeActivityLogCompletely failed', err);
    return false;
  }
}

export function mergeAndDedupe(
  existing: ManagerActivityEvent[],
  incoming: ManagerActivityEvent[]
): ManagerActivityEvent[] {
  return dedupeActivityEvents(mergeActivityEvents(existing, incoming));
}

/** האזנה ללוג — Firestore onSnapshot כשאפשר, אחרת polling ל-API */
export function subscribeActivityEventsViaApi(
  onData: (rows: ManagerActivityEvent[]) => void,
  intervalMs = 8000
): () => void {
  if (useClientFirestore()) {
    let cancelled = false;
    let unsubFs: (() => void) | null = null;
    void import('./firestore/hrStore').then(({ subscribeActivityEvents }) => {
      if (cancelled) return;
      unsubFs = subscribeActivityEvents((rows) => {
        onData(dedupeActivityEvents(rows));
      });
    });
    return () => {
      cancelled = true;
      unsubFs?.();
    };
  }

  let cancelled = false;
  const tick = async () => {
    try {
      const rows = await fetchActivityEventsRemote();
      if (!cancelled) onData(rows);
    } catch (err) {
      console.error('subscribeActivityEventsViaApi', err);
    }
  };
  void tick();
  const id = window.setInterval(() => {
    void tick();
  }, intervalMs);
  return () => {
    cancelled = true;
    window.clearInterval(id);
  };
}
