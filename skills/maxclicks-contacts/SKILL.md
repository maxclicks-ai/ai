---
name: maxclicks-contacts
description: Create, import, update, search, or delete contacts, customers, users, or business objects (records) in maxclicks. Use for CRM/contact-list operations against the maxclicks API, CLI, or SDKs.
---

# Managing contacts and objects in maxclicks

Builds on the **maxclicks** skill (auth, tool choice, and the schema-based data model). Read that first if you have not. This skill covers the concrete record operations: discover, upsert/create, list/get/update/delete, bulk import, and reading a contact audit trail.

Contacts and objects are both **records** under a schema. Contacts (a contact schema) can receive email; objects (an object schema) are any other business entity (products, companies). Everything below applies to both, except the audit trail, which is contacts only.

## Step 1: Discover the schema and its attributes (always first)

Schemas and attributes do have write commands now (`maxclicks schemas create|update|delete`, `maxclicks attributes create`, see the `maxclicks` skill's "Managing schemas, attributes, and API keys" section), but creating one is a deliberate schema-design action, not a shortcut for a missing key. And **undefined attribute keys on a record write are silently dropped** (returned as a `warnings` entry, not an error). So learn the real keys before writing.

```bash
maxclicks whoami                          # confirm the bound space
maxclicks schemas list --type contact     # find the contact schema slug, e.g. "students"
maxclicks attributes list students        # the exact custom keys you may set
```

Only set keys that appear in `attributes list` plus the base fields below.

## Step 2: Write a record (prefer upsert)

Records are **flat**: base fields and custom keys sit at the top level, with no `data`/`attributes` wrapper.

- Contact base fields: `email`, `firstName`, `lastName`, `userId`, `phone`, `notes`, `tags: [...]`, `topicIds: [...]`.
- Object base fields: `externalId`, `notes`, `tags: [...]`.

Prefer `upsert` (idempotent, create-or-update by identity) over `create` (fails with `identifier_conflict` (409) if the identity already exists).

```bash
# Create-or-update by identity (preferred)
maxclicks records upsert students --data '{"email":"ada@example.com","firstName":"Ada","plan":"premium","tags":["beta"]}'

# Object by externalId
maxclicks records upsert products --data '{"externalId":"sku_42","name":"Deluxe Widget"}'

# Strict create (use only when you require insert-or-fail)
maxclicks records create students --data '{"email":"grace@example.com"}'

# Both create and upsert accept --idempotency-key for safe retries (replays the original record):
maxclicks records upsert students --data '{"email":"ada@example.com"}' --idempotency-key "signup-ada-2026-07-18"
```

The **identity cascade** decides which existing record an upsert matches:
- Contact: `id` > `userId` > `email` > `phone`.
- Object: `id` > `externalId`.

Conflicting identifier updates (e.g. setting an `email` another contact already holds) are **skipped and reported in `warnings`**, not failed. Always read the `warnings` array on writes.

TypeScript SDK:

```ts
import { Maxclicks } from 'maxclicks'
const mc = new Maxclicks(process.env.MAXCLICKS_API_KEY!)

const attributes = await mc.attributes.list('students')  // discover first
const contact = await mc.records.upsert('students', {
  email: 'ada@example.com',
  firstName: 'Ada',
  plan: 'premium',
  tags: ['beta'],
})
```

## Step 3: List, get, update, delete

```bash
maxclicks records list students --all              # every page as a flat array
maxclicks records get students <recordId>
maxclicks records update students <recordId> --data '{"notes":"VIP","phone":null}'   # null clears a field
maxclicks records delete students <recordId>
```

`update` targets a known record id and patches it; omit a key to leave it unchanged, send explicit `null` to clear a nullable field. There is no server-side text search endpoint: to find a record by email, upsert (idempotent) or `list --all` and filter client-side.

## Bulk import

For a handful of records, loop-and-upsert is simplest (upsert is idempotent, so a re-run of a partially-failed batch is safe):

```ts
import { Maxclicks } from 'maxclicks'
const mc = new Maxclicks(process.env.MAXCLICKS_API_KEY!)

const rows = [
  { email: 'ada@example.com', firstName: 'Ada', plan: 'premium' },
  { email: 'grace@example.com', firstName: 'Grace', plan: 'free' },
]

for (const row of rows) {
  try {
    const result = await mc.records.upsert('students', row)
    if (result.warnings?.length) console.warn(row.email, result.warnings)
  } catch (error) {
    console.error('failed', row.email, error)   // keep going; upsert re-run is safe
  }
}
```

```python
from maxclicks import Maxclicks
mc = Maxclicks()  # reads MAXCLICKS_API_KEY
for row in rows:
    mc.records.upsert("students", row)
```

```bash
jq -c '.[]' contacts.json | while read -r row; do
  maxclicks records upsert students --data "$row"
done
```

**For a real CSV bulk load, use `maxclicks imports` instead**, a full CLI command group now (see the `maxclicks-imports` skill for the complete flow):

```bash
# 1. Upload the CSV somewhere reachable, then submit its URL (fileUrl and byteSize are both required;
#    contact/object schemas only, files over 50 MB are rejected):
maxclicks imports create students --data '{"fileUrl":"https://your-storage.example.com/contacts.csv","byteSize":48213}'
# -> { "id": "imp_...", "status": "pending", ... }

# 2. Poll status:
maxclicks imports get imp_...

# 3. On partial failure, download the per-row failure log (authenticated, streamed to stdout):
maxclicks imports download-failure-log imp_... > failures.csv

# 4. Cancel a running import if needed:
maxclicks imports cancel imp_...
```

## Read a contact's consent audit trail (contacts only)

```bash
maxclicks records audit-trail students <contactId> --all
maxclicks records audit-trail students <contactId> --channel email
```

Returns consent events (subscribed, unsubscribed, topic changes) for legal compliance. Objects have no audit trail.

## Suppression list, get, and batch operations

`maxclicks suppressions create`/`delete` (admin key) are already covered in the `maxclicks-email` skill. Listing, getting, and batch create/remove are also full CLI commands now:

```bash
maxclicks suppressions list --all
maxclicks suppressions list --identifier ada@example.com
maxclicks suppressions get supp_abc123
maxclicks suppressions batch-add --data '{"suppressions":[{"identifier":"a@example.com","reason":"manual"},{"identifier":"b@example.com","reason":"legal"}]}'
maxclicks suppressions batch-remove --data '{"ids":["supp_1","supp_2"]}'
```

## Gotchas

- **Discover before you write.** Undefined attribute keys are dropped and surfaced only as a `warnings` entry; the write otherwise "succeeds". Run `attributes list <schema>` first and read `warnings` on every write.
- **Records are flat.** No `data`/`attributes`/`properties` wrapper. Custom keys sit beside base fields.
- **Schemas and attributes can be created via the CLI** (`maxclicks schemas create|update|delete`, `maxclicks attributes create`). If a needed attribute is missing, either create it (stored, or evaluated via NL `--requirements`, see the `maxclicks` skill's `references/requirements.md`) or tell the user to add it in the app, whichever fits the task.
- **`source`, `subscriptions`, and `emailStatistics` are read-only.** They are managed by the platform and cannot be set through these endpoints (use `topicIds` and the preferences/consent flows, not `subscriptions`, to change contactability).
- **Upsert merges by identity; conflicting identifier updates are skipped, not failed**, and reported in `warnings`. Prefer `upsert` over `create` for idempotent imports.
- **`null` means clear.** In `update`/`upsert`, an explicit `null` clears a nullable field; omitting the key leaves it unchanged.
- **`schema` is a slug or an id.** Slugs (`students`, `products`) are the ergonomic choice.
