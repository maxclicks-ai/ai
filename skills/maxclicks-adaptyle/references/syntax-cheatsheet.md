# Adaptyle syntax cheat sheet

The complete delimiter set. Adaptyle's own grammar cares about exactly seven token strings; everything else in a `subject`/`body` field is plain content (including all Liquid `{{ }}`/`{% %}` tags, which Adaptyle does not parse at all, they resolve in the earlier Liquid stage).

## Delimiters

| Token | Literal string | Role |
| --- | --- | --- |
| Manifest open | `<<#` | Starts a YAML metadata block |
| Manifest close | `#>>` | Ends a YAML metadata block |
| Prompt open | `<<<` | Starts an LLM instruction |
| Prompt close | `>>>` | Ends an LLM instruction |
| Hidden open | `<##` | Starts a hidden (LLM-invisible) block |
| Hidden close | `##>` | Ends a hidden block |
| Separator | `:::` | Splits id/content or instruction/content inside a prompt or hidden block |

## Manifest

Optional, and if present must be the very first thing in the field (only leading whitespace allowed before it):

```
<<#
title: Weekly Newsletter
description: |
  A marketing email for the weekly product roundup.
author: design@example.com
dataJsonSchema: |
  { "type": "object", "properties": { "topArticle": { "type": "object" } } }
tools:
  - name: image_generation
    description: Generates an image from a text prompt.
#>>
```

Fields: `title` (string), `description` (string, YAML block scalar for multi-line), `author` (string or array of strings), `dataJsonSchema` (a JSON *string* value, not nested YAML; omit unless you specifically need to declare a schema on this field), `tools` (array of tool names or `{name, description?, inputSchema?}` objects). Unknown keys pass through. When authoring against the public API, a manifest is rarely necessary (the platform composes its own manifest for the actual LLM call); use one only to leave a human-readable `title`/`description` on the field.

## Prompt tag: two forms

**Generation** (no base content, the model writes from scratch):

```
<<<Write a short, upbeat subject line under 60 characters welcoming the new contact by name.>>>
```

**Modification** (instruction, then `:::`, then the deterministic base content to rewrite):

```
<<<Rewrite the following to sound more urgent, in one sentence ::: This month only, members save 20% on their next order.>>>
```

The order is always **instruction first, `:::`, content second**. Getting this backward is a common mistake; the content after `:::` is what gets rewritten, the text before it is the instruction.

Prompts can nest (a prompt inside another prompt's instruction or base content), processed inside-out:

```
<<<Rewrite the following teaser to sound more urgent and exciting, in one sentence ::: This month only, members get <<<Write a punchy 3-6 word phrase for an exclusive member discount.>>> on their next order.>>>
```

Keep nesting to 2 levels or fewer (a 3rd level triggers an analysis warning) and the total prompt count per field to 10 or fewer (the same warning threshold). Neither limit is a hard parse error, both are quality signals: past them, the LLM call gets harder to reason about and more expensive.

## Hidden block

```
<## unique-id ::: <style>.receipt-table{width:100%;}</style> ##>
```

The id (`unique-id` above) can be any non-empty string and can be built with Liquid, e.g. `<##prod-{{ product.id }}-style:::...##>`. **The id must be unique across the entire field, and effectively across subject+body together** since they may be merged into one document for a single customize call. A duplicate id is a hard, thrown parse error in strict mode (`Hidden ID "..." is already defined.`), it aborts the whole customize/send call, not just the offending block. See `pitfalls.md` for the concrete incident this caused in the app's own button component.

A hidden block's content is treated as a single plain-text run: it cannot itself contain a literal `<<<`, `>>>`, `<##`, `##>`, or `:::` without escaping them first (see below). A prompt's base content, by contrast, is parsed recursively, which is what allows nesting.

## Escapes

To write a literal delimiter character sequence as text (for example, documenting Adaptyle syntax itself inside an email), use these escape codes instead of the raw characters:

| Literal | Escape code |
| --- | --- |
| `<<#` | `<##ESCMO##>` |
| `#>>` | `<##ESCMC##>` |
| `<<<` | `<##ESCPO##>` |
| `>>>` | `<##ESCPC##>` |
| `<##` | `<##ESCHO##>` |
| `##>` | `<##ESCHC##>` |
| `:::` | `<##ESCS##>` |

You will not need these in ordinary marketing/transactional content; they exist for the rare case of writing about Adaptyle itself, or emitting a literal sequence that would otherwise be mistaken for a delimiter.

## The two-stage resolution order, restated

1. Liquid resolves every `{{ }}`/`{% %}` wherever it appears, including inside `<<< >>>` and `<## ##>` (do not do this deliberately for prompts, see the main SKILL.md Section 6, but understand it happens mechanically).
2. Adaptyle then parses what remains for manifest/prompt/hidden structure. If there are zero prompt tags after Liquid resolves, no LLM call happens at all.
