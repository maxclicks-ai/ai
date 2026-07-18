---
name: maxclicks-imports
description: Bulk-import contacts or objects into maxclicks from a CSV file, poll import status, and download the per-row failure log. Use for real bulk loads (hundreds+ rows), not one-off record writes.
---

# Bulk CSV imports in maxclicks

Builds on the `maxclicks` skill and `maxclicks-contacts` (read those first for the schema-based data model and single-record writes). For a handful of records, looping `records upsert` is simpler and is covered in `maxclicks-contacts`. **For a real bulk load, use imports**: the platform streams and validates the CSV server-side, reports per-row failures, and does not count against the normal per-request payload limits.

## Step 1: Discover the schema

```bash
maxclicks whoami
maxclicks schemas list --type contact     # or --type object
maxclicks attributes list students        # CSV column headers should match these keys
```

Contact and object schemas only, **event schemas and integration-owned schemas are rejected**.

## Step 2: Upload the CSV, then submit its URL

The import endpoint does not accept inline CSV text or a file upload body, it takes the URL of an **already-uploaded** file (your own storage, a signed URL, anywhere reachable). Upload the CSV wherever your app already stores files, then:

```bash
maxclicks imports create students --data '{
  "fileUrl": "https://your-storage.example.com/contacts.csv",
  "byteSize": 48213
}'
# -> { "id": "imp_01hx...", "status": "pending", "rowCount": 0, ... }
```

Optional fields: `fileName`, `defaultTags: [...]` (applied to every imported row), `defaultSubscriptions: [...]` (contact schemas only). `--idempotency-key` is supported, useful if the create call itself needs a safe retry. **Files over 50 MB are rejected** (`import_file_too_large`).

## Step 3: Poll status

```bash
maxclicks imports get imp_01hx...
```

`status` moves through `pending` -> `running` -> a terminal state: `succeeded`, `partial` (some rows failed), `failed`, or `canceled`. Poll on an interval (imports are not instant for large files); there is no webhook/push notification for import completion today. `successCount`/`failureCount`/`skippedFieldCount` and a `failureSamples` preview (first few failing rows) are on the same object once processing starts.

## Step 4: Download the full failure log (on `partial`/`failed`)

```bash
maxclicks imports download-failure-log imp_01hx... > failures.csv
```

This streams the per-row failure CSV to stdout (redirect to a file as needed). It is an **authenticated proxy endpoint**, not a public storage link, do not try to construct the URL yourself or share it unauthenticated; always go through this command (or `GET /imports/{id}/failure-log` with a Bearer key).

## Cancel a running import

```bash
maxclicks imports cancel imp_01hx...
```

Only meaningful while `status` is `pending` or `running`.

## List a schema's imports

```bash
maxclicks imports list students --all
```

## Full example

```bash
maxclicks whoami
maxclicks schemas list --type contact
maxclicks imports create students --data '{"fileUrl":"https://storage.example.com/students.csv","byteSize":102400,"defaultTags":["import-2026-07"]}'
# imp_01hx...
maxclicks imports get imp_01hx...
# status: "partial", failureCount: 3
maxclicks imports download-failure-log imp_01hx... > failures.csv
```

## Gotchas

- **`fileUrl` must already be uploaded and reachable**; there is no multipart/binary upload on this endpoint. Host the CSV yourself first.
- **Both `fileUrl` and `byteSize` are required.** `byteSize` is not derived server-side from the file.
- **50 MB hard limit.** Split larger files.
- **Event schemas and integration-owned schemas cannot be imported into.** Use `events fire-batch` for events (see `maxclicks-events`); integration-owned schemas are managed by their integration's own sync.
- **CSV column headers should match real attribute keys** (same discovery discipline as any other write): `attributes list <schema>` first. Undefined columns are dropped, not rejected, and counted in `skippedFieldCount`.
- **No push notification on completion.** Poll `imports get <id>` until `status` is terminal.
- **The failure log is authenticated, not a public URL**, even though the object exposes a `failureLogUrl` field; always fetch it through the API (or `download-failure-log`), never try to hand a raw storage URL to someone else.
- **For under a few dozen records, prefer looping `records upsert`** (idempotent, immediate feedback per row, see `maxclicks-contacts`) over spinning up an import; imports exist for real bulk loads where per-request payload limits and inline error handling stop being practical.
