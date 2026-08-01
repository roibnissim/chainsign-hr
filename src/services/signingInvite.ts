import { authHeadersAsync } from './authGateway';
import { buildWhatsAppShareUrl } from './whatsappUpload';

export async function createSigningInvite(params: {
  agreementId: string;
  employeeId: string;
  employeeName: string;
  phone?: string;
  docNumber: string;
  title: string;
}) {
  const res = await fetch('/api/signing-invites', {
    method: 'POST',
    headers: await authHeadersAsync({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'create_signing_invite_failed');
  return data as {
    token: string;
    expiresAt: string;
    signPath: string;
    reused?: boolean;
  };
}

export function buildSigningWhatsAppUrl(
  phone: string,
  employeeName: string,
  absoluteUrl: string,
  docTitle: string
) {
  const message =
    `שלום ${employeeName},\n` +
    `התקבל הסכם לחתימה דיגיטלית: «${docTitle}».\n` +
    `נא לאמת זהות בקוד SMS ולחתום בקישור:\n${absoluteUrl}\n` +
    `הקישור בתוקף עד 7 ימים או עד לחתימה.`;
  return buildWhatsAppShareUrl(phone, message);
}

export function signingPortalHeaders(portalToken: string | null): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (portalToken) h.Authorization = `Bearer ${portalToken}`;
  return h;
}
