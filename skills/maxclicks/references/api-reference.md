# maxclicks API reference (CLI + SDK + HTTP)

The complete Public API v1 surface: 18 resource groups, ~88 endpoints. Base URL `https://api.maxclicks.ai/v1` (stage: `api-stage`). Auth: `Authorization: Bearer <api_key>` on everything except the public form/email endpoints.

**Coverage note:** the **CLI now wraps the full surface** (every row below has a `maxclicks <command>` form). The **SDKs** (Node, Python, Go, PHP/Laravel, Ruby, Java, Rust) still wrap only the original subset, marked "SDK" below; rows without an SDK method are marked **raw-API (SDK)**, meaning application code should use a plain HTTP call until the SDKs catch up, not the CLI (the CLI already covers it). Do not invent an SDK method for a raw-API (SDK) row; that surface has not shipped in the SDKs yet.

## Envelopes and conventions

- Success: `{ "data": <payload>, "warnings"?: [ ... ] }`. Paginated (offset-based, most groups): `{ "data": [ ... ], "pagination": { "limit", "offset", "totalCount", "hasMore" }, "warnings"?: [ ... ] }`.
- Error: `{ "error": { "type": "invalid_request_error" | "api_error", "code": <string|null>, "message": <string> } }`.
- Pagination: `limit` default 50 (max 200), `offset` default 0. **`offset` over 10000 is rejected with `400 offset_too_large`**, it does not silently stop; page with narrower filters instead of walking past that depth. CLI `--all` walks every page; SDKs auto-paginate.
- Rate limits per key: reads 100/s, writes 25/s, AI-backed writes (anything generating an expression from `requirements`) 10/min. On 429 the SDKs and CLI retry with backoff honoring `Retry-After`.
- Idempotency: send an `Idempotency-Key` header on supported mutating endpoints (marked "Idem" below) to make retries safe; the same key replays the original response for 24h. A few mutation endpoints do not yet support it (`events.fire`/`fireBatch`, `webhooks.create`, `broadcasts.generateAudience`, `attributes.create`, `contacts.suppressions.create/delete`); for those, design your own dedup (e.g. a stable `eventId`) instead.
- Path values (schema slug, ids) are URL-encoded for you.
- Permission levels below (`read`/`write`/`admin`) are the caller key's minimum space-membership permission. A key with less returns 403.

## 1. Meta

| Op | CLI | SDK | HTTP | Perm |
| --- | --- | --- | --- | --- |
| Whoami | `maxclicks whoami` | `me()` | `GET /me` | any valid key |

## 2. Schemas

| Op | CLI | SDK | HTTP | Perm |
| --- | --- | --- | --- | --- |
| List | `maxclicks schemas list [--type ...] [--all]` | `schemas.list({ type, limit, offset })` | `GET /schemas` | read |
| Get | `maxclicks schemas get <schema>` | `schemas.get(schema)` | `GET /schemas/{schema}` | read |
| Create | `maxclicks schemas create --data '<json>' [--idempotency-key <key>]` | raw-API (SDK) | `POST /schemas` (201, Idem) | write |
| Update | `maxclicks schemas update <schema> --data '<json>'` | raw-API (SDK) | `PATCH /schemas/{schema}` | write |
| Delete | `maxclicks schemas delete <schema>` | raw-API (SDK) | `DELETE /schemas/{schema}` | write |

`Schema` = `{ id, type: contact|object|event, slug, name, namePlural, description, integrationVendorName, attributeCount, createdAt, updatedAt }`. `{schema}` accepts an id or slug. Create body: `{ type, name, namePlural, slug, description? }`; `type` and `slug` are immutable after creation. Delete is blocked while the schema is in use (records, referencing evaluated attributes/segments/templates). See the `maxclicks` skill's "Managing schemas, attributes, and API keys" section.

## 3. Attributes

