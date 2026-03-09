import fs from 'node:fs';
import path from 'node:path';
import PocketBase from 'pocketbase';
import {
  loadEnvFile,
  parseArg,
  requireEnv,
  ensureDir,
  readJsonFile,
  writeJsonFile,
  deterministicLegacyKey,
  deterministicPocketBaseLikeId,
} from './utils.mjs';

const envFile = parseArg('--env', '.env.migration');
const exportDirArg = parseArg('--dir', 'exports');
const mapDirArg = parseArg('--map-dir', 'migration-maps');

loadEnvFile(envFile);

const pocketbaseUrl = requireEnv('POCKETBASE_URL');
const adminEmail = requireEnv('POCKETBASE_ADMIN_EMAIL');
const adminPassword = requireEnv('POCKETBASE_ADMIN_PASSWORD');

const exportDir = path.resolve(process.cwd(), exportDirArg);
const mapDir = path.resolve(process.cwd(), mapDirArg);

const pb = new PocketBase(pocketbaseUrl);

const CORE_MIGRATION_CONFIG = [
  {
    sourceFile: 'inventory.json',
    collection: 'inventory',
    legacyPk: 'id',
    scalarMap: {
      name: 'name',
      quantity: 'quantity',
      min_stock: 'min_stock',
      category: 'category',
      last_updated: 'last_updated_legacy',
    },
    relationMap: {},
  },
];

function getBaseFieldNameFromForeignKey(fieldName) {
  if (!fieldName.endsWith('_id')) return null;
  return fieldName.slice(0, -3);
}

function discoverAdditionalTableConfigs() {
  if (!fs.existsSync(exportDir)) return [];

  const knownFiles = new Set(CORE_MIGRATION_CONFIG.map((config) => config.sourceFile));
  knownFiles.add('users.json');

  const files = fs
    .readdirSync(exportDir)
    .filter((name) => name.endsWith('.json') && !knownFiles.has(name));

  return files.map((fileName) => {
    const collection = path.basename(fileName, '.json');
    const fullPath = path.join(exportDir, fileName);
    const rows = readJsonFile(fullPath);
    const sample = Array.isArray(rows) && rows.length > 0 ? rows[0] : {};

    const scalarMap = {};
    const relationMap = {};

    for (const key of Object.keys(sample)) {
      if (key === 'id') continue;

      const relationBase = getBaseFieldNameFromForeignKey(key);
      if (relationBase) {
        const targetCollection = `${relationBase}s`;
        relationMap[key] = {
          targetCollection,
          targetLegacyPk: 'id',
          targetField: relationBase,
        };
        continue;
      }

      scalarMap[key] = key;
    }

    return {
      sourceFile: fileName,
      collection,
      legacyPk: 'id',
      scalarMap,
      relationMap,
    };
  });
}

