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

   Event schemas and attributes are read-only through the API. If a needed attribute does not exist, tell the user to add it in the maxclicks app; there is no create-schema or create-attribute command.
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
- **You cannot create event schemas or attributes here.** They are read-only through the API/CLI/SDK; the user adds them in the maxclicks app.
