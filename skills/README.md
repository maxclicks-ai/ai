# maxclicks skills

Agent Skills that teach an AI agent to build on maxclicks. Each folder is one skill: a `SKILL.md` (frontmatter + instructions) plus any `references/`.

- `maxclicks`: the umbrella skill (auth, data model, CLI/SDK/API map, gotchas, the natural-language `requirements` contract, schema/attribute/API-key management). Start here.
- `maxclicks-contacts`: manage contacts and objects (records), plus bulk CSV imports.
- `maxclicks-events`: fire and list events to trigger automations.
- `maxclicks-email`: send templates and manage suppressions.
- `maxclicks-templates`: author templates (create/list/get/update/duplicate/delete), the CRUD shell around a template's content and data shape.
- `maxclicks-adaptyle`: write an email template's content in Adaptyle, the manifest/prompt/hidden-block syntax over Liquid, MJML/HTML raw bodies.
- `maxclicks-segments`: build AI-generated contact filters (natural-language `requirements`).
- `maxclicks-broadcasts`: create, schedule, and send mass emails to a segment or the whole audience.
- `maxclicks-deliverability`: verify sending domains and manage saved sender profiles.
- `maxclicks-topics`: manage communication topics (consent-scoped marketing groupings).
- `maxclicks-imports`: bulk CSV import of contacts/objects, with status polling and failure logs.
- `maxclicks-workflows`: trigger workflows and observe their runs.
- `maxclicks-webhooks`: manage outgoing webhooks (including natural-language custom filters) and verify signatures.

These are the source of truth. The installable index at `.well-known/skills/index.json` is generated from this folder with `npm run build:index`, and served at `https://maxclicks.ai/.well-known/skills/index.json` for `npx skills add https://maxclicks.ai`.

Install: see the [repository README](../README.md).
