# The full loop: draft, validate, hand off, read back, send

End-to-end walkthrough tying this skill (content) to `maxclicks-templates` (finding a template and reading its send contract), `maxclicks-email` (sending and suppressions), and `maxclicks-contacts`/the `maxclicks` skill (schema discovery). The content itself is written in the maxclicks app's email editor; everything the API can do sits on either side of that step.

## 1. Confirm the space and discover the schema

```bash
maxclicks whoami
maxclicks schemas list --type contact       # find the contact schema slug, e.g. "students"
maxclicks attributes list students          # the exact custom keys you may reference in Liquid
```

Every `{{ contact.<key> }}` you plan to write must resolve against a real base field or a key that shows up here. Do not guess.

## 2. Decide the data representation and recipient path

List every property your content needs, then write out the `expectedDataRepresentation` the template will need. A single `contact` record property is the common case; add `json` properties for anything else (an order, a cart, a featured article) and `record`+`isArray: true` properties for lists of related records (top picks, recent orders). `recipientDataPath` points at whichever property is the contact or bare email address the send actually goes to, almost always `["contact"]`.

This is not decoration: it is the contract `templates send` validates every payload against, and the reason a `{{ }}` reference resolves at send time. Write it down explicitly so it can be set up alongside the content.

## 3. Decide transactional vs marketing, and the topic

`transactional: true` for anything the recipient needs regardless of marketing consent (receipts, password resets, account notices); `transactional: false` plus a communication topic for anything that requires marketing consent (newsletters, promotions, digests). `maxclicks topics list --all` gives you the space's topics. This is a property of the template, decided once, not something a caller can override per send (see the main SKILL.md Section 8).

## 4. Write the content

Pick `bodyFormat: "mjml"` or `"html"` (Section 7 of the main SKILL.md, and `mjml-and-html.md`), then write `subject` and `body`: deterministic Liquid for anything known and mechanical, prompt tags only where wording genuinely benefits from judgment, hidden blocks for static boilerplate. Start from one of the six templates in `examples.md` and adapt it rather than writing from a blank page.

## 5. Validate by inspection, then hand it over

Run the checklist in the main SKILL.md Section 9 (unique hidden ids, prompt count and nesting within limits, manifest at the very start if present, every delimiter closed, every `{{ }}` reference declared) before you deliver anything.

Then hand the user a complete package for the app's email editor (`https://app.maxclicks.ai`): the body format, the `subject` and `body` text for its raw/code mode, the data representation and recipient path from step 2, the transactional flag and topic from step 3, and the sender if it should not be the space default. Ask for the resulting template id back; that is the `templateId` you send by.

## 6. Read it back, then send it for real

```bash
maxclicks templates get <templateId>                # confirm the stored subject/body and expectedDataRepresentation
maxclicks templates send <templateId> --data '{"contact":{"email":"ada@example.com"}}'
```

`get` is the verification step: the content comes back in raw form whichever editor mode was used, so you can diff it against your draft by eye, and its `expectedDataRepresentation` tells you exactly which keys the `--data` payload must carry.

`send` returns `{ emailId, status, error }`, with warnings alongside `data` (see `maxclicks-email`; the CLI discards the result, so use direct HTTP or a compatible SDK when the outcome matters). `sent` means provider acceptance, not delivery. HTTP 200 `failed` may include an unknown provider outcome; preserve the email id and original operation key and reconcile before sending again. Pre-send validation/eligibility failures use HTTP errors. A template without an email channel can return null result fields. Sending upserts the `contact` (and any other record properties) inside `--data` as a side effect, keep that payload to identifiers plus fields you actually want written (see `maxclicks-contacts` for the identity cascade).

## 7. Iterate

Edits to the content, the data representation, the recipient path, the transactional flag, or the topic all happen in the app, on the same template. Nothing about the send call changes: re-send at any point with `maxclicks templates send <templateId>`, and re-run step 6's `get` after any edit, since a changed `expectedDataRepresentation` changes what your payload must satisfy. For a variant to A/B against, ask for a second template rather than mutating the one already in use.

## Where this hands off

- **`maxclicks-templates`**: finding a template and reading its send contract (`expectedDataRepresentation`, `recipientDataPath`, `from`, `transactional`).
- **`maxclicks-email`**: `send` and suppressions.
- **`maxclicks-contacts`**: schema/attribute discovery, the record identity cascade, and what happens when `send` upserts a record as a side effect.
- **`maxclicks` skill's `references/requirements.md`**: if you also need a segment or a webhook filter to route these emails, not this skill's concern, but the same natural-language-`requirements` discipline applies there.
