---
name: maxclicks
description: >-
  Work with the maxclicks email, CRM, and automation platform: manage contacts,
  objects, and records; fire events; send emails and templates; build and trigger
  workflows; manage webhooks and suppressions; or build a maxclicks integration in
  any language. Use whenever a task mentions maxclicks, or involves its API, CLI,
  SDKs (Node, Python, Go, PHP/Laravel, Ruby, Java, Rust), or MCP server.
allowed-tools: Bash Read WebFetch WebSearch
---

# Working with maxclicks

maxclicks is an AI-first email, CRM, and workflow-automation platform. This skill teaches you to drive it reliably: authenticate, pick the right tool, respect the schema-based data model, and avoid the non-obvious mistakes.

## Pick the right tool

You have three ways to reach the API. Default to the **CLI** for ad-hoc/agent work, the **SDK** for code you are writing into an app, and the **raw API** as an escape hatch.

1. **CLI (`maxclicks`)** — best for exploring and one-off operations from the terminal. Install: `npm install -g maxclicks-cli` (or run with `npx maxclicks-cli ...`). Every command prints JSON to stdout and a structured `{ "error": {...} }` to stderr on failure.
2. **SDK** — when writing application code. There is a first-class SDK per language: `maxclicks` (npm), `maxclicks` (PyPI), `github.com/maxclicks-ai/maxclicks-go`, `maxclicks/maxclicks-php` (+ Laravel), `maxclicks` (RubyGems), `ai.maxclicks:maxclicks-java`, `maxclicks` (crates.io). See `references/sdks.md` for install + a quickstart per language. Match the SDK to the project's language; do not shell out to the CLI from app code.
3. **Raw API / MCP** — `maxclicks api <METHOD> <path> --data '<json>'` for anything not yet wrapped, or the maxclicks MCP server (`mcp.maxclicks.ai/mcp`) when the host supports MCP.

## Authenticate

An API key is required for everything except the public form/email endpoints. It is scoped to one space; create one at `https://app.maxclicks.ai/-/settings/developers`.

- CLI: `maxclicks config set-key <key>` (stored at `~/.config/maxclicks/config.json`), or set `MAXCLICKS_API_KEY`, or pass `--api-key`.
- SDK: pass the key to the client, or set `MAXCLICKS_API_KEY`.
- Confirm with `maxclicks whoami` — it returns the key, its user, and the bound space. **Run this first** to confirm you are pointed at the right space.

Never print or commit the key. Use `--base-url https://api-stage.maxclicks.ai/v1` (or `MAXCLICKS_BASE_URL`) for staging.

## The data model (read this before writing anything)

maxclicks is **schema-based**. Every contact, object, and event belongs to a **schema** (identified by id or slug). This is the single most important thing to get right:

- **Discover before you write.** Run `maxclicks schemas list` and `maxclicks attributes list <schema>` to learn which schemas and attribute keys exist. Do not guess attribute keys.
- **Schemas and attributes are read-only through this API.** You cannot create a schema or attribute from the API/CLI/SDK. If a needed attribute does not exist, tell the user to add it in the maxclicks app; do not try to create it.
- **Records are flat.** Set base fields and custom attribute keys at the top level of the record object (not nested under a `data` key). Example: `{ "email": "a@b.com", "firstName": "Ada", "plan": "premium" }`.
- **Contacts vs objects.** Both are "records" under a schema. Contacts (a contact schema) can receive email; objects (an object schema) are any other business entity. Contacts identify by `id` > `userId` > `email` > `phone`; objects by `id` > `externalId`.
- **Prefer `upsert` over `create`.** `upsert` creates-or-updates by identity and is idempotent; `create` fails if the identity already exists.

## CLI command map

```
maxclicks whoami
maxclicks schemas list [--type contact|object|event] [--all]
maxclicks schemas get <schema>
maxclicks attributes list <schema> [--all]
maxclicks attributes get <schema> <attribute>        # base:<key> | id | key
maxclicks records list <schema> [--all]
maxclicks records get <schema> <id>
maxclicks records create <schema> --data '<json>'    # strict create
maxclicks records upsert <schema> --data '<json>'    # create-or-update (preferred)
maxclicks records update <schema> <id> --data '<json>'
maxclicks records delete <schema> <id>
maxclicks records audit-trail <schema> <id> [--all]  # contacts only
maxclicks events fire <schema> --data '<json>'
maxclicks events fire-batch <schema> --data '<json-array>' [--on-error abort]
maxclicks events get <id>
maxclicks templates send <templateId> --data '<json>'
maxclicks webhooks list|get|create|update|delete|rotate-secret ...
maxclicks suppressions create --identifier <email> --reason manual|legal
maxclicks suppressions delete <id>
maxclicks workflows trigger <reference> --data '<json>'
maxclicks api <METHOD> <path> [--data '<json>']       # raw escape hatch
maxclicks docs [query]
```

List commands are paginated (`--limit`, `--offset`); pass `--all` to fetch every page as a flat array. Full endpoint + field reference: `references/api-reference.md`.

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
- **`templates send` returns an empty body on success**; any warnings come back on the `maxclicks-Warning-Message` response header, not in the body. A successful HTTP call does not guarantee the email was delivered (SES failures are recorded, not thrown).
- **Webhook signing secret is shown once** (on `create` and `rotate-secret`). Save it immediately.
- **Batch events**: `events fire-batch --on-error abort` returns HTTP 422 with a `failedIndex` when the first item is invalid — that is a normal result to read, not an error to retry.
- **`suppressions` needs an admin key**; most other writes need a write-permission key; reads need any valid key.

## Building an integration

When the task is to write maxclicks into an app (not a one-off), read `references/sdks.md`, choose the SDK for the project's language, and follow the same data-model rules (discover schemas/attributes, upsert by identity, keep records flat). For webhooks you receive, verify the signature with the stored secret. For deeper questions, `maxclicks docs <topic>` links the docs, `references/api-reference.md` has the full surface, and the OpenAPI spec is at `https://maxclicks.ai/openapi.json`.
