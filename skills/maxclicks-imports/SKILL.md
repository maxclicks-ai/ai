---
name: maxclicks-imports
description: Route a bulk load of contacts or objects into maxclicks. Use when asked to import a CSV, migrate a contact list, or backfill hundreds of records. A file goes through the app's CSV importer; data already in your program goes through a throttled records upsert loop.
---

# Bulk-loading contacts and objects into maxclicks

Builds on the `maxclicks` skill and `maxclicks-contacts` (read those first for the schema-based data model and the shape of a single record write).

**There are no import operations on the Public API.** Do not reach for `/imports`, `maxclicks imports ...`, or an `imports` resource on an SDK: the CLI, the eight SDKs and the MCP server all mirror the same v1 surface, and none of them has one. CSV import is an app feature, because it needs the column-to-attribute mapping, the sample file and the per-row failure review that only the UI can give.

So a bulk-load request splits two ways, and picking the right side is most of this skill's job.

## The user has a CSV file: route them to the app

Tell them to open **Settings -> Schemas -> the schema -> Import** in the maxclicks app and upload the file there. That page also offers a downloadable sample CSV with the correct headers for that schema, and keeps a table of past imports so they can review failures.

Your job over the API is the preparation and the verification, not the load itself:

```bash
maxclicks whoami                          # confirm the bound space
maxclicks schemas list --type contact     # find the schema slug, e.g. "students"
maxclicks attributes list students        # the exact keys the CSV headers must match
```

Hand them that attribute list before they build the file: a header that matches no attribute is dropped silently on write, so a mismatched column turns into missing data rather than an error. Afterwards, confirm the load landed with `maxclicks records list students --all`.

## The data is already in your program: loop `records upsert`

When the records come from a database query, another API, or a file you have already parsed, there is nothing to upload and nothing to route. Write them one at a time. `upsert` is idempotent (create-or-update by identity), so a rerun repairs a partial load instead of duplicating it.

```bash
maxclicks records upsert students \
  --data '{"email":"ada@example.com","firstName":"Ada","plan":"premium"}' \
  --idempotency-key "migration-2026-07-ada"
```

```ts
import { Maxclicks } from 'maxclicks'
const mc = new Maxclicks(process.env.MAXCLICKS_API_KEY!)

for (const row of rows) {
  const { warnings } = await mc.records.upsert('students', row)
  if (warnings?.length) console.warn(row.email, warnings)
  await new Promise((resolve) => setTimeout(resolve, 50))   // stay under the write limit
}
```

Two limits decide how fast the loop may run:

- **25 writes per second, per API key.** Every non-`GET` request shares one `write` bucket. Exceeding it returns `429` with a `Retry-After` header (an HTTP date, UTC). Pace the loop at roughly 20 per second and honour `Retry-After` instead of retrying blind.
- **Credits are checked per record.** If the schema has any AI auto-fill attribute, each `create`/`upsert` runs a credit check, and running out fails that record with `402 insufficient_credits`. On a long load, treat a 402 as stop-and-report: the remaining rows will all fail the same way.

## Gotchas

- **Discover attributes before building either path.** Undefined keys on a record write are dropped and reported in `warnings`, not rejected, on the CSV path and the loop path alike.
- **Read the `warnings` array on every write.** A conflicting identifier update (an `email` another contact already holds) is skipped and reported there, not failed, so a silent loop can finish "successfully" with records that did not take the value you sent.
- **Prefer `upsert` over `create` for a load.** `create` fails with `409 identifier_conflict` on anything already present, which makes a resumed run collapse.
- **`--idempotency-key` is per record, not per batch.** Derive it from the row's own identity so a retry replays that row rather than claiming a new write.
- **Events are not imported.** Events are fired, never loaded or updated: use `maxclicks events fire-batch <schema>` for a backfill (see `maxclicks-events`).
