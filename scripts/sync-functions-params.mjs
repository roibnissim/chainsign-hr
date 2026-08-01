import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pathEnv = path.join(root, 'functions', '.env.chainsign-hr');
let t = '';
try {
  t = fs.readFileSync(pathEnv, 'utf8');
} catch {
  t = '';
}
const rootEnv = fs.readFileSync(path.join(root, '.env'), 'utf8');
function get(k) {
  const m = rootEnv.match(new RegExp(`^${k}=(.*)$`, 'm'));
  return m ? m[1].replace(/^["']|["']$/g, '') : '';
}
const email = get('GOOGLE_ADMIN_EMAILS');
const club = get('CLUB_ID') || 'asa-tlv';
const lines = t.split(/\r?\n/).filter(Boolean);
function set(k, v) {
  const i = lines.findIndex((l) => l.startsWith(`${k}=`));
  const row = `${k}=${v}`;
  if (i >= 0) lines[i] = row;
  else lines.push(row);
}
if (email) set('GOOGLE_ADMIN_EMAILS', email);
set('CLUB_ID', club);
fs.writeFileSync(pathEnv, `${lines.join('\n')}\n`);
console.log('updated functions env keys:', lines.map((l) => l.split('=')[0]).join(','));
