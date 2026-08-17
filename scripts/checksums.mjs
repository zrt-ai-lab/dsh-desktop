#!/usr/bin/env node
/** Write SHA-256 checksums for distributable artifacts from the current build. */
import { createReadStream, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(HERE, '..', 'dist');
const platform = process.env.DSH_ARTIFACT_PLATFORM || process.platform;
const arch = process.env.DSH_ARTIFACT_ARCH || process.arch;
const outputName = `SHA256SUMS-${platform}-${arch}.txt`;

if (!existsSync(DIST)) throw new Error('dist/ does not exist; build release artifacts first');

const artifacts = readdirSync(DIST)
  .filter((name) => name.endsWith('.exe') || name.endsWith('.dmg'))
  .sort();
if (artifacts.length === 0) throw new Error('dist/ contains no .exe or .dmg release artifacts');

function sha256(path) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolveHash(hash.digest('hex')));
  });
}

const lines = [];
for (const artifact of artifacts) {
  lines.push(`${await sha256(join(DIST, artifact))}  ${basename(artifact)}`);
}
writeFileSync(join(DIST, outputName), `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
console.log(`[checksums] wrote dist/${outputName}`);
