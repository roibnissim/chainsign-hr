/**
 * שליחת SMS דרך sms4free.co.il
 * POST https://api.sms4free.co.il/ApiSMS/v2/SendSMS
 */

export interface SmsSendResult {
  ok: boolean;
  status: number;
  message: string;
  /** במצב בדיקה — האם הקוד הוחזר ללקוח במקום/בנוסף ל־SMS */
  testMode?: boolean;
}

const SMS_STATUS_HE: Record<number, string> = {
  0: 'שגיאה כללית בשליחת SMS',
  [-1]: 'מפתח, שם משתמש או סיסמה שגויים',
  [-2]: 'שם או מספר שולח ההודעה שגוי',
  [-3]: 'לא נמצאו נמענים',
  [-4]: 'יתרת הודעות פנויות נמוכה',
  [-5]: 'הודעה לא מתאימה',
  [-6]: 'יש לאמת מספר שולח אצל ספק ה־SMS',
};

function smsConfigured(): boolean {
  return Boolean(
    process.env.SMS4FREE_KEY?.trim() &&
      process.env.SMS4FREE_USER?.trim() &&
      process.env.SMS4FREE_PASS?.trim() &&
      process.env.SMS4FREE_SENDER?.trim()
  );
}

/** true = אל תשלח SMS אמיתי; הצג קוד במסך */
export function isSmsTestMode(): boolean {
  const flag = (process.env.SMS_OTP_TEST_MODE || '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

export async function sendSms(recipient: string, msg: string): Promise<SmsSendResult> {
  // מצב בדיקה מפורש — בלי קריאה לספק
  if (isSmsTestMode()) {
    console.info(`[sms:test-mode] skip provider | to=${recipient} | ${msg}`);
    return {
      ok: true,
      status: 1,
      message: 'test_mode',
      testMode: true,
    };
  }

  if (!smsConfigured()) {
    console.warn('[sms] SMS4FREE credentials incomplete — falling back to test mode');
    console.info(`[sms:test] to=${recipient} msg=${msg}`);
    return {
      ok: true,
      status: 1,
      message: 'test_mode',
      testMode: true,
    };
  }

  const body = {
    key: process.env.SMS4FREE_KEY!.trim(),
    user: process.env.SMS4FREE_USER!.trim(),
    pass: process.env.SMS4FREE_PASS!.trim(),
    sender: process.env.SMS4FREE_SENDER!.trim().slice(0, 11),
    recipient,
    msg,
  };

  try {
    const res = await fetch('https://api.sms4free.co.il/ApiSMS/v2/SendSMS', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { status?: number; message?: string };
    const status = Number(data.status ?? 0);
    console.info('[sms] provider response', { http: res.status, status, message: data.message });
    if (status > 0) {
      return {
        ok: true,
        status,
        message: data.message || 'ok',
      };
    }
    return {
      ok: false,
      status,
      message: SMS_STATUS_HE[status] || data.message || `שגיאת SMS (${status})`,
    };
  } catch (err) {
    console.error('[sms] send failed', err);
    return { ok: false, status: 0, message: 'כשל ברשת מול ספק ה־SMS' };
  }
}

export async function sendOtpSms(phone: string, code: string, clubName?: string): Promise<SmsSendResult> {
  const brand = clubName || 'האגודה';
  const msg =
    `${brand}: קוד האימות שלך הוא ${code}. הקוד תקף ל־5 דקות. אל תשתף אותו עם אחרים.`;
  return sendSms(phone, msg);
}
