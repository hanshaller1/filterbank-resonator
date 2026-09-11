import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { PARAMETERS } from '../src/state/parameters.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const walk = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
const files = [path.join(root, 'server.js'), ...walk(path.join(root, 'src')).filter(file => file.endsWith('.js'))];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) throw Error(result.stderr || `Syntax check failed: ${file}`);
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/(?:from\s+|import\s+|new URL\(\s*)['"](\.[^'"]+)['"]/g)) {
    if (!existsSync(path.resolve(path.dirname(file), match[1]))) throw Error(`Missing module: ${file} → ${match[1]}`);
  }
}
const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
if (new Set(ids).size !== ids.length) throw Error('Duplicate HTML IDs');
for (const p of Object.values(PARAMETERS)) if (p.control && !ids.includes(p.control)) throw Error(`Missing control: ${p.control}`);
for (const match of html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g)) if (!existsSync(path.resolve(root, match[1]))) throw Error(`Missing asset: ${match[1]}`);
console.log(`${files.length} JavaScript files, module imports, assets and ${ids.length} HTML IDs checked.`);
