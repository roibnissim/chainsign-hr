/**
 * מחיקת כל אירועי הלוג מ-Firestore.
 * Usage: node scripts/clear-activity-log.cjs
 */
const fs = require('fs');
const path = require('path');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const root = path.resolve(__dirname, '..');
const saPath = path.join(root, 'service-account.json');
if (!fs.existsSync(saPath)) {
  console.error('Missing service-account.json');
  process.exit(1);
}

const sa = JSON.parse(fs.readFileSync(saPath, 'utf8'));
if (!getApps().length) {
  initializeApp({ credential: cert(sa) });
}

const clubId = process.env.CLUB_ID || process.env.VITE_CLUB_ID || 'asa-tlv';
const db = getFirestore();
const col = db.collection('clubs').doc(clubId).collection('activityEvents');

async function main() {
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
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
