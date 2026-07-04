# maxclicks API reference (CLI + SDK + HTTP)

The complete Public API v1 surface. Base URL `https://api.maxclicks.ai/v1` (stage: `api-stage`). Auth: `Authorization: Bearer <api_key>` on everything except the public form/email endpoints.

## Envelopes and conventions

- Success: `{ "data": <payload>, "warnings"?: [ ... ] }`. Paginated: `{ "data": [ ... ], "pagination": { "limit", "offset", "totalCount", "hasMore" }, "warnings"?: [ ... ] }`.
- Error: `{ "error": { "type": "invalid_request_error" | "api_error", "code": <string|null>, "message": <string> } }`.
- Pagination: `limit` default 50 (max 200), `offset` default 0 (max 10000). CLI `--all` walks every page; SDKs auto-paginate.
- Rate limits per key: reads 100/s, writes 25/s. On 429 the SDKs and CLI retry with backoff honoring `Retry-After`.
- Path values (schema slug, ids) are URL-encoded for you.

## Meta

| Op | CLI | SDK | HTTP |
| --- | --- | --- | --- |
| Whoami | `maxclicks whoami` | `me()` | `GET /me` |

## Schemas (read only)

| Op | CLI | SDK | HTTP |
| --- | --- | --- | --- |
| List | `maxclicks schemas list [--type ...] [--all]` | `schemas.list({ type, limit, offset })` | `GET /schemas` |
| Get | `maxclicks schemas get <schema>` | `schemas.get(schema)` | `GET /schemas/{schema}` |

`Schema` = `{ id, type: contact|object|event, slug, name, namePlural, description, integrationVendorName, attributeCount, createdAt, updatedAt }`. `{schema}` accepts an id or slug.

## Attributes (read only)

| Op | CLI | SDK | HTTP |
| --- | --- | --- | --- |
| List | `maxclicks attributes list <schema> [--all]` | `attributes.list(schema, { limit, offset })` | `GET /schemas/{schema}/attributes` |
| Get | `maxclicks attributes get <schema> <attribute>` | `attributes.get(schema, attribute)` | `GET /schemas/{schema}/attributes/{attribute}` |

`{attribute}` accepts `base:<key>`, a custom attribute id, or a raw key. There is no create/update/delete for schemas or attributes in this API.

## Records (contacts and objects)

| Op | CLI | SDK | HTTP |
| --- | --- | --- | --- |
| List | `maxclicks records list <schema> [--all]` | `records.list(schema, { limit, offset })` | `GET /schemas/{schema}/records` |
| Get | `maxclicks records get <schema> <id>` | `records.get(schema, id)` | `GET /schemas/{schema}/records/{id}` |
| Create | `maxclicks records create <schema> --data '<json>'` | `records.create(schema, input)` | `POST /schemas/{schema}/records` (201) |
| Upsert | `maxclicks records upsert <schema> --data '<json>'` | `records.upsert(schema, input)` | `POST /schemas/{schema}/records/upsert` (200/201) |
| Update | `maxclicks records update <schema> <id> --data '<json>'` | `records.update(schema, id, input)` | `PATCH /schemas/{schema}/records/{id}` |
| Delete | `maxclicks records delete <schema> <id>` | `records.delete(schema, id)` | `DELETE /schemas/{schema}/records/{id}` |
| Audit trail | `maxclicks records audit-trail <schema> <id> [--channel email] [--all]` | `records.auditTrail(schema, id, { channel, limit, offset })` | `GET /schemas/{schema}/records/{id}/audit-trail` |

Records are **flat**: `{ email, firstName, lastName, userId, phone, notes, tags: [...], subscriptions: ["email"], topicIds: [...], <customKey>: <value> }` for contacts; `{ externalId, notes, tags, <customKey> }` for objects. `create` fails on an existing identity; `upsert` matches by `id > userId > email > phone` (contact) or `id > externalId` (object). `update`/`upsert` with an explicit `null` clears a nullable field. Audit trail is contacts only.

