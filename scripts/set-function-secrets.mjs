import fs from 'fs';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

const env = {};
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const keys = [
  'JWT_SECRET',
  'SMS4FREE_KEY',
  'SMS4FREE_USER',
  'SMS4FREE_PASS',
  'SMS4FREE_SENDER',
];

const firebaseJs = path.join(root, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
const log = [];

for (const key of keys) {
  if (!env[key]) {
    console.error('missing', key);
    process.exit(1);
  }
  const tmp = path.join(root, `.secret-${key}.tmp`);
  fs.writeFileSync(tmp, env[key], 'utf8');
  const r = spawnSync(
    process.execPath,
    [firebaseJs, 'functions:secrets:set', key, `--data-file=${tmp}`, '--force'],
    { encoding: 'utf8' }
  );
  log.push(`=== ${key} ===`);
  log.push(r.stdout || '');
  log.push(r.stderr || '');
  log.push(`status=${r.status}`);
  try {
    fs.unlinkSync(tmp);
  } catch {
    // ignore
  }
  if (r.status !== 0) {
    fs.writeFileSync('secrets-log.txt', log.join('\n'));
    process.exit(r.status || 1);
  }
}

fs.writeFileSync('secrets-log.txt', log.join('\n') + '\nDONE\n');
console.log('secrets set ok');