function mapLegacyIdToPocketBaseId(collection, legacyId) {
  return deterministicPocketBaseLikeId(`${collection}:${legacyId}`);
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeInteger(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(0, parsed);
}

function normalizeInventoryPayload(payload) {
  return {
    ...payload,
    quantity: normalizeInteger(payload.quantity, 0),
    min_stock: normalizeInteger(payload.min_stock, 5),
    last_updated_legacy: normalizeDate(payload.last_updated_legacy),
  };
}

function normalizeExportRows(parsed, sourceFile) {
  if (Array.isArray(parsed)) {
    if (parsed.length === 1 && parsed[0] && Array.isArray(parsed[0].coalesce)) {
      return parsed[0].coalesce;
    }

    return parsed;
  }

  if (parsed && Array.isArray(parsed.coalesce)) {
    return parsed.coalesce;
  }

  throw new Error(
    `${sourceFile} must be a JSON array of rows or contain a coalesce array`
  );
}

function buildScalarPayload(record, scalarMap) {
  const payload = {};
  for (const [sourceField, targetField] of Object.entries(scalarMap)) {
    const value = record[sourceField];

    if (
      targetField.endsWith('_legacy') &&
      (sourceField.endsWith('_at') || sourceField.endsWith('updated'))
    ) {
      payload[targetField] = normalizeDate(value);
      continue;
    }

    payload[targetField] = value ?? null;
  }
  return payload;
}

async function getRecordByLegacyId(collection, legacyId) {
  const escaped = String(legacyId).replaceAll('"', '\\"');
  return pb.collection(collection).getFirstListItem(`legacy_id=\"${escaped}\"`);
}

async function createOrUpdateRecord(collection, legacyId, payload) {
  try {
    const existing = await getRecordByLegacyId(collection, legacyId);
    const updated = await pb.collection(collection).update(existing.id, payload);
    return updated;
  } catch {
    const created = await pb.collection(collection).create(payload);
    return created;
  }
}

async function main() {
  await pb.collection('_superusers').authWithPassword(adminEmail, adminPassword);

  ensureDir(mapDir);

  const MIGRATION_CONFIG = [
    ...CORE_MIGRATION_CONFIG,
    ...discoverAdditionalTableConfigs(),
  ];

  const idMap = {};
  const syntheticIdMap = {};
  const pendingRelationUpdates = [];

  for (const table of MIGRATION_CONFIG) {
    const sourcePath = path.join(exportDir, table.sourceFile);
    if (!fs.existsSync(sourcePath)) {
      console.log(`Skipping ${table.sourceFile} (not found)`);
      continue;
    }

    const rawRows = readJsonFile(sourcePath);
    const rows = normalizeExportRows(rawRows, table.sourceFile);

    idMap[table.collection] = idMap[table.collection] || {};
    syntheticIdMap[table.collection] = syntheticIdMap[table.collection] || {};

    for (const row of rows) {
      const legacyValue = row[table.legacyPk];
      const legacyId = deterministicLegacyKey(legacyValue);
      if (!legacyId) {
        console.warn(`Skipping row in ${table.collection} because legacy PK is missing`);
        continue;
      }

      const payload = {
        legacy_id: legacyId,
        ...buildScalarPayload(row, table.scalarMap),
      };

      const finalPayload =
        table.collection === 'inventory'
          ? normalizeInventoryPayload(payload)
          : payload;

      const syntheticPocketBaseId = mapLegacyIdToPocketBaseId(
        table.collection,
        legacyId
      );

      const unresolved = [];
      for (const [sourceField, relationDef] of Object.entries(table.relationMap)) {
        if (!(sourceField in row)) {
          continue;
        }

        const fkValue = row[sourceField];
        if (!fkValue) {
          if (!(relationDef.targetField in payload)) {
            payload[relationDef.targetField] = null;
          }
          continue;
        }

        const mapped = idMap[relationDef.targetCollection]?.[deterministicLegacyKey(fkValue)];
        if (mapped) {
          payload[relationDef.targetField] = mapped;
        } else {
          payload[relationDef.targetField] = null;
          unresolved.push({
            sourceField,
            fkValue,
            ...relationDef,
          });
        }
      }

      let record;
      try {
        record = await createOrUpdateRecord(table.collection, legacyId, finalPayload);
      } catch (error) {
        console.error(
          `Failed row ${table.collection} legacy_id=${legacyId}`,
          error?.response?.data || error?.message || error
        );
        throw error;
      }
      idMap[table.collection][legacyId] = record.id;
      syntheticIdMap[table.collection][legacyId] = syntheticPocketBaseId;

      if (unresolved.length > 0) {
        pendingRelationUpdates.push({
          collection: table.collection,
          recordId: record.id,
          unresolved,
        });
      }
    }

    console.log(`Imported ${table.collection}: ${Object.keys(idMap[table.collection]).length} records`);
  }

  for (const pending of pendingRelationUpdates) {
    const patch = {};
    let hasAny = false;

    for (const unresolved of pending.unresolved) {
      const legacyKey = deterministicLegacyKey(unresolved.fkValue);
      const resolvedId = idMap[unresolved.targetCollection]?.[legacyKey];
      if (resolvedId) {
        patch[unresolved.targetField] = resolvedId;
        hasAny = true;
      }
    }

    if (hasAny) {
      await pb.collection(pending.collection).update(pending.recordId, patch);
    }
  }

  for (const [collection, map] of Object.entries(idMap)) {
    writeJsonFile(path.join(mapDir, `${collection}-id-map.json`), map);
  }

  const deterministicPreview = Object.fromEntries(
    Object.entries(syntheticIdMap).map(([collection, map]) => [collection, map])
  );

  writeJsonFile(path.join(mapDir, 'deterministic-preview.json'), deterministicPreview);

  console.log('Data migration complete. Mapping files written to migration-maps/.');
}

main().catch((error) => {
  console.error('Data import failed:', error);
  process.exit(1);
});
