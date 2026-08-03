import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as crypto from 'crypto';
import { clubId } from './config';

initializeApp();

type SystemRole = 'SYSTEM_ADMIN' | 'MANAGER';

const smsKey = defineSecret('SMS4FREE_KEY');
const smsUser = defineSecret('SMS4FREE_USER');
const smsPass = defineSecret('SMS4FREE_PASS');
const smsSender = defineSecret('SMS4FREE_SENDER');

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  let local = digits;
  if (local.startsWith('972')) local = `0${local.slice(3)}`;
  if (local.length === 9 && local.startsWith('5')) local = `0${local}`;
  if (!/^05\d{8}$/.test(local)) return null;
  return local;
}

function requireAdmin(auth: { token: Record<string, unknown> } | undefined) {
  if (!auth?.token || auth.token.role !== 'SYSTEM_ADMIN' || auth.token.clubId !== clubId()) {
    throw new HttpsError('permission-denied', 'SYSTEM_ADMIN only');
  }
}

async function sendSms4Free(to: string, message: string): Promise<{ ok: boolean; message: string }> {
  const testMode = process.env.SMS_OTP_TEST_MODE === 'true';
  if (testMode) {
    return { ok: true, message: 'test_mode' };
  }
  const body = {
    key: smsKey.value(),
    user: smsUser.value(),
    pass: smsPass.value(),
    sender: smsSender.value() || 'ChainSign',
    recipient: to,
    msg: message,
  };
  const res = await fetch('https://api.sms4free.co.il/ApiSMS/v2/SendSMS', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { ok: res.ok, message: text };
}

export const requestManagerOtp = onCall(
  { region: 'europe-west1', secrets: [smsKey, smsUser, smsPass, smsSender] },
  async (request) => {
    const phone = normalizePhone(String(request.data?.phone || ''));
    if (!phone) throw new HttpsError('invalid-argument', 'invalid_phone');

    const db = getFirestore();
    const usersSnap = await db.collection('clubs').doc(clubId()).collection('users').get();
    const registered = usersSnap.docs.some((d) => {
      const p = String(d.data().phone || '').replace(/\D/g, '');
      let pl = p;
      if (pl.startsWith('972')) pl = `0${pl.slice(3)}`;
      return pl === phone;
    });
    const adminPhones = (process.env.SMS_ADMIN_PHONES || '')
      .split(',')
      .map((x) => normalizePhone(x.trim()))
      .filter(Boolean);
    if (!registered && !adminPhones.includes(phone)) {
      throw new HttpsError('permission-denied', 'not_registered');
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const expiresAt = Date.now() + 5 * 60 * 1000;
    await db.collection('clubs').doc(clubId()).collection('otp').doc(`manager_${phone}`).set({
      phone,
      purpose: 'manager_login',
      codeHash,
      expiresAt,
      attempts: 0,
      lastSentAt: Date.now(),
    });

    const brand = process.env.SMS_BRAND_NAME || 'ChainSign';
    const sms = await sendSms4Free(phone, `${brand}: קוד התחברות ${code}`);
    const testMode = process.env.SMS_OTP_TEST_MODE === 'true';
    return {
      phone,
      expiresInSec: 300,
      testMode,
      testCode: testMode ? code : undefined,
      message: testMode ? 'מצב בדיקה' : sms.ok ? 'נשלח' : sms.message,
    };
  }
);

export const verifyManagerOtp = onCall({ region: 'europe-west1' }, async (request) => {
  const phone = normalizePhone(String(request.data?.phone || ''));
  const code = String(request.data?.code || '').trim();
  if (!phone || !code) throw new HttpsError('invalid-argument', 'missing_fields');

  const db = getFirestore();
  const otpRef = db.collection('clubs').doc(clubId()).collection('otp').doc(`manager_${phone}`);
  const otpSnap = await otpRef.get();
  if (!otpSnap.exists) throw new HttpsError('not-found', 'not_found');
  const otp = otpSnap.data()!;
  if (Date.now() > Number(otp.expiresAt)) {
    await otpRef.delete();
    throw new HttpsError('deadline-exceeded', 'expired');
  }
  if (Number(otp.attempts || 0) >= 5) throw new HttpsError('resource-exhausted', 'too_many_attempts');
  const codeHash = crypto.createHash('sha256').update(code).digest('hex');
  if (codeHash !== otp.codeHash) {
    await otpRef.update({ attempts: Number(otp.attempts || 0) + 1 });
    throw new HttpsError('unauthenticated', 'invalid_code');
  }
  await otpRef.delete();

  const usersCol = db.collection('clubs').doc(clubId()).collection('users');
  const usersSnap = await usersCol.get();
  let profile = usersSnap.docs.find((d) => {
    const p = String(d.data().phone || '').replace(/\D/g, '');
    let pl = p;
    if (pl.startsWith('972')) pl = `0${pl.slice(3)}`;
    return pl === phone;
  });

  if (!profile) {
    const adminPhones = (process.env.SMS_ADMIN_PHONES || '')
      .split(',')
      .map((x) => normalizePhone(x.trim()))
      .filter(Boolean);
    if (!adminPhones.includes(phone)) {
      throw new HttpsError('permission-denied', 'not_registered');
    }
  }

  const profileData = profile?.data() || {};
  const role = (profileData.role as SystemRole) || 'SYSTEM_ADMIN';
  const name = String(profileData.name || `מנהל ${phone.slice(-4)}`);
  const realEmail = String(profileData.email || '').trim().toLowerCase();
  const useEmail = realEmail && !realEmail.endsWith('@sms.local') ? realEmail : '';

  let fbUser;
  if (useEmail) {
    try {
      fbUser = await getAuth().getUserByEmail(useEmail);
    } catch {
      fbUser = await getAuth().createUser({
        email: useEmail,
        displayName: name,
        emailVerified: true,
        phoneNumber: `+972${phone.slice(1)}`,
      });
    }
  } else {
    const email = `${phone}@sms.local`;
    try {
      fbUser = await getAuth().getUserByEmail(email);
    } catch {
      fbUser = await getAuth().createUser({
        email,
        displayName: name,
        phoneNumber: `+972${phone.slice(1)}`,
      });
    }
  }

  const e164 = `+972${phone.slice(1)}`;
  if (fbUser.phoneNumber !== e164) {
    try {
      fbUser = await getAuth().updateUser(fbUser.uid, { phoneNumber: e164 });
    } catch {
      try {
        const other = await getAuth().getUserByPhoneNumber(e164);
        if (other.uid !== fbUser.uid) {
          await getAuth().updateUser(other.uid, { phoneNumber: null });
          fbUser = await getAuth().updateUser(fbUser.uid, { phoneNumber: e164 });
        }
      } catch {
        // ignore
      }
    }
  }

  await getAuth().setCustomUserClaims(fbUser.uid, { role, clubId: clubId(), phone });

  const now = new Date().toISOString();
  const profileEmail = useEmail || `${phone}@sms.local`;
  const userDoc = {
    id: fbUser.uid,
    email: profileEmail,
    name,
    phone,
    role,
    picture: profileData.picture || null,
    createdAt: profileData.createdAt || now,
    lastLoginAt: now,
  };
  await usersCol.doc(fbUser.uid).set(userDoc, { merge: true });

  // מחיקת כפילויות SMS/אימייל
  for (const d of usersSnap.docs) {
    if (d.id === fbUser.uid) continue;
    const data = d.data();
    const p = String(data.phone || '').replace(/\D/g, '');
    let pl = p;
    if (pl.startsWith('972')) pl = `0${pl.slice(3)}`;
    const samePhone = pl === phone;
    const sameEmail =
      Boolean(profileEmail) &&
      String(data.email || '')
        .trim()
        .toLowerCase() === profileEmail;
    const synthetic =
      String(data.email || '')
        .trim()
        .toLowerCase()
        .endsWith('@sms.local');
    if (sameEmail || (samePhone && synthetic)) {
      await d.ref.delete().catch(() => undefined);
    }
  }

  const customToken = await getAuth().createCustomToken(fbUser.uid, {
    role,
    clubId: clubId(),
    phone,
  });

  return { customToken, user: userDoc };
});

export const createClubUser = onCall({ region: 'europe-west1' }, async (request) => {
  requireAdmin(request.auth);
  const name = String(request.data?.name || '').trim();
  const email = String(request.data?.email || '').trim().toLowerCase();
  const phoneRaw = String(request.data?.phone || '').trim();
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  const role: SystemRole = request.data?.role === 'SYSTEM_ADMIN' ? 'SYSTEM_ADMIN' : 'MANAGER';
  if (!name) throw new HttpsError('invalid-argument', 'missing_name');
  if (!email && !phone) throw new HttpsError('invalid-argument', 'missing_contact');

  let fbUser;
  if (email) {
    try {
      fbUser = await getAuth().getUserByEmail(email);
    } catch {
      fbUser = await getAuth().createUser({ email, displayName: name, emailVerified: false });
    }
  } else {
    const synthetic = `${phone}@sms.local`;
    try {
      fbUser = await getAuth().getUserByEmail(synthetic);
    } catch {
      fbUser = await getAuth().createUser({
        email: synthetic,
        displayName: name,
        phoneNumber: phone ? `+972${phone.slice(1)}` : undefined,
      });
    }
  }

  await getAuth().setCustomUserClaims(fbUser.uid, {
    role,
    clubId: clubId(),
    ...(phone ? { phone } : {}),
  });

  const now = new Date().toISOString();
  const user = {
    id: fbUser.uid,
    email: email || `${phone}@sms.local`,
    name,
    phone: phone || null,
    role,
    createdAt: now,
    lastLoginAt: now,
  };
  await getFirestore().collection('clubs').doc(clubId()).collection('users').doc(fbUser.uid).set(user);
  return { user };
});

export const updateClubUserRole = onCall({ region: 'europe-west1' }, async (request) => {
  requireAdmin(request.auth);
  const userId = String(request.data?.userId || '');
  const role: SystemRole = request.data?.role === 'SYSTEM_ADMIN' ? 'SYSTEM_ADMIN' : 'MANAGER';
  if (!userId) throw new HttpsError('invalid-argument', 'missing_user');

  const ref = getFirestore().collection('clubs').doc(clubId()).collection('users').doc(userId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'user_not_found');
  const data = snap.data()!;
  await getAuth().setCustomUserClaims(userId, {
    role,
    clubId: clubId(),
    ...(data.phone ? { phone: data.phone } : {}),
  });
  await ref.update({ role });
  return { user: { ...data, id: userId, role } };
});

export const deleteClubUser = onCall({ region: 'europe-west1' }, async (request) => {
  requireAdmin(request.auth);
  const userId = String(request.data?.userId || '');
  if (!userId) throw new HttpsError('invalid-argument', 'missing_user');
  if (userId === request.auth!.uid) {
    throw new HttpsError('failed-precondition', 'cannot_delete_self');
  }
  const usersCol = getFirestore().collection('clubs').doc(clubId()).collection('users');
  const admins = (await usersCol.where('role', '==', 'SYSTEM_ADMIN').get()).docs;
  const target = await usersCol.doc(userId).get();
  if (target.exists && target.data()?.role === 'SYSTEM_ADMIN' && admins.length <= 1) {
    throw new HttpsError('failed-precondition', 'last_admin');
  }
  await usersCol.doc(userId).delete();
  try {
    await getAuth().deleteUser(userId);
  } catch {
    // ignore
  }
  return { ok: true };
});

export { dailyManagerDigest } from './dailyDigest';

/** HTTP /api/* — built by `node ../scripts/bundle-api.mjs` into lib/httpApi.js */
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const api = require('./httpApi').api;
