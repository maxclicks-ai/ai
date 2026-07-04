---
name: maxclicks-workflows
description: Start or trigger a maxclicks workflow / automation via its incoming-webhook step. Use when a task needs to kick off a maxclicks workflow with a payload from an external system.
---

# Trigger maxclicks workflows

Builds on the `maxclicks` skill (read that first for auth, tool choice, and the schema-based data model). This skill covers one operation: starting a workflow run through its **incoming-webhook** trigger step.

## What you can and cannot do here

- **You CAN start a run** of an already-built workflow by posting a payload to its incoming-webhook step reference.
- **You CANNOT build or configure workflows through this API.** There are no create-workflow, add-step, or edit-step commands. Steps, the JSON schema the payload is validated against, and the reference id are all set up by the user in the maxclicks app (`https://app.maxclicks.ai`). If the workflow or an incoming-webhook step does not exist yet, tell the user to add it in the app.

## The procedure

1. **Confirm the space** with `maxclicks whoami` (keys are space-scoped).
2. **Get the reference id.** The `<reference>` is the incoming-webhook step's reference id, shown on that step in the workflow editor in the app. It does not come from any list/get endpoint here, so ask the user for it if you do not have it.
3. **Shape the payload** to the step's configured JSON schema. The body is validated against that schema server-side; a mismatch is rejected. Payload fields are whatever the step defines; there is no fixed record shape here. If the workflow's later steps look records up, keep those records flat (see the `maxclicks` skill) and discover schemas/attributes with `schemas list` / `attributes list` before referencing keys.
4. **Trigger it.** Success returns an empty body. The call only **starts** a run; it does not return the run, its id, or any result.

## CLI

```bash
maxclicks whoami                                  # confirm the space
# reference id comes from the workflow's incoming-webhook step in the app:
maxclicks workflows trigger onboarding-signup --data '{"email":"ada@example.com","plan":"premium"}'
# empty payload is allowed if the step's schema needs no input:
maxclicks workflows trigger nightly-recompute
```

The CLI prints `{ "triggered": true, "reference": "onboarding-signup" }` on success (a local confirmation, not a run object). A validation or auth failure prints the `{ "error": {...} }` envelope to stderr.

## SDK (TypeScript)

```ts
import { Maxclicks, MaxclicksError } from 'maxclicks'

const mc = new Maxclicks(process.env.MAXCLICKS_API_KEY!)

try {
  // Returns nothing meaningful: the run is started, not returned.
  await mc.workflows.trigger('onboarding-signup', {
    email: 'ada@example.com',
    plan: 'premium',
  })
} catch (e) {
  if (e instanceof MaxclicksError) {
    // e.status / e.message: e.g. payload failed the step's JSON schema
  }
}
```

## SDK (Python)

```python
from maxclicks import Maxclicks, MaxclicksError

mc = Maxclicks()  # reads MAXCLICKS_API_KEY

try:
    mc.workflows.trigger("onboarding-signup", {"email": "ada@example.com", "plan": "premium"})
except MaxclicksError as e:
    # e.status / e.message
    ...
```

## Raw escape hatch

```bash
maxclicks api POST /workflows/onboarding-signup --data '{"email":"ada@example.com"}'
```

## Gotchas

- **The trigger only starts a run; it does not return it.** There is no run id, status, or output in the response (success is an empty body). To observe what the run did, look at its side effects (records upserted, events, emails) or the workflow run history in the app, not this call's return value.
- **The `<reference>` comes from the app, not from the API.** It is the incoming-webhook step's reference id set in the workflow editor. Nothing here lists references; if you do not have it, ask the user.
- **The payload is validated against the step's JSON schema.** A field the schema does not allow, or a missing required field, is rejected with a validation error. Match the schema the user configured; do not assume a contact/record shape.
- **Raw-endpoint errors can be `text/plain`, not the JSON error envelope.** The CLI and SDKs normalize this for you; only worry about it if you call `maxclicks api` / the HTTP endpoint directly and parse the failure body yourself.
- **A successful trigger does not mean the workflow succeeded.** It means the run was accepted and started. Downstream steps run asynchronously and can still fail without affecting this call's result.
- **Configuration is app-only.** Building the workflow, wiring steps, and defining the incoming-webhook schema all happen in the maxclicks app. This API cannot do any of it.