| Op | CLI | SDK | HTTP | Perm |
| --- | --- | --- | --- | --- |
| List | `maxclicks attributes list <schema> [--all]` | `attributes.list(schema, {...})` | `GET /schemas/{schema}/attributes` | read |
| Get | `maxclicks attributes get <schema> <attribute>` | `attributes.get(schema, attribute)` | `GET /schemas/{schema}/attributes/{attribute}` | read |
| Create | `maxclicks attributes create <schema> --data '<json>'` (stored) or `--requirements '<text>' [--key][--label][--description]` (evaluated) | raw-API (SDK) | `POST /schemas/{schema}/attributes` (not Idem) | write (AI-gated when `requirements` is used) |

`{attribute}` accepts `base:<key>`, a custom attribute id, or a raw key. Create body: `{ key, label, description?, definition? }` for a **stored** attribute, or `{ key, label, description?, requirements }` for an AI-generated **evaluated** attribute, mutually exclusive with `definition`. See `references/requirements.md` for how to phrase `requirements`. The generated `expression` is never returned by any endpoint.

## 4. Records (contacts and objects)

| Op | CLI | SDK | HTTP | Perm |
| --- | --- | --- | --- | --- |
| List | `maxclicks records list <schema> [--all]` | `records.list(schema, {...})` | `GET /schemas/{schema}/records` | read |
| Get | `maxclicks records get <schema> <id>` | `records.get(schema, id)` | `GET /schemas/{schema}/records/{id}` | read |
| Create | `maxclicks records create <schema> --data '<json>'` | `records.create(schema, input)` | `POST /schemas/{schema}/records` (201, Idem) | write |
| Upsert | `maxclicks records upsert <schema> --data '<json>'` | `records.upsert(schema, input)` | `POST /schemas/{schema}/records/upsert` (200/201, Idem) | write |
| Update | `maxclicks records update <schema> <id> --data '<json>'` | `records.update(schema, id, input)` | `PATCH /schemas/{schema}/records/{id}` | write |
| Delete | `maxclicks records delete <schema> <id>` | `records.delete(schema, id)` | `DELETE /schemas/{schema}/records/{id}` | write |
| Audit trail | `maxclicks records audit-trail <schema> <id> [--channel email] [--all]` | `records.auditTrail(schema, id, {...})` | `GET /schemas/{schema}/records/{id}/audit-trail` | read |

Records are **flat**: `{ email, firstName, lastName, userId, phone, notes, tags: [...], subscriptions: ["email"], topicIds: [...], <customKey>: <value> }` for contacts; `{ externalId, notes, tags, <customKey> }` for objects. `create` fails on an existing identity; `upsert` matches by `id > userId > email > phone` (contact) or `id > externalId` (object). `update`/`upsert` with an explicit `null` clears a nullable field. Audit trail is contacts only.

## 5. Contacts: suppressions (admin key; email do-not-contact)

| Op | CLI | SDK | HTTP | Perm |
| --- | --- | --- | --- | --- |
| Create | `maxclicks suppressions create --identifier <email> --reason manual\|legal` | `suppressions.create({...})` | `POST /contacts/suppressions` (201, not Idem) | admin |
| Delete | `maxclicks suppressions delete <id>` | `suppressions.delete(id)` | `DELETE /contacts/suppressions/{id}` (not Idem) | admin |
| List | `maxclicks suppressions list [--identifier <email>] [--all]` | raw-API (SDK) | `GET /contacts/suppressions` | admin |
| Get | `maxclicks suppressions get <id>` | raw-API (SDK) | `GET /contacts/suppressions/{id}` | admin |
| Batch create | `maxclicks suppressions batch-add --data '<json>' [--idempotency-key <key>]` | raw-API (SDK) | `POST /contacts/suppressions/batch` (1-100, Idem) | admin |
| Batch remove | `maxclicks suppressions batch-remove --data '<json>' [--idempotency-key <key>]` | raw-API (SDK) | `POST /contacts/suppressions/batch-remove` (1-100, Idem) | admin |

