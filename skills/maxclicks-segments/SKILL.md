---
name: maxclicks-segments
description: Create, list, count, change, or delete maxclicks segments, AI-generated contact filters defined by a natural-language prompt. Use for audience definitions, saved filters, or "contacts where..." style queries against the maxclicks API or CLI.
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

This is a **slow, billed AI call** (roughly 10-90s, rate-limited on the AI bucket, 10/min per key). The response never includes the generated code, only `conditionDescriptionMarkdown` (a human-readable summary) and, since this was a fresh create, a point-in-time `matchingCount`. Review the description with the user before treating the segment as correct; a segment whose condition is wrong is replaced, not patched (Step 4), and there is no way to hand-edit the generated expression.

Name real schema/attribute keys in the prompt (from Step 1) and state comparisons explicitly (thresholds, date windows, counts). See `references/requirements.md` for the full phrasing guide.

## Step 3: List, get, count, and preview matches

```bash
maxclicks segments list --all
maxclicks segments get seg_01hx...
maxclicks segments count seg_01hx...              # live matching count, recomputed on every call
maxclicks segments contacts seg_01hx... --all      # matching contacts, full records (limit hard-capped at 100/page)
```

`count` and `contacts` are always live, computed at call time, not cached from creation. Use `count` to check size before wiring a segment into a broadcast or webhook; a segment with `matchingCount` from Step 2 can already be stale by the time you act on it.

## Step 4: Change a segment (replace, or edit it in the app)

There is no segment update call. A segment is a stored, AI-generated condition that other entities point at, and the API deliberately does not let a background job silently redefine what an audience means underneath a live broadcast or workflow. Two ways to change one:

- **In the app.** The segment page is where a human iterates on the prompt and reads the regenerated condition description before accepting it. This is the right answer whenever the segment is already wired into something.
- **Replace it over the API.** Create the new segment first, repoint whatever referenced the old one, then delete the old one. Creating first also means you never leave the space without a working segment if generation fails.

```bash
# 1. New definition under a new name, reviewed the same way as Step 2:
maxclicks segments create \
  --name "Lapsed premium (60d)" \
  --contact-schema students \
  --requirements "Contacts whose plan attribute equals premium, who have not opened any email in the last 60 days."

# 2. Repoint the references (see "Using a segment elsewhere" below), then:
maxclicks segments delete seg_old...
```

Renaming is the same story: a name is part of the stored definition, so a rename is also a create-and-replace, or one field edited in the app. When only the name is wrong, editing in the app is far cheaper than a fresh billed generation.

## Step 5: Delete

```bash
maxclicks segments delete seg_01hx...
```

Delete is blocked with **HTTP 409 `segment_in_use`** if the segment is referenced as a broadcast audience, a workflow trigger filter, a webhook condition, or by another generated expression (a segment can reference another segment). Read the error and remove or repoint the referencing entity first; the API will not cascade-delete those references for you. Integration-owned segments (non-null `integrationVendorName`) return `403 segment_integration_owned` on delete, only the owning integration can remove them.

## Using a segment elsewhere

Once created, reference the segment by id, not by re-describing its filter:

- Broadcast audience: `maxclicks broadcasts update <id> --data '{"audience":{"type":"segment","segmentId":"seg_01hx..."}}'` (see `maxclicks-broadcasts`).
- Webhook condition: `maxclicks webhooks update <id> --data '{"condition":{"type":"segment","segmentId":"seg_01hx..."}}'` (see `maxclicks-webhooks`).
- Workflow trigger filter: bound to the segment in the app, on the trigger step (see `maxclicks-workflows`).
- A segment can itself reference other segments inside its `requirements` prompt ("contacts in the Teenage boys segment who also...").

## Gotchas

- **`segments create` is slow and billed.** It hits the AI rate bucket (10/min per key) and takes up to ~90s. Do not retry blindly on a timeout; `segments list` first to see whether it actually landed, or you will pay twice and leave a duplicate behind.
- **The generated expression is never returned**, on any endpoint, at any permission level. `conditionDescriptionMarkdown` is the only human-readable artifact; treat it, not your original prompt, as the contract to review (the model may have refined the wording).
- **`matchingCount` on create is a snapshot, not live.** Call `segments count <id>` whenever you need the current number.
- **There is no update.** Name, description and condition are all fixed once created: iterate in the app, or create a replacement, repoint its references and delete the old one.
- **`segments contacts` is capped at 100 per page** regardless of the `--limit` you pass; use `--all` to walk every page if you need the full set.
- **Delete fails while referenced.** `409 segment_in_use` means something else (broadcast, workflow, webhook, another segment) still points at it; there is no force-delete.
- **Get the prompt right before you send it.** There is no partial-edit of the generated condition and no cheap re-roll: every attempt is a fresh billed generation. Read `references/requirements.md` and confirm the criteria with the user first.
