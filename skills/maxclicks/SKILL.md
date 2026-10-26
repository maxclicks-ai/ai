---
name: maxclicks
description: >-
  Work with the maxclicks email, CRM, and automation platform: read schemas and
  attributes; manage contacts, objects, and records; fire and query events; send
  templates; generate segments from natural language; schedule, send, and measure
  broadcasts; trigger and observe workflows; manage webhooks and suppressions;
  read configured domains, senders, and topics; or build a maxclicks integration.
  Use whenever a task mentions maxclicks, or involves its API, CLI (`maxclicks`),
  SDKs (Node, Python, Go, PHP/Laravel, Ruby, Java, Rust, Elixir), or MCP server.
allowed-tools: Bash Read WebFetch WebSearch
---

# Working with maxclicks

maxclicks is an AI-first email, CRM, and workflow-automation platform. This skill teaches you to drive it reliably: authenticate, pick the right tool, respect the schema-based data model, and avoid the non-obvious mistakes.

## The shape of the API (internalize this first)

The current source contract documents **58 functional operations across 16 resource groups** (26 September 2026). SDK, CLI and MCP coverage is smaller; a shared version number does not prove parity. The authoring boundary is:

> **Entities are authored in the maxclicks app. The API triggers, reads, and measures them.**

Schemas, attributes, templates, broadcast content, domains, senders and topics are created and configured by a human in the app at `https://app.maxclicks.ai`, and the API reads every one of them back so you can discover ids, shapes and status. It then drives everything that depends on them: records, events, sends, segments, workflows, webhooks. (API keys are the one thing the app creates that the API does not read back at all, for the reason below.)

When a task needs a schema, attribute, template, broadcast content, workflow steps, domain, sender, topic or API key created or edited, use the app. Adaptyle drafts can be prepared locally for its editor. Do not invent public authoring endpoints.

Use `references/api-reference.md` as the verified operation map and check the current server/OpenAPI source when a newer contract is needed. Do not guess an endpoint or SDK method. Public REST capability and client coverage are separate facts.

## Pick the right tool

**Installation:** `npm install maxclicks` for Node, `npm install @maxclicks/browser` for the browser and `npm install -g maxclicks-cli` for the CLI. The MCP server is hosted at `https://mcp.maxclicks.ai/mcp` and also runs locally with `npx -y maxclicks-mcp`. `@maxclicks/ai` contains private skill/plugin source, not a runtime AI SDK.

1. **REST:** use `https://api.maxclicks.ai/v1` and the verified HTTP map for the current contract, particularly event readiness, identity changes, record-deletion status and paged workflow history.
2. **CLI/SDK:** CLI commands below describe the published CLI. They do not cover every current REST operation. Application code should use the project's language client only after checking its actual exported methods and response types; see `references/sdks.md`.
3. **MCP:** connect a client to `https://mcp.maxclicks.ai/mcp`, where it signs in with OAuth and the user chooses one workspace and the permissions to grant, or run it locally over stdio or Streamable HTTP with an API key. Its tools cover selected operations, not the whole REST API. Mutating tools perform real writes/sends; the host decides tool exposure and approval behavior.

## Authenticate

An API key is required for everything except the public form/email endpoints. It is scoped to one space; create one in the app at `https://app.maxclicks.ai`. Keys are full-permission and inherit the owner's membership, which is why minting one is an app action rather than an API call.

- CLI: `maxclicks config set-key <key>` (stored at `~/.config/maxclicks/config.json`), or set `MAXCLICKS_API_KEY`, or pass `--api-key`. `--profile <name>` keeps several spaces side by side.
- SDK: pass the key to the client, or set `MAXCLICKS_API_KEY`.
- Confirm with `maxclicks whoami`; it returns the key, its user, the bound space, and the membership role. **Run this first** to confirm you are pointed at the right space.

Never print or commit the key. Use `--base-url https://api-stage.maxclicks.ai/v1` (or `MAXCLICKS_BASE_URL`) for staging.

## The data model (read this before writing anything)

maxclicks is **schema-based**. Every contact, object, and event belongs to a **schema** (identified by id or slug):