## Suppressions (admin key; email do-not-contact)

| Op | CLI | SDK | HTTP |
| --- | --- | --- | --- |
| Create | `maxclicks suppressions create --identifier <email> --reason manual|legal [--notes ...]` | `suppressions.create({ identifier, reason, notes })` | `POST /contacts/suppressions` (201) |
| Delete | `maxclicks suppressions delete <id>` | `suppressions.delete(id)` | `DELETE /contacts/suppressions/{id}` |

## Events

| Op | CLI | SDK | HTTP |
| --- | --- | --- | --- |
| Fire | `maxclicks events fire <schema> --data '<json>'` | `events.fire(schema, input)` | `POST /events/{schema}` (202) |
| Fire batch | `maxclicks events fire-batch <schema> --data '<json-array>' [--on-error abort]` | `events.fireBatch(schema, events, { onError })` | `POST /events/{schema}/batch` |
| Get | `maxclicks events get <id>` | `events.get(id)` | `GET /events/{id}` |

Event input is flat: `{ eventId?, occurredAt?, <customKey> }`. `fire` returns `{ accepted: n }` (async). `fire-batch` returns `{ results, summary, failedIndex? }`; with `--on-error abort` a first invalid item yields HTTP 422 carrying that same body (a result to read, not an error to retry).

## Templates (send email)

| Op | CLI | SDK | HTTP |
| --- | --- | --- | --- |
| Send | `maxclicks templates send <templateId> --data '<json>'` | `templates.send(templateId, { data })` | `POST /templates/{templateId}/send` |

`--data` is the template's data payload (keyed by the template's expected properties, e.g. `{ "contact": { "email": "a@b.com" } }`). Success returns an empty body; warnings arrive on the `maxclicks-Warning-Message` header.

## Webhooks (outgoing)

| Op | CLI | SDK | HTTP |
| --- | --- | --- | --- |
| List | `maxclicks webhooks list [--all]` | `webhooks.list({ limit, offset })` | `GET /webhooks` |
| Get | `maxclicks webhooks get <id>` | `webhooks.get(id)` | `GET /webhooks/{id}` |
| Create | `maxclicks webhooks create --data '<json>'` | `webhooks.create(params)` | `POST /webhooks` (201) |
| Update | `maxclicks webhooks update <id> --data '<json>'` | `webhooks.update(id, params)` | `PATCH /webhooks/{id}` |
| Delete | `maxclicks webhooks delete <id>` | `webhooks.delete(id)` | `DELETE /webhooks/{id}` |
| Rotate secret | `maxclicks webhooks rotate-secret <id>` | `webhooks.rotateSecret(id)` | `POST /webhooks/{id}/rotate-secret` |

Create params: `{ url, trigger: "contact upserted"|"contact deleted"|"object upserted"|"object deleted"|"event fired"|"email event", schemaId?, emailEventTypes?: [...], condition?: { type: "none" } | { type: "segment", segmentId } }`. The `signatureVerificationSecret` is returned on create and rotate only.

## Workflows

| Op | CLI | SDK | HTTP |
| --- | --- | --- | --- |
| Trigger | `maxclicks workflows trigger <reference> --data '<json>'` | `workflows.trigger(reference, body)` | `POST /workflows/{reference}` |

`<reference>` is the incoming-webhook step's reference id. Body is validated against the step's configured JSON schema. Returns an empty body on success.

## Public (unauthenticated) endpoints

Exposed by the SDKs (`forms.submit`, `forms.confirmDoubleOptIn`, `emails.unsubscribeOneClick`); rarely needed from an agent. `forms.submit(formId, { contact, emailMarketingConsent?, captchaToken? })` returns `{ contactId }` or `{ status: "verification_pending" }`.

## Raw escape hatch

`maxclicks api <METHOD> <path> --data '<json>'` sends an authenticated request to any path and returns `{ status, body }`. Use for anything not covered above.
