import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

const saPath = path.join(root, 'service-account.json');
if (!fs.existsSync(saPath)) {
  console.error('missing service-account.json');
  process.exit(1);
}

const firebaseJs = path.join(root, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
const r = spawnSync(
  process.execPath,
  [
    firebaseJs,
    'functions:secrets:set',
    'SERVICE_ACCOUNT_JSON',
    `--data-file=${saPath}`,
    '--force',
  ],
  { encoding: 'utf8' }
);
console.log(r.stdout || '');
console.log(r.stderr || '');
process.exit(r.status || 0);
