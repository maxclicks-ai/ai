# Contributing

Thanks for helping improve the maxclicks Agent Skills.

## Editing a skill

1. Skills live in `skills/<name>/SKILL.md`. The directory name is the skill name and must match the `name` in the frontmatter.
2. Keep `SKILL.md` focused and under 500 lines. Move long reference material into `skills/<name>/references/` and tell the agent when to load it.
3. Ground every instruction in the real maxclicks surface (the CLI in [maxclicks-cli](https://github.com/maxclicks-ai/maxclicks-cli), the SDKs, and the OpenAPI spec in [maxclicks-openapi](https://github.com/maxclicks-ai/maxclicks-openapi)). Do not invent endpoints, commands, or fields.
4. Prefer clear defaults over menus, and capture the non-obvious "gotchas" that an agent would get wrong without being told.
5. Do not use the em-dash character; use a colon, comma, parentheses, or period.

## Before opening a PR

```bash
npm run validate      # frontmatter + size checks
npm run build:index   # regenerate .well-known/skills/index.json
```

Commit the regenerated `.well-known/skills/index.json` alongside your skill changes. CI validates both.

## Adding a skill

Create `skills/<new-name>/SKILL.md` with `name` and `description` frontmatter (the description is what triggers the skill, so make it specific and trigger-rich), add it to the table in the README, run `build:index`, and open a PR.
