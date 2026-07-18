# Natural-language `requirements`: the cross-cutting AI-expression contract

maxclicks's biggest differentiator is that several write endpoints accept a plain-English `requirements` string instead of (or in addition to) a structured filter. The server sends it to an AI model that generates a JavaScript expression, stores it, and runs it server-side on every future evaluation. This reference covers the shared contract; each domain's own doc covers the field's exact position in that endpoint's body.

## Where `requirements` appears

| Domain | Endpoint | Field | What it generates |
| --- | --- | --- | --- |
| Attributes | `POST /schemas/{schema}/attributes` | top-level `requirements` (instead of `definition`) | An **evaluated attribute**: a computed/related value, resolved on read |
| Segments | `POST /segments`, `PATCH /segments/{id}` | top-level `requirements` | A contact filter (count + check expressions) |
| Broadcasts | `POST /broadcasts/{id}/audience/generate` | top-level `requirements` | A one-off audience filter for that broadcast |
| Webhooks | `POST /webhooks`, `PATCH /webhooks/{id}` | `condition: { type: "custom filter", requirements }` | A per-delivery filter predicate |

All four use the literal field name `requirements`. All four are rate-limited on the AI bucket (10/min per key), separate from the normal read/write buckets.

## How to phrase `requirements`

Write it like a business rule you'd hand to an analyst, not like SQL or a formula:

- **Be concrete about the entity and the comparison.** "Contacts whose `plan` attribute is `premium` and who have not opened an email in the last 30 days" beats "inactive premium users."
- **Name real schema/attribute keys when you know them.** Run `schemas list` / `attributes list` first (same discovery discipline as writing records) so `requirements` references keys that actually exist; a vague requirement forces the model to guess at intent.
- **State comparisons explicitly**: thresholds, date windows, counts ("at least 3", "in the last 14 days", "greater than $100"). Ambiguous relative language ("recently", "a lot of") produces an expression that technically satisfies the prompt but not your intent.
- **One rule per `requirements` call.** Compound, multi-clause asks are fine (AND/OR are well supported) but keep the target singular. Segments referencing segments and evaluated attributes referencing evaluated attributes are supported (see below); express layering through composition, not through cramming everything into one string.
- **Iterate by re-sending, not by hand-patching.** `PATCH .../{id}` with a new `requirements` string regenerates the expression from scratch server-side; there is no way to hand-edit the generated code.

## What is never returned

The generated code itself (`expression` on attributes, `queryExpression`/`checkExpression` on segments, the equivalent on webhook custom filters) is **server-only and never sent to the client**, on any endpoint, at any permission level. What you get back instead is a human-readable summary:

- Attributes: `descriptionMarkdown`.
- Segments: `conditionDescriptionMarkdown`.
- Webhooks: a custom filter reduces on read to `{ type: "custom filter", description }`.

Treat that description as the contract to review with a human, not the `requirements` string you sent (the model may have refined it) and not the code (you will never see it).

## References are tracked; you cannot delete out from under a generated expression

Every generated expression records which schemas, attributes, and segments it touched (`referencedSchemas`, `referencedAttributes`, `referencedSegments`). Two consequences:

- **Deleting a referenced entity is blocked.** Trying to delete a schema, attribute, or segment that a live evaluated attribute, segment, or webhook filter depends on fails; delete or edit the dependent expression first, or the platform will not let you break it silently.
- **Editing a referenced schema/attribute does not silently break the expression**, but it also does not auto-regenerate it. If you rename or retype something an expression depends on, expect to need to re-send `requirements` on the dependent entity.

## The "pin the contract" trap

If you are ever building your own tooling on top of these generated expressions (not just calling the endpoints), the biggest failure mode observed in practice: a loosely specified `requirements` prompt lets the generating model pick its own function shape (e.g. it emits a curried `(contact) => (context) => ...` instead of the flat top-level expression the runtime expects), which passes generation but fails at evaluation time with an opaque runtime error, not a validation error at write time. As a caller of the public API this is invisible to you (the server pins the contract on its side), but if a `requirements` call ever comes back successful and later the entity silently never matches/evaluates as expected, re-send `requirements` with a more explicit, concrete restatement rather than assuming the feature is broken; vague inputs are the most common root cause.

## Quick example

```bash
maxclicks attributes create students --key companyName --label Company \
  --requirements "The name of the company this student works for, looked up from the companies schema by matching the student email domain to the company website domain."
```

```bash
maxclicks segments create --name "Lapsed premium" --contact-schema students \
  --requirements "Contacts whose plan attribute equals premium, who have not opened any email in the last 30 days, and who are not already unsubscribed."
```

```bash
maxclicks broadcasts audience-generate bc_01hx... \
  --requirements "Contacts who have completed at least one course and have not received an email in the last 14 days."
```

```bash
maxclicks webhooks create --data '{
  "url": "https://example.com/hooks/maxclicks",
  "trigger": "contact upserted",
  "schemaId": "students",
  "condition": { "type": "custom filter", "requirements": "Only contacts whose plan attribute changed to premium in this update." }
}'
```

All four are CLI-wrapped commands, not the raw API escape hatch; see each domain's skill (`maxclicks-segments`, `maxclicks-broadcasts`, `maxclicks-webhooks`) and the `maxclicks` skill's "Managing schemas, attributes, and API keys" section for attributes.
