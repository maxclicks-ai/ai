---
name: maxclicks
description: >-
  Work with the maxclicks email, CRM, and automation platform: read schemas and
  attributes; manage contacts, objects, and records; fire and query events; send
  templates; generate segments from natural language; schedule, send, and measure
  broadcasts; trigger and observe workflows; manage webhooks, suppressions,
  domains, senders, and topics; or build a maxclicks integration in any language.
  Use whenever a task mentions maxclicks, or involves its API, CLI (`maxclicks`),
  SDKs (Node, Python, Go, PHP/Laravel, Ruby, Java, Rust, Elixir), or MCP server.
allowed-tools: Bash Read WebFetch WebSearch
---

# Working with maxclicks

maxclicks is an AI-first email, CRM, and workflow-automation platform. This skill teaches you to drive it reliably: authenticate, pick the right tool, respect the schema-based data model, and avoid the non-obvious mistakes.

## The shape of the API (internalize this first)

The Public API v1 is **55 operations across 16 resource groups**, and it follows one principle:

> **Entities are authored in the maxclicks app. The API triggers, reads, and measures them.**

Schemas, attributes, templates, broadcast content, domains, senders and topics are created and configured by a human in the app at `https://app.maxclicks.ai`, and the API reads every one of them back so you can discover ids, shapes and status. It then drives everything that depends on them: records, events, sends, segments, workflows, webhooks. (API keys are the one thing the app creates that the API does not read back at all, for the reason below.)

This is deliberate, not a gap. There is no schema-migration system, so a schema or attribute created over the API could never be corrected afterwards (and an API-created schema could not even receive attributes). A template or broadcast needs the app's preview and render pipeline before it can send. Registering a domain reserves a name globally and provisions AWS SES resources. API keys are full-permission and inherit the owner's membership, so minting one over the API would be an escalation primitive. When a task says "create a schema" or "author a template", the right answer is: the user does that in the app, and you read it back and drive it from there.

Practically: **if an operation is not in `references/api-reference.md`, it does not exist.** Do not guess a method name, do not reach for the raw escape hatch hoping for a hidden endpoint, and do not tell the user a feature is missing. Every feature is still in the product; the question is only who performs which half.

## Pick the right tool

Three ways to reach the API. Default to the **CLI** for ad-hoc and agent work, the **SDK** for code you are writing into an app, and the **raw API** only as an escape hatch.

1. **CLI (`maxclicks`)**: best for exploring and one-off operations from the terminal, and the default for agent work. Install: `npm install -g maxclicks-cli` (or `npx maxclicks-cli ...`). Every command prints JSON to stdout and a structured `{ "error": {...} }` to stderr on failure, so it composes with `jq`. It wraps 52 of the 55 operations (all but the three public form/email endpoints).
2. **SDK**: when writing application code. There is a first-class SDK per language, all at full 55-operation parity: `maxclicks` (npm), `maxclicks` (PyPI), `github.com/maxclicks-ai/maxclicks-go`, `maxclicks/maxclicks-php` (+ Laravel), `maxclicks` (RubyGems), `ai.maxclicks:maxclicks-java`, `maxclicks` (crates.io), `:maxclicks` (Hex). See `references/sdks.md` for install plus a quickstart per language. Match the SDK to the project's language; do not shell out to the CLI from app code.
3. **Raw API / MCP**: `maxclicks api <METHOD> <path> --data '<json>'` for the three endpoints the CLI does not wrap, or when a CLI wrapper summarizes a response you need in full. The maxclicks MCP server (`mcp.maxclicks.ai/mcp`) is the option when the host speaks MCP; its tool catalog matches the same surface.

## Authenticate

An API key is required for everything except the public form/email endpoints. It is scoped to one space; create one in the app at `https://app.maxclicks.ai/-/settings/developers`. Keys are full-permission and inherit the owner's membership, which is why minting one is an app action rather than an API call.

- CLI: `maxclicks config set-key <key>` (stored at `~/.config/maxclicks/config.json`), or set `MAXCLICKS_API_KEY`, or pass `--api-key`. `--profile <name>` keeps several spaces side by side.
- SDK: pass the key to the client, or set `MAXCLICKS_API_KEY`.
- Confirm with `maxclicks whoami`; it returns the key, its user, the bound space, and the membership role. **Run this first** to confirm you are pointed at the right space.

