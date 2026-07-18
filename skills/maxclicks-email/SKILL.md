---
name: maxclicks-email
description: Send an email or a stored template to a contact through maxclicks. Use when a task involves sending transactional or marketing email, template sends, or email suppression via the maxclicks API, CLI, or SDKs.
---

# Sending email and templates with maxclicks

Builds on the `maxclicks` skill (read it first for auth, the CLI/SDK/raw split, and the schema-based data model). This skill covers **sending**: a stored **template**, and managing email **suppressions** (the do-not-contact list). For **authoring** a template's CRUD shell (create/list/get/update/duplicate/delete), see the `maxclicks-templates` skill. For **writing** a template's content (the Adaptyle + Liquid subject/body), see the `maxclicks-adaptyle` skill.

## Sending a template

maxclicks does not send arbitrary HTML inline in the send call. You send a **stored template** by its `templateId` with a **data payload** keyed by the properties the template expects.

Procedure:

1. `maxclicks whoami` to confirm the space.
2. Get the `templateId` from the user, the app (`https://app.maxclicks.ai`), or `maxclicks templates list --all` / `maxclicks templates get <id>` yourself (see `maxclicks-templates`).
3. Build the `--data` payload matching the template's expected properties. The recipient lives inside this payload, typically as a `contact` property carrying at least an identifier: `{ "contact": { "email": "ada@example.com" } }`. Other properties (objects, JSON values) are keyed by whatever the template declares.
4. Send. `POST /templates/{templateId}/send` is synchronous and returns `{ emailId, status: "sent"|"failed", error? }`; the CLI prints that body. A `"failed"` status (a genuine SES failure) is a normal `200`, not an HTTP error, read it rather than assuming success from a 2xx. Pre-send validation/eligibility problems (no credits, domain not verified, recipient suppressed/unsubscribed, etc.) throw as real HTTP errors instead of coming back as `status: "failed"`.

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

## Authoring templates

Template authoring (create/list/get/update/duplicate/delete) is a full CLI command group now, `maxclicks templates create|list|get|update|duplicate|delete`, separate from the `send` action above. The public API only ever stores **raw** editor content, `{ bodyFormat: "mjml"|"html", subject, body }`, written in Adaptyle layered over Liquid. Full authoring reference (field shapes, `expectedDataRepresentation`, `recipientDataPath`, `from`): the `maxclicks-templates` skill. For the content language itself (the manifest/prompt/hidden-block syntax, Liquid + the data model, MJML vs HTML raw bodies): the `maxclicks-adaptyle` skill.

```bash
# List / get existing templates:
maxclicks templates list --all
maxclicks templates get tmpl_welcome_01

# Create a new one:
maxclicks templates create --data '{
  "name": "Welcome email",
  "transactional": true,
  "recipientDataPath": ["contact"],
  "expectedDataRepresentation": [
    { "key": "contact", "type": "record", "schema": "students", "isArray": false }
  ],
  "content": {
    "bodyFormat": "mjml",
    "subject": "<<<Write a short, upbeat subject line welcoming the new contact by name.>>>",
    "body": "<mjml><mj-body><mj-section><mj-column><mj-text><<<Write a one-sentence welcome heading.>>></mj-text></mj-column></mj-section></mj-body></mjml>"
  }
}'

# Update, duplicate, or delete:
maxclicks templates update tmpl_welcome_01 --data '{"name":"Welcome email v2"}'
maxclicks templates duplicate tmpl_welcome_01
maxclicks templates delete tmpl_welcome_01
```

`expectedDataRepresentation` and `recipientDataPath` define the data shape `send` expects, and `transactional`/`communicationTopicId` live here, not on the send call (see Gotchas below).

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

List, get, and batch create/remove are also full CLI commands now:

```bash
maxclicks suppressions list --all
maxclicks suppressions get supp_abc123
maxclicks suppressions batch-add --data '{"suppressions":[{"identifier":"a@example.com","reason":"manual"}]}'
maxclicks suppressions batch-remove --data '{"ids":["supp_1","supp_2"]}'
```

## Gotchas

- **A successful send call does not guarantee delivery.** `send` hands off to SES; delivery failures are recorded on the email record, not thrown. `send` itself is synchronous and returns `{ emailId, status: "sent"|"failed", error? }`; a `"failed"` status is a normal `200` result to read, not an exception. Do not report "delivered", report "queued/sent".
- **Warnings are in the response body, in the `warnings` array**, alongside `data`, same envelope as every other endpoint. The CLI and SDKs surface these for you, so read them.
- **Pre-send validation/eligibility failures throw as real HTTP errors, not `status: "failed"`.** `email_limit_reached` (402), `sending_disabled`/`domain_not_verified`/`marketing_requires_contact`/`recipient_not_subscribed`/`recipient_suppressed` (422), `template_not_sendable`/`invalid_data` (400) all mean the send never reached SES. Only a genuine SES-side failure comes back as `200` with `status: "failed"`.
- **Transactional vs marketing, and the communication topic, are baked into the template content, not the send call.** You cannot override them at send time. `transactional` and `communicationTopicId` are fields on the template itself (`maxclicks templates update <id> --data '{"transactional":...}'`, see "Authoring templates" above), not on `send`.
- **Sending records into the platform mutates them.** The `contact` (and any object) inside `--data` is upserted by identity as a side effect of the send. Keep the payload to identifiers plus fields you actually want written.
- **Template authoring is a full CLI command group** (`maxclicks templates create|list|get|update|duplicate|delete`), separate from `send`. It is not yet wrapped by any SDK; use the CLI or a raw HTTP call from application code. The public API always stores raw editor content (Adaptyle + Liquid), never the app's rich block-tree format. Full field reference: `maxclicks-templates`.
- **Suppressions need an admin key**; a plain write key returns 403. Confirm with `maxclicks whoami`.
- **Bounce-suppressed identifiers block even transactional email.** Only `manual` and `legal` suppressions leave transactional sending open; you cannot create a bounce/complaint suppression from the API to test this.
