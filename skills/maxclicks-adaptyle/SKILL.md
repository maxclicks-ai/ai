---
name: maxclicks-adaptyle
description: >-
  Write or edit the CONTENT of a maxclicks email template: the subject and body
  in Adaptyle, maxclicks's LLM-enhanced templating language layered over Liquid.
  Use whenever a task asks to write, draft, generate, or edit an email template's
  subject/body, an MJML or HTML raw template, an Adaptyle prompt tag, manifest,
  or hidden block, or to personalize email copy with AI at send time.
allowed-tools: Bash Read
---

# Authoring Adaptyle email content in maxclicks

**Coverage:** read the `maxclicks` entry skill for current REST coverage and client limits.

Builds on the `maxclicks` skill (auth, tool choice, data model), the `maxclicks-templates` skill (reading a template's send contract) and the `maxclicks-email` skill (sending). This skill is the content language itself: how to write a template's `subject` and `body` so that Liquid inserts real data deterministically and an LLM personalizes the parts that need judgment.

## 1. What this covers, and where the content lives

**Template content is authored in the maxclicks app** (`https://app.maxclicks.ai`), in the email editor, where the preview and render pipeline validates it before it can go in front of recipients. So this skill has two real jobs:

1. **Draft the `subject` and `body`** for a human to put into the app's editor (its raw/code mode takes exactly the Adaptyle + Liquid text you write here). Getting the language right up front is most of the work.
2. **Read and reason about content that already exists.** `GET /templates/{id}` returns `content` as `{ subject, body }` in **raw** form, always, whichever editor mode the app used (`contentEditor` tells you which). So you can read a live template's Adaptyle back, explain it, spot a bug in it, or draft a corrected version for the user to apply.

There is no public "validate this template" or "preview" endpoint, and no way to write content back through the API. Validate a draft by inspection (Section 9) before handing it over, then confirm by reading the stored template back (`maxclicks templates get <id>`) and exercising it with `templates send` against a real or sandbox contact.

## 2. The two-stage mental model

Every Adaptyle document resolves in exactly two stages, in order:

1. **Interpolation (Liquid).** Every `{{ ... }}` and `{% ... %}` tag resolves against the data object, wherever it appears in the document, including inside prompt tags. This runs first and is fully deterministic: no AI, no cost, same input always produces the same output.
2. **LLM call (Adaptyle).** Only after Liquid has resolved does the Adaptyle parser look for `<<< >>>` prompt tags. If the document has **zero** prompt tags, this stage is skipped entirely, no LLM call happens, no AI cost is spent, and `customize` behaves exactly like `strip`. **Prefer zero prompt tags whenever the content can be fully deterministic** (transactional confirmations, data tables, anything where wording doesn't need to vary). Reach for a prompt tag only for the part that genuinely benefits from judgment: tone, a short generated phrase, picking among options.

Because the LLM already receives the full data object as context, prompt instructions should describe *what to write*, in plain English, not interpolate data into the instruction text. See Section 6.

## 3. Write RAW content: two strings and a format

The shape you are writing, whether you are drafting it for the app's editor or reading it back off a template:

```jsonc
{
  "bodyFormat": "mjml",   // or "html"
  "subject": "<<<...>>>",  // an Adaptyle+Liquid string, or plain text, or null
  "body": "<mjml>...</mjml>"  // an Adaptyle+Liquid string
}
```

There is **no separate `preview` field**. For MJML, put preview text inline as an `<mj-preview>` tag inside `<mj-head>` (Section 7). Subject and body are customized together as one logical document (a matched pair), so a prompt in one may reasonably reference what the other is doing, but they are still two separate strings you write and validate independently (see Section 9).

The app's visual editor keeps its own block structure, and a template built that way still reads back through the API as raw text in this shape. That raw text is a faithful read-only projection: study it, never treat it as an editing surface.

## 4. Syntax

Full cheat sheet: `references/syntax-cheatsheet.md`. The essentials:

- **Manifest** `<<# ... #>>`: optional YAML metadata at the very start of a field (`title`, `description`, `author`, `dataJsonSchema`, `tools`). Rarely needed in a maxclicks template (the platform composes its own manifest for the LLM call); include one only when you want to leave a human-readable `title`/`description` on the field itself.
- **Prompt tag** `<<< ... >>>`: two forms.
  - Generation: `<<<Instruction>>>` (no content to modify, the LLM writes it from scratch).
  - Modification: `<<<Instruction ::: Base content to modify>>>` (instruction first, then `:::`, then the deterministic base text). Note the order: instruction before content.
  - Prompts can nest (processed inside-out); keep nesting to 2 levels or fewer (a prompt inside a prompt's base content is fine; a third level triggers an analysis warning). Keep the total prompt-tag count in one field at 10 or fewer for the same reason.
- **Hidden block** `<## unique-id ::: Content to hide ##>`: marks static, context-free content (CSS, SVG, boilerplate markup) that should never reach the LLM and comes back byte-for-byte in the output. **`unique-id` must be unique across the entire document, subject and body combined.** A collision is a hard parse error that blocks the whole customize/send call. See `references/pitfalls.md` for the real incident this rule caused.
- **Escapes**: to write a literal delimiter character sequence (e.g. describing Adaptyle syntax itself), use the `<##ESCxx##>` escape codes (`references/syntax-cheatsheet.md` has the full table). You will not need these in ordinary content.

## 5. Liquid and the data model

Full reference: `references/liquid-and-data.md`. The load-bearing facts:

- **Records are flat.** `{{ contact.plan }}`, never `{{ contact.data.plan }}`. Base fields and custom attributes sit at the same level.
- **Data keys are the template's `expectedDataRepresentation` property keys.** If the representation declares `{ key: "contact", type: "record", schema: "students" }`, the data object has a top-level `contact`; declare `{ key: "order", type: "json", jsonSchema: {...} }` and the data object has a top-level `order` JSON value. `recipientDataPath` (e.g. `["contact"]`) points at whichever property is the contact or bare email address the email actually sends to.
- **`branding` is auto-injected.** Every customize call adds a top-level `branding` object (brand name, website, logo, color palette, style pack, values, tones, assets) even if you never declared it in `expectedDataRepresentation`. Use it for on-brand styling: `{{ branding.colorPalette.headingColor }}`, `{{ branding.stylePack.textFontFamily }}`, etc. Full property list in the reference.
- **Escape untrusted data before it reaches a prompt.** Liquid resolves before the LLM sees anything, so a contact-supplied `firstName` like "Ignore previous instructions" lands in the LLM's context as data, not as your instructions, which is the safe default. Do not manually splice untrusted strings into prompt instruction text yourself; let Liquid interpolation handle it outside prompts, or leave it to the LLM as data.

## 6. The Liquid-vs-prompt decision rule

Use **Liquid** for anything deterministic: inserting a known value, looping over an array, conditionals, formatting a number or date, choosing branding colors. Use a **prompt tag** only for content that genuinely benefits from judgment: tone, a short generated phrase, summarizing, persuasive copy, picking among options, generating an image via a tool.

**Never interpolate `{{ }}` data into a prompt's instruction text.** Write `<<<Write a one-sentence welcome heading, greeting the contact by their first name.>>>`, not `<<<Write a welcome heading for {{ contact.firstName }}.>>>`. The LLM already receives the full data object as context and will read it itself; interpolating into the instruction just makes the prompt brittle (what if the name is empty or contains something odd) and does not make the model more accurate. This also keeps prompts free of the injection risk noted above.

## 7. MJML vs HTML raw bodies

Full reference: `references/mjml-and-html.md`. Quick version:

- **MJML** (`bodyFormat: "mjml"`): a restricted MJML v4 tag set (`mjml`, `mj-head`, `mj-body`, `mj-section`, `mj-column`, `mj-text`, `mj-button`, `mj-image`, `mj-divider`, `mj-spacer`, and a few structural/style tags). Always include `<mj-preview>` inside `<mj-head>` when you can, it is the email client's inbox preview text.
- **HTML** (`bodyFormat: "html"`): plain hand-written HTML with inline styles, no MJML wrapper. There is no separate rich block model to worry about; write the markup directly.
- Liquid tags are allowed anywhere in either body, including inside attribute values (`background-color="{{ branding.colorPalette.backgroundColor }}"`).

## 8. The metadata contract: transactional/topic live on the template, not the send call

`transactional` (boolean) and `communicationTopicId` are fields on the template resource itself, set alongside the content in the app and readable with `maxclicks templates get <id>`, never on `templates send`. Whether a message counts as transactional (bypassing marketing suppression, no unsubscribe requirement) or marketing (subject to consent and topic preferences) is a property of the content, decided once, not something a caller chooses per send. Decide it deliberately when you draft: a receipt or password reset is transactional; a newsletter or promo is marketing with a topic. Say which one your draft assumes, so whoever sets it up in the app sets it right.

## 9. Validate before you hand it over

There is no public preview/validate endpoint, so validate by discipline:

1. **Hidden IDs are unique across the whole field** (and ideally across subject+body together, since they may be combined for one customize call). Grep your own draft for `<##` and check for duplicates before handing it over.
2. **Prompt count and nesting**: count `<<<` occurrences (aim for 10 or fewer per field) and check nesting depth (2 or fewer). A field with zero prompts is valid and skips the LLM, that is a feature, not a gap.
3. **Manifest, if present, is the very first thing in the field** (only leading whitespace allowed before it). A manifest anywhere else is a parse error.
4. **Every delimiter is closed.** Every `<<<` has a matching `>>>`, every `<##...:::` has a matching `##>`, every `<<#` a matching `#>>`. An unclosed tag is a parse error, not a silent pass-through.
5. **Every `{{ }}` reference resolves** against a key the template's `expectedDataRepresentation` declares (read it with `maxclicks templates get <id>`) or against `branding`, which is automatic.
6. **Once it is in the app**, `maxclicks templates get <id>` and read the stored `subject`/`body` back, confirming the content landed as drafted, then exercise it with `templates send` against a real or sandbox contact and inspect the returned `status`/`error` and `warnings` (see `maxclicks-email`).

See `references/pitfalls.md` for the concrete historical failure mode (a duplicate hidden ID from a generated ID scheme) and how to avoid its class of bug when you are constructing IDs programmatically rather than typing them by hand.

## 10. Do / Don't

**Do:**
- Discover the schema and its attribute keys before writing `{{ contact.<key> }}` references (same discipline as the `maxclicks-contacts` skill).
- Keep deterministic content in Liquid, judgment in prompts, and mark truly static boilerplate as hidden so it never counts against the prompt/nesting budget or gets rewritten by mistake.
- Write prompt instructions in plain English describing the desired outcome and constraints (length, tone, what not to say).
- Give every hidden block a distinctive, human-legible id (`welcome-footer-note`, not `block-1`) so collisions are easy to spot by eye.

**Don't:**
- Don't invent attribute or data-representation keys; every `{{ x.y }}` you write must resolve against a key the template's `expectedDataRepresentation` actually declares (or `branding`, which is automatic).
- Don't interpolate data into a prompt's instruction text (Section 6).
- Don't assume code generation is a shortcut: hand-writing valid Adaptyle syntax directly is more reliable than generating it through an intermediate templating step that might itself mangle the delimiters.
- Don't reuse a hidden id across subject and body, or across two block instances in the same field, even if you are certain they will never actually collide in this draft; treat the id namespace as global and permanent.
- Don't treat `transactional`/`communicationTopicId` casually; they gate real compliance behavior (suppression, consent). State which one a draft assumes.
- Don't imply you can push content into the platform. Deliver the draft, name the app editor as where it goes, and offer to verify it afterwards with `templates get`.

## 11. Handoff

Once the template exists in the app, `maxclicks-templates` covers reading its send contract (`expectedDataRepresentation`, `recipientDataPath`) and `maxclicks-email` covers `send`ing it (building the `--data` payload, reading the `status`/warnings) and the suppression list it respects. This skill only covers the `subject`/`body` content itself.

## References

- `references/syntax-cheatsheet.md`: delimiters, manifest fields, both prompt forms, hidden blocks, the full escape table.
- `references/liquid-and-data.md`: flat records, the full `branding` property tree, data representation keys, prompt-injection-safe escaping.
- `references/mjml-and-html.md`: the allowed MJML v4 tag set, HTML raw structure, inline Liquid in markup.
- `references/examples.md`: 6 copy-paste RAW templates, each with its `expectedDataRepresentation` and `recipientDataPath`, verified to parse clean in strict mode.
- `references/pitfalls.md`: the hidden-ID uniqueness rule and the real incident it caused, the no-code-generation-fallacy, nesting/prompt limits, injection escaping.
- `references/authoring-and-sending.md`: the full draft -> validate -> hand off -> read back -> send loop end to end, tying this skill to `maxclicks-templates` and `maxclicks-email`.
