# maxclicks gotchas

Non-obvious facts that will bite you if you assume otherwise. Read before any non-trivial task.

## Data model

- **Schemas and attributes cannot be created via the API/CLI/SDK.** They are read-only. If a task needs a new schema or attribute, the user must add it in the maxclicks app (`https://app.maxclicks.ai`). Do not build a workaround.
- **Undefined attribute keys are dropped, not rejected.** If you set a custom key that is not a defined attribute on the schema, the write succeeds but that key is ignored (surfaced as a `warnings` entry). Always `attributes list <schema>` first and only set defined keys. Read the `warnings` array on writes.
- **Records are flat, not nested.** Custom attributes go at the top level of the record object, alongside base fields. There is no `data`/`attributes`/`properties` wrapper.
- **`schema` is an id OR a slug.** Slugs are the ergonomic choice (`students`, `products`, `purchase-completed`).
- **Contact identity cascade:** `id` > `userId` > `email` > `phone`. Object identity: `id` > `externalId`. `upsert` merges by this cascade; conflicting identifier updates are skipped and reported in `warnings` rather than failing the whole call.

## Writes

- **Prefer `upsert` over `create`.** `create` throws `identifier_conflict` (409) if the identity already exists; `upsert` is idempotent.
- **`update` and `upsert` treat explicit `null` as "clear this field".** Omit a key to leave it unchanged; send `null` to clear a nullable field.
- **Read-only contact fields** (`source`, `subscriptions`, `emailStatistics`) cannot be set through these endpoints; they are managed by the platform.

## Events

- **`events fire` is fire-and-forget (HTTP 202).** It returns `{ "accepted": n }`, not the stored event, and does not fail if a downstream workflow/webhook is misconfigured. It is not for high-volume analytics; events should be meaningful and actionable (e.g. `purchase-completed`, `cart-abandoned`).
- **Use a stable `eventId` for deduplication.** Re-firing with the same `eventId` on the same schema is deduped.
- **`fire-batch --on-error abort` returns HTTP 422 on the first invalid item.** That 422 body is a normal result carrying `results`, `summary`, and `failedIndex`; the SDKs surface it as a value, not an exception. The CLI prints it. Do not treat it as a transient error to retry.

## Email

- **`templates send` returns an empty body on success**; warnings are on the `maxclicks-Warning-Message` response header. The CLI/SDKs surface those warnings for you.
- **A successful send call does not guarantee delivery.** SES failures are recorded on the email record, not thrown. The call sending records into the platform can also mutate them (inputting a contact updates it).
- **Marketing vs transactional and the topic are properties of the template content, not the send call.** You cannot override them at send time.

## Webhooks

- **The signing secret is shown once** (on `create` and `rotate-secret`) and never returned again by `get`/`list`. Save it immediately; verify inbound payloads with it.
- **Integration-owned webhooks** (non-null `integrationVendorName`) cannot be updated, deleted, or rotated via the API (403 `webhook_integration_owned`).
- **`schemaId` is required for every trigger except `email event`;** `emailEventTypes` is required (and only used) when `trigger` is `email event`. Custom-filter conditions are app-only; the API accepts only `{ type: "none" }` or `{ type: "segment", segmentId }`.

## Workflows

- **`workflows trigger` errors can be `text/plain`, not the JSON envelope.** The SDKs/CLI normalize this, but if you hit the raw endpoint, do not assume JSON on failure.
- The `<reference>` is the incoming-webhook step's reference id, configured on the workflow in the app.

## Auth and permissions

- **Reads need any valid key; writes need a write-permission key; suppressions need an admin key.** A 403 usually means the key lacks the permission or the key's space does not match.
- Keys are space-scoped. If `whoami` shows the wrong space, switch keys/profiles.

## Pagination

- `offset` is capped at 10000. For very large datasets, offset pagination cannot page past ~10000 items; `--all`/auto-pagination stops there. Use filters or narrower schemas for bigger sets.