Never print or commit the key. Use `--base-url https://api-stage.maxclicks.ai/v1` (or `MAXCLICKS_BASE_URL`) for staging.

## The data model (read this before writing anything)

maxclicks is **schema-based**. Every contact, object, and event belongs to a **schema** (identified by id or slug):

- **Discover before you write.** Run `maxclicks schemas list` and `maxclicks attributes list <schema>` to learn which schemas and attribute keys exist. Do not guess attribute keys. Both are read-only endpoints, and that discovery step is the whole point of them.
- **Records are flat.** Set base fields and custom attribute keys at the top level of the record object, not nested under a `data` key. Example: `{ "email": "a@b.com", "firstName": "Ada", "plan": "premium" }`.
- **Contacts vs objects.** Both are "records" under a schema. Contacts (a contact schema) can receive email; objects (an object schema) are any other business entity. Contacts identify by `id` > `userId` > `email` > `phone`; objects by `id` > `externalId`.
- **Prefer `upsert` over `create`.** `upsert` creates-or-updates by identity and is idempotent; `create` fails if the identity already exists.
- **If an attribute key you need does not exist**, that is a schema-design decision: tell the user to add it in the app (Settings, then Schemas, then the schema's attributes), then re-run `attributes list`. Writing an undefined key is silently dropped, not rejected.

## CLI command map

List commands are paginated (`--limit`, `--offset`); pass `--all` to fetch every page as a flat array. Full endpoint, field and error reference: `references/api-reference.md`.

```
maxclicks whoami
maxclicks config set-key <key> | show | path
maxclicks login | logout

maxclicks schemas list [--type contact|object|event] [--all]
maxclicks schemas get <schema>
maxclicks attributes list <schema> [--all]

maxclicks records list <schema> [--all]
maxclicks records get <schema> <id>
maxclicks records create <schema> --data '<json>' [--idempotency-key <key>]
maxclicks records upsert <schema> --data '<json>' [--idempotency-key <key>]
maxclicks records update <schema> <id> --data '<json>'
maxclicks records delete <schema> <id>
maxclicks records audit-trail <schema> <id> [--channel email] [--all]     # contacts only

maxclicks events fire <schema> --data '<json>'
maxclicks events fire-batch <schema> --data '<json-array>' [--on-error abort]
maxclicks events list --schema <schema> [--from <iso>] [--to <iso>] [--cursor <c>] [--all]

maxclicks segments list [--all]
maxclicks segments create --name <name> --contact-schema <schema> --requirements '<text>' [--description <text>]
maxclicks segments get|count|contacts <id> [--all]
maxclicks segments delete <id>

maxclicks broadcasts list [--all]
maxclicks broadcasts get <id>
maxclicks broadcasts update <id> --data '<json>'        # name/description/audience/scheduledFor only
maxclicks broadcasts send <id> [--data '{"scheduledFor":"<iso>"}']
maxclicks broadcasts runs <id> [--all]
maxclicks broadcasts metrics <id>

maxclicks templates list [--all]
maxclicks templates get <id>
maxclicks templates send <templateId> --data '<json>'

maxclicks webhooks list|get|create|update|delete|rotate-secret ...

maxclicks suppressions list [--identifier <email>] [--all]              # admin key
maxclicks suppressions create --identifier <email> --reason manual|legal [--notes <text>]
maxclicks suppressions delete <id>
maxclicks suppressions batch-add --data '<json>' [--idempotency-key <key>]
maxclicks suppressions batch-remove --data '<json>' [--idempotency-key <key>]

maxclicks workflows list|get <id>
maxclicks workflows trigger <reference> --data '<json>'
maxclicks workflows runs <id> [--all]
maxclicks workflows get-run <id> <runId>
maxclicks workflows pause|unpause <id>

maxclicks domains list [--all]
maxclicks domains get <id>
maxclicks senders list [--all]
maxclicks topics list|get <id>

maxclicks api <METHOD> <path> [--data '<json>']         # raw escape hatch
maxclicks docs [query]
```

That is the complete CLI. There is no `schemas create`, no `attributes create`, no `templates create`, no `imports`, no `api-keys`, and no `workflows delete`: those live in the app.

Task-specific skills exist for the larger domains: `maxclicks-contacts` (records), `maxclicks-events`, `maxclicks-email` (send + suppressions), `maxclicks-templates`, `maxclicks-adaptyle` (content language), `maxclicks-segments`, `maxclicks-broadcasts`, `maxclicks-deliverability` (domains + senders), `maxclicks-topics`, `maxclicks-workflows`, `maxclicks-webhooks`. Load the relevant one for anything beyond a single quick call; this skill is the entry point and the map above is for orientation, not a substitute for the task skill's gotchas.

## Golden path

```bash
maxclicks whoami                                  # confirm the space
maxclicks schemas list --type contact             # find the contact schema slug
maxclicks attributes list students                # learn the attribute keys
maxclicks records upsert students --data '{"email":"ada@example.com","firstName":"Ada","tags":["beta"]}'
maxclicks events fire purchase-completed --data '{"eventId":"ord_123","amount":42}'
maxclicks templates list                          # find a template authored in the app
maxclicks templates send tpl_01hx... --data '{"contact":{"email":"ada@example.com"}}'
```

## Gotchas

Load `references/gotchas.md` before anything non-trivial. The highest-value ones:

- **Do not invent schema/attribute keys.** Always `schemas list` + `attributes list` first. Writing an undefined attribute key is silently ignored (returned as a warning), not applied.
- **`events fire` is async and returns `{ "accepted": n }`**, not the stored event. It does not fail if a downstream consumer is misconfigured. Use a real, meaningful `eventId` for deduplication: `events` is not idempotency-key aware.
- **`templates send` is synchronous** and returns `{ emailId, status: "sent"|"failed", error? }`, plus any warnings in the same body's `warnings` array. A `"failed"` status (a genuine SES failure) is a `200`, not an HTTP error; read it rather than assuming success. Pre-send validation and eligibility problems (no credits, domain not verified, recipient suppressed, and so on) throw as real HTTP errors instead (400/402/422).
- **Webhook signing secret is shown once** (on `create` and `rotate-secret`). Save it immediately.
- **Batch events**: `events fire-batch --on-error abort` returns HTTP 422 with a `failedIndex` when the first item is invalid. That is a normal result to read, not an error to retry.
- **`suppressions` needs an admin key**; other writes need a write-permission key; reads need any valid key.
- **Idempotency-Key works on exactly seven operations**: `records.create`, `records.upsert`, `suppressions.batchCreate`, `suppressions.batchDelete`, `broadcasts.send`, `templates.send`, `workflows.trigger`. Nothing else accepts it, and client support is uneven; see `references/api-reference.md`.
- **Writing a natural-language `requirements` field** (segments, webhook custom filters)? Read `references/requirements.md` first: how to phrase it, what is never returned, and how referenced entities get locked.

## Natural-language filters

Two operations take a plain-English `requirements` string and have an AI model generate a stored, server-side filter expression: `segments.create`, and `webhooks.create`/`webhooks.update` with a `condition` of `{ "type": "custom filter", "requirements": "..." }`. They share one rate bucket (10/minute per key), they cost credits, and they take roughly 10 to 90 seconds. The generated code is never returned; what you get back is a human-readable description to review. `references/requirements.md` is the contract.

## Working with email content

**Sending** a template (`templates send`) is covered above and in `maxclicks-email`. A template's shell (its content, sender, `recipientDataPath`, `expectedDataRepresentation`, `transactional` flag and `communicationTopicId`) is **authored in the app**; `maxclicks-templates` covers reading that shell back and sending against it. **Adaptyle**, the manifest/prompt/hidden-block content language layered over Liquid with MJML or HTML bodies, is `maxclicks-adaptyle`: load it when the task is writing or reasoning about the content itself.

## Building an integration

When the task is to write maxclicks into an app (not a one-off), read `references/sdks.md`, choose the SDK for the project's language, and follow the same data-model rules (discover schemas and attributes, upsert by identity, keep records flat). For webhooks you receive, verify the signature with the secret you saved at create time. For deeper questions, `maxclicks docs <topic>` prints the documentation links, `references/api-reference.md` has the full surface, `references/requirements.md` covers the natural-language fields, and the OpenAPI spec is at `https://maxclicks.ai/openapi.json`.
