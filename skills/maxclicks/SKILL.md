---
name: maxclicks
description: >-
  Work with the maxclicks email, CRM, and automation platform: manage contacts,
  objects, and records; define schemas and attributes (including AI-generated
  evaluated attributes); fire events; send emails, author and send templates;
  build segments and broadcasts with natural-language filters; build and trigger
  workflows; manage webhooks, domains, senders, topics, imports, API keys, and
  suppressions; or build a maxclicks integration in any language. Use whenever a
  task mentions maxclicks, or involves its API, CLI (`maxclicks`), SDKs (Node,
  Python, Go, PHP/Laravel, Ruby, Java, Rust), or MCP server.
allowed-tools: Bash Read WebFetch WebSearch
---

# Working with maxclicks

maxclicks is an AI-first email, CRM, and workflow-automation platform. This skill teaches you to drive it reliably: authenticate, pick the right tool, respect the schema-based data model, and avoid the non-obvious mistakes.

## Pick the right tool

You have three ways to reach the API. Default to the **CLI** for ad-hoc/agent work, the **SDK** for code you are writing into an app, and the **raw API** as an escape hatch.

1. **CLI (`maxclicks`)**: best for exploring and one-off operations from the terminal, and the default for agent work. Install: `npm install -g maxclicks-cli` (or run with `npx maxclicks-cli ...`). Every command prints JSON to stdout and a structured `{ "error": {...} }` to stderr on failure. The CLI now wraps the **full Public API v1 surface** (see the command map below).
2. **SDK**: when writing application code. There is a first-class SDK per language: `maxclicks` (npm), `maxclicks` (PyPI), `github.com/maxclicks-ai/maxclicks-go`, `maxclicks/maxclicks-php` (+ Laravel), `maxclicks` (RubyGems), `ai.maxclicks:maxclicks-java`, `maxclicks` (crates.io). See `references/sdks.md` for install + a quickstart per language. Match the SDK to the project's language; do not shell out to the CLI from app code.
3. **Raw API / MCP**: `maxclicks api <METHOD> <path> --data '<json>'` remains available as an escape hatch for anything genuinely not covered, or the maxclicks MCP server (`mcp.maxclicks.ai/mcp`) when the host supports MCP.

**Coverage gap to know about (SDKs only):** the Public API v1 has 18 resource groups (~88 endpoints; see `references/api-reference.md`). The **CLI now wraps every group**. The **SDKs** (Node, Python, Go, PHP/Laravel, Ruby, Java, Rust) still wrap only the original operation set (whoami, schemas/attributes read, records, events fire/get, template send, webhooks, suppressions create/delete, workflows trigger); newer domains (schema/attribute writes, segments, broadcasts, template authoring, domains, senders, topics, imports, API keys, and workflow observability) are **not yet wrapped by any SDK**. For application code that needs one of those, use a plain HTTP call in the project's language (same base URL, same `Bearer` header) until the SDKs catch up; see `references/sdks.md`. Do not invent an SDK method for them, and do not fall back to `maxclicks api` for something a CLI subcommand already covers.

## Authenticate

An API key is required for everything except the public form/email endpoints. It is scoped to one space; create one at `https://app.maxclicks.ai/-/settings/developers`.

- CLI: `maxclicks config set-key <key>` (stored at `~/.config/maxclicks/config.json`), or set `MAXCLICKS_API_KEY`, or pass `--api-key`.
- SDK: pass the key to the client, or set `MAXCLICKS_API_KEY`.
- Confirm with `maxclicks whoami`, it returns the key, its user, and the bound space. **Run this first** to confirm you are pointed at the right space.

Never print or commit the key. Use `--base-url https://api-stage.maxclicks.ai/v1` (or `MAXCLICKS_BASE_URL`) for staging.

## The data model (read this before writing anything)

maxclicks is **schema-based**. Every contact, object, and event belongs to a **schema** (identified by id or slug). This is the single most important thing to get right:

