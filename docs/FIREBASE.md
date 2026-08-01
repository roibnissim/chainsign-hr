# Firebase setup (ChainSign HR)

## Prerequisites

1. `npx -y firebase-tools@latest login --reauth`
2. Active project: `npx -y firebase-tools@latest use chainsign-hr`
3. Web app config in `.env` / `.env.production` (`VITE_FIREBASE_*`)
4. Local Admin only: `service-account.json` via `GOOGLE_APPLICATION_CREDENTIALS` (dev)

## Architecture (production)

| Layer | Role |
|-------|------|
| **Firebase Hosting** | Vite SPA (`dist/`) |
| **Cloud Function `api`** | HTTP `/api/**` (auth, onboarding, signing, upload, activity) |
| **Callables** | Manager SMS OTP + user admin |
| **`dailyManagerDigest`** | Email at 13:00 Asia/Jerusalem |

Hosting rewrite: `/api/**` → function `api` (`europe-west1`), then SPA `**` → `/index.html`.

## Enable flags (local staged)

```env
VITE_USE_FIREBASE=true
# or per-stage:
VITE_USE_FIREBASE_AUTH=true
VITE_USE_FIRESTORE=true
VITE_USE_FIREBASE_STORAGE=true
```

## Emulators

```bash
npx -y firebase-tools@latest emulators:start
```

Set `VITE_USE_FIREBASE_EMULATORS=true`.

## Cloud Function secrets (once)

```bash
npx -y firebase-tools@latest functions:secrets:set SMS4FREE_KEY
npx -y firebase-tools@latest functions:secrets:set SMS4FREE_USER
npx -y firebase-tools@latest functions:secrets:set SMS4FREE_PASS
npx -y firebase-tools@latest functions:secrets:set SMS4FREE_SENDER
npx -y firebase-tools@latest functions:secrets:set JWT_SECRET
npx -y firebase-tools@latest functions:secrets:set RESEND_API_KEY
```

Optional params: `CLUB_ID` (default `asa-tlv`), `RESEND_FROM`.

## Production build + deploy

1. Ensure [`.env.production`](../.env.production) has `VITE_USE_FIREBASE=true`, Firebase web config, and `VITE_USE_FIREBASE_EMULATORS=false`.
2. Deploy:

```bash
npm run deploy:prod
```

This runs:

- `vite build --mode production` → `dist/`
- `functions` build (`tsc` + esbuild bundle of `server/` API → `lib/httpApi.js`)
- `firebase deploy --only hosting,functions,firestore:rules,storage`

Manual pieces:

```bash
npm run build:prod
npm --prefix functions run build
npx -y firebase-tools@latest deploy --only hosting,functions,firestore:rules,storage
```

## After first deploy (console)

1. **Authentication → Authorized domains** — add `chainsign-hr.web.app` / custom domain
2. **Google OAuth client** — Authorized JavaScript origins + redirect URIs for the Hosting URL
3. Smoke: manager login, signing invite `/?sign=…`, onboarding/upload portals

## Migrate local data

In the browser (while logged in with Firebase Auth):

```js
const { migrateLocalStorageToFirestore } = await import('/src/services/migrateLocal.ts');
await migrateLocalStorageToFirestore();
```

## Dev note

Vite plugins in `server/*ApiPlugin.ts` share middleware with Cloud Function `api` via [`server/apiApp.ts`](../server/apiApp.ts). Local `npm run dev` still mounts the same handlers unless `DISABLE_LOCAL_DATA_API=true`.
