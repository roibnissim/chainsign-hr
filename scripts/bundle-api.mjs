/**
 * Bundle server/apiApp (+ plugins) into functions/lib/httpApi.js for Cloud Functions.
 * Externals: firebase-admin, firebase-functions (provided by runtime / functions deps).
 */
import * as esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(root, 'functions', 'httpApi.entry.ts');
const outfile = path.join(root, 'functions', 'lib', 'httpApi.js');

fs.mkdirSync(path.dirname(outfile), { recursive: true });

await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile,
  sourcemap: true,
  external: [
    'firebase-admin',
    'firebase-admin/*',
    'firebase-functions',
    'firebase-functions/*',
    'vite',
  ],
  logLevel: 'info',
});

console.log('[bundle-api] wrote', outfile);
