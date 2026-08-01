/**
 * Replace local readBody helpers with shared readHttpBody import.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'server');
const files = [
  'authApiPlugin.ts',
  'uploadApiPlugin.ts',
  'onboardingApiPlugin.ts',
  'signingApiPlugin.ts',
  'activityLogApiPlugin.ts',
];

for (const file of files) {
  const p = path.join(dir, file);
  let text = fs.readFileSync(p, 'utf8');
  if (text.includes("from './httpBody'")) {
    console.log(file, 'already uses httpBody');
    continue;
  }

  // Remove local readBody function definitions (various styles)
  text = text.replace(
    /\nfunction readBody\([\s\S]*?\n\}\n/,
    '\n'
  );
  text = text.replace(
    /\nasync function readBody\([\s\S]*?\n\}\n/,
    '\n'
  );

  // Add import after first import block line that fits
  if (!text.includes("import { readHttpBody }")) {
    const firstImportEnd = text.indexOf('\n', text.indexOf('import '));
    // Prefer inserting after vite/plugin imports
    const insertAt = text.lastIndexOf('\nimport ', text.indexOf('\n\n'));
    const idx = insertAt >= 0 ? text.indexOf('\n', insertAt + 1) + 1 : firstImportEnd + 1;
    text =
      text.slice(0, idx) +
      "import { readHttpBody } from './httpBody';\n" +
      text.slice(idx);
  }

  text = text.replace(/\breadBody\s*\(/g, 'readHttpBody(');
  fs.writeFileSync(p, text);
  console.log(file, 'updated');
}
