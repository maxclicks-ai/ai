# maxclicks gotchas

Non-obvious facts that will bite you if you assume otherwise. Read before any non-trivial task.

## Data model

- **Schemas and attributes have real write endpoints, and the CLI wraps them**: `maxclicks schemas create|update|delete` and `maxclicks attributes create`. Attribute creation supports both stored types (`--data` with a `definition`) and AI-generated evaluated attributes (`--requirements`, see `references/requirements.md`). Still discover before writing: this is a deliberate schema-design action, not a shortcut for a missing key on one record.
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

- **`templates send` is synchronous** and returns `{ emailId, status: "sent"|"failed", error? }`, with any warnings in the same body's `warnings` array. A `"failed"` status (a genuine SES failure) is a normal `200` result, not an exception; read it. Pre-send validation/eligibility problems (no credits, domain not verified, recipient suppressed/unsubscribed, etc.) throw as real HTTP errors (400/402/422) instead of coming back as `status: "failed"`.
- **A successful send call does not guarantee delivery**, only that SES accepted the send attempt; delivery/bounce events land on the email record afterward. The call sending records into the platform can also mutate them (inputting a contact updates it).
- **Marketing vs transactional and the topic are properties of the template/broadcast content, not the send call.** You cannot override them at send time.
- **Template and broadcast authoring are full CLI commands now** (`maxclicks templates create|update|duplicate|delete`, `maxclicks broadcasts create|update|send`), not raw-API only. See `maxclicks-templates` and `maxclicks-broadcasts`.

## Webhooks

- **The signing secret is shown once** (on `create` and `rotate-secret`) and never returned again by `get`/`list`. Save it immediately; verify inbound payloads with it.
- **Integration-owned webhooks** (non-null `integrationVendorName`) cannot be updated, deleted, or rotated via the API (403 `webhook_integration_owned`).
- **`schemaId` is required for every trigger except `email event`;** `emailEventTypes` is required (and only used) when `trigger` is `email event`.
- **Custom filter conditions are supported via natural language.** `condition: { type: "custom filter", requirements: "..." }` is accepted on create/update alongside `{ type: "none" }` and `{ type: "segment", segmentId }`; the server generates and stores the check expression, never returned. On read, a custom filter reduces to `{ type: "custom filter", description }`. See `references/requirements.md` for how to phrase `requirements`.

## Workflows

- **`workflows trigger` errors can be `text/plain`, not the JSON envelope.** The SDKs/CLI normalize this, but if you hit the raw endpoint, do not assume JSON on failure.
- The `<reference>` is the incoming-webhook step's reference id, configured on the workflow in the app.
- **Observability and lifecycle are full CLI commands**: `maxclicks workflows list|get|runs|get-run|pause|unpause|delete`, alongside `trigger`. There is still no create-workflow/add-step/edit-step endpoint; steps are built in the app.

## Auth and permissions

- **Reads need any valid key; writes need a write-permission key; suppressions need an admin key.** A 403 usually means the key lacks the permission or the key's space does not match.
- Keys are space-scoped. If `whoami` shows the wrong space, switch keys/profiles.

## Pagination

- `offset` is capped at 10000: a request with a larger offset is **rejected outright** with `400 offset_too_large`, it does not just silently stop returning results. `--all`/auto-pagination surfaces that as an error once it reaches the cap. Use filters, narrower schemas, or (for events) the cursor-based `GET /events` list for bigger sets.
