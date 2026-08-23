# maxclicks gotchas

Non-obvious facts that will bite you if you assume otherwise. Read before any non-trivial task.

## The surface

- **55 operations, 16 groups, and that is all there is.** If it is not in `references/api-reference.md`, it does not exist on the server. The raw escape hatch (`maxclicks api`) reaches the same routes, not a hidden set: an unlisted path returns 404.
- **Entities are authored in the app; the API triggers, reads and measures them.** Schemas, attributes, templates, broadcast content, domains, senders, topics and API keys are configured at `https://app.maxclicks.ai`. When a task calls for one of those, hand that half to the user and pick the work back up with a read (an API key is the one exception with nothing to read back). Do not report the feature as missing: it exists, it just lives on the other side.
- **Reads are not decoration.** `schemas list`, `attributes list`, `templates get`, `domains list`, `senders list` and `topics list` exist precisely so you can discover ids, keys and readiness before writing or sending.

## Data model

- **Undefined attribute keys are dropped, not rejected.** If you set a custom key that is not a defined attribute on the schema, the write succeeds but that key is ignored (surfaced as a `warnings` entry). Always `attributes list <schema>` first and only set defined keys. Read the `warnings` array on every write.
- **Records are flat, not nested.** Custom attributes go at the top level of the record object, alongside base fields. There is no `data`/`attributes`/`properties` wrapper.
- **`schema` is an id OR a slug.** Slugs are the ergonomic choice (`students`, `products`, `purchase-completed`).
- **Contact identity cascade:** `id` > `userId` > `email` > `phone`. Object identity: `id` > `externalId`. `upsert` merges by this cascade; conflicting identifier updates are skipped and reported in `warnings` rather than failing the whole call.
- **`url`, `email` and `phone` are not attribute types.** They are `format` values on `type: string`. And there is no `object` or `object array` type: nested structures are `type: json` with a `jsonSchema`. Expect this when reading a definition.
- **An `evaluated` attribute is computed, not stored.** Its generated expression is never returned.

## Writes

- **Prefer `upsert` over `create`.** `create` fails when the identity already exists; `upsert` is idempotent by identity.
- **`update` and `upsert` treat explicit `null` as "clear this field".** Omit a key to leave it unchanged; send `null` to clear a nullable field.
- **Read-only contact fields** (`source`, `subscriptions`, `emailStatistics`) cannot be set through these endpoints; they are platform-managed.
- **`Idempotency-Key` works on exactly seven operations**: `records.create`, `records.upsert`, `suppressions.batchCreate`, `suppressions.batchDelete`, `broadcasts.send`, `templates.send`, `workflows.trigger`. Everything else ignores it. A replay returns the original status and body with an `Idempotent-Replay: true` header; the key also covers a hash of the request body, so reusing a key with a different body returns `422 idempotency_key_reused` instead of replaying. Only `2xx` is cached: a rejected request can be corrected and retried under the same key. Client support is uneven: the CLI exposes `--idempotency-key` on four of the six, and the Node, Java and Elixir SDKs do not expose one at all.

## Events

- **`events fire` is fire-and-forget (HTTP 202).** It returns `{ "accepted": n }`, not the stored event, and does not fail if a downstream workflow or webhook is misconfigured. It is not for high-volume analytics; events should be meaningful and actionable (`purchase-completed`, `cart-abandoned`).
- **Use a stable `eventId` for deduplication.** Events are not idempotency-key aware, so `eventId` is your dedup mechanism. Re-firing with the same `eventId` on the same schema is deduped.
- **`fire-batch --on-error abort` returns HTTP 422 on the first invalid item.** That 422 body is a normal result carrying `results`, `summary` and `failedIndex`; the SDKs surface it as a value, not an exception, and the CLI prints it. Do not treat it as a transient error to retry.
- **`events list` is the only cursor-paginated endpoint.** No `offset`, no `totalCount`; page with `pagination.nextCursor`. It requires a `schema` query param, defaults to the last 7 days, and silently clamps a wider span to 90 days with a warning rather than rejecting it.
- **Events are immutable.** `PATCH`/`DELETE /events/{id}` always return `405 events_immutable`, and there is no get-an-event-by-id operation: find it through `events list`.

## Email

