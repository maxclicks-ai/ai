# Security policy

## Reporting a vulnerability

If you discover a security issue in these skills or in the maxclicks platform, email `security@maxclicks.ai`. Do not open a public issue for security reports.

## Handling credentials

These skills instruct agents to read the maxclicks API key from `MAXCLICKS_API_KEY` or the maxclicks CLI config, and never to print or commit it. API keys are scoped to a single space. Rotate a key immediately if it is exposed, from `https://app.maxclicks.ai/-/settings/developers`.