Only `manual` and `legal` reasons are settable; bounce/complaint suppressions are created by the platform. Suppressions are stored by hashed identifier, not by contact. Batch bodies are **wrapped objects**, not bare arrays: `{ "suppressions": [{identifier, reason, notes?}, ...] }` for batch create, `{ "ids": ["<id>", ...] }` for batch remove.

## 6. Domains

| Op | CLI | HTTP | Perm |
| --- | --- | --- | --- |
| Create | `maxclicks domains create --data '<json>' [--idempotency-key <key>]` | `POST /domains` | **admin** |
| List (omits DNS `records`) | `maxclicks domains list [--all]` | `GET /domains` | read |
| Get (includes live `records`) | `maxclicks domains get <id>` | `GET /domains/{id}` | read |
| Verify | `maxclicks domains verify <id>` | `POST /domains/{id}/verify` | write |
| Delete | `maxclicks domains delete <id>` | `DELETE /domains/{id}` | **admin** |

CLI-wrapped; not yet in any SDK (raw-API (SDK)). A verified domain is required before it (or a sender on it) can be used to send. See the `maxclicks-deliverability` skill.

## 7. Senders

| Op | CLI | HTTP | Perm |
| --- | --- | --- | --- |
| Create | `maxclicks senders create --data '<json>' [--idempotency-key <key>]` | `POST /senders` (Idem) | write |
| List / Get | `maxclicks senders list [--all]` / `maxclicks senders get <id>` | `GET /senders`, `GET /senders/{id}` | read |
| Update | `maxclicks senders update <id> --data '<json>'` | `PATCH /senders/{id}` | write |
| Delete | `maxclicks senders delete <id>` | `DELETE /senders/{id}` | write |

CLI-wrapped; not yet in any SDK (raw-API (SDK)). A sender is a saved `{code, name, domainId}` slug on a verified domain. See the `maxclicks-deliverability` skill.

## 8. Topics (communication topics)

| Op | CLI | HTTP | Perm |
| --- | --- | --- | --- |
| Create | `maxclicks topics create --data '<json>' [--idempotency-key <key>]` | `POST /topics` (Idem) | write |
| List / Get | `maxclicks topics list [--all]` / `maxclicks topics get <id>` | `GET /topics`, `GET /topics/{id}` | read |
| Update | `maxclicks topics update <id> --data '<json>'` | `PATCH /topics/{id}` | write |
| Delete | `maxclicks topics delete <id> [--force]` | `DELETE /topics/{id}?force=true` | write |

CLI-wrapped; not yet in any SDK (raw-API (SDK)). `channel` is immutable on update (`400 topic_immutable_field` if you try to change it). See the `maxclicks-topics` skill.

## 9. Segments (the flagship NL-expression domain)

| Op | CLI | HTTP | Perm |
| --- | --- | --- | --- |
| Create | `maxclicks segments create --name <name> --contact-schema <schema> --requirements '<text>' [--description <text>]` | `POST /segments` | write (**AI**, unconditional) |
| List | `maxclicks segments list [--all]` | `GET /segments` | read |
| Get | `maxclicks segments get <id>` | `GET /segments/{id}` | read |
| Live matching count | `maxclicks segments count <id>` | `GET /segments/{id}/count` | read |
| List matching contacts | `maxclicks segments contacts <id> [--all]` (`limit` hard-capped at 100 regardless of requested value) | `GET /segments/{id}/contacts` | read |
| Update | `maxclicks segments update <id> [--data '<json>'] [--requirements '<text>']` | `PATCH /segments/{id}` | write (**AI** iff `requirements` sent) |
| Delete | `maxclicks segments delete <id>` | `DELETE /segments/{id}` | write |

CLI-wrapped; not yet in any SDK (raw-API (SDK)). Create body: `{ name, description?, contactSchema, requirements }`. `requirements` is a natural-language description of the filter; the server generates and stores the query/check expressions, never returned. See `references/requirements.md` and the `maxclicks-segments` skill.

