---
name: maxclicks-contacts
description: Create, import, update, search, or delete contacts, customers, users, or business objects (records) in maxclicks. Use for CRM/contact-list operations against the maxclicks API, CLI, or SDKs.
---

# Managing contacts and objects in maxclicks

**Coverage:** read the `maxclicks` entry skill for current REST coverage and client limits.

Builds on the **maxclicks** skill (auth, tool choice, and the schema-based data model). Read that first if you have not. This skill covers the concrete record operations: discover, upsert/create, list/get/update/delete, bulk loading, and reading a contact audit trail.

Contacts and objects are both **records** under a schema. Contacts (a contact schema) can receive email; objects (an object schema) are any other business entity (products, companies). Everything below applies to both, except the audit trail, which is contacts only.

## Step 1: Discover the schema and its attributes (always first)

The schema is the contract every record write is validated against, and over the API it is **read-only**: schemas and attributes are designed in the app, and the API reads them back. That split is deliberate. There is no schema-migration system, so an attribute created in a hurry could never be corrected afterwards, and a schema created without attributes could never be given any. And **undefined attribute keys on a record write are silently dropped** (returned as a `warnings` entry, not an error). So learn the real keys before writing.

```bash
maxclicks whoami                          # confirm the bound space
maxclicks schemas list --type contact     # find the contact schema slug, e.g. "students"
maxclicks attributes list students        # the exact custom keys you may set
```

Only set keys that appear in `attributes list` plus the base fields below. If a key you need does not exist, ask the user to add the attribute in the app (Settings, Schemas), then re-run `attributes list` and write.

## Step 2: Write a record (prefer upsert)

Records are **flat**: base fields and custom keys sit at the top level, with no `data`/`attributes` wrapper.

- Contact base fields: `email`, `firstName`, `lastName`, `fullName`, `avatarUrl`, `userId`, `phone`, `notes`, `tags: [...]`, `subscriptions: [...]`, `topicIds: [...]`.
- Object base fields: `externalId`, `notes`, `tags: [...]`.

`subscriptions` (channels, today only `email`) and `topicIds` are both writable on a record write, so consent can be set at the same time as the rest of the contact. `topicIds` is checked against the caller's own space: an id belonging to another space fails the whole write with `400 topic_not_found` rather than silently linking. Get the ids from `maxclicks topics list` (see the `maxclicks-topics` skill).

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

Conflicting identifier updates (e.g. setting an `email` another contact already holds) are **skipped and reported in `warnings`**, not failed. Always read the warnings on writes: the CLI prints the response `warnings` array, and the SDKs hand them to the client-level `onWarning` callback (see the loop below).

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

`update` targets a known record id and patches it; omit a key to leave it unchanged, send explicit `null` to clear a nullable field. There is no server-side ad-hoc text filter on records list. Discover records with bounded list pages and filter locally; an upsert is a write, not a read-only lookup.

## Deletion status

A record DELETE returns `{ operationId, status, canCancel, message }`, not a completed-erasure guarantee. It requires an `Idempotency-Key`; the CLI and the Node client generate one when you pass none, and the CLI prints it. Preserve the complete operation id and poll it until `completed`: `maxclicks records deletion-status <operationId>`, `mc.records.getDeletion(operationId)` or `GET /record-deletions/{operationId}`. `pending` means cleanup remains; `blocked` needs reconciliation. Incomplete operations return HTTP 202. While `canCancel` is true, before removal begins, the original requester can stop it with `maxclicks records cancel-deletion <operationId>` or `mc.records.cancelDeletion(operationId)`.

## Bulk loading

**There is no batch record endpoint.** A bulk load is a loop over `upsert`, one record per call. Throttle writes and record per-row progress. Upsert preserves record identity, but repeating it can repeat side effects; reuse a supported stable idempotency key for one unchanged logical write.

Warnings on a single-record write are not attached to the returned record; register the SDK's `onWarning` callback to see them:

```ts
import { Maxclicks } from 'maxclicks'

const mc = new Maxclicks({
  apiKey: process.env.MAXCLICKS_API_KEY,
  onWarning: (warnings, context) => console.warn(context.path, warnings),
})

const rows = [
  { email: 'ada@example.com', firstName: 'Ada', plan: 'premium' },
  { email: 'grace@example.com', firstName: 'Grace', plan: 'free' },
]

for (const row of rows) {
  try {
    await mc.records.upsert('students', row)
  } catch (error) {
    console.error('failed', row.email, error)   // record failure and retry with the same logical-operation key
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

**For a real CSV bulk load, point the user at the app's import flow** (Settings, Schemas, Import). It takes the file directly, maps columns to attributes with the schema in front of the user, reports progress, and produces a per-row failure log to fix and re-upload. Driving a file that size through a per-record loop instead means no column mapping, no resumable progress, and one HTTP call per row. Once the import has run, everything in this skill reads and updates the resulting records normally.

## Read a contact's consent audit trail (contacts only)

```bash
maxclicks records audit-trail students <contactId> --all
maxclicks records audit-trail students <contactId> --channel email
```

Returns consent events (subscribed, unsubscribed, topic changes) for legal compliance. Objects have no audit trail.

## Suppression list and batch operations

`maxclicks suppressions create`/`delete` (admin key) are already covered in the `maxclicks-email` skill. Listing and batch create/remove round out the group:

```bash
maxclicks suppressions list --all
maxclicks suppressions list --identifier ada@example.com     # the suppression(s) for one address
maxclicks suppressions batch-add --data '{"suppressions":[{"identifier":"a@example.com","reason":"manual"},{"identifier":"b@example.com","reason":"legal"}]}'
maxclicks suppressions batch-remove --data '{"ids":["supp_1","supp_2"]}'
```

There is no fetch-one-suppression call: `list --identifier <email>` is how you look a single address up. Both batch commands take 1 to 100 items, always respond `200` with per-item results (an already-suppressed identifier comes back as `exists`, not a failure), and accept `--idempotency-key`.

## Gotchas

- **Discover before you write.** Undefined attribute keys are dropped and surfaced only as a warning; the write otherwise "succeeds". Run `attributes list <schema>` first, and read the warnings on every write (CLI: the `warnings` array in the printed body; SDK: the `onWarning` callback).
- **Records are flat.** No `data`/`attributes`/`properties` wrapper. Custom keys sit beside base fields.
- **Schemas and attributes are read-only over the API.** `schemas list|get` and `attributes list` are the whole surface. A missing attribute is a request to the user ("add it in the app, then I'll write the field"), not something to work around by stuffing the value into `notes`.
- **`source` and `emailStatistics` are read-only.** The platform sets them (`source` is forced to `api` on every write through these endpoints). `subscriptions` and `topicIds`, by contrast, *are* writable; a `topicIds` entry from another space fails the write with `400 topic_not_found`.
- **There is no batch record endpoint.** Loop `upsert` for bulk work, and send a user with a CSV to the app's import flow.
- **Upsert merges by identity; conflicting identifier updates are skipped, not failed**, and reported in `warnings`. Prefer `upsert` over `create` for idempotent bulk loads.
- **`null` means clear.** In `update`/`upsert`, an explicit `null` clears a nullable field; omitting the key leaves it unchanged.
- **`schema` is a slug or an id.** Slugs (`students`, `products`) are the ergonomic choice.
