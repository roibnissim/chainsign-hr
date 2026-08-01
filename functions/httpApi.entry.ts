/**
 * Cloud Functions HTTP API entry (bundled by scripts/bundle-api.mjs → lib/httpApi.js).
 * Not compiled by functions/tsc — lives outside functions/src.
 */
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import { createApiApp } from '../server/apiApp';

const clubIdParam = defineString('CLUB_ID', { default: 'asa-tlv' });
const googleAdminEmails = defineString('GOOGLE_ADMIN_EMAILS', { default: '' });

const smsKey = defineSecret('SMS4FREE_KEY');
const smsUser = defineSecret('SMS4FREE_USER');
const smsPass = defineSecret('SMS4FREE_PASS');
const smsSender = defineSecret('SMS4FREE_SENDER');
const jwtSecret = defineSecret('JWT_SECRET');
const googleClientId = defineSecret('GOOGLE_CLIENT_ID');
const firebaseSaJson = defineSecret('SERVICE_ACCOUNT_JSON');

let cachedApp: ReturnType<typeof createApiApp> | null = null;

function ensureEnvFromSecrets() {
  process.env.CLUB_ID = clubIdParam.value() || process.env.CLUB_ID || 'asa-tlv';
  process.env.VITE_CLUB_ID = process.env.CLUB_ID;
  process.env.SMS4FREE_KEY = smsKey.value();
  process.env.SMS4FREE_USER = smsUser.value();
  process.env.SMS4FREE_PASS = smsPass.value();
  process.env.SMS4FREE_SENDER = smsSender.value();
  process.env.JWT_SECRET = jwtSecret.value();
  process.env.GOOGLE_CLIENT_ID = googleClientId.value();
  process.env.VITE_GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  process.env.SERVICE_ACCOUNT_JSON = firebaseSaJson.value();
  const admins = googleAdminEmails.value();
  if (admins) process.env.GOOGLE_ADMIN_EMAILS = admins;
  if (!process.env.FIREBASE_PROJECT_ID) {
    process.env.FIREBASE_PROJECT_ID =
      process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'chainsign-hr';
  }
}

export const api = onRequest(
  {
    region: 'europe-west1',
    memory: '512MiB',
    timeoutSeconds: 120,
    cors: true,
    secrets: [
      smsKey,
      smsUser,
      smsPass,
      smsSender,
      jwtSecret,
      googleClientId,
      firebaseSaJson,
    ],
    invoker: 'public',
  },
  (req, res) => {
    try {
      ensureEnvFromSecrets();
      if (!cachedApp) cachedApp = createApiApp();
      return cachedApp(req, res);
    } catch (err) {
      console.error('[api]', err);
      res.status(500).json({
        error: 'server_error',
        message: err instanceof Error ? err.message : 'unknown',
      });
    }
  }
);
