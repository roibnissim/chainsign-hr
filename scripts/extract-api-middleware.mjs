import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, '..', 'server');

const plugins = [
  { file: 'authApiPlugin.ts', pluginFn: 'authApiPlugin', exportName: 'authApiMiddleware' },
  { file: 'uploadApiPlugin.ts', pluginFn: 'uploadApiPlugin', exportName: 'uploadApiMiddleware' },
  { file: 'onboardingApiPlugin.ts', pluginFn: 'onboardingApiPlugin', exportName: 'onboardingApiMiddleware' },
  { file: 'signingApiPlugin.ts', pluginFn: 'signingApiPlugin', exportName: 'signingApiMiddleware' },
  { file: 'activityLogApiPlugin.ts', pluginFn: 'activityLogApiPlugin', exportName: 'activityLogApiMiddleware' },
];

function extract(file, pluginFn, exportName) {
  const p = path.join(dir, file);
  let text = fs.readFileSync(p, 'utf8');
  if (text.includes(`export async function ${exportName}`)) {
    console.log(`${file}: already extracted`);
    return;
  }

  const pluginStart = text.indexOf(`export function ${pluginFn}(): Plugin`);
  if (pluginStart < 0) throw new Error(`plugin not found: ${pluginFn}`);

  const useNeedle = 'server.middlewares.use(async (req, res, next) => {';
  const useIdx = text.indexOf(useNeedle, pluginStart);
  if (useIdx < 0) throw new Error(`middleware use not found in ${file}`);

  const bodyStart = useIdx + useNeedle.length - 1; // points at '{'
  let depth = 0;
  let i = bodyStart;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }
  const bodyEnd = i;
  const afterMatch = text.slice(bodyEnd).match(/^\s*\)\s*;/);
  if (!afterMatch) throw new Error(`expected ); after middleware in ${file}`);
  const useEnd = bodyEnd + afterMatch[0].length;

  const asyncBody = text.slice(bodyStart, bodyEnd);
  const nameMatch = text.slice(pluginStart, useIdx).match(/name:\s*'([^']+)'/);
  if (!nameMatch) throw new Error(`plugin name not found in ${file}`);
  const pluginName = nameMatch[1];

  const middlewareFn =
    `export async function ${exportName}(\n` +
    `  req: import('http').IncomingMessage & { url?: string },\n` +
    `  res: import('http').ServerResponse,\n` +
    `  next: (err?: unknown) => void\n` +
    `) ${asyncBody}\n\n`;

  const newPlugin =
    `export function ${pluginFn}(): Plugin {\n` +
    `  return {\n` +
    `    name: '${pluginName}',\n` +
    `    configureServer(server) {\n` +
    `      server.middlewares.use(${exportName});\n` +
    `    },\n` +
    `  };\n` +
    `}`;

  // Find end of original plugin function (from pluginStart to matching braces of export function)
  const fnBrace = text.indexOf('{', pluginStart);
  let d = 0;
  let j = fnBrace;
  for (; j < text.length; j++) {
    if (text[j] === '{') d++;
    else if (text[j] === '}') {
      d--;
      if (d === 0) {
        j++;
        break;
      }
    }
  }

  const before = text.slice(0, pluginStart);
  const after = text.slice(j);
  const out = before + middlewareFn + newPlugin + after;
  fs.writeFileSync(p, out, 'utf8');
  console.log(`${file}: extracted ${exportName}`);
}

for (const spec of plugins) {
  extract(spec.file, spec.pluginFn, spec.exportName);
}
