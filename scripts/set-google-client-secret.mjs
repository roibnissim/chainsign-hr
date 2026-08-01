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

const key = 'GOOGLE_CLIENT_ID';
if (!env[key]) {
  console.error('missing', key);
  process.exit(1);
}

const tmp = path.join(root, `.secret-${key}.tmp`);
fs.writeFileSync(tmp, env[key], 'utf8');
const firebaseJs = path.join(root, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
const r = spawnSync(
  process.execPath,
  [firebaseJs, 'functions:secrets:set', key, `--data-file=${tmp}`, '--force'],
  { encoding: 'utf8' }
);
try {
  fs.unlinkSync(tmp);
} catch {
  // ignore
}
console.log(r.stdout || '');
console.log(r.stderr || '');
process.exit(r.status || 0);
