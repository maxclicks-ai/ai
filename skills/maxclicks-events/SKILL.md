---
name: maxclicks-events
description: Accept durable business events in maxclicks, inspect their receipts and readiness, list ready events, or connect browser observations through a trusted identity backend. Use for application instrumentation and event backfills using the current REST contract or the published clients.
---

# Events, receipts and readiness

Builds on the `maxclicks` skill for authentication, package installation and the schema-based data model. Current receipt/status contracts may be newer than client declarations, so use direct HTTP when the client does not expose them.

A server event describes a business occurrence under an existing event schema. HTTP 202 means the occurrence was durably accepted. It may still need preparation before workflows, webhooks and event lists can consume it. Acceptance, readiness and downstream completion are separate states.

## Discover before accepting events

Confirm the workspace with `GET /me`. Discover an event schema through `GET /schemas?type=event` and its writable keys through `GET /schemas/{schema}/attributes`. Equivalent source CLI commands are:

```bash
maxclicks whoami
maxclicks schemas list --type event
maxclicks attributes list purchase-completed
```

Schemas and attributes are authored in the app. Undefined custom keys are dropped with warnings, so do not infer a key from an example. The examples below assume `amount` and `currency` exist.

Server input is flat. Reserved inputs include optional `eventId`, `occurredAt`, `contactId` and `objectId`; the last two are mutually exclusive explicit subjects. Do not infer a subject from an arbitrary email property. Normalized input is limited to 256 KiB, and explicit `occurredAt` must be within the previous 366 days or five minutes into the future.

## Accept one event

```bash
curl https://api.maxclicks.ai/v1/events/purchase-completed \
  -H "Authorization: Bearer $MAXCLICKS_API_KEY" \
  -H 'Content-Type: application/json' \
  --data '{"eventId":"order_1042_paid","amount":42.5,"currency":"USD"}'
```

The success envelope contains an immutable receipt:

```json
{
  "data": {
    "accepted": 1,
    "id": "ev_example",
    "eventId": "order_1042_paid",
    "isDuplicate": false,
    "readinessAtAcceptance": "pending"
  }
}
```

Save `id` and `eventId`. Retry the same business occurrence with the same `eventId`, normalized payload and explicit `occurredAt` to recover the original receipt (`isDuplicate: true`). Changed input under that id returns `409 event_id_conflict`; erased occurrences return `409 event_erased`. Omitting `eventId` lets the server generate it, which makes recovery after a lost receipt harder. Events do not use `Idempotency-Key`.

The source CLI command is `maxclicks events fire <schema> --data '<json>'`. Node source exposes `mc.events.fire(schema, input)`, but its older result type does not yet describe every receipt field.

## Inspect current readiness

```bash
curl https://api.maxclicks.ai/v1/events/purchase-completed/ev_example/status \
  -H "Authorization: Bearer $MAXCLICKS_API_KEY"
```

Replace `ev_example` with the receipt's **maxclicks `id`**, not your `eventId`. `data.readinessState` is `pending`, `ready`, `failed` or `outcome_unknown`. The response includes timestamps, definition revision, subjects and `data`: raw accepted values before readiness, prepared values when ready. The receipt's `readinessAtAcceptance` never changes, even when a retried receipt arrives after preparation.

Current Node/CLI/MCP sources have no dedicated status method/tool. Use this verified REST route. Read a workflow run or delivery record separately when downstream completion matters.

## Accept a batch

Submit 1–500 events of one schema in a wrapped body:

```json
{
  "events": [
    { "eventId": "order_1_paid", "amount": 10 },
    { "eventId": "order_2_paid", "amount": 20 }
  ],
  "onError": "continue"
}
```

Send that to `POST /events/{schema}/batch`. With `continue`, events commit independently; inspect every result and summary even on HTTP 200. Accepted items contain receipt fields. Admission failures can include `retryAfterMilliseconds`.

With `abort`, the first validation or admission failure rolls back new acceptances in that transaction, marks earlier new results `rolled_back`, and returns HTTP 422 with `data.results`, `data.summary` and `data.failedIndex`. Later items are not attempted. Existing occurrences encountered as duplicates remain existing. This is a business-result envelope, not a generic error to retry blindly.

Source wrappers take a bare array and wrap it for HTTP:

```bash
maxclicks events fire-batch purchase-completed --on-error abort --data '[
  {"eventId":"order_1_paid","amount":10},
  {"eventId":"order_2_paid","amount":20}
]'
```

```ts
const result = await mc.events.fireBatch('purchase-completed', events, { onError: 'abort' })
if (result.failedIndex != null) console.error(result.failedIndex, result.summary)
```

## List ready events

`GET /events?schema=<schema>` lists **ready** events for one schema. Pending/failed acceptances remain inspectable through their status route. Use `from`/`to` for the query window; the default is seven days and a span above 90 days is clamped with a warning. Follow `pagination.nextCursor`; there is no offset or totalCount.

```bash
maxclicks events list --schema purchase-completed --all
```

```ts
const page = await mc.events.list({ schema: 'purchase-completed', limit: 200 })
const next = page.pagination.nextCursor
```

An event is immutable. PATCH/DELETE guards return `405 events_immutable`; a correction is a new occurrence with its own id, not changed input under the old eventId.

## Browser observations and trusted identity

The browser client exposes `createClient`, consent controls, `track()` and `page()`. `track()` reports local enqueue status; it is not a server receipt or completion signal. Supply a separately provisioned collector base URL serving `/v1/events/config` and `/v1/events/batch`. Do not invent a collector hostname or assume `api.maxclicks.ai` routes those requests. Browser code uses a public observation-only `mxe_` key, never a server API key.

Browser `identify()` calls an authenticated application-backend adapter. That backend binds or unbinds the alias with `POST /event-identities` and a Write-authorized server key. All six fields are required: `sourceId`, contact `subjectSchemaId`, `anonymousId`, `contactId` (or null to unbind), UUID `operationId`, and decimal-string `expectedAliasRevision`. Use `"0"` for a new alias; retain the returned `identityRevision` for its next change. Retry the same operation id and unchanged body, and handle revision conflicts explicitly. The source must match an enabled contact track definition. See the entry skill's API reference for the exact identity contract.

## Operational checks

- Preserve the original receipt and occurrence input across retry attempts.
- Honor `Retry-After` and per-item retry delays; event admission has shared occurrence, backlog and receipt-storage caps beyond the per-key write budget.
- Keep downstream failure handling separate from accepting the business occurrence.
- For durable application integration, persist a retryable occurrence alongside the business action, then deliver it with a stable eventId; a caught exception alone can lose it.
