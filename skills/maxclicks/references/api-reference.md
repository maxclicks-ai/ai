# maxclicks API reference (CLI + SDK + HTTP)

The complete Public API v1 surface: **16 resource groups, 55 operations**, spec version 1.1.0. Base URL `https://api.maxclicks.ai/v1` (stage: `api-stage`). Auth: `Authorization: Bearer <api_key>` on everything except the public form/email endpoints.

**The surface follows one principle:** entities are *authored in the maxclicks app*, and the API *triggers, reads and measures* them. Schemas, attributes, templates, broadcast content, domains, senders and topics are created and configured in the app; this API reads them back so a caller can discover ids, shapes and status, and drives the sends and automations that depend on them. (API keys are also minted in the app, and are the one thing this API does not read back: a key is full-permission and inherits the owner's membership.)

**Coverage:** every operation below is wrapped by the CLI **and** by all eight SDKs (Node, Python, Go, PHP/Laravel, Ruby, Java, Rust, Elixir), with three exceptions: the public `forms.*` and `emails.*` endpoints are in the SDKs but have no CLI subcommand (reach them with `maxclicks api` if you must). If a method or subcommand is not listed here, it does not exist: do not invent one, and do not reach for the raw escape hatch expecting a hidden endpoint.

## Envelopes and conventions

- Success: `{ "data": <payload>, "warnings"?: [ ... ] }`. Paginated (offset-based, every list except `events.list`): `{ "data": [ ... ], "pagination": { "limit", "offset", "totalCount", "hasMore" }, "warnings"?: [ ... ] }`. `events.list` uses a cursor envelope instead: `{ "limit", "nextCursor", "hasMore" }`, no `offset`, no `totalCount`.
- Error: `{ "error": { "type": "invalid_request_error" | "api_error", "code": <string|null>, "message": <string>, "issues"?: [ ... ] } }`. `type` is `invalid_request_error` for every 4xx and `api_error` for every 5xx. `issues` appears only on the few validation gates that report several problems at once (notably `broadcasts.send`'s `broadcast_invalid`).
- Pagination: `limit` default 50, clamped to 1..200 with a warning; `offset` default 0. **`offset` above 10000 is rejected with `400 offset_too_large`**, not clamped, so a client cannot silently page forever. Narrow the query instead. CLI `--all` walks every page; the SDKs auto-paginate.
- Rate limits per key, three buckets: `read` 100/second (every `GET`), `write` 25/second (every other `POST`/`PATCH`/`DELETE`), `ai` 10/minute (the LLM-backed calls: `segments.create`, and `webhooks.create`/`webhooks.update` when they carry a `custom filter` condition). On 429 you get a `Retry-After` header (an HTTP date, UTC); the SDKs and CLI retry with backoff honoring it.
- Beyond the usual codes, four appear here: `402` (`insufficient_credits` on an AI call or a schema with AI auto-fill; `email_limit_reached` on `templates.send`), `405` (`events_immutable`), `413` (`payload_too_large`, body over 10 MB), `415` (`unsupported_media_type`). `400` also covers `malformed_json`.
- Path values (schema slug, ids) are URL-encoded for you by the CLI and SDKs.
- `Perm` below is the caller key's minimum space-membership permission (`read` / `write` / `admin`). A key with less returns 403. Only the five suppression operations require `admin`.

## Idempotency: exactly seven operations

`Idempotency-Key` is accepted on **seven** operations and no others:

| Operation | HTTP |
| --- | --- |
| `records.create` | `POST /schemas/{schema}/records` |
| `records.upsert` | `POST /schemas/{schema}/records/upsert` |
| `suppressions.batchCreate` | `POST /contacts/suppressions/batch` |
| `suppressions.batchDelete` | `POST /contacts/suppressions/batch-remove` |
| `broadcasts.send` | `POST /broadcasts/{id}/send` |
| `templates.send` | `POST /templates/{templateId}/send` |
| `workflows.trigger` | `POST /workflows/{workflowStepReference}` |

The first request with a given key executes normally; a retry while the original is still in flight returns `409 idempotency_conflict`; a retry after completion replays the original status and body verbatim with an `Idempotent-Replay: true` response header. Records expire after 24 hours.

Only `2xx` responses are cached. A `4xx` is not: the request was rejected before doing anything, so there is no side effect to replay and you are free to fix the payload and retry with the same key. A `5xx` is not cached either, so it re-executes.

The key is scoped to the API key, the resolved request path, and a hash of the request body. Two different resources under one key therefore do not collide, and reusing a key with a **changed** body returns `422 idempotency_key_reused` rather than silently replaying the first response. JSON key order does not matter: the body is canonicalized before hashing, so a reordered but otherwise identical retry still replays.

Everything else is not idempotency-aware. For `events.fire`/`events.fireBatch`, dedupe with a stable `eventId` of your own. `webhooks.create` and `webhooks.rotateSecret` deliberately refuse it, because replaying a cached response would re-expose the plaintext signing secret.

Client support is uneven, so check before you rely on it. The CLI exposes `--idempotency-key` on four of the seven (`records create`, `records upsert`, `suppressions batch-add`, `suppressions batch-remove`) and has no way to set it on `templates send` or `workflows trigger` (`maxclicks api` sends no custom headers either). Among the SDKs, Python, Go, PHP, Ruby and Rust take an idempotency key per call; Node, Java and Elixir do not expose one.

## 1. Meta (1)

| Op | CLI | SDK | HTTP | Perm |
| --- | --- | --- | --- | --- |
| Whoami | `maxclicks whoami` | `me()` | `GET /me` | any valid key |

Returns `{ apiKey: { id, name, keyDisplay, createdAt }, user: { id, email, name }, space: { id, slug, name } | null, role: { name, label, description } | null }`. `role.name` is `admin`, `non-paid admin`, or `member`. Run this first to confirm which space the key is bound to.

## 2. Schemas (2, read-only)

| Op | CLI | SDK | HTTP | Perm |
| --- | --- | --- | --- | --- |
| List | `maxclicks schemas list [--type contact\|object\|event] [--all]` | `schemas.list({ type, limit, offset })` | `GET /schemas` | read |
| Get | `maxclicks schemas get <schema>` | `schemas.get(schema)` | `GET /schemas/{schema}` | read |

`Schema` = `{ id, type: contact|object|event, slug, name, namePlural, description, integrationVendorName, attributeCount, createdAt, updatedAt }`. `attributeCount` counts custom attributes only, base attributes excluded. `{schema}` accepts an id or a slug; slugs are the ergonomic choice.

Schemas are **created and edited in the app**, under Settings then Schemas (`https://app.maxclicks.ai/-/settings/schemas`). There is no schema write endpoint, because the platform has no schema-migration system yet: a schema created over the API could never be corrected afterwards, and would not even be able to receive attributes. Discover here; author there.

## 3. Attributes (1, read-only)

| Op | CLI | SDK | HTTP | Perm |
| --- | --- | --- | --- | --- |
| List | `maxclicks attributes list <schema> [--all]` | `attributes.list(schema, { limit, offset })` | `GET /schemas/{schema}/attributes` | read |

Base attributes first, then custom ones. `Attribute` = `{ id, key, label, description, sequence, definition, integrationVendorName, createdAt, updatedAt }`. `id` is an `attr_`-prefixed id for custom attributes and `base:<key>` for platform base attributes; `sequence` is null for base attributes.

`definition.type` is one of `string`, `number`, `decimal`, `boolean`, `date time`, `date only`, `time only`, `string array`, `json`, `evaluated`. Two traps worth internalizing:

- **`url`, `email` and `phone` are not types.** They are `format` values on `type: string`. With `multiLine` false or absent the formats are `plain text`, `email`, `phone`, `url`; with `multiLine: true` they are `plain text` or `code`.
- **There is no `object` or `object array` type.** Nested structures are `type: json` with a `jsonSchema`.

`nullable` is present on every stored definition and absent on `evaluated`. An `evaluated` attribute is computed rather than stored (an AI-generated expression run server-side); its generated expression is never returned by any endpoint at any permission level.

Attributes are authored in the app for the same reason as schemas: no migration system means a wrong type or a wrong key could not be fixed. Read them here so your writes only ever set keys that exist.

## 4. Records: contacts and objects (7)

| Op | CLI | SDK | HTTP | Perm |
| --- | --- | --- | --- | --- |
| List | `maxclicks records list <schema> [--all]` | `records.list(schema, { limit, offset })` | `GET /schemas/{schema}/records` | read |
| Get | `maxclicks records get <schema> <id>` | `records.get(schema, id)` | `GET /schemas/{schema}/records/{id}` | read |
| Create | `maxclicks records create <schema> --data '<json>' [--idempotency-key <key>]` | `records.create(schema, input)` | `POST /schemas/{schema}/records` (201, Idem) | write |
| Upsert | `maxclicks records upsert <schema> --data '<json>' [--idempotency-key <key>]` | `records.upsert(schema, input)` | `POST /schemas/{schema}/records/upsert` (Idem) | write |
| Update | `maxclicks records update <schema> <id> --data '<json>'` | `records.update(schema, id, input)` | `PATCH /schemas/{schema}/records/{id}` | write |
| Delete | `maxclicks records delete <schema> <id>` | `records.delete(schema, id)` | `DELETE /schemas/{schema}/records/{id}` | write |
| Audit trail | `maxclicks records audit-trail <schema> <id> [--channel email] [--all]` | `records.auditTrail(schema, id, { channel, limit, offset })` | `GET /schemas/{schema}/records/{id}/audit-trail` | read |

Records are **flat**: `{ id?, email, firstName, lastName, fullName, avatarUrl, userId, phone, notes, tags: [...], subscriptions: ["email"], topicIds: [...], <customKey>: <value> }` for contacts; `{ externalId, notes, tags, <customKey> }` for objects. There is no `data`/`attributes`/`properties` wrapper.

`create` fails when the identity already exists; `upsert` matches by `id > userId > email > phone` (contact) or `id > externalId` (object). `update`/`upsert` with an explicit `null` clears a nullable field; omit a key to leave it unchanged. `source`, `subscriptions` and `emailStatistics` are platform-managed and not settable. Conflicting identifier updates on `upsert` are skipped and reported in `warnings` rather than failing the call. Audit trail is contacts only, newest first, and strips `ipAddress`/`userAgent` from the returned `context`.

## 5. Suppressions (5, admin key)

| Op | CLI | SDK | HTTP | Perm |
| --- | --- | --- | --- | --- |
| List | `maxclicks suppressions list [--identifier <email>] [--all]` | `suppressions.list({ identifier, limit, offset })` | `GET /contacts/suppressions` | admin |
| Create | `maxclicks suppressions create --identifier <email> --reason manual\|legal [--notes <text>]` | `suppressions.create(input)` | `POST /contacts/suppressions` (201) | admin |
| Batch create | `maxclicks suppressions batch-add --data '<json>' [--idempotency-key <key>]` | `suppressions.batchCreate(inputs)` | `POST /contacts/suppressions/batch` (1-100, Idem) | admin |
| Batch delete | `maxclicks suppressions batch-remove --data '<json>' [--idempotency-key <key>]` | `suppressions.batchDelete(ids)` | `POST /contacts/suppressions/batch-remove` (1-100, Idem) | admin |
| Delete | `maxclicks suppressions delete <id>` | `suppressions.delete(id)` | `DELETE /contacts/suppressions/{id}` | admin |

Only `manual` and `legal` are settable reasons. `unsubscribed`, `hard_bounce`, `soft_bounce_consecutive` and `spam_complaint` are system-applied and read-only: deleting one returns `403 suppression_reason_not_removable`. Suppressions are stored by hashed identifier, never by contact, and the raw identifier is never returned (only `identifierHash`). `list` includes global suppressions alongside space-scoped ones, since both block sends. `affectedContactCount` appears only on create responses.

Batch bodies are **wrapped objects, not bare arrays**: `{ "suppressions": [{ identifier, reason, notes? }, ...] }` for batch create, `{ "ids": ["<id>", ...] }` for batch remove. Both always respond `200` with per-item results and a summary; an already-existing suppression comes back as `exists`, not as a failure. Single create and single delete are not idempotency-aware.

## 6. Events (3)

| Op | CLI | SDK | HTTP | Perm |
| --- | --- | --- | --- | --- |
| List | `maxclicks events list --schema <schema> [--from <iso>] [--to <iso>] [--cursor <c>] [--limit <n>] [--all]` | `events.list({ schema, from, to, cursor, limit })` | `GET /events?schema=<id-or-slug>` | read |
| Fire | `maxclicks events fire <schema> --data '<json>'` | `events.fire(schema, input)` | `POST /events/{schema}` (202) | write |
| Fire batch | `maxclicks events fire-batch <schema> --data '<json-array>' [--on-error abort]` | `events.fireBatch(schema, events, { onError })` | `POST /events/{schema}/batch` (1-500) | write |

Event input is flat: `{ eventId?, occurredAt?, <customKey> }`. Any `id` is ignored on fire.

`fire` is asynchronous fire-and-forget: `202` with `{ accepted: n }`, not the stored event, and it does not fail when a downstream workflow or webhook is misconfigured. If the ingest pipeline is down you get `502 ingest_unavailable`.

`fireBatch`'s HTTP body is a **wrapped object**, `{ "events": [ ... ], "onError": "continue"|"abort" }` (the CLI's `--data` takes the bare array and the SDKs take the array argument; both wrap it for you). It returns `{ results, summary }`, plus `failedIndex` on an abort. With `onError: continue` (the default) every item is validated and the whole valid subset is ingested in one call; if that single ingest call fails, the whole request fails `502` rather than partially succeeding. With `onError: abort` the batch stops at the first invalid item, ingests nothing, and returns `422` carrying that same body: **a result to read, not an error to retry.**

`events.list` requires the `schema` query param (one schema per call) and reads the ClickHouse-backed archive, so it sees every event ever fired. `from`/`to` default to the 7 days before now; a span wider than 90 days is silently clamped with a warning, not rejected. It is the only cursor-paginated endpoint in v1: pass `pagination.nextCursor` back as `cursor`, and expect no `offset` and no `totalCount`. Errors: `invalid_cursor`, `invalid_time_range`, `event_archive_unavailable` (502).

Events are immutable: `PATCH`/`DELETE /events/{id}` always return `405 events_immutable`. There is no get-an-event-by-id operation; find it through `events.list`.

## 7. Domains (2, read-only)

| Op | CLI | SDK | HTTP | Perm |
| --- | --- | --- | --- | --- |
| List | `maxclicks domains list [--all]` | `domains.list({ limit, offset })` | `GET /domains` | read |
| Get | `maxclicks domains get <id>` | `domains.get(id)` | `GET /domains/{id}` | read |

`Domain` = `{ id, createdAt, updatedAt, name, customReturnPath, verificationStarted, verifiedForSending, records? }`. `records` (live-checked DNS records) is present on `get` and omitted on `list`, so call `get` when you need to show someone what to add to their DNS.

Domains are registered and verified in the app. Registering one reserves the name globally and provisions AWS SES resources, so it is not an API action. Read `verifiedForSending` here: a verified domain is required before it, or any sender on it, can send. See the `maxclicks-deliverability` skill.

## 8. Senders (1, read-only)

| Op | CLI | SDK | HTTP | Perm |
| --- | --- | --- | --- | --- |
| List | `maxclicks senders list [--all]` | `senders.list({ limit, offset })` | `GET /senders` | read |

`Sender` = `{ id, createdAt, updatedAt, name, description, code, domainId, email }`. A sender is a saved `{ code, name, domainId }` on a verified domain; `code` is the email local part and `email` is the derived `code@domain`. Sender profiles are created in the app; read them here to pick a `senderId`.

## 9. Topics (2, read-only)

| Op | CLI | SDK | HTTP | Perm |
| --- | --- | --- | --- | --- |
| List | `maxclicks topics list [--all]` | `topics.list({ limit, offset })` | `GET /topics` | read |
| Get | `maxclicks topics get <id>` | `topics.get(id)` | `GET /topics/{id}` | read |

`Topic` = `{ id, createdAt, updatedAt, name, description, color, channel, private }`. `channel` is `email` (the only channel today). `private` topics only appear on the contact preferences page when the contact has been granted access. Topics are defined in the app; read them to resolve a `topicIds` value on a record, or to understand a template's `communicationTopicId`. See the `maxclicks-topics` skill.

## 10. Segments (6, the natural-language domain)

| Op | CLI | SDK | HTTP | Perm |
| --- | --- | --- | --- | --- |
| List | `maxclicks segments list [--all]` | `segments.list({ limit, offset })` | `GET /segments` | read |
| Create | `maxclicks segments create --name <name> --contact-schema <schema> --requirements '<text>' [--description <text>]` | `segments.create({ name, contactSchema, requirements, description })` | `POST /segments` (201) | write (**AI**) |
| Get | `maxclicks segments get <id>` | `segments.get(id)` | `GET /segments/{id}` | read |
| Count | `maxclicks segments count <id>` | `segments.count(id)` | `GET /segments/{id}/count` | read |
| List contacts | `maxclicks segments contacts <id> [--all]` | `segments.listContacts(id, { limit, offset })` | `GET /segments/{id}/contacts` | read |
| Delete | `maxclicks segments delete <id>` | `segments.delete(id)` | `DELETE /segments/{id}` | write |

Create body: `{ name, contactSchema, requirements, description? }`, where `contactSchema` is a contact schema id or slug and `requirements` is a plain-English description of the filter. Every create is an AI call (the `ai` rate bucket, credits checked first) and takes roughly 10 to 90 seconds. Errors: `schema_not_found`, `invalid_segment`, `segment_generation_failed` (422), `segment_name_conflict` (409), `insufficient_credits` (402).

`Segment` = `{ id, createdAt, updatedAt, name, description, contactSchemaId, contactSchemaSlug, requirements, conditionDescriptionMarkdown, integrationVendorName, matchingCount? }`. The generated query/check expressions are never returned; `conditionDescriptionMarkdown` is the human-readable contract to review. `matchingCount` is present only on the create response, a live count at that moment, not kept in sync: call `segments.count` (which returns `{ count, total }`) for the current value.

`segments.listContacts` hard-caps `limit` at 100 regardless of what you request. Delete errors: `segment_integration_owned` (403), `segment_in_use` (409, when it backs a broadcast audience, workflow trigger, or webhook condition).

There is no segment update operation. **Refining a segment's `requirements` happens in the app**, where a human reviews the regenerated condition; over the API, create a new segment. See `references/requirements.md` and the `maxclicks-segments` skill.

## 11. Broadcasts (6)

| Op | CLI | SDK | HTTP | Perm |
| --- | --- | --- | --- | --- |
| List | `maxclicks broadcasts list [--all]` | `broadcasts.list({ limit, offset })` | `GET /broadcasts` | read |
| Get | `maxclicks broadcasts get <id>` | `broadcasts.get(id)` | `GET /broadcasts/{id}` | read |
| Update | `maxclicks broadcasts update <id> --data '<json>'` | `broadcasts.update(id, params)` | `PATCH /broadcasts/{id}` | write |
| Send | `maxclicks broadcasts send <id> [--data '{"scheduledFor":"<iso>"}']` | `broadcasts.send(id, { scheduledFor })` | `POST /broadcasts/{id}/send` (202) | write |
| List runs | `maxclicks broadcasts runs <id> [--all]` | `broadcasts.listRuns(id, { limit, offset })` | `GET /broadcasts/{id}/runs` | read |
| Metrics | `maxclicks broadcasts metrics <id>` | `broadcasts.getMetrics(id)` | `GET /broadcasts/{id}/metrics` | read |

A broadcast (its content, its sender, its data shape) is **composed in the app**, where the preview pipeline renders it before anyone can schedule a mass send. The API takes it from there: point it at an audience, schedule or fire it, and measure the result.

`Broadcast` = `{ id, createdAt, updatedAt, name, description, contactSchemaId, contactSchemaSlug, schedulingStatus, scheduledFor, sendingStartedAt, sendingFinishedAt, failureReason, audience, hasContent }`. `schedulingStatus` is `none` / `draft` / `send now` / `send at`. `hasContent` is a boolean summary only: the underlying email content (raw Adaptyle markup and so on) is never returned.

`update` accepts only `name`, `description`, `audience` and `scheduledFor`, at least one of them, and is rejected once sending has started (`409 broadcast_already_sending`). `schedulingStatus` only ever changes through `send`. Content is not editable here.

`audience` on input is `{ "type": "all" }` or `{ "type": "segment", "segmentId": "<id>" }`. A `custom filter` audience can be read back but **cannot be set over the API**: it is authored in the app so a human reviews the generated condition before it drives a mass send.

`send` with no body sends now; with `{ "scheduledFor": "<iso>" }` it schedules. It runs the same readiness gate the app runs (content present, sender set, and so on) and returns `202` on acceptance; the sending itself is asynchronous. A readiness failure is `422 broadcast_invalid` carrying an `issues[]` array, which is the thing to read and report.

`listRuns` gives one reduced run record per recipient contact. `metrics` returns aggregated send/open/click/bounce counts, with `email` omitted entirely when the broadcast has no content yet. See the `maxclicks-broadcasts` skill.

## 12. Templates (3)

| Op | CLI | SDK | HTTP | Perm |
| --- | --- | --- | --- | --- |
| List | `maxclicks templates list [--all]` | `templates.list({ limit, offset })` | `GET /templates` | read |
| Get | `maxclicks templates get <id>` | `templates.get(id)` | `GET /templates/{id}` | read |
| Send | `maxclicks templates send <templateId> --data '<json>'` | `templates.send(templateId, { data })` | `POST /templates/{templateId}/send` (Idem) | write |

Templates are **authored in the app**: the content, the sender, the recipient path and the expected data shape all go through the app's preview and render pipeline before a template becomes sendable. Read one here to learn what payload it wants, then send it.

`Template` = `{ id, createdAt, updatedAt, name, description, transactional, contentFormat: mjml|html|null, contentEditor: rich|raw|null, content: { subject, body } | null, from, recipientDataPath, expectedDataRepresentation, communicationTopicId }`. `from` is either `{ type: "domain", domainId, code, name? }` or `{ type: "sender", senderId }`. `recipientDataPath` is an array of property-key segments pointing at the contact or email address inside the payload. Whether a message is transactional and which topic it belongs to are properties of the template, not of the send call: you cannot override them at send time.

`send` body is `{ "data": { ... } }`, keyed by the template's `expectedDataRepresentation` properties. Minimal identifiers suffice for record properties (`{ "contact": { "email": "ada@example.com" } }`); the platform finds-or-creates the record, reads it back, then renders. **That upsert is a real side effect:** sending a template with extra fields on a contact updates that contact.

The send is synchronous and returns `{ emailId, status: "sent"|"failed", error? }` with any warnings in the body's `warnings` array. A `"failed"` status is a genuine SES failure returned as a **`200`, not an HTTP error**; read it rather than assuming success, and note the `error` message is deliberately generic (the real detail stays server-side). Pre-send validation and eligibility failures throw as real HTTP errors instead: `email_limit_reached` (402), `sending_disabled` / `domain_not_verified` / `marketing_requires_contact` / `recipient_not_subscribed` / `recipient_suppressed` (422), `template_not_sendable` / `invalid_data` (400).

Not every client hands that body back: the CLI prints `{ "sent": true, "templateId": ... }`, and the PHP and Ruby SDKs return void. If you need to read `status` and `emailId`, use the Node, Python, Go, Java, Rust or Elixir SDK, or call `maxclicks api POST /templates/<id>/send --data '{"data":{...}}'`.

For the content language itself (Adaptyle manifests, prompt tags, hidden blocks, Liquid, MJML vs HTML) see the `maxclicks-adaptyle` skill.

## 13. Webhooks, outgoing (6)

| Op | CLI | SDK | HTTP | Perm |
| --- | --- | --- | --- | --- |
| List | `maxclicks webhooks list [--all]` | `webhooks.list({ limit, offset })` | `GET /webhooks` | read |
| Create | `maxclicks webhooks create --data '<json>'` | `webhooks.create(params)` | `POST /webhooks` (201) | write (**AI** iff `custom filter`) |
| Get | `maxclicks webhooks get <id>` | `webhooks.get(id)` | `GET /webhooks/{id}` | read |
| Update | `maxclicks webhooks update <id> --data '<json>'` | `webhooks.update(id, params)` | `PATCH /webhooks/{id}` | write (**AI** iff regenerating a `custom filter`) |
| Delete | `maxclicks webhooks delete <id>` | `webhooks.delete(id)` | `DELETE /webhooks/{id}` | write |
| Rotate secret | `maxclicks webhooks rotate-secret <id>` | `webhooks.rotateSecret(id)` | `POST /webhooks/{id}/rotate-secret` | write |

Create params: `{ url, trigger, schemaId?, emailEventTypes?, condition? }`.

- `trigger` is one of `contact upserted`, `contact deleted`, `object upserted`, `object deleted`, `event fired`, `email event`.
- `schemaId` (an id or slug) is required for every trigger **except** `email event`.
- `emailEventTypes` is required, non-empty, and only used when `trigger` is `email event`. Values: `scheduled`, `sending failed`, `sent`, `rejected`, `unsubscribed`, `bounced`, `complained`, `delivered`, `opened`, `clicked`, `delivery delayed`.
- `condition` is `{ type: "none" }`, `{ type: "segment", segmentId }`, or `{ type: "custom filter", requirements }`. The last one is a natural-language filter generated server-side (AI bucket, credits checked first); see `references/requirements.md`.

`update` accepts `url`, `emailEventTypes`, `condition` and `status` (`live` or `paused`), at least one. Trigger and schema are **not** updatable (`400 webhook_immutable_field`).

On read a webhook is `{ id, createdAt, updatedAt, url, trigger, emailEventTypes, schemaId, condition, status, totalCalls, failedCalls, failedCallsInARow, lastCalledAt, lastCallErrorMessage, integrationVendorName }`. `status` is `live` / `paused` / `circuit breaker` (the platform trips the breaker after repeated failures). A custom filter reduces on read to `{ type: "custom filter", description }`; the generated check expression is never returned.

`signatureVerificationSecret` is returned **only** on create and rotate-secret. Save it immediately: nothing returns it again, and rotating invalidates the old one instantly. A non-null `integrationVendorName` means the webhook is integration-owned and cannot be updated, deleted, or rotated (`403 webhook_integration_owned`).

## 14. Workflows (7)

| Op | CLI | SDK | HTTP | Perm |
| --- | --- | --- | --- | --- |
| List | `maxclicks workflows list [--all]` | `workflows.list({ limit, offset })` | `GET /workflows` | read |
| Get | `maxclicks workflows get <id>` | `workflows.get(id)` | `GET /workflows/{id}` | read |
| Trigger | `maxclicks workflows trigger <reference> --data '<json>'` | `workflows.trigger(reference, body)` | `POST /workflows/{workflowStepReference}` (Idem) | write |
| Pause | `maxclicks workflows pause <id>` | `workflows.pause(id)` | `POST /workflows/{id}/pause` | write |
| Unpause | `maxclicks workflows unpause <id>` | `workflows.unpause(id)` | `POST /workflows/{id}/unpause` | write |
| List runs | `maxclicks workflows runs <id> [--all]` | `workflows.listRuns(id, { limit, offset })` | `GET /workflows/{id}/runs` | read |
| Get run | `maxclicks workflows get-run <id> <runId>` | `workflows.getRun(id, runId)` | `GET /workflows/{id}/runs/{runId}` | read |

Workflows are **built in the app**: there is no create-workflow, add-step or edit-step endpoint, and no delete. The API triggers, observes, and pauses an already-published workflow.

`Workflow` = `{ id, createdAt, updatedAt, name, description, paused, isDirty, published }` (`isDirty` means it has unpublished changes). `WorkflowRun` = `{ id, createdAt, updatedAt, versionId, status: running|completed|failed, failureReason, stepHistory: [{ stepId, stepLabel, slotKey, enteredAt, leftAt, failureReason }] }`.

`trigger`'s path segment is the **incoming-webhook step's `workflowStepReference`**, not a workflow id. The body is arbitrary JSON validated server-side against that step's configured JSON schema, and the response `data` is an empty object. It needs `write` permission (the run it starts can send email, spend credits, call AI, mutate records, and issue outbound HTTP requests) and it supports `Idempotency-Key`, which is the right way to make a retried external webhook delivery safe.

Two trigger-specific traps: failures from the workflow handler come back as **`text/plain`**, not the JSON error envelope (authentication failures still use JSON), and `404 workflow_step_not_found` covers a missing, duplicate, unpublished *or paused-workflow* step indistinguishably. `400 invalid_request_body` means the body failed the step's JSON schema.

`pause` stops new runs from starting; runs already in flight finish normally. See the `maxclicks-workflows` skill.

## 15. Forms (2, unauthenticated, SDK only)

| Op | SDK | HTTP |
| --- | --- | --- |
| Submit | `forms.submit(formId, { contact, emailMarketingConsent?, captchaToken? })` | `POST /forms/{formId}/submit` |
| Confirm double opt-in | `forms.confirmDoubleOptIn(formId, token)` | `GET /forms/{formId}/confirm/{token}` (302) |

Public: the tenant is derived from the form, not from an API key. `submit` validates required fields, CAPTCHA and consent, then either upserts the contact (`{ contactId }`) or, on a double opt-in form when the visitor opted in to email, stores a pending record and emails a confirmation link (`{ status: "verification_pending" }`). A declined-consent submission always takes the direct path even on a double opt-in form. Rate limits: 10/60s per IP and 120/60s per form, both failing open, plus a separate per-recipient cap on confirmation emails.

`confirmDoubleOptIn` is a browser navigation target: it always redirects (302) to the hosted result page, including on every failure path (missing token, expired token, unpublished form), so there is no JSON error to parse. Rarely needed from an agent.

## 16. Emails (1, unauthenticated, SDK only)

| Op | SDK | HTTP |
| --- | --- | --- |
| One-click unsubscribe | `emails.unsubscribeOneClick(emailId)` | `POST /emails/{emailId}/unsubscribe` (302) |

The RFC 8058 one-click unsubscribe target, form-encoded with `List-Unsubscribe=One-Click`. Unsubscribes the linked contact from a topic or the whole email channel, then redirects to the hosted result page. No rate limit at all.

## Raw escape hatch

`maxclicks api <METHOD> <path> [--data '<json>']` sends an authenticated request to any path and returns `{ status, body }`. Use it for the three public endpoints the CLI does not wrap, or when you need the full response body of a command whose CLI wrapper summarizes it. It sends only `Authorization`, `Accept` and `Content-Type`, so it cannot carry an `Idempotency-Key`.

It is **not** a way around the surface above: an operation absent from this document does not exist on the server either, and calling it returns 404.
