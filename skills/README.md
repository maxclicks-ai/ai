# maxclicks skills

Agent Skills that teach an AI agent to build on maxclicks. Each folder is one skill: a `SKILL.md` (frontmatter + instructions) plus any `references/`.

- `maxclicks` — the umbrella skill (auth, data model, CLI/SDK/API map, gotchas). Start here.
- `maxclicks-contacts` — manage contacts and objects (records).
- `maxclicks-events` — fire events to trigger automations.
- `maxclicks-email` — send templates and manage suppressions.
- `maxclicks-workflows` — trigger workflows.
- `maxclicks-webhooks` — manage outgoing webhooks and verify signatures.

These are the source of truth. The installable index at `.well-known/skills/index.json` is generated from this folder with `npm run build:index`, and served at `https://maxclicks.ai/.well-known/skills/index.json` for `npx skills add https://maxclicks.ai`.

Install: see the [repository README](../README.md).
