# maxclicks skills

Agent Skills that teach an AI agent to build on maxclicks. Each folder is one skill: a `SKILL.md` (frontmatter + instructions) plus any `references/`.

They describe the current **Public API v1 source contract: 58 functional operations across 16 resource groups**. The CLI, SDKs and MCP server wrap a smaller surface; the entry skill records what each covers. The organizing principle across every skill: entities are authored in the maxclicks app, and the API triggers, reads and measures them.

- `maxclicks`: the umbrella skill (auth, the shape of the surface, the data model, CLI/SDK/API map, gotchas, the natural-language `requirements` contract). Start here.
- `maxclicks-contacts`: manage contacts and objects (records) and read a contact's consent audit trail.
- `maxclicks-events`: fire events to trigger automations, and read the event history back.
- `maxclicks-email`: send templates and manage the suppression list.
- `maxclicks-templates`: read stored templates, understand their expected data shape and recipient path, and send against them (a template's content is authored in the app).
- `maxclicks-adaptyle`: Adaptyle, the manifest/prompt/hidden-block content language over Liquid, with MJML or HTML bodies.
- `maxclicks-segments`: generate AI-defined contact filters from natural-language `requirements`, then count and list their contacts.
- `maxclicks-broadcasts`: point a broadcast at an audience, schedule or send it, and read its runs and metrics.
- `maxclicks-deliverability`: read sending domains (including their live DNS records) and saved sender profiles, and check sending readiness.
- `maxclicks-topics`: read communication topics (consent-scoped marketing groupings).
- `maxclicks-imports`: choose the app's CSV importer or a throttled, resumable `records upsert` loop; there is no public imports endpoint.
- `maxclicks-workflows`: trigger workflows, observe their runs, and pause or unpause them.
- `maxclicks-webhooks`: manage outgoing webhooks (including natural-language custom filters) and verify signatures.

These are the skill sources. Generate `.well-known/skills/index.json` with `npm run build:index`. Hosted installation at `https://maxclicks.ai/.well-known/skills/index.json` additionally requires deployment of every advertised skill/reference file. Verify those files before claiming the hosted installation works.

Install: see the [repository README](../README.md).
