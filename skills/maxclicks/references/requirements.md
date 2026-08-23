# Natural-language `requirements`: the cross-cutting AI-expression contract

maxclicks's biggest differentiator is that a filter can be specified in plain English instead of a structured rule builder. The server sends your `requirements` string to an AI model, which generates a JavaScript expression; the server stores it and runs it server-side on every future evaluation. This reference covers the shared contract; each domain's own skill covers the field's exact position in that endpoint's body.

## Where `requirements` appears

| Domain | Endpoint | Field | What it generates |
| --- | --- | --- | --- |
| Segments | `POST /segments` | top-level `requirements` | A named, reusable contact filter (count + check expressions) |
| Webhooks | `POST /webhooks`, `PATCH /webhooks/{id}` | `condition: { type: "custom filter", requirements }` | A per-delivery filter predicate |

Both use the literal field name `requirements`. Both are billed (credits are checked before generation, so an empty wallet fails `402 insufficient_credits`) and both sit in the `ai` rate bucket: **10 requests per minute per key**, separate from the read (100/s) and write (25/s) buckets. Generation is slow, roughly 10 to 90 seconds; do not treat a long-running call as a hang.

Other places in the product that use a generated filter, an evaluated attribute on a schema, a broadcast's custom-filter audience, are **composed in the app**, where a human reviews the generated condition before it goes live. A broadcast audience set over the API is either `{ "type": "all" }` or `{ "type": "segment", "segmentId": "..." }`; if the user wants a bespoke audience, the clean path is to generate a segment (which you can do here) and point the broadcast at it.

## How to phrase `requirements`

Write it like a business rule you would hand to an analyst, not like SQL or a formula:

- **Be concrete about the entity and the comparison.** "Contacts whose `plan` attribute is `premium` and who have not opened an email in the last 30 days" beats "inactive premium users."
- **Name real schema and attribute keys.** Run `schemas list` and `attributes list` first (the same discovery discipline as writing records) so `requirements` references keys that actually exist. A vague requirement forces the model to guess at intent.
- **State comparisons explicitly**: thresholds, date windows, counts ("at least 3", "in the last 14 days", "greater than $100"). Ambiguous relative language ("recently", "a lot of") produces an expression that technically satisfies the prompt but not your intent.
- **One rule per call.** Compound, multi-clause asks are fine (AND/OR are well supported) but keep the target singular. Segments can reference other segments, so express layering through composition rather than cramming everything into one string.
- **Segments cannot be edited over the API.** There is no `PATCH /segments/{id}`. To refine an existing segment, the user edits it in the app (where the regenerated condition gets a human review); from here, create a new segment with a sharper `requirements` string. So it pays to be precise the first time.
- **Webhook conditions can be regenerated.** `PATCH /webhooks/{id}` with a new `condition` regenerates the expression from scratch (another AI call). There is no way to hand-edit generated code anywhere.

## What is never returned

The generated code itself (`queryExpression`/`checkExpression` on segments, the equivalent on a webhook custom filter) is **server-only and never sent to the client**, on any endpoint, at any permission level. What you get back instead is a human-readable summary:

- Segments: `conditionDescriptionMarkdown`, alongside the server's refined `requirements`.
- Webhooks: a custom filter reduces on read to `{ "type": "custom filter", "description": "..." }`.

Treat that description as the contract to review with a human. Not the `requirements` string you sent (the model may have refined it), and not the code (you will never see it).

## References are tracked; you cannot delete out from under a generated expression

Every generated expression records which schemas, attributes, and segments it touched. The consequence you will actually hit: **deleting a referenced entity is blocked.** `DELETE /segments/{id}` returns `409 segment_in_use` when the segment backs a broadcast audience, a workflow trigger, or a webhook condition. Unwire the dependents first; the platform will not let you break them silently.

Editing a referenced schema or attribute in the app does not silently break a dependent expression, but it does not auto-regenerate it either. If a key is renamed or retyped, expect the dependent segment or webhook filter to need regenerating.

## The "pin the contract" trap

If you are building your own tooling on top of these generated expressions (not just calling the endpoints), the biggest failure mode observed in practice: a loosely specified `requirements` prompt lets the generating model pick its own function shape (for example a curried `(contact) => (context) => ...` instead of the flat top-level expression the runtime expects), which passes generation but fails at evaluation time with an opaque runtime error rather than a validation error at write time.

As a caller of the public API this is invisible to you (the server pins the contract on its side). But if a `requirements` call comes back successful and the entity later never seems to match, re-state the requirement more explicitly and concretely rather than assuming the feature is broken. Vague input is the most common root cause.

## Quick examples

```bash
maxclicks segments create --name "Lapsed premium" --contact-schema students \
  --requirements "Contacts whose plan attribute equals premium, who have not opened any email in the last 30 days, and who are not already unsubscribed."
```

```bash
maxclicks segments count seg_01hx...        # live matching count for the segment you just made
maxclicks segments contacts seg_01hx...     # the matching contacts, limit hard-capped at 100
```

```bash
maxclicks webhooks create --data '{
  "url": "https://example.com/hooks/maxclicks",
  "trigger": "contact upserted",
  "schemaId": "students",
  "condition": { "type": "custom filter", "requirements": "Only contacts whose plan attribute changed to premium in this update." }
}'
```

To point a broadcast at that segment rather than at everyone:

```bash
maxclicks broadcasts update bc_01hx... --data '{"audience":{"type":"segment","segmentId":"seg_01hx..."}}'
```

See the `maxclicks-segments`, `maxclicks-webhooks` and `maxclicks-broadcasts` skills for each domain's full workflow.
