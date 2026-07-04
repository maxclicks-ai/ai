# maxclicks AI

The one-stop shop for building on [maxclicks](https://maxclicks.ai) with AI agents. This repo ships **Agent Skills** and **agents** that teach any skills-compatible coding agent (Claude Code, Cursor, Codex, Gemini CLI, and more) to work with the maxclicks API, SDKs, CLI, and docs, using the latest best practices.

Install one skill and your agent can manage contacts, fire events, send email, build and trigger workflows, and wire webhooks against your maxclicks space, correctly and safely.

## Install

### npx (any agent, recommended)

```bash
npx skills add https://maxclicks.ai
```

This reads `https://maxclicks.ai/.well-known/skills/index.json` and installs the maxclicks skills into your agent. Update later with:

```bash
npx skills update -y
```

### Official plugins (auto-updating)

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
| `maxclicks` | The entry point: auth, the schema-based data model, the CLI/SDK/API map, and the top gotchas. Loads on any maxclicks task. |
| `maxclicks-contacts` | Creating, importing, updating, or deleting contacts and objects (records). |
| `maxclicks-events` | Firing events to trigger automations. |
| `maxclicks-email` | Sending templates and managing email suppressions. |
| `maxclicks-workflows` | Triggering workflows through their incoming-webhook step. |
| `maxclicks-webhooks` | Creating and managing outgoing webhooks, and verifying inbound signatures. |

Each skill is grounded in the real maxclicks surface (no invented endpoints) and follows the [Agent Skills](https://agentskills.io) open standard, so it works across skills-compatible agents.

### Agents

| Agent | Use it for |
| --- | --- |
| `maxclicks-integration-engineer` | Building or debugging a full maxclicks integration end to end. |

## Prerequisites

- A maxclicks API key (create one at `https://app.maxclicks.ai/-/settings/developers`). Set `MAXCLICKS_API_KEY`, or run `maxclicks config set-key <key>`.
- For terminal operations the skills use the **maxclicks CLI**: `npm install -g maxclicks-cli` (its own repo, [maxclicks-cli](https://github.com/maxclicks-ai/maxclicks-cli)).
- For application code, the skills point at the **maxclicks SDKs** (Node, Python, Go, PHP/Laravel, Ruby, Java, Rust).
- For hosts that speak MCP, the maxclicks **MCP server** is at `https://mcp.maxclicks.ai/mcp`.

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
