---
name: maxclicks-broadcasts
description: Create, schedule, or send a maxclicks broadcast, a one-time mass email to a contact-schema audience (everyone, a segment, or an AI-generated custom filter). Use for newsletters, promos, or any "email this whole audience" task.
---

# Building and sending broadcasts in maxclicks

Builds on the `maxclicks` skill (read it first) and, for the audience filter, the `maxclicks-segments` skill. A **broadcast** is a one-shot mass send: pick a contact schema, an audience (all contacts, a saved segment, or a fresh natural-language filter), attach raw email content, and send. Broadcast content is a **1:1 owned copy**, not a reference to a reusable `Template` (for a reusable, send-many-times template, see `maxclicks-templates` instead).

## Step 1: Discover the contact schema

```bash
maxclicks whoami
maxclicks schemas list --type contact
```

## Step 2: Create a draft

A broadcast needs a `contactSchema` at minimum; everything else (audience, content, scheduling) can be added now or via `update`/`send`.

```bash
# Minimal draft: audience defaults to "all" contacts in the schema, no content yet
maxclicks broadcasts create --data '{"contactSchema":"students","name":"July product update"}'

# With an explicit segment audience and inline raw content:
maxclicks broadcasts create --data '{
  "contactSchema": "students",
  "name": "July product update",
  "audience": { "type": "segment", "segmentId": "seg_01hx..." },
  "content": {
    "bodyFormat": "mjml",
    "subject": "<<<Write a short, upbeat subject line about the product update shipped this month.>>>",
    "body": "<mjml><mj-body><mj-section><mj-column><mj-text><<<Write a two-sentence summary of what shipped this month.>>></mj-text></mj-column></mj-section></mj-body></mjml>",
    "transactional": false,
    "communicationTopicId": "top_01hx..."
  }
}'
```

`content` is **raw editor content only** (`{ bodyFormat, subject, body, transactional?, from?, communicationTopicId? }`), no rich block-tree structure, written in Adaptyle + Liquid. Load `maxclicks-adaptyle` for how to write `subject`/`body`. Unlike a template, `transactional` and `communicationTopicId` live inline on this same `content` object, there is no separate authoring resource to patch. `--idempotency-key` is supported on create.

## Step 3: Set the audience

Three audience shapes, only the first two are settable directly:

```bash
maxclicks broadcasts update bc_01hx... --data '{"audience":{"type":"all"}}'
maxclicks broadcasts update bc_01hx... --data '{"audience":{"type":"segment","segmentId":"seg_01hx..."}}'
```

For a one-off natural-language filter that is not worth saving as a reusable segment, generate it directly on the broadcast:

```bash
maxclicks broadcasts audience-generate bc_01hx... --requirements "Contacts in the students schema who have completed at least one course and have not received an email from us in the last 14 days."
```

This is a **slow, billed AI call** (see `references/requirements.md` in the `maxclicks` skill for phrasing). It persists a `{ type: "custom filter", requirements, conditionDescriptionMarkdown }` audience and returns a live `matchingCount`; the generated expression itself is never returned. A `custom filter` audience can only be set this way, never via `create`/`update` directly. Rejected once the broadcast has started sending (`409 broadcast_already_sending`).

## Step 4: Send

```bash
# Send now:
maxclicks broadcasts send bc_01hx...

# Schedule for later:
maxclicks broadcasts send bc_01hx... --data '{"scheduledFor":"2026-08-01T14:00:00Z"}'
```

`send` moves the broadcast to `send now`/`send at` scheduling status; the actual send is asynchronous (HTTP 202). It runs the same readiness gate the app enforces before letting a broadcast go out: missing content, no verified sender, empty audience, etc.

**The gate can reject with `422 broadcast_invalid`, carrying `issues[]`.** Read every issue in the array (there can be more than one problem at once) and fix each before retrying; this is a normal validation result, not a transient error.

## Step 5: Observe

```bash
maxclicks broadcasts runs bc_01hx... --all       # one reduced run record per recipient contact
maxclicks broadcasts metrics bc_01hx...           # aggregated sent/delivered/opens/clicks/bounces
```

`metrics` omits the `email` key entirely if the broadcast never had content. A run's `status` is `sent`, `failed`, or `pending`; a `failed` run carries `failureReason`.

## Full lifecycle

```bash
maxclicks broadcasts list --all
maxclicks broadcasts get bc_01hx...
maxclicks broadcasts update bc_01hx... --data '{"name":"July product update v2","scheduledFor":null}'
maxclicks broadcasts delete bc_01hx...
```

Only `name`/`description`/`audience`/`scheduledFor` are updatable through `update`; `content` is not editable through that endpoint once set (there is no PATCH for content, recreate the broadcast if the content needs to change before it has content set the first time). Both `update` and `delete` are rejected once sending has started (`409 broadcast_already_sending` / `409 broadcast_sending`).

## Gotchas

- **Broadcast content is owned, not a template reference.** There is no `templateId` on a broadcast; the raw `{ bodyFormat, subject, body }` you send in `content` is copied in, and there is no update path for it after creation via this API.
- **Transactional/topic live inside `content`, same rule as templates.** `content.transactional` and `content.communicationTopicId` decide suppression and consent handling for this specific send; get them right at creation, since content is not patchable afterward.
- **`send`'s 422 gate carries an array, not a single error.** `broadcast_invalid` issues can include multiple simultaneous problems (no content, no audience, sender not verified); fix all of them, not just the first.
- **`audience-generate` is billed and slow, and only settable that way for a custom filter.** You cannot `PATCH` a `custom filter` audience into existence directly; you must call `broadcasts audience-generate`.
- **`update`/`delete`/`audience-generate` all reject once sending has started.** Once a broadcast is `send now`/`send at` and picked up by the pipeline, treat it as immutable; build a new broadcast (or duplicate manually) for a follow-up send.
- **There is no `broadcasts duplicate` endpoint** at the Public API level (unlike templates); recreate with the same `content`/`audience` if you need a copy.
- **Metrics and runs are read-only observability**, not a retry mechanism; a `failed` run does not automatically retry.