- **Discover before you write.** Run `maxclicks schemas list` and `maxclicks attributes list <schema>` to learn which schemas and attribute keys exist. Do not guess attribute keys.
- **Schemas and attributes have real write endpoints, and the CLI wraps them.** `maxclicks schemas create|update|delete` and `maxclicks attributes create` are live (see "Managing schemas, attributes, and API keys" below and `references/api-reference.md`). Attribute creation accepts either `--data` (a stored type's `definition`) or `--requirements` (a natural-language prompt that generates an **evaluated** attribute), never both. Still discover first: creating a schema/attribute is a deliberate action, not something to do speculatively when a key is merely missing.
- **Records are flat.** Set base fields and custom attribute keys at the top level of the record object (not nested under a `data` key). Example: `{ "email": "a@b.com", "firstName": "Ada", "plan": "premium" }`.
- **Contacts vs objects.** Both are "records" under a schema. Contacts (a contact schema) can receive email; objects (an object schema) are any other business entity. Contacts identify by `id` > `userId` > `email` > `phone`; objects by `id` > `externalId`.
- **Prefer `upsert` over `create`.** `upsert` creates-or-updates by identity and is idempotent; `create` fails if the identity already exists.

## CLI command map

The CLI wraps every Public API v1 group. List commands are paginated (`--limit`, `--offset`); pass `--all` to fetch every page as a flat array. Mutating commands that support it take `--idempotency-key <key>`. Full endpoint + field reference: `references/api-reference.md`.

```
maxclicks whoami

maxclicks schemas list [--type contact|object|event] [--all]
maxclicks schemas get <schema>
maxclicks schemas create --data '<json>' [--idempotency-key <key>]
maxclicks schemas update <schema> --data '<json>'
maxclicks schemas delete <schema>

maxclicks attributes list <schema> [--all]
maxclicks attributes get <schema> <attribute>          # base:<key> | id | key
maxclicks attributes create <schema> --data '<json>'                       # stored attribute
maxclicks attributes create <schema> --requirements '<text>' [--key ...] [--label ...]  # AI-generated evaluated attribute

maxclicks records list|get|create|upsert|update|delete <schema> [<id>] [--data '<json>']
maxclicks records audit-trail <schema> <id> [--channel email] [--all]      # contacts only

maxclicks events fire <schema> --data '<json>'
maxclicks events fire-batch <schema> --data '<json-array>' [--on-error abort]
maxclicks events get <id>
maxclicks events list --schema <schema> [--from <iso>] [--to <iso>] [--cursor <c>] [--all]

maxclicks segments list|get|count|contacts <id> [--all]
maxclicks segments create --name <name> --contact-schema <schema> --requirements '<text>' [--description <text>]
maxclicks segments update <id> [--data '<json>'] [--requirements '<text>']
maxclicks segments delete <id>

maxclicks broadcasts list|get <id>
maxclicks broadcasts create --data '<json>' [--idempotency-key <key>]
maxclicks broadcasts update <id> --data '<json>'
maxclicks broadcasts delete <id>
maxclicks broadcasts send <id> [--data '<json>']       # {scheduledFor} to schedule, omit to send now
maxclicks broadcasts audience-generate <id> --requirements '<text>'
maxclicks broadcasts runs <id> [--all]
maxclicks broadcasts metrics <id>

maxclicks templates list|get <id>
maxclicks templates create --data '<json>' [--idempotency-key <key>]
maxclicks templates update <id> --data '<json>'
maxclicks templates delete <id>
maxclicks templates duplicate <id> [--idempotency-key <key>]
maxclicks templates send <templateId> --data '<json>'

maxclicks webhooks list|get|create|update|delete|rotate-secret ...

maxclicks suppressions create --identifier <email> --reason manual|legal [--notes <text>]
maxclicks suppressions delete <id>
maxclicks suppressions list [--identifier <email>] [--all]
maxclicks suppressions get <id>
maxclicks suppressions batch-add --data '<json>' [--idempotency-key <key>]
maxclicks suppressions batch-remove --data '<json>' [--idempotency-key <key>]

maxclicks workflows trigger <reference> --data '<json>'
maxclicks workflows list|get <id>
maxclicks workflows runs <id> [--all]
maxclicks workflows get-run <id> <runId>
maxclicks workflows pause|unpause|delete <id>

maxclicks domains list|get <id>
maxclicks domains create --data '<json>' [--idempotency-key <key>]      # admin key
maxclicks domains verify <id>
maxclicks domains delete <id>                                          # admin key

maxclicks senders list|get|create|update|delete <id> [--data '<json>']

maxclicks topics list|get <id>
maxclicks topics create --data '<json>' [--idempotency-key <key>]
maxclicks topics update <id> --data '<json>'
maxclicks topics delete <id> [--force]

maxclicks imports create <schema> --data '<json>' [--idempotency-key <key>]
maxclicks imports list <schema> [--all]
maxclicks imports get <id>
maxclicks imports cancel <id>
maxclicks imports download-failure-log <id>            # streams CSV to stdout

maxclicks api-keys list [--all]
maxclicks api-keys create [--name <name>]               # admin key, secret returned once
maxclicks api-keys delete <id>                           # admin key

maxclicks api <METHOD> <path> [--data '<json>']          # raw escape hatch, for anything not above
maxclicks docs [query]
```

Task-specific skills exist for the larger domains: `maxclicks-contacts` (records, imports), `maxclicks-events`, `maxclicks-email` (send + suppressions), `maxclicks-templates` (authoring CRUD), `maxclicks-adaptyle` (content language), `maxclicks-segments`, `maxclicks-broadcasts`, `maxclicks-deliverability` (domains + senders), `maxclicks-topics`, `maxclicks-imports`, `maxclicks-workflows`, `maxclicks-webhooks`. Load the relevant one for anything beyond a single quick call; this skill is the entry point and the map above is for orientation, not a substitute for the task skill's gotchas.

## Managing schemas, attributes, and API keys

These are simple enough to not need their own skill, but real write operations, not raw-API-only:

```bash
# Schema CRUD (type and slug are immutable after create):
maxclicks schemas create --data '{"type":"object","name":"Product","namePlural":"Products","slug":"products"}'
maxclicks schemas update products --data '{"description":"Catalog items"}'
maxclicks schemas delete products     # cascades records; blocked while referenced by attributes/segments/templates

# Stored attribute (a definition, not AI-generated):
maxclicks attributes create products --data '{"key":"price","label":"Price","definition":{"type":"decimal"}}'

# AI-generated evaluated attribute (see references/requirements.md for how to phrase --requirements):
maxclicks attributes create students --key companyName --label Company \
  --requirements "The name of the company this student works for, looked up from the companies schema by matching the student email domain to the company website domain."

# API keys (admin key required; the plaintext key is returned once, on create only):
maxclicks api-keys list
maxclicks api-keys create --name "CI pipeline"
maxclicks api-keys delete key_01hx...
```

`schemas create`/`update`/`delete` and `attributes create` need a write-permission key (not admin); `api-keys` need an admin key. Reserved schema names and the mutual-exclusivity of `--data`/`--requirements` on `attributes create` are covered in `references/api-reference.md` and `references/requirements.md`.

## Golden path

```bash
maxclicks whoami                                  # confirm the space
maxclicks schemas list --type contact             # find the contact schema slug
maxclicks attributes list students                # learn the attribute keys
maxclicks records upsert students --data '{"email":"ada@example.com","firstName":"Ada","tags":["beta"]}'
maxclicks events fire purchase-completed --data '{"eventId":"ord_123","amount":42}'
```

## Gotchas

Load `references/gotchas.md` before anything non-trivial. The highest-value ones:

- **Do not invent schema/attribute keys.** Always `schemas list` + `attributes list` first. Writing an undefined attribute key is silently ignored (returned as a warning), not applied.
- **`events fire` is async and returns `{ "accepted": n }`**, not the stored event. It does not fail if a downstream consumer is misconfigured. Use a real, meaningful `eventId` for deduplication.
- **`templates send` is synchronous** and returns `{ emailId, status: "sent"|"failed", error? }`, plus any warnings in the same body's `warnings` array. A `"failed"` status (a genuine SES failure) is a `200`, not an HTTP error; read it rather than assuming success. Pre-send validation/eligibility problems (no credits, domain not verified, recipient suppressed, etc.) throw as real HTTP errors instead (400/402/422).
- **Webhook signing secret is shown once** (on `create` and `rotate-secret`). Save it immediately.
- **Batch events**: `events fire-batch --on-error abort` returns HTTP 422 with a `failedIndex` when the first item is invalid, that is a normal result to read, not an error to retry.
- **`suppressions` needs an admin key**; most other writes need a write-permission key; reads need any valid key.
- **Writing a natural-language `requirements` field** (attributes, segments, broadcasts audience, webhook filters)? Read `references/requirements.md` first: how to phrase it, what is never returned, and how referenced entities get locked.

## Authoring email content

**Sending** a template (`templates send`) is covered above and in `maxclicks-email`. **Authoring** a template's CRUD shell (create/list/get/update/duplicate/delete, `expectedDataRepresentation`, `recipientDataPath`, `from`, `transactional`, `communicationTopicId`) is `maxclicks-templates`. **Writing** the content itself in Adaptyle (the manifest/prompt/hidden-block syntax, Liquid + the data model, MJML vs HTML raw bodies) is `maxclicks-adaptyle`. Load the one that matches the task: sending an existing template, defining a new one's shape, or editing its `subject`/`body`.

## Building an integration

When the task is to write maxclicks into an app (not a one-off), read `references/sdks.md`, choose the SDK for the project's language, and follow the same data-model rules (discover schemas/attributes, upsert by identity, keep records flat). For webhooks you receive, verify the signature with the stored secret. For deeper questions, `maxclicks docs <topic>` links the docs, `references/api-reference.md` has the full surface, `references/requirements.md` covers natural-language fields, and the OpenAPI spec is at `https://maxclicks.ai/openapi.json`.
