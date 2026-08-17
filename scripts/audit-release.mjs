#!/usr/bin/env node
/**
 * Release safety audit.
 *
 * Runs against the staged runtime and (when present) the packed output, and
 * fails the build if anything that belongs to the build machine or its operator
 * would ship to users. This exists because such leaks are silent: an installer
 * with a stray credential looks exactly like a clean one.
 *
 * Checked:
 *   1. no DSH user-data files (.credentials.yaml, settings.yaml, sessions, storages)
 *   2. no credential-shaped strings in text files
 *   3. no build-machine paths or usernames in shipped metadata
 *   4. no environment dumps (.env and friends)
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, userInfo } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT = resolve(HERE, '..');

/** Files that must never appear in a shipped tree, matched on basename. */
const FORBIDDEN_NAMES = new Set([
  '.credentials.yaml',
  '.credentials.yml',
  'settings.yaml',
  '.env',
  '.env.local',
  '.npmrc',
  'stage-source.txt',
]);

/** Directory names that indicate user data was copied in by mistake. */
const FORBIDDEN_DIRS = new Set(['sessions', 'storages', 'profiles']);

/** Only these extensions are scanned for secret-shaped text. */
const TEXT_EXTENSIONS = new Set(['.json', '.yaml', '.yml', '.txt', '.md', '.cfg', '.ini', '.log']);

/**
 * Credential-shaped patterns.
 *
 * Deliberately narrow: broad patterns match minified vendor code and produce
 * noise that trains people to ignore this check.
 */
const SECRET_PATTERNS = [
  { label: 'OpenAI-style key', re: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { label: 'Anthropic key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { label: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}/ },
  { label: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { label: 'Slack token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { label: 'private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { label: 'bearer token', re: /\bBearer\s+[A-Za-z0-9_\-.]{30,}/ },
];

/** Build-machine identifiers that must not travel with the artifact. */
const USERNAME = userInfo().username;
const MACHINE_PATTERNS = [
  { label: 'build-machine home path', re: new RegExp(`[A-Za-z]:\\\\+Users\\\\+${USERNAME}\\b`, 'i') },
  { label: 'build-machine home path', re: new RegExp(`[A-Za-z]:/Users/${USERNAME}\\b`, 'i') },
  { label: 'build-machine home path', re: new RegExp(homedir().replace(/[\\/]/g, '[\\\\/]+'), 'i') },
];

const findings = [];
let filesScanned = 0;

function record(severity, message, path) {
  findings.push({ severity, message, path });
}

/** Walk a tree, applying every check to each entry. */
function audit(root, label) {
  if (!existsSync(root)) return false;

  const walk = (current) => {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return; // unreadable directory is not a leak
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isSymbolicLink()) {
        if (/[\\/]runtime[\\/]/.test(full)) record('FAIL', 'symbolic link shipped inside runtime', full);
        continue;
      }
      if (entry.isDirectory()) {
        // Only a user-data directory sitting at the DSH home root is a leak.
        // Package source trees legitimately contain folders named `sessions`
        // (e.g. the Anthropic SDK's resources), and flagging those trains
        // people to ignore this check.
        if (
          FORBIDDEN_DIRS.has(entry.name.toLowerCase()) &&
          !/[\\/]node_modules[\\/]/.test(full) &&
          /[\\/]runtime[\\/]dsh[\\/][^\\/]+$/i.test(full)
        ) {
          record('FAIL', `user-data directory shipped: ${entry.name}/`, full);
        }
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;

      if (FORBIDDEN_NAMES.has(entry.name.toLowerCase())) {
        record('FAIL', `user-data file shipped: ${entry.name}`, full);
      }

      const ext = extname(entry.name).toLowerCase();
      if (!TEXT_EXTENSIONS.has(ext)) continue;
      // Vendor docs and licenses are noise; they carry no build-machine state.
      if (/[\\/]node_modules[\\/]/.test(full) && (ext === '.md' || ext === '.txt')) continue;

      let size;
      try {
        size = statSync(full).size;
      } catch {
        continue;
      }
      if (size > 2 * 1024 * 1024) continue;

      let text;
      try {
        text = readFileSync(full, 'utf8');
      } catch {
        continue;
      }
      filesScanned += 1;

      for (const { label: what, re } of SECRET_PATTERNS) {
        if (re.test(text)) record('FAIL', `possible ${what}`, full);
      }
      // Machine paths inside vendor packages come from upstream build metadata,
      // not from this build, so only our own emitted files are held to it.
      if (!/[\\/]node_modules[\\/]/.test(full)) {
        for (const { label: what, re } of MACHINE_PATTERNS) {
          if (re.test(text)) record('WARN', `${what} in shipped metadata`, full);
        }
      }
    }
  };

  walk(root);
  console.log(`[audit] scanned ${label}`);
  return true;
}

console.log('[audit] release safety audit\n');

const targets = [
  [join(PROJECT, 'runtime'), 'runtime/'],
  [join(PROJECT, 'dist'), 'dist/'],
];
let auditedAny = false;
for (const [path, label] of targets) {
  if (audit(path, label)) auditedAny = true;
}

if (!auditedAny) {
  console.error('[audit] nothing to audit — run `npm run stage` first');
  process.exit(1);
}

const fails = findings.filter((f) => f.severity === 'FAIL');
const warns = findings.filter((f) => f.severity === 'WARN');

console.log(`[audit] text files scanned: ${filesScanned}`);

for (const { severity, message, path } of [...fails, ...warns]) {
  console.log(`  [${severity}] ${message}\n          ${path}`);
}

if (fails.length > 0) {
  console.error(`\n[audit] FAILED — ${fails.length} blocking issue(s); artifacts must not be distributed.`);
  process.exit(1);
}
if (warns.length > 0) {
  console.warn(`\n[audit] passed with ${warns.length} warning(s) — review before publishing.`);
  process.exit(0);
}
console.log('\n[audit] clean — no user data, credentials, or build-machine paths found.');
