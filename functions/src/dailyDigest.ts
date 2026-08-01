import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineString, defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';
import { clubId } from './config';

const resendApiKey = defineSecret('RESEND_API_KEY');
const resendFrom = defineString('RESEND_FROM', {
  default: 'ChainSign <onboarding@resend.dev>',
});

type ActivityRow = {
  id?: string;
  createdAt?: string;
  description?: string;
  sourceKey?: string;
  employeeName?: string;
  status?: string;
};

function resolveNotifyEmail(data: Record<string, unknown>): string | null {
  const notification =
    typeof data.notificationEmail === 'string' ? data.notificationEmail.trim() : '';
  if (notification && notification.includes('@') && !notification.endsWith('@sms.local')) {
    return notification;
  }
  const email = typeof data.email === 'string' ? data.email.trim() : '';
  if (email && email.includes('@') && !email.endsWith('@sms.local') && !email.endsWith('@pending.local')) {
    return email;
  }
  return null;
}

function isEmployeeUpdateEvent(sourceKey: string): boolean {
  const key = String(sourceKey || '');
  return key.startsWith('profile:') || key.startsWith('doc:');
}

/**
 * «הסכם שנחתם» — כל אירועי זרימת החתימה:
 * agreement: (הושלם), agreement-emp-signed: (עובד חתם), disclosure: (גילוי נאות)
 * חשוב: agreement-emp-signed אינו מתחיל ב־"agreement:" ולכן נבדק בנפרד.
 */
function isAgreementSignedEvent(sourceKey: string): boolean {
  const key = String(sourceKey || '');
  return (
    key.startsWith('agreement:') ||
    key.startsWith('agreement-emp-signed:') ||
    key.startsWith('disclosure:')
  );
}

function filterEventsForUser(
  events: ActivityRow[],
  prefs: { notifyEmployeeUpdates: boolean; notifyAgreementSigned: boolean }
): ActivityRow[] {
  return events.filter((e) => {
    const key = String(e.sourceKey || '');
    if (prefs.notifyEmployeeUpdates && isEmployeeUpdateEvent(key)) return true;
    if (prefs.notifyAgreementSigned && isAgreementSignedEvent(key)) return true;
    return false;
  });
}

function buildEmailHtml(params: {
  managerName: string;
  clubId: string;
  events: ActivityRow[];
  windowLabel: string;
}): string {
  const items = params.events
    .slice(0, 40)
    .map((e) => {
      const when = e.createdAt
        ? new Date(e.createdAt).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })
        : '';
      const desc = String(e.description || e.sourceKey || e.id || 'אירוע');
      return `<li style="margin-bottom:8px"><strong>${when}</strong><br/>${escapeHtml(desc)}</li>`;
    })
    .join('');
  const more =
    params.events.length > 40
      ? `<p style="color:#64748b">ועוד ${params.events.length - 40} אירועים…</p>`
      : '';

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<body style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:24px;border:1px solid #e2e8f0">
    <h1 style="font-size:18px;margin:0 0 8px">סיכום יומי — לוג פעילות</h1>
    <p style="margin:0 0 16px;color:#64748b;font-size:14px">
      שלום ${escapeHtml(params.managerName || 'מנהל')}, להלן אירועים מ־${escapeHtml(params.windowLabel)}
      (מועדון ${escapeHtml(params.clubId)}).
    </p>
    <ul style="padding-right:18px;margin:0;font-size:14px;line-height:1.45">${items}</ul>
    ${more}
    <p style="margin-top:20px;font-size:12px;color:#94a3b8">הודעה אוטומטית מ־ChainSign HR · נשלחת ב־13:00 שעון ישראל</p>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendResendEmail(params: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: params.from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`resend_${res.status}: ${text}`);
  }
}

/**
 * דיגסט יומי למנהלים — 13:00 שעון ישראל.
 * שולח רק אם יש אירועי לוג רלוונטיים לפי העדפות המשתמש.
 */
export const dailyManagerDigest = onSchedule(
  {
    schedule: '0 13 * * *',
    timeZone: 'Asia/Jerusalem',
    region: 'europe-west1',
    secrets: [resendApiKey],
  },
  async () => {
    const apiKey = resendApiKey.value();
    if (!apiKey) {
      console.warn('[dailyManagerDigest] RESEND_API_KEY missing — skip');
      return;
    }
    const from = resendFrom.value() || 'ChainSign <onboarding@resend.dev>';
    const cid = clubId();
    const db = getFirestore();

    const now = Date.now();
    const windowStart = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const windowEnd = new Date(now).toISOString();
    const windowLabel = `${new Date(windowStart).toLocaleString('he-IL', {
      timeZone: 'Asia/Jerusalem',
    })} – ${new Date(windowEnd).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}`;

    const eventsSnap = await db.collection('clubs').doc(cid).collection('activityEvents').get();
    const eventsInWindow: ActivityRow[] = eventsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() } as ActivityRow))
      .filter((e) => {
        const t = String(e.createdAt || '');
        return t >= windowStart && t <= windowEnd;
      })
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

    if (!eventsInWindow.length) {
      console.log('[dailyManagerDigest] no events in window');
      return;
    }

    const usersSnap = await db.collection('clubs').doc(cid).collection('users').get();
    let sent = 0;

    for (const userDoc of usersSnap.docs) {
      const data = userDoc.data() as Record<string, unknown>;
      const to = resolveNotifyEmail(data);
      if (!to) continue;

      const prefs = {
        notifyEmployeeUpdates: data.notifyEmployeeUpdates !== false,
        notifyAgreementSigned: data.notifyAgreementSigned !== false,
      };
      if (!prefs.notifyEmployeeUpdates && !prefs.notifyAgreementSigned) continue;

      const relevant = filterEventsForUser(eventsInWindow, prefs);
      if (!relevant.length) continue;

      const name = String(data.name || 'מנהל');
      const html = buildEmailHtml({
        managerName: name,
        clubId: cid,
        events: relevant,
        windowLabel,
      });

      try {
        await sendResendEmail({
          apiKey,
          from,
          to,
          subject: `סיכום יומי · ${relevant.length} אירועים בלוג הפעילות`,
          html,
        });
        sent += 1;
      } catch (err) {
        console.error('[dailyManagerDigest] send failed', to, err);
      }
    }

    console.log(`[dailyManagerDigest] sent=${sent} events=${eventsInWindow.length}`);
  }
);
