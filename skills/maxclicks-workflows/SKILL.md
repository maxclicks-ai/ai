---
name: maxclicks-workflows
description: Start or trigger a maxclicks workflow / automation via its incoming-webhook step. Use when a task needs to kick off a maxclicks workflow with a payload from an external system.
---

# Trigger maxclicks workflows

Builds on the `maxclicks` skill (read that first for auth, tool choice, and the schema-based data model). This skill covers one operation: starting a workflow run through its **incoming-webhook** trigger step.

## What you can and cannot do here

- **You CAN start a run** of an already-built workflow by posting a payload to its incoming-webhook step reference.
- **You CAN list and observe workflows and their runs, and pause/unpause/remove a workflow** (full CLI commands, see "Observability and lifecycle" below), but this is read/lifecycle-only, not step editing.
- **You CANNOT build or configure workflow steps through this API.** There are no create-workflow, add-step, or edit-step commands. Steps, the JSON schema the payload is validated against, and the reference id are all set up by the user in the maxclicks app (`https://app.maxclicks.ai`). If the workflow or an incoming-webhook step does not exist yet, tell the user to add it in the app.

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

## Observability and lifecycle

List/get workflows and their runs, and pause, unpause, or remove a workflow. Full CLI commands (not yet wrapped by any SDK, use a raw HTTP call from application code):

```bash
maxclicks workflows list --all
maxclicks workflows get wf_01hx...
maxclicks workflows runs wf_01hx... --all
maxclicks workflows get-run wf_01hx... run_01hx...
maxclicks workflows pause wf_01hx...
maxclicks workflows unpause wf_01hx...
maxclicks workflows delete wf_01hx...
```

This is how you now confirm a trigger actually did something, list runs for the workflow and inspect the run's status, instead of relying only on side effects or the app's run history. Pausing stops the workflow from starting new runs (runs already in progress continue); it does not touch steps or the trigger endpoint's validation.

## Gotchas

- **The trigger only starts a run; it does not return it.** There is no run id, status, or output in the trigger response itself (success is an empty body). Use `maxclicks workflows runs <id>` (above) to find and inspect the run afterward, rather than assuming the trigger call tells you anything beyond "accepted."
- **The `<reference>` comes from the app, not from the API.** It is the incoming-webhook step's reference id set in the workflow editor. Nothing here lists references; if you do not have it, ask the user.
- **The payload is validated against the step's JSON schema.** A field the schema does not allow, or a missing required field, is rejected with a validation error. Match the schema the user configured; do not assume a contact/record shape.
- **Raw-endpoint errors can be `text/plain`, not the JSON error envelope.** The CLI and SDKs normalize this for you; only worry about it if you call `maxclicks api` / the HTTP endpoint directly and parse the failure body yourself.
- **A successful trigger does not mean the workflow succeeded.** It means the run was accepted and started. Downstream steps run asynchronously and can still fail; check the run via the observability endpoints above rather than assuming success from the trigger's 2xx.
- **Step-level configuration is app-only.** Building the workflow and wiring/editing steps happen in the maxclicks app; this API cannot do that. Listing, observing runs, pausing/unpausing, and removing a whole workflow are the only lifecycle operations available here.
