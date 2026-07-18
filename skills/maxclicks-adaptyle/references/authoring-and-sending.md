# The full loop: create, validate, send

End-to-end walkthrough tying this skill (content) to `maxclicks-templates` (the CRUD shell), `maxclicks-email` (sending and suppressions), and `maxclicks-contacts`/the `maxclicks` skill (schema discovery). All template authoring operations below are full CLI commands (not yet wrapped by any SDK; use a raw HTTP call from application code).

## 1. Confirm the space and discover the schema

```bash
maxclicks whoami
maxclicks schemas list --type contact       # find the contact schema slug, e.g. "students"
maxclicks attributes list students          # the exact custom keys you may reference in Liquid
```

Every `{{ contact.<key> }}` you plan to write must resolve against a real base field or a key that shows up here. Do not guess.

## 2. Decide the data representation and recipient path

List every property your content needs, then write `expectedDataRepresentation`. A single `contact` record property is the common case; add `json` properties for anything else (an order, a cart, a featured article) and `record`+`isArray: true` properties for lists of related records (top picks, recent orders). `recipientDataPath` points at whichever property is the contact or bare email address the send actually goes to, almost always `["contact"]`.

## 3. Decide transactional vs marketing, and the topic

`transactional: true` for anything the recipient needs regardless of marketing consent (receipts, password resets, account notices); `transactional: false` plus a `communicationTopicId` for anything that requires marketing consent (newsletters, promotions, digests). This is a property of the template, decided once here, not something a caller can override per send (see the main SKILL.md Section 8).

## 4. Write the content

Pick `bodyFormat: "mjml"` or `"html"` (Section 7 of the main SKILL.md, and `mjml-and-html.md`), then write `subject` and `body` directly: deterministic Liquid for anything known and mechanical, prompt tags only where wording genuinely benefits from judgment, hidden blocks for static boilerplate. Start from one of the six templates in `examples.md` and adapt it rather than writing from a blank page.

## 5. Validate by inspection, then create

Run the checklist in the main SKILL.md Section 9 (unique hidden ids, prompt count and nesting within limits, manifest at the very start if present, every delimiter closed) before sending. Then:

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

Read the response's `id` back; that is the `templateId` you send by.

## 6. Read it back, then send it for real

```bash
maxclicks templates get <templateId>                # confirm subject/body stored exactly what you sent
maxclicks templates send <templateId> --data '{"contact":{"email":"ada@example.com"}}'
```

`send` is synchronous and returns `{ emailId, status: "sent"|"failed", error? }` plus any warnings in the same body's `warnings` array (see `maxclicks-email`). A `"failed"` status (a genuine SES failure) is a real `200` result to read, not an exception; pre-send validation/eligibility problems throw as real HTTP errors instead. Sending upserts the `contact` (and any other record properties) inside `--data` as a side effect, keep that payload to identifiers plus fields you actually want written (see `maxclicks-contacts` for the identity cascade).

## 7. Iterate

`maxclicks templates update <templateId> --data '<json>'` to change `content`, `expectedDataRepresentation`, `recipientDataPath`, `transactional`, or `communicationTopicId`; re-send at any point without recreating the template. `maxclicks templates duplicate <templateId>` when you want a variant to A/B without touching the original. `maxclicks templates delete <templateId>` to remove one you no longer need.

## Where this hands off

- **`maxclicks-templates`**: the full authoring CRUD (field shapes, `expectedDataRepresentation`, `recipientDataPath`, `from`).
- **`maxclicks-email`**: `send` and suppressions.
- **`maxclicks-contacts`**: schema/attribute discovery, the record identity cascade, and what happens when `send` upserts a record as a side effect.
- **`maxclicks` skill's `references/requirements.md`**: if you also need a segment or a webhook filter to route these emails, not this skill's concern, but the same natural-language-`requirements` discipline applies there.
