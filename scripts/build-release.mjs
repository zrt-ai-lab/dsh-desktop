#!/usr/bin/env node
/** Build desktop artifacts with the exact staged official DSH version. */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = resolve(HERE, '..');
const stagePath = join(PROJECT, 'runtime', 'stage.json');
const builderCli = join(PROJECT, 'node_modules', 'electron-builder', 'cli.js');

if (!existsSync(stagePath)) throw new Error('runtime/stage.json is missing; run `npm run stage` first');
if (!existsSync(builderCli)) throw new Error('electron-builder is missing; run `npm ci` first');

const stage = JSON.parse(readFileSync(stagePath, 'utf8'));
const dshVersion = stage.dshVersion;
if (typeof dshVersion !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(dshVersion)) {
  throw new Error(`runtime/stage.json contains an invalid DSH version: ${String(dshVersion)}`);
}

console.log(`[build] artifact and application version: ${dshVersion}`);
const result = spawnSync(
  process.execPath,
  [
    builderCli,
    ...process.argv.slice(2),
    '--publish',
    'never',
    `-c.extraMetadata.version=${dshVersion}`,
  ],
  { cwd: PROJECT, stdio: 'inherit' },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
