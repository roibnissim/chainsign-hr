/**
 * מחיקת כל אירועי הלוג מ-Firestore.
 * Usage: node scripts/clear-activity-log.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

// CJS require of firebase-admin
const adminModule = require('firebase-admin');
const admin = adminModule.default ?? adminModule;

const saPath = path.join(root, 'service-account.json');
if (!fs.existsSync(saPath)) {
  console.error('Missing service-account.json');
  process.exit(1);
}

const sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));
const existing = admin.apps?.length ? admin.app() : null;
const app =
  existing ||
  admin.initializeApp({
    credential: admin.credential.cert(sa),
  });

const clubId = process.env.CLUB_ID || process.env.VITE_CLUB_ID || 'asa-tlv';
const db = admin.firestore(app);
const col = db.collection('clubs').doc(clubId).collection('activityEvents');

const snap = await col.get();
console.log(`Found ${snap.size} activity events in clubs/${clubId}/activityEvents`);
let deleted = 0;
let batch = db.batch();
let ops = 0;
for (const doc of snap.docs) {
  const data = doc.data();
  console.log(
    ` - delete ${doc.id} :: ${data.employeeName || ''} :: ${String(data.description || '').slice(0, 80)}`
  );
  batch.delete(doc.ref);
  ops += 1;
  deleted += 1;
  if (ops >= 400) {
    await batch.commit();
    batch = db.batch();
    ops = 0;
  }
}
if (ops > 0) await batch.commit();
console.log(`Deleted ${deleted} events.`);
process.exit(0);