## 10. Broadcasts

| Op | CLI | HTTP | Perm |
| --- | --- | --- | --- |
| Create | `maxclicks broadcasts create --data '<json>' [--idempotency-key <key>]` | `POST /broadcasts` (Idem) | write |
| List / Get | `maxclicks broadcasts list [--all]` / `maxclicks broadcasts get <id>` | `GET /broadcasts`, `GET /broadcasts/{id}` | read |
| Update | `maxclicks broadcasts update <id> --data '<json>'` | `PATCH /broadcasts/{id}` | write |
| Delete | `maxclicks broadcasts delete <id>` | `DELETE /broadcasts/{id}` | write |
| Send | `maxclicks broadcasts send <id> [--data '<json>']` | `POST /broadcasts/{id}/send` | write |
| Generate audience from NL | `maxclicks broadcasts audience-generate <id> --requirements '<text>'` | `POST /broadcasts/{id}/audience/generate` | write (**AI**) |
| List runs | `maxclicks broadcasts runs <id> [--all]` | `GET /broadcasts/{id}/runs` | read |
| Metrics | `maxclicks broadcasts metrics <id>` | `GET /broadcasts/{id}/metrics` | read |

CLI-wrapped; not yet in any SDK (raw-API (SDK)). `audience-generate` body: `{ requirements }`, same NL contract as segments. There is no `broadcasts.duplicate` endpoint. See the `maxclicks-broadcasts` skill.

## 11. Templates (authoring + send)

| Op | CLI | SDK | HTTP | Perm |
| --- | --- | --- | --- | --- |
| Create | `maxclicks templates create --data '<json>' [--idempotency-key <key>]` | raw-API (SDK) | `POST /templates` (Idem) | write |
| List | `maxclicks templates list [--all]` | raw-API (SDK) | `GET /templates` | read |
| Get | `maxclicks templates get <id>` | raw-API (SDK) | `GET /templates/{id}` | read |
| Update | `maxclicks templates update <id> --data '<json>'` | raw-API (SDK) | `PATCH /templates/{id}` | write |
| Delete | `maxclicks templates delete <id>` | raw-API (SDK) | `DELETE /templates/{id}` | write |
| Duplicate | `maxclicks templates duplicate <id> [--idempotency-key <key>]` | raw-API (SDK) | `POST /templates/{id}/duplicate` (Idem) | write |
| Send | `maxclicks templates send <templateId> --data '<json>'` | `templates.send(templateId, { data })` | `POST /templates/{templateId}/send` (Idem) | write |

