import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function parseArg(flag, fallback = undefined) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

export function loadEnvFile(filePath = '.env.migration') {
  const resolved = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) return;

  const raw = fs.readFileSync(resolved, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function writeJsonFile(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

export function deterministicLegacyKey(value) {
  if (value === null || value === undefined) return null;
  return String(value);
}

export function deterministicPocketBaseLikeId(seed) {
  const source = String(seed);
  const hashHex = crypto.createHash('sha256').update(source).digest('hex');
  const bigint = BigInt(`0x${hashHex}`);
  const base36 = bigint.toString(36);
  const normalized = base36.replace(/[^a-z0-9]/g, '').toLowerCase();
  return normalized.padStart(15, '0').slice(0, 15);
}

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export async function asyncPool(items, concurrency, task) {
  const active = new Set();

  for (const item of items) {
    const run = Promise.resolve().then(() => task(item));
    active.add(run);
    run.finally(() => active.delete(run));

    if (active.size >= concurrency) {
      await Promise.race(active);
    }
  }

  await Promise.all(active);
}