- **`templates send` is synchronous** and returns `{ emailId, status: "sent"|"failed", error? }`, with any warnings in the same body's `warnings` array. A `"failed"` status (a genuine SES failure) is a normal `200` result, not an exception; read it. Pre-send validation and eligibility problems (no credits, domain not verified, recipient suppressed or unsubscribed, and so on) throw as real HTTP errors (400/402/422) instead of coming back as `status: "failed"`.
- **Not every client hands that body back.** The CLI prints `{ "sent": true, "templateId": ... }` and the PHP and Ruby SDKs return void. When you need `status` and `emailId`, use another SDK or `maxclicks api POST /templates/<id>/send`.
- **A successful send call does not guarantee delivery**, only that SES accepted the attempt; delivery and bounce events land on the email record afterwards.
- **Sending has a side effect on your data.** Records referenced by the send `data` are upserted before rendering, so sending a template with extra fields on a contact also updates that contact.
- **Marketing vs transactional and the topic are properties of the template's content, not of the send call.** You cannot override them at send time; they are set when the template is authored in the app.
- **Broadcast content is not editable over the API.** `broadcasts update` accepts only `name`, `description`, `audience` and `scheduledFor`, and is rejected once sending has started (`409 broadcast_already_sending`). A broadcast's `audience` over the API is `{ "type": "all" }` or `{ "type": "segment", "segmentId": ... }`; a custom-filter audience can be read but only set in the app.
- **`broadcasts send` returns 202 and sends asynchronously.** A readiness failure is `422 broadcast_invalid` carrying an `issues[]` array: read the issues and report them, they name exactly what the broadcast is missing.

## Segments

- **There is no segment update.** Refining a segment happens in the app; over the API you create a new one. Get the `requirements` right the first time (see `references/requirements.md`).
- **`matchingCount` on the create response is a snapshot**, not a live field. Call `segments count` for the current value.
- **`segments contacts` hard-caps `limit` at 100** regardless of what you request.
- **Deleting a segment in use fails with `409 segment_in_use`** when it backs a broadcast audience, workflow trigger, or webhook condition.

## Webhooks

- **The signing secret is shown once** (on `create` and `rotate-secret`) and never returned again by `get`/`list`. Save it immediately; verify inbound payloads with it. Rotating invalidates the old secret instantly.
- **Neither `create` nor `rotate-secret` accepts an `Idempotency-Key`**, deliberately: replaying a cached response would re-expose the plaintext secret.
- **Integration-owned webhooks** (non-null `integrationVendorName`) cannot be updated, deleted, or rotated via the API (`403 webhook_integration_owned`).
- **`schemaId` is required for every trigger except `email event`;** `emailEventTypes` is required (and only used) when `trigger` is `email event`.
- **`trigger` and `schemaId` are immutable on update** (`400 webhook_immutable_field`). `update` changes `url`, `emailEventTypes`, `condition` and `status` only.
- **A `custom filter` condition is an AI call** on both create and update, in the 10/minute `ai` bucket, and costs credits. On read it reduces to `{ "type": "custom filter", "description": ... }`; the generated check expression is never returned.
- **`status` can go to `circuit breaker` on its own.** The platform trips it after repeated delivery failures, so a webhook that "stopped working" may just need investigation plus a `status: "live"` update.

## Workflows

- **`workflows trigger` errors can be `text/plain`, not the JSON envelope.** The SDKs and CLI normalize this, but if you hit the raw endpoint, do not assume JSON on failure. Authentication failures still use the JSON envelope.
- **The `<reference>` is the incoming-webhook step's reference id**, configured on the workflow in the app, not the workflow id. `404 workflow_step_not_found` covers a missing, duplicate, unpublished or paused-workflow step indistinguishably, so a 404 does not necessarily mean you have the wrong reference.
- **`trigger` needs a write-permission key**, not a read key: the run it starts can send email, spend credits, call AI, mutate records, and issue outbound HTTP requests. It is also one of the six idempotency-aware operations, which is the right way to make a retried external webhook delivery safe.
- **Workflows are built and published in the app.** There is no create, add-step, edit-step, publish or delete operation. The API lists, gets, triggers, pauses, unpauses, and reads runs. `pause` stops new runs; in-flight runs finish normally. `isDirty` on a workflow means it has unpublished changes, which is a useful thing to report to a user whose trigger "does nothing".

## Auth and permissions

- **Reads need any valid key; writes need a write-permission key; the five suppression operations need an admin key.** A 403 usually means the key lacks the permission or the key's space does not match.
- Keys are space-scoped, full-permission, and inherit the owner's membership. If `whoami` shows the wrong space, switch keys or profiles. Minting a key is an app action, which is exactly why: it is an escalation primitive.

## Pagination and limits

- `offset` is capped at 10000: a request past it is **rejected outright** with `400 offset_too_large`, it does not silently stop returning results. `--all` and SDK auto-pagination surface that as an error on reaching the cap. Narrow the query with filters instead of walking past that depth.
- `limit` is clamped to 1..200 with a warning rather than rejected.
- Rate buckets are per key: reads 100/second, writes 25/second, AI-backed writes 10/minute. On 429 the SDKs and CLI back off honoring `Retry-After` (an HTTP date, UTC).
- Request bodies over 10 MB return `413 payload_too_large`.
