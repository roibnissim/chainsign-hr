/**
 * בדיקת פרטי SMS4FREE מול הספק (בלי להדפיס סודות).
 *
 * Usage:
 *   npm run test:sms -- 05XXXXXXXX
 *
 * דורש SMS4FREE_KEY / USER / PASS / SENDER ב־.ENV
 * מתעלם מ־SMS_OTP_TEST_MODE — תמיד קורא לספק.
 */
import 'dotenv/config';

const STATUS_HE = {
  0: 'שגיאה כללית בשליחת SMS',
  [-1]: 'מפתח, שם משתמש או סיסמה שגויים',
  [-2]: 'שם או מספר שולח ההודעה שגוי',
  [-3]: 'לא נמצאו נמענים',
  [-4]: 'יתרת הודעות פנויות נמוכה',
  [-5]: 'הודעה לא מתאימה',
  [-6]: 'יש לאמת מספר שולח אצל ספק ה־SMS',
};

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  let local = digits;
  if (local.startsWith('972')) local = `0${local.slice(3)}`;
  if (local.length === 9 && local.startsWith('5')) local = `0${local}`;
  return /^05\d{8}$/.test(local) ? local : null;
}

function mask(value) {
  const s = String(value || '');
  if (s.length <= 4) return '****';
  return `${s.slice(0, 2)}…${s.slice(-2)} (${s.length} תווים)`;
}

const phoneArg = process.argv[2];
const phone = normalizePhone(phoneArg);

const key = (process.env.SMS4FREE_KEY || '').trim();
const user = (process.env.SMS4FREE_USER || '').trim();
const pass = (process.env.SMS4FREE_PASS || '').trim();
const sender = (process.env.SMS4FREE_SENDER || '').trim().slice(0, 11);

console.log('── בדיקת SMS4FREE ──');
console.log(`KEY:    ${key ? mask(key) : 'חסר'}`);
console.log(`USER:   ${user ? mask(user) : 'חסר'}`);
console.log(`PASS:   ${pass ? 'מוגדר (' + pass.length + ' תווים)' : 'חסר'}`);
console.log(`SENDER: ${sender || 'חסר'}`);

if (!key || !user || !pass || !sender) {
  console.error('\nחסרים משתני סביבה ב־.env — מלא SMS4FREE_KEY/USER/PASS/SENDER');
  process.exit(1);
}

if (!phone) {
  console.error('\nשימוש: npm run test:sms -- 05XXXXXXXX');
  console.error('מספר ישראלי בפורמט 05XXXXXXXX');
  process.exit(1);
}

const body = {
  key,
  user,
  pass,
  sender,
  recipient: phone,
  msg: 'ChainSign: בדיקת חיבור SMS (ניתן להתעלם)',
};

console.log(`\nשולח בדיקה אל ${phone} …`);

try {
  const res = await fetch('https://api.sms4free.co.il/ApiSMS/v2/SendSMS', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  const status = Number(data.status ?? 0);
  const meaning = STATUS_HE[status] || data.message || `קוד ${status}`;

  console.log(`HTTP:   ${res.status}`);
  console.log(`status: ${status}`);
  console.log(`משמעות: ${meaning}`);
  if (data.message) console.log(`הודעת ספק: ${data.message}`);

  if (status > 0) {
    console.log('\n✓ הפרטים תקינים וההודעה נשלחה (או התקבלה אצל הספק).');
    process.exit(0);
  }

  console.error('\n✗ הבדיקה נכשלה — תקן את הפרטים ב־.env (או ב־Firebase Secrets) ונסה שוב.');
  process.exit(2);
} catch (err) {
  console.error('\n✗ כשל רשת מול הספק:', err instanceof Error ? err.message : err);
  process.exit(3);
}
