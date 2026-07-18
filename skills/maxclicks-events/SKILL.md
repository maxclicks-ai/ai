---
name: maxclicks-events
description: Track or fire events (purchase completed, signup, cart abandoned, etc.) into maxclicks to trigger workflows and webhooks. Use when instrumenting an app or backfilling events via the maxclicks API, CLI, or SDKs.
---

# Firing events into maxclicks

Builds on the `maxclicks` skill (auth, tool choice, and the schema-based data model). Read that first. This skill covers one job: firing **events** so they trigger workflows and webhooks.

An event is a meaningful, actionable thing that happened (a purchase completed, a signup, a cart abandoned), described by an **event schema**. Firing one is fire-and-forget: the API accepts it (HTTP 202) and downstream workflows/webhooks pick it up asynchronously. Events are not high-volume analytics (do not fire page views or clicks); each one consumes resources.

## Procedure

1. **Confirm the space:** `maxclicks whoami`.
2. **Discover the event schema and its attribute keys.** Never guess keys: undefined keys are silently dropped (returned as a warning), not applied.

   ```bash
   maxclicks schemas list --type event               # find the event schema slug
   maxclicks attributes list purchase-completed       # learn the payload keys
   ```

   Event schema and attribute writes exist (`maxclicks schemas create|update|delete`, `maxclicks attributes create`), but this is not something to reach for mid-instrumentation. If a needed attribute does not exist, either create it deliberately or tell the user to add it in the app; either way, discover first.
3. **Fire.** The payload is **flat**, keyed by the schema's attribute keys, plus two optional reserved keys: `eventId` (dedup) and `occurredAt` (when it happened, defaults to now). Prefer `fire-batch` for backfills.

## Fire one event (CLI)

```bash
maxclicks events fire purchase-completed --data '{
  "eventId": "ord_10432",
  "occurredAt": "2026-07-04T18:22:00Z",
  "email": "ada@example.com",
  "amount": 42.5,
  "currency": "USD"
}'
# -> { "accepted": 1 }
```

`fire` returns `{ "accepted": n }`, not the stored event. Retrieve a fired event later by its returned id:

```bash
maxclicks events get evt_01J2K...
```

## Fire a batch (CLI)

Up to 500 events of one schema per call. `--on-error continue` (default) fires the valid ones and reports the rest; `--on-error abort` stops on the first invalid item.

```bash
maxclicks events fire-batch purchase-completed --on-error abort --data '[
  { "eventId": "ord_1", "email": "a@example.com", "amount": 10 },
  { "eventId": "ord_2", "email": "b@example.com", "amount": 20 }
]'
```

With `--on-error abort`, a first invalid item comes back as **HTTP 422** carrying `{ results, summary, failedIndex }`. That 422 is a normal result to read (fix `failedIndex` and re-fire), not a transient error to retry.

## List events

`maxclicks events list --schema <schema>` lists fired events for **one event schema per call** (`--schema` is required, id or slug), cursor-paginated (`--cursor`, following `pagination.nextCursor`, not the `limit`/`offset`/`totalCount` envelope the other list commands use). Reads through the ClickHouse-backed archive, so it sees every event ever fired, not just ones that triggered a workflow/webhook. Not yet wrapped by any SDK, use the CLI or a raw HTTP call from application code:

```bash
maxclicks events list --schema purchase-completed --all
maxclicks events list --schema purchase-completed --from 2026-07-01T00:00:00Z --to 2026-07-18T00:00:00Z
```

If `--from` is omitted it defaults to the **last 7 days** before `--to` (which defaults to now), not 90; a requested span wider than 90 days is silently clamped (with a `warnings` entry, not rejected). For a single known event, `events get <id>` (already CLI/SDK-wrapped) remains the simpler call.

## Instrument a backend action (TypeScript SDK)

Fire the event where the thing actually happens (for example, after an order is paid). Keep it non-blocking so a maxclicks hiccup never breaks checkout:

```ts
import { Maxclicks } from 'maxclicks'

const mc = new Maxclicks(process.env.MAXCLICKS_API_KEY!)

async function onOrderPaid(order: Order) {
  try {
    await mc.events.fire('purchase-completed', {
      eventId: order.id,                 // stable id => idempotent, safe to retry
      occurredAt: order.paidAt,          // ISO 8601; omit to default to now
      email: order.customerEmail,        // must be a defined attribute key
      amount: order.total,
      currency: order.currency,
    })
  } catch (error) {
    logger.warn('maxclicks event failed', error)  // do not fail the order
  }
}
```

Batch backfill and read of the failed index:

```ts
const result = await mc.events.fireBatch('purchase-completed', pastOrders.map(o => ({
  eventId: o.id,
  occurredAt: o.paidAt,
  email: o.customerEmail,
  amount: o.total,
})), { onError: 'abort' })

if (result.failedIndex != null)
  console.error('first invalid at', result.failedIndex, result.summary)
```

Python is identical in shape: `mc.events.fire("purchase-completed", {"eventId": order_id, "email": ...})`.

## Gotchas

- **Fire is async and never confirms downstream work.** `{ "accepted": n }` means "queued", not "workflow ran". A misconfigured workflow or webhook does not make `fire` fail.
- **Undefined payload keys are dropped, not rejected.** The write succeeds and the extra key is returned in `warnings`. Always `attributes list <schema>` first; read the `warnings` array on writes.
- **Payloads are flat.** Custom keys sit at the top level next to `eventId`/`occurredAt`. There is no `data`, `attributes`, or `properties` wrapper.
- **`eventId` deduplicates.** Re-firing with the same `eventId` on the same schema is deduped, which is why it is safe to retry a failed send. Use a real, stable business id (order id, signup id), not a random UUID per attempt.
- **`--on-error abort` returns HTTP 422 as a result.** The SDKs surface it as a value with `failedIndex`; the CLI prints the body. Do not retry it blindly.
- **Events are meaningful, not analytics.** Fire `cart-abandoned`, not `page-viewed`. High-volume streams belong in a real analytics pipeline.
- **Event schemas and attributes can be created via the CLI** (`maxclicks schemas create|update|delete`, `maxclicks attributes create`). Reach for it deliberately, not as a quick fix for one missing key mid-instrumentation.
- **`events list` requires `--schema`** and defaults to a 7-day lookback, not the 90-day maximum it silently clamps to; pass explicit `--from`/`--to` for anything else, and remember it is cursor-paginated (`--cursor`), not offset-paginated like the other list commands.
