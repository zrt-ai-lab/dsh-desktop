#!/usr/bin/env node
/**
 * Stage the self-contained DSH runtime into ./runtime, which electron-builder
 * ships verbatim as extraResources.
 *
 * Layout produced:
 *   runtime/node/node.exe          the Node binary the backend runs under
 *   runtime/dsh/package.json       the npx-style installation manifest
 *   runtime/dsh/node_modules/**    the full dependency tree (cordis resolves
 *                                  plugin bundles from here at runtime, so it
 *                                  must stay a real directory tree — never
 *                                  bundled into a single file)
 *
 * Source of truth is the npx cache DSH already booted from; override with
 * DSH_SOURCE_ROOT when staging from a different installation.
 */
import { cpSync, existsSync, mkdirSync, rmSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = resolve(HERE, '..');
const RUNTIME = join(PROJECT, 'runtime');

/** Locate the DSH installation to stage from. */
function resolveSourceRoot() {
  const override = process.env.DSH_SOURCE_ROOT;
  if (override) {
    if (!existsSync(join(override, 'node_modules', '@deepseek-ai', 'dsh'))) {
      throw new Error(`DSH_SOURCE_ROOT does not contain node_modules/@deepseek-ai/dsh: ${override}`);
    }
    return override;
  }
  const npxCache = join(process.env.LOCALAPPDATA ?? '', 'npm-cache', '_npx');
  if (!existsSync(npxCache)) {
    throw new Error('no npx cache found; set DSH_SOURCE_ROOT to a directory containing node_modules/@deepseek-ai/dsh');
  }
  const candidates = readdirSync(npxCache)
    .map((entry) => join(npxCache, entry))
    .filter((dir) => existsSync(join(dir, 'node_modules', '@deepseek-ai', 'dsh')))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  const found = candidates[0];
  if (!found) {
    throw new Error('no @deepseek-ai/dsh installation found in the npx cache; run `npx @deepseek-ai/dsh web` once, or set DSH_SOURCE_ROOT');
  }
  return found;
}

/**
 * Copy a tree, dereferencing junctions/symlinks.
 *
 * npx installs profile dependencies as Windows junctions pointing back into the
 * cache. A packaged app cannot carry those links, so every entry is
 * materialized as real files.
 */
function copyTree(from, to) {
  cpSync(from, to, { recursive: true, dereference: true, force: true });
}

function directorySizeMb(dir) {
  let total = 0;
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) total += statSync(full).size;
    }
  };
  walk(dir);
  return (total / 1024 / 1024).toFixed(1);
}

const sourceRoot = resolveSourceRoot();
console.log(`[stage] DSH source: ${sourceRoot}`);

rmSync(RUNTIME, { recursive: true, force: true });
mkdirSync(join(RUNTIME, 'node'), { recursive: true });
mkdirSync(join(RUNTIME, 'dsh'), { recursive: true });

// 1. the Node binary the backend runs under.
const nodeExe = process.execPath;
console.log(`[stage] node binary: ${nodeExe}`);
cpSync(nodeExe, join(RUNTIME, 'node', 'node.exe'));

// 2. the DSH installation itself.
console.log('[stage] copying node_modules (dereferencing junctions, this takes a minute)...');
copyTree(join(sourceRoot, 'node_modules'), join(RUNTIME, 'dsh', 'node_modules'));
for (const manifest of ['package.json', 'package-lock.json']) {
  const src = join(sourceRoot, manifest);
  if (existsSync(src)) cpSync(src, join(RUNTIME, 'dsh', manifest));
}

// 3. record what was staged, for support and for the About box.
const dshManifest = JSON.parse(
  execFileSync(nodeExe, [
    '-p',
    'JSON.stringify(require(process.argv[1]))',
    join(RUNTIME, 'dsh', 'node_modules', '@deepseek-ai', 'dsh', 'package.json'),
  ]).toString(),
);
writeFileSync(
  join(RUNTIME, 'stage.json'),
  `${JSON.stringify(
    {
      dshVersion: dshManifest.version,
      nodeVersion: process.version,
      stagedAt: new Date().toISOString(),
      // sourceRoot is intentionally omitted: it contains the build machine's
      // local path and must not be shipped in release artifacts.
    },
    null,
    2,
  )}\n`,
);

console.log(`[stage] dsh version : ${dshManifest.version}`);
console.log(`[stage] node version: ${process.version}`);
console.log(`[stage] runtime size: ${directorySizeMb(RUNTIME)} MB`);
console.log('[stage] done -> runtime/');
