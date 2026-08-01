import {
  clearActivityLogLocal,
  ACTIVITY_LOG_FIRESTORE_ONLY_FLAG,
  mergeActivityEvents,
  dedupeActivityEvents,
  archiveActivityEvent as archiveLocal,
} from '../config/activityLog';
import type { ManagerActivityEvent } from '../types';
import { authHeadersAsync } from './authGateway';

/**
 * לוג דאשבורד — נשמר ב-Firestore בלבד, דרך Admin API בשרת
 * (לא תלוי ב-Firestore Rules של הלקוח).
 */

export async function fetchActivityEventsRemote(): Promise<ManagerActivityEvent[]> {
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

/** איפוס מלא של הלוג ב-Firestore (Admin) + ניקוי localStorage */
export async function purgeActivityLogCompletely(force = false): Promise<boolean> {
  clearActivityLogLocal();
  try {
    localStorage.removeItem('club_activity_log_firestore_only_v1');
    localStorage.removeItem('club_activity_log_firestore_only_v2');
  } catch {
    // ignore
  }
  try {
    const already = !force && localStorage.getItem(ACTIVITY_LOG_FIRESTORE_ONLY_FLAG) === '1';
    if (already) return false;
    const headers = await authHeadersAsync();
    const res = await fetch('/api/activity-events', { method: 'DELETE', headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `activity_events_purge_${res.status}`);
    }
    localStorage.setItem(ACTIVITY_LOG_FIRESTORE_ONLY_FLAG, '1');
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

/** האזנה ללוג דרך polling ל-API (Firestore דרך Admin) */
export function subscribeActivityEventsViaApi(
  onData: (rows: ManagerActivityEvent[]) => void,
  intervalMs = 8000
): () => void {
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
