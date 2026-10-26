# maxclicks API reference (CLI + SDK + HTTP)

The current Public API v1 source contract: **16 resource groups, 58 functional operations**, spec version 1.1.0 (checked 26 September 2026). Base URL `https://api.maxclicks.ai/v1`. Auth: `Authorization: Bearer <api_key>` on everything except the public form/email endpoints.

**The surface follows one principle:** entities are *authored in the maxclicks app*, and the API *triggers, reads and measures* them. Schemas, attributes, templates, broadcast content, domains, senders and topics are created and configured in the app; this API reads them back so a caller can discover ids, shapes and status, and drives the sends and automations that depend on them. (API keys are also minted in the app, and are the one thing this API does not read back: a key is full-permission and inherits the owner's membership.)

**Coverage:** CLI/SDK columns describe the published clients, not complete current response types. The current Node client has no dedicated event-status, event-identity or deletion-status methods, and no workflow-history cursor option. Use HTTP for those contracts. Check each language client's source before translating a method signature.

## Envelopes and conventions

- Success: `{ "data": <payload>, "warnings"?: [ ... ] }`. Paginated offset-based lists: `{ "data": [ ... ], "pagination": { "limit", "offset", "totalCount", "hasMore" }, "warnings"?: [ ... ] }`. `events.list` uses a cursor envelope instead: `{ "limit", "nextCursor", "hasMore" }`, no `offset`, no `totalCount`.
- Error: `{ "error": { "type": "invalid_request_error" | "api_error", "code": <string|null>, "message": <string>, "issues"?: [ ... ] } }`. `type` is `invalid_request_error` for every 4xx and `api_error` for every 5xx. `issues` appears on validation gates. Event batch abort uses a 422 `data` envelope; an unresolved idempotency persistence failure can omit `error.type`.
- Pagination: `limit` default 50, clamped to 1..200 with a warning; `offset` default 0. **`offset` above 10000 is rejected with `400 offset_too_large`**, not clamped, so a client cannot silently page forever. Narrow the query instead. Pagination stops at the server's offset traversal cap, and `hasMore` becomes false when the next page would reach it. `--all` is not an unlimited export guarantee.
- Rate limits per key, three buckets: `read` 100/second (every `GET`), `write` 25/second (every other `POST`/`PATCH`/`DELETE`), `ai` 10/minute (the LLM-backed calls: `segments.create`, and `webhooks.create`/`webhooks.update` when they carry a `custom filter` condition). On 429 honor `Retry-After`, which can be seconds or an HTTP date. Retry only when the operation and client make doing so safe. Events also have shared occurrence, backlog and receipt-storage admission limits.
- Beyond the usual codes, four appear here: `402` (`insufficient_credits` on an AI call or a schema with AI auto-fill; `email_limit_reached` on `templates.send`), `405` (`events_immutable`), `413` (`payload_too_large`, body over 10 MB), `415` (`unsupported_media_type`). `400` also covers `malformed_json`.
- Path values (schema slug, ids) are URL-encoded for you by the CLI and SDKs.
- `Perm` below is the caller key's minimum space-membership permission (`read` / `write` / `admin`). A key with less returns 403. Only the five suppression operations require `admin`.

## Idempotency: 17 REST operations

These operations accept `Idempotency-Key` in the current server source:

| Operation | HTTP |
| --- | --- |
| `records.create` | `POST /schemas/{schema}/records` |
| `records.upsert` | `POST /schemas/{schema}/records/upsert` |
| `suppressions.batchCreate` | `POST /contacts/suppressions/batch` |
| `suppressions.batchDelete` | `POST /contacts/suppressions/batch-remove` |
| `suppressions.delete` | `DELETE /contacts/suppressions/{id}` |
| `segments.create` | `POST /segments` |
| `segments.delete` | `DELETE /segments/{id}` |
| `broadcasts.update` | `PATCH /broadcasts/{id}` |
| `broadcasts.send` | `POST /broadcasts/{id}/send` |
| `templates.send` | `POST /templates/{templateId}/send` |
| `webhooks.create` | `POST /webhooks` |
| `webhooks.update` | `PATCH /webhooks/{id}` |
| `webhooks.delete` | `DELETE /webhooks/{id}` |
| `webhooks.rotateSecret` | `POST /webhooks/{id}/rotate-secret` |
| `workflows.trigger` | `POST /workflows/{workflowStepReference}` |
| `workflows.pause` | `POST /workflows/{id}/pause` |
| `workflows.unpause` | `POST /workflows/{id}/unpause` |

A key is at most 256 characters and belongs to one logical operation. It is scoped to the calling API key, method and resolved path, with a canonical request-body fingerprint. Keep that key, path and body unchanged on retries. Changed input returns `422 idempotency_key_reused`; active work returns `409 idempotency_conflict`. Replays return the recorded status/body with `Idempotent-Replay: true`. Recorded results can include errors and signing secrets: do not assume any 4xx/5xx is safe to execute again, and protect replayed webhook responses.

Completed operation records expire after 24 hours. Unresolved operations remain for reconciliation and can return `idempotency_outcome_unknown`; preserve any `Operation-Id`, original key and body, and reconcile before starting a replacement operation. Upserting the same identity does not alone prevent repeated side effects.

Event acceptance uses a stable `eventId` instead. Event identity changes use a UUID `operationId` with `expectedAliasRevision`. Record deletion has its own pollable operation id and does not use `Idempotency-Key`.

**Client support is smaller than server support.** Node source exposes `options.idempotencyKey` on `records.create`, `records.upsert`, `suppressions.batchCreate`, `suppressions.batchDelete`, `templates.send`, `broadcasts.send` and `workflows.trigger`. The CLI flag exists on record create/upsert and suppression batch add/remove only. Its raw `api` command cannot add custom headers. Use direct HTTP for another supported server operation or when the installed client lacks the option. Other language clients must be checked individually.

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

Schemas are **created and edited in the app** (`https://app.maxclicks.ai`). The current public routes expose list/get, not schema writes. Discover here; author there.

## 3. Attributes (1, read-only)

| Op | CLI | SDK | HTTP | Perm |
| --- | --- | --- | --- | --- |
| List | `maxclicks attributes list <schema> [--all]` | `attributes.list(schema, { limit, offset })` | `GET /schemas/{schema}/attributes` | read |

Base attributes first, then custom ones. `Attribute` = `{ id, key, label, description, sequence, definition, integrationVendorName, createdAt, updatedAt }`. `id` is an `attr_`-prefixed id for custom attributes and `base:<key>` for platform base attributes; `sequence` is null for base attributes.

`definition.type` is one of `string`, `number`, `decimal`, `boolean`, `date time`, `date only`, `time only`, `string array`, `json`, `evaluated`. Two traps worth internalizing:

- **`url`, `email` and `phone` are not types.** They are `format` values on `type: string`. With `multiLine` false or absent the formats are `plain text`, `email`, `phone`, `url`; with `multiLine: true` they are `plain text` or `code`.
- **There is no `object` or `object array` type.** Nested structures are `type: json` with a `jsonSchema`.

`nullable` is present on every stored definition and absent on `evaluated`. An `evaluated` attribute is computed rather than stored (an AI-generated expression run server-side); its generated expression is never returned by any endpoint at any permission level.

Attributes are authored in the app. Read them here so your writes only set keys that exist.

## 4. Records: contacts and objects (8)

| Op | CLI | SDK | HTTP | Perm |
| --- | --- | --- | --- | --- |
| List | `maxclicks records list <schema> [--all]` | `records.list(schema, { limit, offset })` | `GET /schemas/{schema}/records` | read |
| Get | `maxclicks records get <schema> <id>` | `records.get(schema, id)` | `GET /schemas/{schema}/records/{id}` | read |
| Create | `maxclicks records create <schema> --data '<json>' [--idempotency-key <key>]` | `records.create(schema, input)` | `POST /schemas/{schema}/records` (201, Idem) | write |
| Upsert | `maxclicks records upsert <schema> --data '<json>' [--idempotency-key <key>]` | `records.upsert(schema, input)` | `POST /schemas/{schema}/records/upsert` (Idem) | write |
| Update | `maxclicks records update <schema> <id> --data '<json>'` | `records.update(schema, id, input)` | `PATCH /schemas/{schema}/records/{id}` | write |
| Delete | `maxclicks records delete <schema> <id>` | `records.delete(schema, id)` | `DELETE /schemas/{schema}/records/{id}` | write |
| Audit trail | `maxclicks records audit-trail <schema> <id> [--channel email] [--all]` | `records.auditTrail(schema, id, { channel, limit, offset })` | `GET /schemas/{schema}/records/{id}/audit-trail` | read |
| Deletion status | HTTP | HTTP | `GET /record-deletions/{operationId}` | read |

Records are **flat**: `{ id?, email, firstName, lastName, fullName, avatarUrl, userId, phone, notes, tags: [...], subscriptions: ["email"], topicIds: [...], <customKey>: <value> }` for contacts; `{ externalId, notes, tags, <customKey> }` for objects. There is no `data`/`attributes`/`properties` wrapper.

`create` fails when the identity already exists; `upsert` matches by `id > userId > email > phone` (contact) or `id > externalId` (object). `update`/`upsert` with an explicit `null` clears a nullable field; omit a key to leave it unchanged. `source`, `subscriptions` and `emailStatistics` are platform-managed and not settable. Conflicting identifier updates on `upsert` are skipped and reported in `warnings` rather than failing the call. Audit trail is contacts only, newest first, and strips `ipAddress`/`userAgent` from the returned `context`.

**Deletion is asynchronous.** Preserve `{ operationId, status, message }` from DELETE, then poll `GET /record-deletions/{operationId}` using the URL-encoded full operation id until `status` is `completed`. `pending` means cleanup remains; `blocked` needs reconciliation. HTTP 202 indicates an incomplete operation; a 2xx alone does not establish erasure. Current Node `records.delete` declarations still describe the older response; use direct HTTP for the current contract.

## 5. Suppressions (5, admin key)

| Op | CLI | SDK | HTTP | Perm |
| --- | --- | --- | --- | --- |
| List | `maxclicks suppressions list [--identifier <email>] [--all]` | `suppressions.list({ identifier, limit, offset })` | `GET /contacts/suppressions` | admin |
| Create | `maxclicks suppressions create --identifier <email> --reason manual\|legal [--notes <text>]` | `suppressions.create(input)` | `POST /contacts/suppressions` (201) | admin |
| Batch create | `maxclicks suppressions batch-add --data '<json>' [--idempotency-key <key>]` | `suppressions.batchCreate(inputs)` | `POST /contacts/suppressions/batch` (1-100, Idem) | admin |
| Batch delete | `maxclicks suppressions batch-remove --data '<json>' [--idempotency-key <key>]` | `suppressions.batchDelete(ids)` | `POST /contacts/suppressions/batch-remove` (1-100, Idem) | admin |
| Delete | `maxclicks suppressions delete <id>` | `suppressions.delete(id)` | `DELETE /contacts/suppressions/{id}` | admin |

Only `manual` and `legal` are settable reasons. `unsubscribed`, `hard_bounce`, `soft_bounce_consecutive` and `spam_complaint` are system-applied and read-only: deleting one returns `403 suppression_reason_not_removable`. Suppressions are stored by hashed identifier, never by contact, and the raw identifier is never returned (only `identifierHash`). `list` includes global suppressions alongside space-scoped ones, since both block sends. `affectedContactCount` appears only on create responses.

Batch bodies are **wrapped objects, not bare arrays**: `{ "suppressions": [{ identifier, reason, notes? }, ...] }` for batch create, `{ "ids": ["<id>", ...] }` for batch remove. Both always respond `200` with per-item results and a summary; an already-existing suppression comes back as `exists`, not as a failure. Single create is not idempotency-aware; single delete supports `Idempotency-Key`.

## 6. Events and source identity (5)

| Op | CLI / source client | HTTP | Perm |
| --- | --- | --- | --- |
| List ready events | `maxclicks events list --schema <schema>` / `events.list({ schema, from, to, cursor, limit })` | `GET /events?schema=<id-or-slug>` | read |
| Accept one event | `maxclicks events fire <schema> --data '<json>'` / `events.fire(schema, input)` | `POST /events/{schema}` | write |
| Accept batch | `maxclicks events fire-batch <schema> --data '<json-array>'` / `events.fireBatch(schema, events, { onError })` | `POST /events/{schema}/batch` | write |
| Current readiness | Direct HTTP; no current Node/CLI/MCP wrapper | `GET /events/{schema}/{id}/status` | read |
| Bind/unbind browser identity | Direct HTTP; no current Node/CLI/MCP wrapper | `POST /event-identities` | write |

Server event input is flat: `{ eventId?, occurredAt?, contactId?, objectId?, <customKey> }`. `contactId` and `objectId` are mutually exclusive subjects; any `id` on input is ignored. Normalized input is capped at 256 KiB. `occurredAt` must be within the previous 366 days or five minutes into the future.

Single acceptance returns HTTP 202 with `data: { accepted: 1, id, eventId, isDuplicate, readinessAtAcceptance }`. `readinessAtAcceptance` is the immutable original `pending` or `ready` state. Retry the same `eventId` and normalized input/explicit `occurredAt` to recover the receipt with `isDuplicate: true`; a changed input returns `409 event_id_conflict`, and erased occurrences return `409 event_erased`. Missing `eventId` is generated, so retain the receipt.

Poll `GET /events/{schema}/{id}/status` using the receipt's **maxclicks id**, not the caller's `eventId`. Current `readinessState` can be `pending`, `ready`, `failed` or `outcome_unknown`. It includes timestamps, definition revision, subjects and `data` (raw accepted values before readiness, prepared values when ready). Acceptance and readiness do not prove workflow, webhook or email completion.

Batch bodies are `{ "events": [...], "onError": "continue"|"abort" }`, with 1–500 events. `continue` commits each event independently; read every result even on HTTP 200. Accepted items carry their receipts, and admission failures can carry `retryAfterMilliseconds`. `abort` rolls back new acceptances on a validation/admission failure, marks them `rolled_back`, leaves existing duplicate occurrences intact, and returns HTTP 422 with `data.results`, `data.summary`, and `data.failedIndex`; later items are not attempted. Read that result rather than retrying the whole batch blindly.

`events.list` contains **ready** events, not every accepted event. It requires one `schema`, defaults to a seven-day window, and clamps spans over 90 days with a warning. Follow `pagination.nextCursor`; there is no offset/totalCount. Pending and failed occurrences belong in the status endpoint. Events are immutable; the PATCH/DELETE guards return `405 events_immutable`.

**Browser identity:** `POST /event-identities` requires all six fields: `sourceId`, `subjectSchemaId` (contact schema id), `anonymousId`, `contactId` (or null to unbind), UUID `operationId`, and decimal-string `expectedAliasRevision`. An enabled contact track definition must match the source and schema. Keep the returned `identityRevision` for that alias's next change; use `"0"` only for a new alias. Reuse the operation id and unchanged body for retries. Revision/input conflicts or erased aliases return 409. A server-held Write-authorized key is required; never put it in browser code. Browser `identify()` delegates to an authenticated application backend, and `track()` returns local enqueue state. The browser collector endpoint must be provisioned separately, not guessed from the public REST host.

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

The send returns `{ emailId, status, error }` with any warnings alongside `data`. `sent` means provider acceptance, not inbox delivery. HTTP 200 `failed` can represent refusal, cancellation or an unknown provider outcome: it does not prove non-delivery or make another send safe. Preserve `emailId` and the original operation key and reconcile in the app. A template with no email channel can return null fields. Pre-send validation and eligibility failures throw as real HTTP errors instead: `email_limit_reached` (402), `sending_disabled` / `domain_not_verified` / `marketing_requires_contact` / `recipient_not_subscribed` / `recipient_suppressed` (422), `template_not_sendable` / `invalid_data` (400).

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

`signatureVerificationSecret` is returned on create and rotate-secret, including idempotent replay of those responses; normal get/list never returns it. Save it securely, protect replay bodies, and remember rotating invalidates the old secret instantly. A non-null `integrationVendorName` means the webhook is integration-owned and cannot be updated, deleted, or rotated (`403 webhook_integration_owned`).

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

`Workflow` = `{ id, createdAt, updatedAt, name, description, paused, isDirty, published }` (`isDirty` means it has unpublished changes). `WorkflowRun` includes status, version, failure reason and a bounded `stepHistory` window (at most 100 rows). Each history row has an `index`; `stepCount`, parent-run fields and `nextHistoryBeforeIndex` provide additional context. Pass the non-null cursor as `history_before` to GET run to inspect older history. A failed run can have a null `failureReason` in a window that omits the failed step. Current client declarations/options do not fully expose this contract.

`trigger`'s path segment is the **incoming-webhook step's `workflowStepReference`**, not a workflow id. The body is arbitrary JSON validated server-side against that step's configured JSON schema, and the response `data` is an empty object. It needs `write` permission (the run it starts can send email, spend credits, call AI, mutate records, and issue outbound HTTP requests) and it supports `Idempotency-Key`, which is the right way to make a retried external webhook delivery safe.

Trigger failures use the standard JSON error envelope. `404 workflow_step_not_found` covers a missing, duplicate, unpublished *or paused-workflow* step indistinguishably. `400 invalid_request_body` means the body failed the step's JSON schema.

`pause` stops new runs from starting; runs already in flight finish normally. See the `maxclicks-workflows` skill.

## 15. Forms (2, unauthenticated REST; SDK wrappers)

| Op | SDK | HTTP |
| --- | --- | --- |
| Submit | `forms.submit(formId, { contact, emailMarketingConsent?, captchaToken? })` | `POST /forms/{formId}/submit` |
| Confirm double opt-in | `forms.confirmDoubleOptIn(formId, token)` | `GET /forms/{formId}/confirm/{token}` (302) |

Public: the tenant is derived from the form, not from an API key. `submit` validates required fields, CAPTCHA and consent, then either upserts the contact (`{ contactId }`) or, on a double opt-in form when the visitor opted in to email, stores a pending record and emails a confirmation link (`{ status: "verification_pending" }`). A declined-consent submission always takes the direct path even on a double opt-in form. Rate limits: 10/60s per IP and 120/60s per form, both failing open, plus a separate per-recipient cap on confirmation emails.

`confirmDoubleOptIn` is a browser navigation target: it always redirects (302) to the hosted result page, including on every failure path (missing token, expired token, unpublished form), so there is no JSON error to parse. Rarely needed from an agent.

## 16. Emails (1, unauthenticated REST; SDK wrapper)

| Op | SDK | HTTP |
| --- | --- | --- |
| One-click unsubscribe | `emails.unsubscribeOneClick(emailId)` | `POST /emails/{emailId}/unsubscribe` (302) |

The RFC 8058 one-click unsubscribe target, form-encoded with `List-Unsubscribe=One-Click`. Unsubscribes the linked contact from a topic or the whole email channel, then redirects to the hosted result page. No rate limit at all.

## Raw escape hatch

`maxclicks api <METHOD> <path> [--data '<json>']` sends an authenticated request to any path and returns `{ status, body }`. Use it for the three public endpoints the CLI does not wrap, or when you need the full response body of a command whose CLI wrapper summarizes it. It sends only `Authorization`, `Accept` and `Content-Type`, so it cannot carry an `Idempotency-Key`.

Only call verified routes from the matching contract. For public form/email requests and custom headers, direct HTTP gives precise control; the CLI raw helper always sends its configured Authorization header.
