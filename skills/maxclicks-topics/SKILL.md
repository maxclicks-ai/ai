---
name: maxclicks-topics
description: Create, list, update, or delete a maxclicks communication topic (e.g. "Marketing", "Product Updates"), the consent-scoped grouping for marketing sends. Use when wiring a template's or broadcast's communicationTopicId, or building a preference center.
---

# Communication topics in maxclicks

Builds on the `maxclicks` skill (read it first). A **topic** is a user-defined grouping, per communication channel, that marketing content is sent under (e.g. "Marketing", "Product Updates"). A contact must have consented to a topic (or the channel generally) before a marketing send under that topic proceeds; transactional content bypasses topics entirely. Today the only channel is `email`.

## Create

```bash
maxclicks topics create --data '{"name":"Product Updates","description":"Feature launches and changelog digests","color":"blue","private":false}'
```

`--idempotency-key` is supported. Fields: `name` (required), `description?`, `color?` (a `BadgeColor`, e.g. `blue`, `green`, `amber`), `channel?` (defaults to `email`, the only channel today), `private?` (defaults to `false`). Private topics are hidden from the public contact-preferences page unless the contact has been individually granted access, use for internal or invite-only sequences.

## List, get, update

```bash
maxclicks topics list --all
maxclicks topics get top_01hx...
maxclicks topics update top_01hx... --data '{"description":"Now includes beta invites","private":true}'
```

**`channel` is immutable.** Attempting to change it on `update` fails with `400 topic_immutable_field`. If content needs a different channel, create a new topic (there is currently only `email`, so this rarely comes up, but the rule holds as more channels ship). `name` collisions return `409 topic_name_conflict`.

## Delete

```bash
maxclicks topics delete top_01hx...
```

Blocked with **`409 topic_in_use`** if the topic is referenced by a form or an email template's `communicationTopicId`. Bypass with `--force` when you have confirmed the references should be dropped (the referencing template/form keeps its `communicationTopicId` pointing at a now-deleted topic, effectively reverting that content to "no topic", check what depends on it first):

```bash
maxclicks topics delete top_01hx... --force
```

## Wiring into content

```bash
maxclicks templates update tmpl_01hx... --data '{"communicationTopicId":"top_01hx..."}'
maxclicks broadcasts create --data '{"contactSchema":"students","content":{"bodyFormat":"mjml","subject":"...","body":"...","communicationTopicId":"top_01hx..."}}'
```

See `maxclicks-templates` and `maxclicks-broadcasts` for exactly where `communicationTopicId` sits in each resource. A webhook's `condition` and a contact's audit trail also reference topics indirectly through consent events, see `maxclicks-webhooks` and the `maxclicks` skill's data model notes.

## Gotchas

- **`channel` is immutable after create.** Get it right the first time; there is no migration path other than creating a new topic.
- **Delete is blocked while referenced**, `--force` bypasses the check but does not clean up the referencing template/form, it silently leaves them pointing at nothing. Confirm nothing depends on the topic first, or accept that consequence deliberately.
- **`private: true` hides the topic from the public preferences page** unless the contact has explicit access; do not use it for anything a contact is expected to self-manage consent for.
- **Topics gate marketing, not transactional, sends.** A transactional template/broadcast never checks topic consent regardless of `communicationTopicId`.
- **`name` must be unique within the space**; a duplicate returns `409 topic_name_conflict` on create or update.
