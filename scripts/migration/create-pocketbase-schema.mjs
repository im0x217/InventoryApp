import fs from 'node:fs';
import path from 'node:path';
import PocketBase from 'pocketbase';
import {
  loadEnvFile,
  parseArg,
  requireEnv,
  readJsonFile,
} from './utils.mjs';

const envFile = parseArg('--env', '.env.migration');
const exportDirArg = parseArg('--dir', 'exports');
loadEnvFile(envFile);

const pocketbaseUrl = requireEnv('POCKETBASE_URL');
const adminEmail = requireEnv('POCKETBASE_ADMIN_EMAIL');
const adminPassword = requireEnv('POCKETBASE_ADMIN_PASSWORD');

const pb = new PocketBase(pocketbaseUrl);
const exportDir = path.resolve(process.cwd(), exportDirArg);

const COLLECTIONS = [
  {
    name: 'inventory',
    type: 'base',
    listRule: '',
    viewRule: '',
    createRule: '',
    updateRule: '',
    deleteRule: '',
    fields: [
      { name: 'legacy_id', type: 'text', required: true, unique: true },
      { name: 'name', type: 'text', required: true },
      { name: 'quantity', type: 'number', required: false, min: 0 },
      { name: 'min_stock', type: 'number', required: false, min: 0 },
      { name: 'category', type: 'text', required: false },
      { name: 'last_updated_legacy', type: 'date', required: false },
    ],
  },
];

const USERS_EXTRA_FIELDS = [
  { name: 'legacy_id', type: 'text', required: false, unique: true },
  { name: 'must_reset_password', type: 'bool', required: true },
];

function shouldSkipAutoCollection(name) {
  return ['users', '_superusers', '_externalAuths', '_mfas', '_otps'].includes(name);
}

function inferScalarFieldType(key, value) {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'bool';
  if (typeof value === 'string' && /_at$/i.test(key)) return 'date';
  return 'text';
}

function inferFieldsFromSample(sample) {
  const fields = [{ name: 'legacy_id', type: 'text', required: true, unique: true }];

  for (const [key, value] of Object.entries(sample)) {
    if (key === 'id') continue;

    if (key.endsWith('_id')) {
      fields.push({
        name: key.replace(/_id$/, ''),
        type: 'relation',
        required: false,
        collectionName: `${key.replace(/_id$/, '')}s`,
        maxSelect: 1,
      });
      continue;
    }

    fields.push({
      name: key,
      type: inferScalarFieldType(key, value),
      required: false,
    });
  }

  return fields;
}

function discoverExtraCollections() {
  if (!fs.existsSync(exportDir)) return [];

  const known = new Set(COLLECTIONS.map((collection) => collection.name));

  const files = fs.readdirSync(exportDir).filter((name) => name.endsWith('.json'));
  const discovered = [];

  for (const fileName of files) {
    const collectionName = path.basename(fileName, '.json');
    if (known.has(collectionName) || shouldSkipAutoCollection(collectionName)) {
      continue;
    }

    const rows = readJsonFile(path.join(exportDir, fileName));
    const sample = Array.isArray(rows) && rows.length > 0 ? rows[0] : {};

    discovered.push({
      name: collectionName,
      type: 'base',
      listRule: '',
      viewRule: '',
      createRule: '',
      updateRule: '',
      deleteRule: '',
      fields: inferFieldsFromSample(sample),
    });
  }

  return discovered;
}

function normalizeField(field) {
  if (field.type === 'relation') {
    return {
      ...field,
      maxSelect: field.maxSelect ?? 1,
      minSelect: field.minSelect ?? null,
      required: field.required ?? false,
    };
  }

  if (field.type === 'number') {
    return {
      ...field,
      onlyInt: field.onlyInt ?? true,
      required: field.required ?? false,
    };
  }

  if (field.type === 'date') {
    return {
      ...field,
      required: field.required ?? false,
    };
  }

  if (field.type === 'bool') {
    return {
      ...field,
      required: field.required ?? false,
    };
  }

  return {
    ...field,
    required: field.required ?? false,
  };
}

async function resolveRelationFieldTargets(fields) {
  const resolved = [];

  for (const field of fields) {
    if (field.type !== 'relation' || !field.collectionName) {
      resolved.push(field);
      continue;
    }

    let target = null;

    try {
      target = await pb.collections.getFirstListItem(
        `name=\"${field.collectionName}\"`
      );
    } catch {
      target = null;
    }

    if (!target) {
      continue;
    }

    const { collectionName, ...rest } = field;
    resolved.push({
      ...rest,
      collectionId: target.id,
    });
  }

  return resolved;
}

function mergeFields(existingFields = [], wantedFields = []) {
  const byName = new Map(existingFields.map((field) => [field.name, field]));

  for (const wanted of wantedFields.map(normalizeField)) {
    byName.set(wanted.name, {
      ...byName.get(wanted.name),
      ...wanted,
    });
  }

  return Array.from(byName.values());
}

async function upsertCollection(definition) {
  let desiredFields = definition.fields.map(normalizeField);
  desiredFields = await resolveRelationFieldTargets(desiredFields);
  let existing = null;

  try {
    existing = await pb.collections.getFirstListItem(`name=\"${definition.name}\"`);
  } catch {
    existing = null;
  }

  if (!existing) {
    await pb.collections.create({
      ...definition,
      fields: desiredFields,
    });
    console.log(`Created collection: ${definition.name}`);
    return;
  }

  await pb.collections.update(existing.id, {
    ...definition,
    fields: mergeFields(existing.fields ?? [], desiredFields),
  });
  console.log(`Updated collection: ${definition.name}`);
}

async function ensureUsersCollectionFields() {
  const users = await pb.collections.getOne('users');
  const merged = mergeFields(users.fields ?? [], USERS_EXTRA_FIELDS);

  await pb.collections.update(users.id, {
    name: users.name,
    type: users.type,
    listRule: users.listRule,
    viewRule: users.viewRule,
    createRule: users.createRule,
    updateRule: users.updateRule,
    deleteRule: users.deleteRule,
    fields: merged,
  });

  console.log('Updated users collection with legacy migration fields');
}

async function main() {
  await pb.collection('_superusers').authWithPassword(adminEmail, adminPassword);

  const autoCollections = discoverExtraCollections();
  const finalCollections = [...COLLECTIONS, ...autoCollections];

  for (const collection of finalCollections) {
    await upsertCollection(collection);
  }

  await ensureUsersCollectionFields();

  console.log('PocketBase schema migration complete.');
}

main().catch((error) => {
  console.error('Schema migration failed:', error);
  process.exit(1);
});
