/**
 * One-shot migration: reads exported HR JSON and writes to Firestore.
 *
 * Usage (after Firebase Auth as admin + VITE_FIREBASE_* set):
 *   1. In browser console on the app: copy(JSON.stringify({
 *        employees: JSON.parse(localStorage.blocksalary_employees||'[]'),
 *        agreements: JSON.parse(localStorage.blocksalary_agreements||'[]'),
 *        templates: JSON.parse(localStorage.club_agreement_templates_v4||'[]'),
 *        fileDocuments: JSON.parse(localStorage.blocksalary_employee_docs||'[]'),
 *        branding: JSON.parse(localStorage.club_branding_settings||'null'),
 *      }))
 *   2. Save to scripts/local-export.json
 *   3. Or use the in-app helper migrateLocalStorageToFirestore() from src/services/migrateLocal.ts
 *
 * This Node script requires firebase-admin + FIREBASE_SERVICE_ACCOUNT_JSON.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

async function main() {
  const exportPath = process.argv[2] || path.resolve('scripts/local-export.json');
  if (!fs.existsSync(exportPath)) {
    console.error('Missing export file:', exportPath);
    console.error('Create it from localStorage (see file header) or pass a path.');
    process.exit(1);
  }

  const { ensureFirebaseAdmin, getClubIdServer } = await import('../server/auth/firebaseAdmin.ts');
  const admin = ensureFirebaseAdmin();
  const db = admin.firestore();
  const clubId = getClubIdServer();
  const data = JSON.parse(fs.readFileSync(exportPath, 'utf-8'));

  const batchWrite = async (colName, rows) => {
    if (!Array.isArray(rows) || !rows.length) return 0;
    let n = 0;
    for (const row of rows) {
      const id = row.id || `mig-${Date.now()}-${n}`;
      const { fileDataUrl, pdfUrl, ...rest } = row;
      await db.collection('clubs').doc(clubId).collection(colName).doc(id).set(
        {
          ...rest,
          id,
          ...(typeof fileDataUrl === 'string' && fileDataUrl.startsWith('http')
            ? { fileDataUrl }
            : {}),
          ...(typeof pdfUrl === 'string' && pdfUrl.startsWith('http') ? { pdfUrl } : {}),
          migratedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      n += 1;
    }
    return n;
  };

  const e = await batchWrite('employees', data.employees);
  const a = await batchWrite('agreements', data.agreements);
  const t = await batchWrite('templates', data.templates);
  const d = await batchWrite('fileDocuments', data.fileDocuments);

  if (data.branding) {
    const { logoDataUrl, ...brandRest } = data.branding;
    await db
      .collection('clubs')
      .doc(clubId)
      .set(
        {
          id: clubId,
          branding: {
            ...brandRest,
            ...(typeof logoDataUrl === 'string' && logoDataUrl.startsWith('http')
              ? { logoDataUrl }
              : { logoDataUrl: null }),
          },
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
  }

  console.log(`Migrated club=${clubId}: employees=${e} agreements=${a} templates=${t} docs=${d}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
