---
name: maxclicks-email
description: Send an email or a stored template to a contact through maxclicks. Use when a task involves sending transactional or marketing email, template sends, or email suppression via the maxclicks API, CLI, or SDKs.
---

# Sending email and templates with maxclicks

Builds on the `maxclicks` skill (read it first for auth, the CLI/SDK/raw split, and the schema-based data model). This skill covers the two email operations exposed by the Public API: sending a stored **template**, and managing email **suppressions** (the do-not-contact list).

## Sending a template

maxclicks does not send arbitrary HTML from the API. You send a **stored template** by its `templateId` with a **data payload** keyed by the properties the template expects. Templates are authored in the maxclicks app; the API only runs them.

Procedure:

1. `maxclicks whoami` to confirm the space.
2. Get the `templateId` from the user or the app (`https://app.maxclicks.ai`). There is no `templates list` command; you cannot discover templates from the CLI.
3. Build the `--data` payload matching the template's expected properties. The recipient lives inside this payload, typically as a `contact` property carrying at least an identifier: `{ "contact": { "email": "ada@example.com" } }`. Other properties (objects, JSON values) are keyed by whatever the template declares.
4. Send. A successful call returns an empty body (the CLI prints `{ "sent": true, "templateId": ... }`).

The `contact` object is a flat record (base fields and defined custom attribute keys at the top level, no `data` wrapper). Sending it can create-or-update that contact as a side effect: passing `{ "contact": { "email": "ada@example.com", "firstName": "Ada" } }` upserts Ada's `firstName` while sending. Only pass keys you intend to persist. Undefined attribute keys are dropped with a warning.

### Examples

CLI:

```bash
maxclicks whoami
maxclicks templates send tmpl_welcome_01 --data '{"contact":{"email":"ada@example.com"}}'

# a template that also expects a product and a plain value:
maxclicks templates send tmpl_receipt_02 \
  --data '{"contact":{"email":"ada@example.com"},"product":{"externalId":"prod_123"},"total":42}'
```

TypeScript SDK:

```ts
import { Maxclicks } from 'maxclicks'

const mc = new Maxclicks(process.env.MAXCLICKS_API_KEY!)
await mc.templates.send('tmpl_welcome_01', {
  data: { contact: { email: 'ada@example.com' } },
})
```

Python SDK:

```python
from maxclicks import Maxclicks

mc = Maxclicks()  # reads MAXCLICKS_API_KEY
mc.templates.send("tmpl_welcome_01", data={"contact": {"email": "ada@example.com"}})
```

## Managing suppressions

A suppression puts an email identifier on the space's do-not-contact list. Marketing sends to a suppressed identifier are skipped; transactional sends are skipped only for bounce-type suppressions. Use suppressions to honor manual opt-outs or legal requirements.

- Create needs `--identifier <email>` and `--reason manual|legal` (only those two reasons are settable from the API; bounce and complaint suppressions are created by the platform). `--notes` is optional.
- Delete (unsuppress) takes the suppression `id` returned by create.
- Suppressions require an **admin** key. A write key is not enough (403 otherwise).

### Examples

CLI:

```bash
maxclicks suppressions create --identifier ada@example.com --reason manual --notes "asked to stop"
maxclicks suppressions delete supp_abc123
```

TypeScript SDK:

```ts
const supp = await mc.suppressions.create({ identifier: 'ada@example.com', reason: 'manual' })
await mc.suppressions.delete(supp.id)
```

## Gotchas

- **A successful send call does not guarantee delivery.** `templates send` hands off to SES; delivery failures are recorded on the email record, not thrown. Do not report "delivered", report "queued/sent".
- **Warnings are on a header, not in the body.** Success returns an empty body; any warnings come back on the `maxclicks-Warning-Message` response header. The CLI and SDKs surface these for you, so read them.
- **Transactional vs marketing, and the communication topic, are baked into the template content, not the send call.** You cannot override them at send time. If the user wants a different classification, they must edit the template in the app.
- **Sending records into the platform mutates them.** The `contact` (and any object) inside `--data` is upserted by identity as a side effect of the send. Keep the payload to identifiers plus fields you actually want written.
- **No `templates list` / `templates create` in this API.** Templates are authored in the app; you only need the `templateId` to send. Do not invent a discovery command.
- **Suppressions need an admin key**; a plain write key returns 403. Confirm with `maxclicks whoami`.
- **Bounce-suppressed identifiers block even transactional email.** Only `manual` and `legal` suppressions leave transactional sending open; you cannot create a bounce/complaint suppression from the API to test this.