`send` is a sibling action on a template created through the six authoring endpoints above, not a separate resource. Authoring content only accepts **raw** editor format server-side (`{ bodyFormat: 'mjml'|'html', subject, body }`), written in Adaptyle + Liquid; see the `maxclicks-adaptyle` skill for the content language itself, and the `maxclicks-templates` skill for the authoring CRUD. `send`'s `--data` is the template's data payload (keyed by the template's expected properties, e.g. `{ "contact": { "email": "a@b.com" } }`). `send` is synchronous and returns `{ emailId, status: 'sent'|'failed', error? }` with any warnings in the same body's `warnings` array; a `'failed'` status (a genuine SES failure) is a `200`, not an HTTP error, read it. Pre-send validation/eligibility failures (`email_limit_reached` 402, `sending_disabled`/`domain_not_verified`/`marketing_requires_contact`/`recipient_not_subscribed`/`recipient_suppressed` 422, `template_not_sendable`/`invalid_data` 400) throw as real HTTP errors instead.

## 12. Events

| Op | CLI | SDK | HTTP | Perm |
| --- | --- | --- | --- | --- |
| Fire | `maxclicks events fire <schema> --data '<json>'` | `events.fire(schema, input)` | `POST /events/{schema}` (202, not Idem) | write |
| Fire batch | `maxclicks events fire-batch <schema> --data '<json-array>' [--on-error abort]` | `events.fireBatch(...)` | `POST /events/{schema}/batch` (1-500, not Idem) | write |
| List | `maxclicks events list --schema <schema> [--from <iso>] [--to <iso>] [--cursor <c>] [--all]` | raw-API (SDK) | `GET /events?schema=<id-or-slug>` (cursor-paginated) | read |
| Get | `maxclicks events get <id>` | `events.get(id)` | `GET /events/{id}` | read |

Event input is flat: `{ eventId?, occurredAt?, <customKey> }`. `fire` returns `{ accepted: n }` (async). `fire-batch` returns `{ results, summary, failedIndex? }`; with `--on-error abort` a first invalid item yields HTTP 422 carrying that same body (a result to read, not an error to retry). `GET /events` requires a `schema` query param (one schema per call), defaults `from`/`to` to the 7 days before now when `from` is omitted, and silently clamps (with a warning, not a rejection) any wider requested span to 90 days. It uses a distinct **cursor** pagination envelope (`cursor` param, `pagination.nextCursor` in the response), not the offset envelope (`limit`/`offset`/`totalCount`) the rest of the API uses. Events are immutable (`PATCH`/`DELETE /events/{id}` always return `405 events_immutable`).

## 13. Imports (bulk CSV)

| Op | CLI | HTTP | Perm |
| --- | --- | --- | --- |
| Create | `maxclicks imports create <schema> --data '<json>' [--idempotency-key <key>]` | `POST /schemas/{schema}/imports` (Idem) | write |
| List | `maxclicks imports list <schema> [--all]` | `GET /schemas/{schema}/imports` | read |
| Get | `maxclicks imports get <id>` | `GET /imports/{id}` | read |
| Download failure log | `maxclicks imports download-failure-log <id>` (streams CSV to stdout) | `GET /imports/{id}/failure-log` (authenticated) | read |
| Cancel | `maxclicks imports cancel <id>` | `POST /imports/{id}/cancel` | write |

CLI-wrapped; not yet in any SDK (raw-API (SDK)). Create body: `{ fileUrl, byteSize, fileName?, defaultTags?: [...], defaultSubscriptions?: [...] }`, both `fileUrl` and `byteSize` required. Contact and object schemas only (event schemas and integration-owned schemas are rejected); files over 50 MB are rejected (`import_file_too_large`). Flow: submit the CSV's already-uploaded URL, poll for status, download the failure log for per-row failures (an authenticated proxy endpoint, not a public S3 link, streams with `no-store`). For a handful of records, looping `records upsert` (idempotent) is simpler; use imports for real CSV bulk loads. See the `maxclicks-imports` skill.

## 14. Webhooks (outgoing)

| Op | CLI / SDK | HTTP | Perm |
| --- | --- | --- | --- |
| List | `maxclicks webhooks list [--all]` / `webhooks.list(...)` | `GET /webhooks` | read |
| Get | `maxclicks webhooks get <id>` / `webhooks.get(id)` | `GET /webhooks/{id}` | read |
| Create | `maxclicks webhooks create --data '<json>'` / `webhooks.create(params)` | `POST /webhooks` (201, not Idem) | write (**AI** iff `condition.type === 'custom filter'`) |
| Update | `maxclicks webhooks update <id> --data '<json>'` / `webhooks.update(id, params)` | `PATCH /webhooks/{id}` | write (**AI** iff regenerating a custom filter) |
| Delete | `maxclicks webhooks delete <id>` / `webhooks.delete(id)` | `DELETE /webhooks/{id}` | write |
| Rotate secret | `maxclicks webhooks rotate-secret <id>` / `webhooks.rotateSecret(id)` | `POST /webhooks/{id}/rotate-secret` | write |

Create params: `{ url, trigger: "contact upserted"|"contact deleted"|"object upserted"|"object deleted"|"event fired"|"email event", schemaId?, emailEventTypes?: [...], condition?: {type:"none"} | {type:"segment", segmentId} | {type:"custom filter", requirements} }`. `condition.type: "custom filter"` is a natural-language filter, AI-generated server-side like segments; see `references/requirements.md`. On read, a custom filter reduces to `{type:"custom filter", description}`, the generated `checkExpression` is never returned. The `signatureVerificationSecret` is returned on create and rotate only.

## 15. Workflows

| Op | CLI | SDK | HTTP | Perm |
| --- | --- | --- | --- | --- |
| Trigger | `maxclicks workflows trigger <reference> --data '<json>'` | `workflows.trigger(reference, body)` | `POST /workflows/{workflowStepReference}` (Idem) | read (intentionally not write) |
| List | `maxclicks workflows list [--all]` | raw-API (SDK) | `GET /workflows` | read |
| Get | `maxclicks workflows get <id>` | raw-API (SDK) | `GET /workflows/{id}` | read |
| List runs | `maxclicks workflows runs <id> [--all]` | raw-API (SDK) | `GET /workflows/{id}/runs` | read |
| Get run | `maxclicks workflows get-run <id> <runId>` | raw-API (SDK) | `GET /workflows/{id}/runs/{runId}` | read |
| Pause | `maxclicks workflows pause <id>` | raw-API (SDK) | `POST /workflows/{id}/pause` | write |
| Unpause | `maxclicks workflows unpause <id>` | raw-API (SDK) | `POST /workflows/{id}/unpause` | write |
| Remove | `maxclicks workflows delete <id>` | raw-API (SDK) | `DELETE /workflows/{id}` | write |

`<reference>` is the incoming-webhook step's reference id. Body is validated against the step's configured JSON schema. `trigger` returns an empty body on success. There is still no create-workflow/add-step/edit-step endpoint: building and wiring a workflow's steps happens in the app; this API can trigger, observe, and lifecycle-manage an already-built workflow. See the `maxclicks-workflows` skill.

## 16. API Keys (admin key)

| Op | CLI | HTTP | Perm |
| --- | --- | --- | --- |
| Create | `maxclicks api-keys create [--name <name>]` (secret returned once) | `POST /api-keys` (not Idem) | admin |
| List | `maxclicks api-keys list [--all]` | `GET /api-keys` | admin |
| Delete | `maxclicks api-keys delete <id>` | `DELETE /api-keys/{id}` | admin |

CLI-wrapped; not yet in any SDK (raw-API (SDK)). A key mints a key. Only `FULL` permission exists today; granular scopes are not yet implemented. See the `maxclicks` skill's "Managing schemas, attributes, and API keys" section.

## 17. Public forms (unauthenticated)

| Op | HTTP |
| --- | --- |
| Submit | `POST /forms/{formId}/submit` -> `{contactId}` or `{status:"verification_pending"}` |
| Confirm double opt-in | `GET /forms/{formId}/confirm/{token}` (302) |

Exposed by the SDKs as `forms.submit(formId, { contact, emailMarketingConsent?, captchaToken? })` / `forms.confirmDoubleOptIn`. Rarely needed from an agent.

## 18. Public emails (unauthenticated)

| Op | HTTP |
| --- | --- |
| One-click unsubscribe | `POST /emails/{emailId}/unsubscribe` (302, no rate limit) |

Exposed by the SDKs as `emails.unsubscribeOneClick`.

## Raw escape hatch

`maxclicks api <METHOD> <path> --data '<json>'` sends an authenticated request to any path and returns `{ status, body }`. The CLI wraps every row above already; reach for `maxclicks api` only for something genuinely not listed (a new endpoint ahead of this doc, or a one-off you don't want a subcommand for). For application code, a row marked **raw-API (SDK)** means use a plain HTTP call in that language until the SDKs are regenerated against the full v1 surface (see `references/sdks.md`).
