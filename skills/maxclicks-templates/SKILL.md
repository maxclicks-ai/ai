---
name: maxclicks-templates
description: Create, list, get, update, duplicate, or delete a reusable maxclicks email template (the authoring CRUD, separate from sending). Use when a task needs to define a template's data shape, recipient, sender, or metadata, not just send an existing one.
---

# Authoring maxclicks templates

Builds on the `maxclicks` skill (read it first). A **template** is a stored, reusable message definition: raw email content plus the data shape it expects (`expectedDataRepresentation`), the recipient path, sender, and topic. This skill covers the authoring CRUD (`create`/`list`/`get`/`update`/`duplicate`/`delete`). For the content **language** itself (Adaptyle + Liquid syntax in `subject`/`body`), load `maxclicks-adaptyle`. For **sending** an already-authored template, load `maxclicks-email`.

## Step 1: Discover the schema(s) the template will reference

Every `record`-typed property in `expectedDataRepresentation` points at a schema. Discover it first, same discipline as everywhere else:

```bash
maxclicks whoami
maxclicks schemas list --type contact
maxclicks attributes list students
```

## Step 2: Create

```bash
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
```

`--idempotency-key` is supported.

### Field shapes that matter

- **`expectedDataRepresentation`** is an array of properties, each either:
  - a **record** property: `{ "key": "contact", "type": "record", "schema": "<id-or-slug>", "isArray": false, "description"? }`
  - a **json** property: `{ "key": "orderTotal", "type": "json", "jsonSchema": { "type": "number" }, "description"? }`

  `key` is what `templates send`'s `--data` payload and Liquid (`{{ contact.firstName }}`, `{{ orderTotal }}`) both key off of. `schema` accepts an id or slug on write; reads always echo the slug.
- **`recipientDataPath`** (array of property-key segments, e.g. `["contact"]`) points into that representation at whichever property is the contact or bare email address the send actually goes to. It can be a shallow root-level key or, with `attributeExpansions`, a deeper path through an evaluated attribute.
- **`content`** is **raw editor content only**: `{ bodyFormat: "mjml"|"html", subject, body }`. There is no `editor` field to set (the API forces raw) and no rich block-tree shape; see `maxclicks-adaptyle` for how to write `subject`/`body`.
- **`transactional`** (boolean) and **`communicationTopicId`** live on the template itself, not on `send`. They decide whether the message bypasses marketing suppression (transactional) or is subject to consent/topic preferences (marketing). Pick deliberately: a receipt or password reset is transactional; a newsletter is marketing with a topic.
- **`from`** picks the sender: `{ "type": "domain", "domainId": "...", "code": "support", "name"? }` or `{ "type": "sender", "senderId": "..." }`. See `maxclicks-deliverability` for verified domains and saved senders. Omit it and the space default sender/domain applies at send time.

## Step 3: List, get, update, duplicate, delete

```bash
maxclicks templates list --all
maxclicks templates get tmpl_01hx...
maxclicks templates update tmpl_01hx... --data '{"name":"Welcome email v2"}'
maxclicks templates duplicate tmpl_01hx...          # --idempotency-key supported
maxclicks templates delete tmpl_01hx...
```

`update` is a partial patch, send only the fields you are changing. Updating `content` replaces the whole `{bodyFormat, subject, body}` object (all three fields required together, you cannot patch just `subject`). Updating `expectedDataRepresentation` or `recipientDataPath` changes what `send`'s `--data` payload must satisfy going forward; existing callers of `send` need to be updated in lockstep.

## Step 4: Send

Sending is `maxclicks-email`'s job: `maxclicks templates send <templateId> --data '<json>'`, keyed by the `expectedDataRepresentation` you just declared. See that skill for the full send contract (response shape, warnings header, upsert-as-side-effect).

## Gotchas

- **Content is always raw, never the app's rich block-tree.** The Public API only ever stores/returns `{ bodyFormat, subject, body }`. There is no way to author or read the visual/rich editor structure through this API.
- **`content` updates are all-or-nothing.** `PATCH .../{id}` with a `content` key requires `bodyFormat`, `subject`, and `body` together; there is no partial content patch.
- **`transactional`/`communicationTopicId` are template properties, not send-time overrides.** Get them right when authoring; `templates send` cannot change them per call.
- **`expectedDataRepresentation` and `recipientDataPath` are the send contract.** Changing them after callers exist is a breaking change to anyone calling `send`, treat it like changing a function signature.
- **`schema` on a record property accepts an id or slug on write, but reads always echo the slug**, do not assume the value you sent round-trips byte-for-byte if you sent an id.
- **Errors to expect**: `invalid_template`, `invalid_content`, `topic_not_found`, `domain_not_found`, `sender_not_found` on create/update; `template_not_found` on get/update/delete/duplicate.
- **No validate/preview endpoint.** Validate Adaptyle syntax by inspection before you POST/PATCH (see `maxclicks-adaptyle` Section 9), then confirm by reading the template back (`templates get`) and exercising `templates send` against a real or sandbox contact.
