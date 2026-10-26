# maxclicks AI

The one-stop shop for building on [maxclicks](https://maxclicks.ai) with AI agents. This repo ships **Agent Skills** and **agents** that teach any skills-compatible coding agent (Claude Code, Cursor, Codex, Gemini CLI, and more) to work with the maxclicks API, SDKs, CLI, and docs, using the latest best practices.

The skills cover contact records, durable business events, stored-template sends, natural-language segments, prepared broadcasts and workflows, and outgoing webhooks. They also help draft Adaptyle email content for the app editor. Schemas, attributes, email content, workflow steps, domains, senders, topics, API keys, and CSV import remain app workflows; the public API does not author them. `@maxclicks/ai` is a private skills-and-plugins repository, not a runtime AI SDK.

**Availability:** the clients install from npm (`maxclicks`, `@maxclicks/browser`, `maxclicks-cli` and `maxclicks-mcp`), and the MCP server is hosted at `https://mcp.maxclicks.ai/mcp`. Use the documented REST API for current receipt/readiness, identity, and deletion contracts; clients do not yet cover the whole current surface.

## Install

### From this reviewed checkout

Copy the needed `skills/` folders into your agent's skills directory. This works without an npm release of any maxclicks client. The repository also contains plugin manifests and an agent definition.

### Hosted catalog (after deployment verification)

```bash
npx skills add https://maxclicks.ai
```

This is the intended hosted install command. Before relying on it, verify that the deployed index and **every file it lists** are served successfully; the local catalog does not prove deployment. Update an existing installation with:

```bash
npx skills update -y
```

### Repository plugins

**Claude Code**

```bash
claude plugin marketplace add maxclicks-ai/maxclicks-ai
claude plugin install maxclicks@maxclicks
```

**Cursor**: add the marketplace above, or `npx skills add https://maxclicks.ai`.

**Codex / Gemini CLI**: `npx skills add https://maxclicks.ai` (Gemini CLI users can also install this repo as an extension via `gemini-extension.json`).

### Manual

Clone this repo and copy the `skills/` folders into your agent's skills directory (for Claude Code that is `~/.claude/skills/` for personal use or `.claude/skills/` in a project).

## What you get

### Skills

| Skill | Use it when |
| --- | --- |
| `maxclicks` | Auth, the schema-based data model, verified REST operations, client coverage, release availability, and the top gotchas. |
| `maxclicks-contacts` | Creating, importing, updating, or deleting contacts and objects (records). |
| `maxclicks-events` | Accepting events, inspecting receipts/readiness, and listing ready event history. |
| `maxclicks-email` | Sending templates and managing email suppressions. |
| `maxclicks-templates` | Reading stored templates, their data representation, recipient path and sender, then sending a matching payload. |
| `maxclicks-adaptyle` | Writing or editing an email template's content: Adaptyle's manifest/prompt/hidden-block syntax over Liquid, MJML/HTML raw bodies. |
| `maxclicks-segments` | Building AI-generated contact filters from a natural-language prompt. |
| `maxclicks-broadcasts` | Retargeting, scheduling, sending, and measuring broadcasts prepared in the app. |
| `maxclicks-deliverability` | Reading sending-domain DNS verification and saved sender profiles configured in the app. |
| `maxclicks-topics` | Looking up communication topics for consent-scoped marketing sends. |
| `maxclicks-imports` | Choosing the app CSV importer or a throttled per-record synchronization loop. |
| `maxclicks-workflows` | Triggering workflows through their incoming-webhook step, and observing runs. |
| `maxclicks-webhooks` | Creating and managing outgoing webhooks, and verifying inbound signatures. |

Each skill is grounded in the real maxclicks surface (no invented endpoints) and follows the [Agent Skills](https://agentskills.io) open standard, so it works across skills-compatible agents.

### Agents

| Agent | Use it for |
| --- | --- |
| `maxclicks-integration-engineer` | Building or debugging a full maxclicks integration end to end. |

## Prerequisites

- A maxclicks API key created in the [app](https://app.maxclicks.ai), for a workspace you are authorized to use. Keep it in `MAXCLICKS_API_KEY` or your secret store.
- REST integrations use `https://api.maxclicks.ai/v1` with a Bearer key. Browser collector keys and routes are a separate contract.
- CLI/Node/browser examples use the npm packages; see [client coverage](skills/maxclicks/references/sdks.md) for what each covers.
- MCP clients connect to `https://mcp.maxclicks.ai/mcp` and sign in with OAuth, or run `npx -y maxclicks-mcp` locally with an API key.

## How it fits together

- **maxclicks-ai** (this repo): the skills, agents, and plugins your agent installs.
- **maxclicks-cli**: the `maxclicks` command the skills drive from the terminal.
- **maxclicks-node / -python / -go / -php / -ruby / -java / -rust**: the SDKs for application code.
- **maxclicks-openapi**: the OpenAPI 3.1 contract.
- **maxclicks-mcp**: the MCP server.

## Contributing

Skills live in `skills/<name>/SKILL.md`. After editing a skill, regenerate the installable index and validate:

```bash
npm run build:index   # writes .well-known/skills/index.json from skills/
npm run validate      # checks every skill's frontmatter and size
```

See [CONTRIBUTING.md](CONTRIBUTING.md). Report security issues per [SECURITY.md](SECURITY.md).

## License

MIT
