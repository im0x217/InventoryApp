# Legacy Postgres ➜ PocketBase migration

This toolkit migrates schema and data from a legacy PostgreSQL database to PocketBase with deterministic legacy ID mapping for relations.

Your current confirmed schema is a single `public.inventory` table.

## 1) Export from Postgres to JSON

Use your PostgreSQL connection string.

### Option A: Direct SQL (JSON output)

```powershell

$env:LEGACY_POSTGRES_URL="postgresql://postgres.<host>:<password>@<server>:5432/postgres"

# inventory table
psql "$env:LEGACY_POSTGRES_URL" -t -A -c "SELECT COALESCE(json_agg(t), '[]'::json) FROM (SELECT id, name, quantity, min_stock, category, last_updated FROM public.inventory ORDER BY id) t;" > exports/inventory.json

# users (auth users from auth schema)
psql "$env:LEGACY_POSTGRES_URL" -t -A -c "SELECT COALESCE(json_agg(t), '[]'::json) FROM (SELECT id, email, encrypted_password, email_confirmed_at, created_at, updated_at FROM auth.users ORDER BY created_at) t;" > exports/users.json

# optional additional table export example
psql "$env:LEGACY_POSTGRES_URL" -t -A -c "SELECT COALESCE(json_agg(t), '[]'::json) FROM (SELECT * FROM public.some_other_table ORDER BY id) t;" > exports/some_other_table.json
```

Save each command output to `exports/*.json`.

## 2) Prepare PocketBase + env

Create `.env.migration` in project root:

```env
POCKETBASE_URL=http://127.0.0.1:8090
POCKETBASE_ADMIN_EMAIL=admin@example.com
POCKETBASE_ADMIN_PASSWORD=your-admin-password

# optional if you also run export helper scripts or custom tools
LEGACY_POSTGRES_URL=postgresql://...
```

## 3) Create PocketBase schema

```powershell
node scripts/migration/create-pocketbase-schema.mjs --env .env.migration --dir exports
```

Included explicitly:
- `inventory` collection
- fields: `legacy_id`, `name`, `quantity`, `min_stock`, `category`, `last_updated_legacy`

Auto-discovery:
- Any additional `exports/*.json` file (except `users.json`) is inferred as a PocketBase collection.
- `_id` columns are inferred as relation fields when the target collection exists.

## 4) Import data

```powershell
node scripts/migration/import-data.mjs --env .env.migration --dir exports
```

This script:
- creates deterministic mapping from legacy UUID/bigint ids to PocketBase ids
- stores mapping files under `migration-maps/`
- preserves cross-table relations using a two-pass import/update process
- imports `inventory` as the default core table

### UUID ➜ 15-char mapping function

Implemented in `scripts/migration/import-data.mjs`:

```js
function mapLegacyIdToPocketBaseId(collection, legacyId) {
	return deterministicPocketBaseLikeId(`${collection}:${legacyId}`);
}
```

Output files:
- `migration-maps/<collection>-id-map.json` (actual created PocketBase IDs)
- `migration-maps/deterministic-preview.json` (synthetic 15-char IDs from UUID/bigint)

Use the actual map files for relation writes.

## 5) Migrate users (safe method)

```powershell
node scripts/migration/import-users-force-reset.mjs --env .env.migration --file exports/users.json --send-reset-emails
```

This imports users into PocketBase `users` auth collection and flags them with `must_reset_password=true`.

## Why not raw bcrypt hash import?

Legacy `auth.users.encrypted_password` values may be bcrypt. PocketBase stores its own auth hash format and metadata (argon2id in current versions). Writing raw bcrypt hashes directly into `pb_data/data.db` is not a supported migration path and can break auth/session behavior after upgrades.

If you still want direct SQLite manipulation, do it only for non-auth fields. For passwords, use force-reset flow.

## Force password reset app flow

1. After successful login, if `user.must_reset_password === true`, redirect to reset page.
2. On reset, call PocketBase password update endpoint.
3. Clear `must_reset_password` to `false`.

## Relation config example (optional future tables)

In `scripts/migration/import-data.mjs`, add config entries like:

```js
{
	sourceFile: 'suppliers.json',
	collection: 'suppliers',
	legacyPk: 'id',
	scalarMap: { name: 'name' },
	relationMap: {}
},
{
	sourceFile: 'supplier_items.json',
	collection: 'supplier_items',
	legacyPk: 'id',
	scalarMap: { note: 'note' },
	relationMap: {
		supplier_id: {
			targetCollection: 'suppliers',
			targetLegacyPk: 'id',
			targetField: 'supplier'
		}
	}
}
```

---

## PocketBase auth migration options summary

1. **Recommended**: import users with random temporary passwords + force reset.
2. **Alternative**: ask users to use "forgot password" immediately after migration.
3. **Not recommended**: direct SQL hash injection into PocketBase internals.
