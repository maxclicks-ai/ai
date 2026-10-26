---
name: maxclicks-imports
description: Route a bulk load of contacts or objects into maxclicks. Use when asked to import a CSV, migrate a contact list, or backfill hundreds of records. A file goes through the app's CSV importer; data already in your program goes through a throttled records upsert loop.
---

# Bulk-loading contacts and objects into maxclicks

**Coverage:** read the `maxclicks` entry skill for current REST coverage and client limits.

Builds on the `maxclicks` skill and `maxclicks-contacts` (read those first for the schema-based data model and the shape of a single record write).

**There are no import operations on the current Public API.** Do not invent `/imports`, CLI import commands or SDK methods. CSV import is an app workflow; a programmatic migration can instead use the supported per-record writes below.

So a bulk-load request splits two ways, and picking the right side is most of this skill's job.

## The user has a CSV file: route them to the app

Use the target schema's CSV import flow in the maxclicks app. Review its column mapping, sample headers and per-row failures there; do not guess a deep app URL.

Your job over the API is the preparation and the verification, not the load itself:

```bash
maxclicks whoami                          # confirm the bound space
maxclicks schemas list --type contact     # find the schema slug, e.g. "students"
maxclicks attributes list students        # the exact keys the CSV headers must match
```

Hand them that attribute list before they build the file: a header that matches no attribute is dropped silently on write, so a mismatched column turns into missing data rather than an error. Afterwards, confirm the load landed with `maxclicks records list students --all`.

## The data is already in your program: loop `records upsert`

When the records come from a database query, another API, or a file you have already parsed, there is nothing to upload and nothing to route. Write them one at a time. `upsert` creates or updates by identity. Keep per-row progress and stable operation keys so retries do not repeat a logical write's side effects.

```bash
maxclicks records upsert students \
  --data '{"email":"ada@example.com","firstName":"Ada","plan":"premium"}' \
  --idempotency-key "migration-2026-07-ada"
```

```ts
import { Maxclicks } from 'maxclicks'
const mc = new Maxclicks({
  apiKey: process.env.MAXCLICKS_API_KEY,
  onWarning: (warnings, context) => console.warn(context.path, warnings),
})

for (const row of rows) {
  await mc.records.upsert('students', row, {
    idempotencyKey: `migration-2026-09-${row.email}`,
  })
  await new Promise((resolve) => setTimeout(resolve, 50))   // stay under the write limit
}
```

Two limits decide how fast the loop may run:

- **25 writes per second, per API key.** Every non-`GET` request shares one `write` bucket. Exceeding it returns `429` with a `Retry-After` header (seconds or an HTTP date). Pace the loop at roughly 20 per second and honour `Retry-After` instead of retrying blind.
- **Credits are checked per record.** If the schema has any AI auto-fill attribute, each `create`/`upsert` runs a credit check, and running out fails that record with `402 insufficient_credits`. On a long load, treat a 402 as stop-and-report: the remaining rows will all fail the same way.

## Gotchas

- **Discover attributes before building either path.** Undefined keys on a record write are dropped and reported in `warnings`, not rejected, on the CSV path and the loop path alike.
- **Read the `warnings` array on every write.** A conflicting identifier update (an `email` another contact already holds) is skipped and reported there, not failed, so a silent loop can finish "successfully" with records that did not take the value you sent.
- **Prefer `upsert` over `create` for a load.** `create` fails with `409 identifier_conflict` on anything already present, which makes a resumed run collapse.
- **`--idempotency-key` is per record, not per batch.** Derive it from the row's own identity so a retry replays that row rather than claiming a new write.
- **Events are not imported.** Events are fired, never loaded or updated: use `maxclicks events fire-batch <schema>` for a backfill (see `maxclicks-events`).
