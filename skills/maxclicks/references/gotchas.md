# maxclicks gotchas

Non-obvious facts that will bite you if you assume otherwise. Read before any non-trivial task.

## The surface

- **The current source contract has 58 functional operations across 16 groups.** Client coverage differs; check the entry skill before using a CLI/SDK example. Use the matching server/OpenAPI source for newer operations rather than guessing routes.
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

- **Use `upsert` for identity-based synchronization.** Repeating an upsert finds the same record but can repeat side effects. A supported stable idempotency key replays one logical operation.
- **`update` and `upsert` treat explicit `null` as "clear this field".** Omit a key to leave it unchanged; send `null` to clear a nullable field.
- **Read-only contact fields** (`source`, `subscriptions`, `emailStatistics`) cannot be set through these endpoints; they are platform-managed.
- **Seventeen REST operations support `Idempotency-Key`; see the exact table in `references/api-reference.md`.** Replays return recorded status/body, including recorded errors and webhook secrets. Changed input returns `422 idempotency_key_reused`; active work returns `409 idempotency_conflict`; unknown outcomes require reconciliation. Completed entries expire after 24 hours, unresolved entries do not. Node exposes the key on seven methods; CLI flags cover four. Do not infer full server support from a client option.

## Deletion

Record DELETE returns `{ operationId, status, message }`. Poll `GET /record-deletions/{operationId}` until `completed`; `pending` is unfinished and `blocked` needs reconciliation. Current client declarations may describe the older deleted-record shape.

## Events

- **Event acceptance returns a durable receipt (HTTP 202).** `{ accepted: 1, id, eventId, isDuplicate, readinessAtAcceptance }` records the original acceptance. Poll `GET /events/{schema}/{id}/status` with the maxclicks `id` for current `pending`, `ready`, `failed` or `outcome_unknown` readiness. Neither acceptance nor readiness proves downstream completion.
- **Use a stable `eventId` and unchanged occurrence input.** Events use this instead of an idempotency header. Reusing it with changed normalized payload or explicit occurredAt returns `409 event_id_conflict`; erased occurrences return `409 event_erased`.
- **Batch abort is HTTP 422 with a data result.** Validation/admission failure rolls back new acceptances, marks earlier new results `rolled_back`, and reports `failedIndex`; existing duplicates remain existing and later items are not attempted. Continue mode commits each item independently, so read every result even on HTTP 200.
- **`events list` contains ready events and uses cursors.** No offset or totalCount; follow `pagination.nextCursor`. It requires one schema, defaults to seven days, and clamps windows above 90 days. Workflow run history separately has a `history_before` cursor.
- **Events are immutable.** PATCH/DELETE guards return `405 events_immutable`. Inspect accepted occurrences by their status route and use the list for ready history.

## Email

- **Template send results need interpretation.** `sent` means provider acceptance, not delivery. HTTP 200 `failed` includes refusals, cancellation and unknown provider outcomes; it does not prove non-delivery. Preserve emailId and the original operation key and reconcile before a replacement send. Pre-send validation/eligibility problems use HTTP errors; a template with no email channel can return null fields.
- **Not every client hands that body back.** The CLI prints `{ "sent": true, "templateId": ... }` and the PHP and Ruby SDKs return void. When you need `status` and `emailId`, use another SDK or `maxclicks api POST /templates/<id>/send`.
- **`status: sent` does not guarantee delivery.** It records provider acceptance; use the later delivery/bounce evidence to establish what happened.
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

- **The signing secret appears on create/rotate responses and their idempotent replays.** Normal get/list never returns it. Save it securely; rotating invalidates the old secret.
- **Webhook create, update, delete and rotate support idempotency on the REST server.** Protect recorded/replayed secret bodies. Client helpers may lack header options; use direct HTTP when needed.
- **Integration-owned webhooks** (non-null `integrationVendorName`) cannot be updated, deleted, or rotated via the API (`403 webhook_integration_owned`).
- **`schemaId` is required for every trigger except `email event`;** `emailEventTypes` is required (and only used) when `trigger` is `email event`.
- **`trigger` and `schemaId` are immutable on update** (`400 webhook_immutable_field`). `update` changes `url`, `emailEventTypes`, `condition` and `status` only.
- **A `custom filter` condition is an AI call** on both create and update, in the 10/minute `ai` bucket, and costs credits. On read it reduces to `{ "type": "custom filter", "description": ... }`; the generated check expression is never returned.
- **`status` can go to `circuit breaker` on its own.** The platform trips it after repeated delivery failures, so a webhook that "stopped working" may just need investigation plus a `status: "live"` update.

## Workflows

- **Workflow trigger failures use the standard JSON error envelope.** A successful response contains `data: {}` and means a run was created, not completed.
- **The `<reference>` is the incoming-webhook step's reference id**, configured on the workflow in the app, not the workflow id. `404 workflow_step_not_found` covers a missing, duplicate, unpublished or paused-workflow step indistinguishably, so a 404 does not necessarily mean you have the wrong reference.
- **`trigger` needs Write permission.** The run can send email, spend credits, mutate records and issue HTTP requests. A stable supported idempotency key prevents a repeated trigger from creating another run.
- **Workflows are built and published in the app.** There is no create, add-step, edit-step, publish or delete operation. The API lists, gets, triggers, pauses, unpauses, and reads runs. `pause` stops new runs; in-flight runs finish normally. `isDirty` on a workflow means it has unpublished changes, which is a useful thing to report to a user whose trigger "does nothing".

## Auth and permissions

- **Authenticated resource reads need Read permission; writes need Write; suppression operations need Admin.** `GET /me` accepts any valid key, including an unbound key. A 403 can mean missing permission or a workspace mismatch.
- Keys are space-scoped, full-permission, and inherit the owner's membership. If `whoami` shows the wrong space, switch keys or profiles. Minting a key is an app action, which is exactly why: it is an escalation primitive.

## Pagination and limits

- `offset` above 10000 is rejected with `400 offset_too_large`. Server pagination sets `hasMore` false at its traversal cap, so `--all` is not an unlimited export. Records list does not accept ad-hoc filters.
- `limit` is clamped to 1..200 with a warning rather than rejected.
- Rate buckets are per key: reads 100/second, writes 25/second, AI-backed writes 10/minute. Honor Retry-After as seconds or an HTTP date, subject to the operation's retry-safety contract.
- Request bodies over 10 MB return `413 payload_too_large`.
