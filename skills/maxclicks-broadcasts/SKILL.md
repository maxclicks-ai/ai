---
name: maxclicks-broadcasts
description: Point a maxclicks broadcast at its audience, schedule or send it, and measure the result. Use for "send this newsletter/promo now or at a time", retargeting a broadcast at a segment, or reporting on a mass send's opens, clicks, and bounces.
---

# Scheduling, sending, and measuring broadcasts in maxclicks

**Coverage:** read the `maxclicks` entry skill for current REST coverage and client limits.

Builds on the `maxclicks` skill (read it first) and, for the audience, the `maxclicks-segments` skill. A **broadcast** is a one-shot mass email to a contact schema's audience.

**Broadcasts are built in the maxclicks app** (`https://app.maxclicks.ai`): the contact schema, the email content, and any AI-generated custom audience filter are all authored there, where a human previews the content and reviews the audience condition before it drives a send to thousands of people. Over the API you do the operational half: **retarget, schedule, send, and measure**. Six operations, `list`, `get`, `update`, `send`, `runs`, `metrics`.

If the broadcast a task needs does not exist yet, or its content has to change, say so and hand the user the app.

## Step 1: Find the broadcast and check its state

```bash
maxclicks whoami
maxclicks broadcasts list --all
maxclicks broadcasts get bc_01hx...
```

`get` returns the state that decides everything you can do next:

- **`schedulingStatus`**: `none`, `draft`, `send now`, or `send at`. The last two mean the sending pipeline has it; treat the broadcast as immutable from then on.
- **`hasContent`** (boolean): whether an email has been written for it in the app. `false` means `send` will be rejected by the readiness gate. The content itself is never returned by this API, only this summary.
- **`audience`**: `{ "type": "all" }`, `{ "type": "segment", "segmentId": "..." }`, or `{ "type": "custom filter", "requirements": "...", "conditionDescriptionMarkdown": "..." }`. The custom filter's `requirements` and human-readable condition are readable, so you can report exactly who a broadcast targets; the generated expression itself stays server-side.
- **`contactSchemaId`/`contactSchemaSlug`**, **`scheduledFor`**, **`sendingStartedAt`**, **`sendingFinishedAt`**, **`failureReason`**.

## Step 2: Retarget or reschedule

```bash
maxclicks broadcasts update bc_01hx... --data '{"audience":{"type":"all"}}'
maxclicks broadcasts update bc_01hx... --data '{"audience":{"type":"segment","segmentId":"seg_01hx..."}}'
maxclicks broadcasts update bc_01hx... --data '{"name":"July product update v2","scheduledFor":null}'
```

Only `name`, `description`, `audience`, and `scheduledFor` are updatable, and at least one must be present. The two audience shapes above are the only ones settable here: everyone in the broadcast's contact schema, or a saved segment (find one with `maxclicks segments list --all`, see `maxclicks-segments`).

A **`custom filter` audience is set in the app**, where the person sending reviews the generated condition before it selects the recipients of a mass send. If a task asks for a one-off natural-language audience, either point the user at the app or save a reusable segment instead and set it here by `segmentId`.

`update` never changes `schedulingStatus`; only `send` does that.

## Step 3: Send

```bash
# Send now:
maxclicks broadcasts send bc_01hx...

# Schedule for later:
maxclicks broadcasts send bc_01hx... --data '{"scheduledFor":"2026-08-01T14:00:00Z"}'
```

`send` moves the broadcast to `send now`/`send at` and answers `202`; the actual sending is asynchronous. It runs the same readiness gate the app enforces before letting a broadcast go out: missing content, no verified sender, empty audience, and so on.

**The gate can reject with `422 broadcast_invalid`, carrying `issues[]`.** Read every issue in the array (there can be more than one problem at once) and fix each before retrying; this is a normal validation result, not a transient error. Issues that trace back to content or sender setup are fixed in the app, not here.

## Step 4: Measure

```bash
maxclicks broadcasts runs bc_01hx... --all       # one reduced run record per recipient contact
maxclicks broadcasts metrics bc_01hx...          # aggregated sent/delivered/opens/clicks/bounces
```

A run carries `contactId`, `contactEmail`, `status` (`sent`, `failed`, or `pending`), `failureReason`, and an `email` object (`id`, `sentAt`, `opensCount`, `clicksCount`, `bounced`, `complained`) or `null`.

`metrics` returns `email` with `sent`, `delivered`, `bounced`, `deliveryDelays`, `rejected`, `failed`, `complained`, `unsubscribed`, `opens`, `uniqueOpens`, `clicks`, `uniqueClicks`. The `email` key is **omitted entirely** when the broadcast never had content, so check for it rather than assuming zeros.

## Gotchas

- **Content is not readable or writable here.** `get` gives you `hasContent`, never the subject/body. Authoring and editing the email happen in the app, where the preview pipeline validates it.
- **A `custom filter` audience can be read but not set.** `update` accepts only `all` and `segment`. Reach for a saved segment when you need a filter over the API.
- **`send`'s 422 gate carries an array, not a single error.** `broadcast_invalid` issues can include several simultaneous problems (no content, no audience, sender not verified); fix all of them, not just the first.
- **`update` is rejected once sending has started** (`409 broadcast_already_sending`). Once a broadcast is `send now`/`send at` and picked up by the pipeline, treat it as immutable; a follow-up send is a new broadcast built in the app.
- **`202` means accepted, not delivered.** Sending is asynchronous and per-recipient; poll `runs`/`metrics` for what actually happened.
- **Metrics and runs are read-only observability**, not a retry mechanism; a `failed` run does not automatically retry.
- **Errors to expect**: `broadcast_not_found` (404) on every operation, `invalid_broadcast` (400) and `segment_not_found` on `update`, `broadcast_already_sending` (409) on `update`/`send`, `broadcast_invalid` (422) on `send`.
