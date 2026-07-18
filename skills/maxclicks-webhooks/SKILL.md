---
name: maxclicks-webhooks
description: Create, list, update, delete, or rotate maxclicks outgoing webhooks, and verify inbound webhook signatures. Use when wiring maxclicks events to an external endpoint or handling maxclicks webhook deliveries.
---

# maxclicks outgoing webhooks

Manage outgoing webhooks that stream maxclicks events (contact/object/event/email changes) to an external URL, and verify the deliveries you receive. This builds on the `maxclicks` skill, which covers auth (`maxclicks whoami`, `MAXCLICKS_API_KEY`), the schema-based data model, and the CLI/SDK/API tools. Read that first if you have not.

## Create a webhook

A webhook needs a `url`, a `trigger`, and (for every trigger except `email event`) the `schemaId` it watches. Shape of the create params:

- `url` (required): the HTTPS endpoint maxclicks POSTs to.
- `trigger` (required), exactly one of: `contact upserted`, `contact deleted`, `object upserted`, `object deleted`, `event fired`, `email event`.
- `schemaId`: **required for every trigger except `email event`**; accepts a schema id or slug (resolve one with `maxclicks schemas list` if you only have the name).
- `emailEventTypes` (array): required, and only used, when `trigger` is `email event` (e.g. `bounce`, `complaint`, `delivery`, `open`, `click`).
- `condition`: one of `{ "type": "none" }` (default), `{ "type": "segment", "segmentId": "<id>" }` (see `maxclicks-segments` for creating one), or `{ "type": "custom filter", "requirements": "<plain-English filter>" }`. The third form is AI-generated server-side, same contract as segments; see the `maxclicks` skill's `references/requirements.md` for how to phrase it. The generated check expression is never returned; on `get`/`list` a custom filter reduces to `{ "type": "custom filter", "description": "<human-readable summary>" }`.

The response includes `signatureVerificationSecret`. **This secret is returned on create and rotate ONLY**, never by `get` or `list`. Save it immediately (into your endpoint's env/secret store): you will need it to verify deliveries, and losing it means rotating.

### CLI

```bash
# schemaId accepts an id or a slug; list to find one either way
maxclicks schemas list --type contact

# Create a contact-upserted webhook filtered to one segment
maxclicks webhooks create --data '{
  "url": "https://example.com/hooks/maxclicks",
  "trigger": "contact upserted",
  "schemaId": "sch_01hx...",
  "condition": { "type": "segment", "segmentId": "seg_01hx..." }
}'

# An email-event webhook: no schemaId, but emailEventTypes is required
maxclicks webhooks create --data '{
  "url": "https://example.com/hooks/maxclicks",
  "trigger": "email event",
  "emailEventTypes": ["bounce", "complaint"]
}'

# A natural-language custom filter instead of a segment
maxclicks webhooks create --data '{
  "url": "https://example.com/hooks/maxclicks",
  "trigger": "contact upserted",
  "schemaId": "sch_01hx...",
  "condition": {
    "type": "custom filter",
    "requirements": "Only contacts whose plan attribute changed to premium in this update."
  }
}'
```

Save the `signatureVerificationSecret` from the response.

### SDK (TypeScript)

```ts
import { Maxclicks } from 'maxclicks'

const mc = new Maxclicks(process.env.MAXCLICKS_API_KEY!)

const webhook = await mc.webhooks.create({
  url: 'https://example.com/hooks/maxclicks',
  trigger: 'contact upserted',
  schemaId: 'sch_01hx...',
  condition: { type: 'none' },
})

// Persist this now: it is never returned again.
saveSecret(webhook.signatureVerificationSecret)
```

## List, get, update, delete, rotate

```bash
maxclicks webhooks list [--all]
maxclicks webhooks get <id>
maxclicks webhooks update <id> --data '{"url":"https://example.com/new"}'   # patch: send only changed fields
maxclicks webhooks delete <id>
maxclicks webhooks rotate-secret <id>    # returns a NEW signatureVerificationSecret; the old one stops verifying
```

SDK equivalents: `mc.webhooks.list({ limit, offset })`, `.get(id)`, `.update(id, params)`, `.delete(id)`, `.rotateSecret(id)`. Rotate when a secret leaks or on a rotation schedule; update your endpoint with the new secret in the same step, since the old one is invalidated immediately.

## Verify an inbound delivery

When your endpoint receives a POST, verify it came from maxclicks using the stored `signatureVerificationSecret` before trusting the body. Compute an HMAC-SHA256 over the raw request body and compare (constant-time) against the signature header:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto'

function verifyMaxclicksWebhook(rawBody: string, signatureHeader: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(signatureHeader)
  return a.length === b.length && timingSafeEqual(a, b)
}
```

Verify against the **raw** request body bytes (do not re-serialize the parsed JSON, or the HMAC will not match). Reject the request if verification fails.

## Gotchas

- **The signing secret is shown once,** on `create` and `rotate-secret` only. `get`/`list` never return it. Save it on receipt; if lost, `rotate-secret` and re-store.
- **`schemaId` is required for every trigger except `email event`,** and accepts a schema id or slug. `emailEventTypes` is required and used only for `trigger: email event`.
- **A third condition type exists: `{ type: "custom filter", requirements }`.** It is AI-generated server-side from a natural-language description, rate-limited on the AI bucket, and the generated code is never returned (`get`/`list` show `{ type: "custom filter", description }` instead). See the `maxclicks` skill's `references/requirements.md`.
- **Integration-owned webhooks** (those with a non-null `integrationVendorName`) cannot be updated, deleted, or rotated through the API: you get a 403 (`webhook_integration_owned`). Only the owning integration can change them.
- **Segment conditions apply to contact triggers;** a `segmentId` must belong to the same contact schema the webhook watches.
- **`rotate-secret` invalidates the old secret immediately.** Roll it out to your endpoint atomically to avoid a window of failed verifications.