- **Discover before you write.** Run `maxclicks schemas list` and `maxclicks attributes list <schema>` to learn which schemas and attribute keys exist. Do not guess attribute keys. Both are read-only endpoints, and that discovery step is the whole point of them.
- **Records are flat.** Set base fields and custom attribute keys at the top level of the record object, not nested under a `data` key. Example: `{ "email": "a@b.com", "firstName": "Ada", "plan": "premium" }`.
- **Contacts vs objects.** Both are "records" under a schema. Contacts (a contact schema) can receive email; objects (an object schema) are any other business entity. Contacts identify by `id` > `userId` > `email` > `phone`; objects by `id` > `externalId`.
- **Prefer `upsert` for identity-based synchronization.** It creates or updates the same record; use a stable supported idempotency key to replay one logical write without repeating its side effects. `create` fails if the identity already exists.
- **If an attribute key you need does not exist**, that is a schema-design decision: tell the user to add it in the app (Settings, then Schemas, then the schema's attributes), then re-run `attributes list`. Writing an undefined key is silently dropped, not rejected.

## CLI command map

This map describes the CLI. Offset-based list commands use `--limit`/`--offset`; `--all` walks available pages up to the server's traversal cap. Event lists use cursors. Full endpoint, field and error reference: `references/api-reference.md`.

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

No CLI command authors schemas, attributes, templates or workflow steps, or creates imports/API keys. Those are app workflows. Newer REST event status, identity binding, deletion polling and workflow-history cursor options are not represented by this command map; use direct HTTP for those operations.

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
- **Event acceptance returns a durable receipt**: `{ accepted: 1, id, eventId, isDuplicate, readinessAtAcceptance }`. Poll `GET /events/{schema}/{id}/status` using the returned maxclicks `id` for current readiness. Neither acceptance nor readiness proves downstream completion. Preserve `eventId`, payload and `occurredAt` across retries.
- **Template sends expose an outcome, not delivery proof.** Read `emailId`, `status` and `error`. `sent` means provider acceptance; HTTP 200 `failed` can include unknown provider outcomes. Preserve the email id and original operation key and reconcile before another send. Pre-send validation/eligibility failures use HTTP errors.
- **Webhook signing secrets appear on create/rotate responses and their idempotent replays**, never normal get/list responses. Save them securely and treat replay bodies as secrets.
- **Batch events**: `events fire-batch --on-error abort` returns HTTP 422 with a `failedIndex` when the first item is invalid. That is a normal result to read, not an error to retry.
- **Suppressions require Admin permission**; other authenticated writes require Write and resource reads require Read. `GET /me` accepts any valid key, including an unbound key.
- **Seventeen REST operations support `Idempotency-Key`.** Recorded results can include errors and webhook secrets; unresolved outcomes require reconciliation. Events instead deduplicate by `eventId`, and identity changes by `operationId` plus alias revision. See the exact operation list and client coverage in `references/api-reference.md`.
- **Writing a natural-language `requirements` field** (segments, webhook custom filters)? Read `references/requirements.md` first: how to phrase it, what is never returned, and how referenced entities get locked.

## Natural-language filters

Two operations take a plain-English `requirements` string and have an AI model generate a stored, server-side filter expression: `segments.create`, and `webhooks.create`/`webhooks.update` with a `condition` of `{ "type": "custom filter", "requirements": "..." }`. They share one rate bucket (10/minute per key), they cost credits, and they take roughly 10 to 90 seconds. The generated code is never returned; what you get back is a human-readable description to review. `references/requirements.md` is the contract.

## Working with email content

**Sending** a template (`templates send`) is covered above and in `maxclicks-email`. A template's shell (its content, sender, `recipientDataPath`, `expectedDataRepresentation`, `transactional` flag and `communicationTopicId`) is **authored in the app**; `maxclicks-templates` covers reading that shell back and sending against it. **Adaptyle**, the manifest/prompt/hidden-block content language layered over Liquid with MJML or HTML bodies, is `maxclicks-adaptyle`: load it when the task is writing or reasoning about the content itself.

## Building an integration

When the task is to write maxclicks into an app (not a one-off), read `references/sdks.md`, choose the SDK for the project's language, and follow the same data-model rules (discover schemas and attributes, upsert by identity, keep records flat). For webhooks you receive, verify the signature with the secret you saved at create time. For deeper questions, `maxclicks docs <topic>` prints the documentation links, `references/api-reference.md` has the full surface, `references/requirements.md` covers the natural-language fields, and the versioned contract is in the `maxclicks-openapi` repository (`openapi.yaml`). Check the matching source/release; a guessed public spec URL is not an API contract.
