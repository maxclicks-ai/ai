---
name: maxclicks-templates
description: Read a maxclicks email template and send it with a matching data payload. Use when a task needs to find a stored template, learn the data shape and recipient it expects, or send it to a contact.
---

# Reading and sending maxclicks templates

Builds on the `maxclicks` skill (read it first). A **template** is a stored, reusable message definition: email content plus the data shape it expects (`expectedDataRepresentation`), the recipient path, sender, and topic.

**Templates are authored in the maxclicks app** (`https://app.maxclicks.ai`), where the editor's preview and render pipeline validates the content before it can ever be sent. The API's job is the other half: **find a template, read its send contract, and send it**. That is three operations, `list`, `get`, and `send`, and they compose into one loop worth learning properly.

For the content **language** inside `subject`/`body` (Adaptyle + Liquid syntax), load `maxclicks-adaptyle`. For the send response contract and the suppression list, load `maxclicks-email`.

## The read-then-send loop

A template's `expectedDataRepresentation` is its function signature. You cannot guess it, and sending a payload that does not satisfy it fails with `invalid_data` (400). So always read before you send.

### Step 1: Find the template

```bash
maxclicks whoami
maxclicks templates list --all
```

Or take the `templateId` straight from the user or the app.

### Step 2: Read its send contract

```bash
maxclicks templates get tmpl_01hx...
```

The fields that decide how you call `send`:

- **`expectedDataRepresentation`**, an array of properties, each either:
  - a **record** property: `{ "key": "contact", "type": "record", "schema": "students", "isArray": false, "description": null }`
  - a **json** property: `{ "key": "orderTotal", "type": "json", "jsonSchema": { "type": "number" }, "description": null }`

  Each `key` is a top-level key your `--data` payload must supply, and the same key Liquid inside the template reads (`{{ contact.firstName }}`, `{{ orderTotal }}`). `schema` on a record property is always echoed as the schema **slug**.
- **`recipientDataPath`** (property-key segments, e.g. `["contact"]`) points at whichever property is the contact or bare email address the send actually goes to. Whatever it names, your payload must carry it.
- **`transactional`** (boolean) and **`communicationTopicId`** tell you whether this template bypasses marketing suppression or is subject to consent and topic preferences. They are properties of the template, not send-time options.
- **`from`** is the sender: `{ "type": "domain", "domainId": "...", "code": "support", "name": null }`, `{ "type": "sender", "senderId": "..." }`, or `null` (the space default sender/domain applies at send time). See `maxclicks-deliverability`.
- **`contentFormat`** (`mjml`/`html`), **`contentEditor`** (`rich`/`raw`), and **`content`** (`{ subject, body }`, either field possibly `null`). `content` is always returned in its **raw** form, so a template built in the app's visual editor still reads back as raw Adaptyle + Liquid text. Read it to see which data keys the content actually references; it is a read-only projection, the app owns the editable form.

### Step 3: Discover the schema behind each record property

Only if you need to build a record payload richer than a bare identifier:

```bash
maxclicks schemas list --type contact
maxclicks attributes list students
```

Every key you put inside a record property must be a real base field or a defined attribute key. Undefined keys are dropped with a warning.

### Step 4: Send

```bash
maxclicks templates send tmpl_01hx... --data '{"contact":{"email":"ada@example.com"}}'
```

Minimal identifiers are enough for record properties: the platform finds-or-creates the record, reads it back in full, expands it, and renders. JSON properties must be supplied whole. Full send contract (response shape, warnings, upsert-as-side-effect, the pre-send error table): `maxclicks-email`.

## Worked example

A template whose `get` returns (abridged):

```jsonc
{
  "id": "tmpl_01hx...",
  "name": "Order receipt",
  "transactional": true,
  "recipientDataPath": ["contact"],
  "expectedDataRepresentation": [
    { "key": "contact", "type": "record", "schema": "customers", "isArray": false, "description": null },
    { "key": "order", "type": "json", "jsonSchema": { "type": "object" }, "description": null }
  ],
  "communicationTopicId": null
}
```

sends like this:

```bash
maxclicks templates send tmpl_01hx... --data '{
  "contact": { "email": "ada@example.com" },
  "order": { "id": "ord_123", "total": 42 }
}'
```

TypeScript SDK:

```ts
import { Maxclicks } from 'maxclicks'

const mc = new Maxclicks(process.env.MAXCLICKS_API_KEY!)
const template = await mc.templates.get('tmpl_01hx...')
// inspect template.expectedDataRepresentation, then:
const { emailId, status, error } = await mc.templates.send('tmpl_01hx...', {
  data: { contact: { email: 'ada@example.com' }, order: { id: 'ord_123', total: 42 } },
})
```

## What is authored in the app

Creating a template, editing its content, changing its data representation or recipient path, duplicating it, and deleting it all happen in the app. The reason is the render pipeline: a template's content has to survive Adaptyle parsing, Liquid interpolation, and MJML compilation before it is safe to put in front of recipients, and the app's editor is where that preview and validation lives. There is no public preview endpoint to stand in for it.

So when a task needs a template that does not exist yet, or an existing one changed, say so plainly and hand the user the app. Then come back to `get` and `send`.

## Gotchas

- **`get` before `send`, every time you are not certain of the payload.** `expectedDataRepresentation` is the contract; a mismatch is `invalid_data` (400), and it can change whenever someone edits the template in the app.
- **The data keys are the template's keys, not the schema's names.** A record property keyed `recipient` pointing at the `students` schema means your payload needs `{"recipient": {...}}`, not `{"students": ...}` and not `{"contact": ...}`.
- **`schema` on a record property always reads back as the slug**, never the id, whatever the app stored.
- **`transactional`/`communicationTopicId` cannot be overridden at send time.** If a message needs to go out as transactional and the template is marketing, that is an app-side change to the template, not a send parameter.
- **Sending mutates the records in the payload.** Every record property in `--data` is upserted by identity as a side effect before rendering. Keep the payload to identifiers plus fields you actually intend to persist.
- **`content` reads back raw even for app-visual templates.** Do not treat that raw text as an editing surface; there is no way to write it back through this API.
- **Errors to expect**: `template_not_found` (404) on `get`/`send`; `invalid_data` (400) and `template_not_sendable` (400) on `send`, plus the eligibility set (`email_limit_reached` 402, `sending_disabled`/`domain_not_verified`/`marketing_requires_contact`/`recipient_not_subscribed`/`recipient_suppressed` 422). See `maxclicks-email`.
- **`send` accepts an `Idempotency-Key`.** It is one of only seven operations that do, so use it when a retry after a network timeout would otherwise risk a duplicate email.
