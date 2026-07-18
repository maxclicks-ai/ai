---
name: maxclicks-segments
description: Create, list, count, or update maxclicks segments, AI-generated contact filters defined by a natural-language prompt. Use for audience definitions, saved filters, or "contacts where..." style queries against the maxclicks API or CLI.
---

# Building segments in maxclicks

Builds on the `maxclicks` skill (read it first). A **segment** is a named, reusable contact filter scoped to one contact schema. You describe the filter in plain English; the server generates and stores a query/check expression from it, evaluated fresh on every read. This is the flagship natural-language domain, read `references/requirements.md` (in the `maxclicks` skill) before writing a `requirements` string.

## Step 1: Discover the contact schema

A segment always targets one contact schema. Find its slug first:

```bash
maxclicks whoami
maxclicks schemas list --type contact
maxclicks attributes list students     # know the real attribute keys before naming them in the prompt
```

## Step 2: Generate a segment from a prompt

```bash
maxclicks segments create \
  --name "Lapsed premium" \
  --contact-schema students \
  --requirements "Contacts whose plan attribute equals premium, who have not opened any email in the last 30 days, and who are not already unsubscribed." \
  --description "Premium contacts going cold"
```

This is a **slow, billed AI call** (roughly 10-90s, rate-limited on the AI bucket, 10/min per key). The response never includes the generated code, only `conditionDescriptionMarkdown` (a human-readable summary) and, since this was a fresh create, a point-in-time `matchingCount`. Review the description with the user before treating the segment as correct; re-send `requirements` (Step 4) if it does not match intent, there is no way to hand-edit the generated expression.

Name real schema/attribute keys in the prompt (from Step 1) and state comparisons explicitly (thresholds, date windows, counts). See `references/requirements.md` for the full phrasing guide.

## Step 3: List, get, count, and preview matches

```bash
maxclicks segments list --all
maxclicks segments get seg_01hx...
maxclicks segments count seg_01hx...              # live matching count, recomputed on every call
maxclicks segments contacts seg_01hx... --all      # matching contacts, full records (limit hard-capped at 100/page)
```

`count` and `contacts` are always live, computed at call time, not cached from creation. Use `count` to check size before wiring a segment into a broadcast or webhook; a segment with `matchingCount` from Step 2 can already be stale by the time you act on it.

## Step 4: Update (rename, or regenerate the condition)

`segments update` does two different things depending on which flag you pass:

```bash
# Rename / redescribe only, no AI call, no billing:
maxclicks segments update seg_01hx... --data '{"name":"Lapsed premium (Q3)"}'

# Regenerate the filter condition from a new prompt (billed, same rate bucket as create):
maxclicks segments update seg_01hx... --requirements "Contacts whose plan attribute equals premium, who have not opened any email in the last 60 days."

# Both at once:
maxclicks segments update seg_01hx... --data '{"description":"Widened to 60 days"}' --requirements "..."
```

Passing neither `--data` nor `--requirements` fails locally with a clear message; the CLI will not send an empty PATCH.

## Step 5: Delete

```bash
maxclicks segments delete seg_01hx...
```

Delete is blocked with **HTTP 409 `segment_in_use`** if the segment is referenced as a broadcast audience, a workflow trigger filter, a webhook condition, or by another generated expression (a segment can reference another segment). Read the error and remove or repoint the referencing entity first; the API will not cascade-delete those references for you. Integration-owned segments (non-null `integrationVendorName`) return `403 segment_integration_owned` on delete, only the owning integration can remove them.

## Using a segment elsewhere

Once created, reference the segment by id, not by re-describing its filter:

- Broadcast audience: `{ "type": "segment", "segmentId": "seg_01hx..." }` (see `maxclicks-broadcasts`).
- Webhook condition: `{ "type": "segment", "segmentId": "seg_01hx..." }` (see `maxclicks-webhooks`).
- A segment can itself reference other segments inside its `requirements` prompt ("contacts in the Teenage boys segment who also...").

## Gotchas

- **`requirements` calls are slow and billed.** Both `segments create` and `segments update --requirements` hit the AI rate bucket (10/min per key) and take up to ~90s. Do not retry blindly on a timeout; check `segments get <id>` first to see if it actually landed.
- **The generated expression is never returned**, on any endpoint, at any permission level. `conditionDescriptionMarkdown` is the only human-readable artifact; treat it, not your original prompt, as the contract to review (the model may have refined the wording).
- **`matchingCount` on create/update is a snapshot, not live.** Call `segments count <id>` whenever you need the current number.
- **`segments contacts` is capped at 100 per page** regardless of the `--limit` you pass; use `--all` to walk every page if you need the full set.
- **Delete fails while referenced.** `409 segment_in_use` means something else (broadcast, workflow, webhook, another segment) still points at it; there is no force-delete.
- **Iterate by re-sending `--requirements`, not by hand-editing.** There is no partial-edit of the generated condition; a new `requirements` string regenerates it from scratch.
