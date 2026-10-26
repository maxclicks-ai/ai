---
name: maxclicks-email
description: Send an email or a stored template to a contact through maxclicks. Use when a task involves sending transactional or marketing email, template sends, or email suppression via the maxclicks API, CLI, or SDKs.
---

# Sending email and templates with maxclicks

**Coverage:** read the `maxclicks` entry skill for current REST coverage and client limits.

Builds on the `maxclicks` skill (read it first for auth, the CLI/SDK/raw split, and the schema-based data model). This skill covers **sending**: a stored **template**, and managing email **suppressions** (the do-not-contact list). For finding a template and reading the data shape it expects, see the `maxclicks-templates` skill. For the content language inside a template (the Adaptyle + Liquid subject/body), see the `maxclicks-adaptyle` skill.

## Sending a template

maxclicks does not send arbitrary HTML inline in the send call. You send a **stored template** by its `templateId` with a **data payload** keyed by the properties the template expects.

Procedure:

1. `maxclicks whoami` to confirm the space.
2. Get the `templateId` from the user, the app (`https://app.maxclicks.ai`), or `maxclicks templates list --all` yourself, then read its contract with `maxclicks templates get <id>` (see `maxclicks-templates`).
3. Build the `--data` payload matching the template's `expectedDataRepresentation`. The recipient lives inside this payload, typically as a `contact` property carrying at least an identifier: `{ "contact": { "email": "ada@example.com" } }`. Other properties (objects, JSON values) are keyed by whatever the template declares.
4. Send and inspect the result. `POST /templates/{templateId}/send` returns `{ emailId, status, error }`. `sent` means provider acceptance, not inbox delivery. HTTP 200 `failed` can represent refusal, cancellation or an unknown provider outcome, so it does not prove another send is safe. Preserve the email id and original operation key and reconcile in the app before a replacement send. Pre-send validation/eligibility failures use HTTP errors. A template with no email channel can return null result fields.

Node source returns that result, but some wrappers (notably PHP/Ruby) discard it, and current declarations can lag nullable wire fields. The CLI prints a local confirmation and discards the send result. Use direct HTTP or a client that exposes the actual outcome when deciding what happened.

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
const result = await mc.templates.send('tmpl_welcome_01', {
  data: { contact: { email: 'ada@example.com' } },
}, { idempotencyKey: 'welcome-ada-2026-09-26' })
if (result.status !== 'sent') console.error(result.emailId, result.status, result.error)
```

Python SDK:

```python
from maxclicks import Maxclicks

mc = Maxclicks()  # reads MAXCLICKS_API_KEY
mc.templates.send("tmpl_welcome_01", data={"contact": {"email": "ada@example.com"}})
```

## Where templates come from

Templates are authored in the maxclicks app (`https://app.maxclicks.ai`), where the editor's preview and render pipeline validates the content before it can go in front of recipients. Over the API you read them and send them:

```bash
maxclicks templates list --all
maxclicks templates get tmpl_welcome_01
```

`get` returns the whole send contract: `expectedDataRepresentation` and `recipientDataPath` (the data shape `send` expects), `transactional` and `communicationTopicId` (which live on the template, not on the send call, see Gotchas below), `from`, and the `content` as raw `subject`/`body`. Read it before building a payload. Full field reference: the `maxclicks-templates` skill. For the content language itself (the manifest/prompt/hidden-block syntax, Liquid + the data model, MJML vs HTML bodies): the `maxclicks-adaptyle` skill.

If a task needs a template that does not exist yet, or an existing one changed, say so and hand the user the app, then come back to `get` and `send`.

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

List and the batch forms round out the group:

```bash
maxclicks suppressions list --all
maxclicks suppressions list --identifier ada@example.com   # look one identifier up
maxclicks suppressions batch-add --data '{"suppressions":[{"identifier":"a@example.com","reason":"manual"}]}'
maxclicks suppressions batch-remove --data '{"ids":["supp_1","supp_2"]}'
```

There is no get-one endpoint: list with `--identifier` is how you check whether an address is suppressed. Both batch forms take 1 to 100 items, always answer `200` with per-item `results` plus a `summary`, and accept an `--idempotency-key`.

## Gotchas

- **A successful HTTP call does not guarantee delivery.** Read status and preserve emailId. `sent` means provider acceptance; `failed` can include an unknown outcome. Report the observed result and reconcile unknown outcomes without creating a fresh operation key.
- **The CLI does not print the send body.** It confirms the call succeeded; the `{ emailId, status, error }` object comes back through compatible SDKs and raw HTTP. If the task needs the `emailId`, or has to branch on `status`, do not send from the CLI.
- **Warnings are in the response body, in the `warnings` array**, alongside `data`, same envelope as every other endpoint. The SDKs surface these for you, so read them.
- **`send` accepts an `Idempotency-Key`.** Keep it and the request body unchanged on retries. Node source supports `{ idempotencyKey }` as the third send argument; the current CLI send/raw helper cannot set it. A recorded error may replay, and a new key can create a duplicate send.
- **Pre-send validation/eligibility failures use HTTP errors.** `email_limit_reached` (402), `sending_disabled`/`domain_not_verified`/`marketing_requires_contact`/`recipient_not_subscribed`/`recipient_suppressed` (422), and `template_not_sendable`/`invalid_data` (400) are distinct from HTTP 200 `failed`. Do not infer provider outcome or retry safety from a generic failed result.
- **Transactional vs marketing, and the communication topic, are baked into the template, not the send call.** You cannot override them at send time. `transactional` and `communicationTopicId` are fields on the template itself, read them with `maxclicks templates get <id>`; changing one is an app-side edit to the template.
- **Sending records into the platform mutates them.** The `contact` (and any object) inside `--data` is upserted by identity as a side effect of the send. Keep the payload to identifiers plus fields you actually want written.
- **Read the template before you send it.** `expectedDataRepresentation` is the payload contract and it can change whenever someone edits the template in the app; a mismatch is `invalid_data` (400). See `maxclicks-templates` for the read-then-send loop.
- **Suppressions need an admin key**; a plain write key returns 403. Confirm with `maxclicks whoami`. `delete` also refuses system-applied reasons: removing a hard-bounce or complaint suppression returns `suppression_reason_not_removable` (403), only `manual` and `legal` come off.
- **Bounce-suppressed identifiers block even transactional email.** Only `manual` and `legal` suppressions leave transactional sending open; you cannot create a bounce/complaint suppression from the API to test this.
