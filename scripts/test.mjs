import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const tests = readdirSync(new URL('../tests/', import.meta.url)).filter(file => file.endsWith('.test.mjs')).map(file => `tests/${file}`);
const result = spawnSync(process.execPath, ['--test', ...tests], { cwd: root, stdio: 'inherit' });
process.exitCode = result.status ?? 1;
