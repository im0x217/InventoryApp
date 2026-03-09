import path from 'node:path';
import crypto from 'node:crypto';
import PocketBase from 'pocketbase';
import {
  loadEnvFile,
  parseArg,
  requireEnv,
  readJsonFile,
  writeJsonFile,
  ensureDir,
  deterministicLegacyKey,
} from './utils.mjs';

const envFile = parseArg('--env', '.env.migration');
const usersFile = parseArg('--file', 'exports/users.json');
const mapDirArg = parseArg('--map-dir', 'migration-maps');
const sendResetEmails = process.argv.includes('--send-reset-emails');

loadEnvFile(envFile);

const pocketbaseUrl = requireEnv('POCKETBASE_URL');
const adminEmail = requireEnv('POCKETBASE_ADMIN_EMAIL');
const adminPassword = requireEnv('POCKETBASE_ADMIN_PASSWORD');

const mapDir = path.resolve(process.cwd(), mapDirArg);
const usersPath = path.resolve(process.cwd(), usersFile);

const pb = new PocketBase(pocketbaseUrl);

function randomTempPassword() {
  return `${crypto.randomBytes(10).toString('hex')}Aa1!`;
}

async function findUserByLegacyId(legacyId) {
  const escaped = String(legacyId).replaceAll('"', '\\"');
  return pb.collection('users').getFirstListItem(`legacy_id=\"${escaped}\"`);
}

async function findUserByEmail(email) {
  const escaped = String(email).replaceAll('"', '\\"');
  return pb.collection('users').getFirstListItem(`email=\"${escaped}\"`);
}

async function main() {
  await pb.collection('_superusers').authWithPassword(adminEmail, adminPassword);

  const users = readJsonFile(usersPath);
  if (!Array.isArray(users)) {
    throw new Error('users file must contain a JSON array');
  }

  const userMap = {};

  for (const src of users) {
    const legacyId = deterministicLegacyKey(src.id);
    const email = src.email;

    if (!legacyId || !email) {
      console.warn('Skipping malformed user row', src);
      continue;
    }

    const payloadBase = {
      email,
      emailVisibility: true,
      verified: Boolean(src.email_confirmed_at),
      legacy_id: legacyId,
      must_reset_password: true,
    };

    let existing = null;
    try {
      existing = await findUserByLegacyId(legacyId);
    } catch {
      existing = null;
    }

    if (!existing) {
      try {
        existing = await findUserByEmail(email);
      } catch {
        existing = null;
      }
    }

    if (existing) {
      const updated = await pb.collection('users').update(existing.id, payloadBase);
      userMap[legacyId] = updated.id;
      continue;
    }

    const tempPassword = randomTempPassword();

    const created = await pb.collection('users').create({
      ...payloadBase,
      password: tempPassword,
      passwordConfirm: tempPassword,
    });

    userMap[legacyId] = created.id;

    if (sendResetEmails) {
      await pb.collection('users').requestPasswordReset(email);
    }
  }

  ensureDir(mapDir);
  writeJsonFile(path.join(mapDir, 'users-id-map.json'), userMap);

  console.log(`Imported/updated users: ${Object.keys(userMap).length}`);
  if (!sendResetEmails) {
    console.log('Tip: re-run with --send-reset-emails after configuring PocketBase SMTP.');
  }
}

main().catch((error) => {
  console.error('User migration failed:', error);
  process.exit(1);
});
