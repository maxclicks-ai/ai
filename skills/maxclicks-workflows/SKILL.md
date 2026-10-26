---
name: maxclicks-workflows
description: Start or trigger a maxclicks workflow / automation via its incoming-webhook step, then list, inspect, pause, or unpause workflows and their runs. Use when a task needs to kick off a maxclicks workflow with a payload from an external system, or to check whether a run actually did anything.
---

# Trigger and observe maxclicks workflows

**Coverage:** read the `maxclicks` entry skill for current REST coverage and client limits.

Builds on the `maxclicks` skill (read that first for auth, tool choice, and the schema-based data model). This skill covers starting a workflow run through its **incoming-webhook** trigger step, and the read/lifecycle operations around it.

## What you can and cannot do here

- **You CAN start a run** of an already-built workflow by posting a payload to its incoming-webhook step reference.
- **You CAN list and observe workflows and their runs, and pause or unpause a workflow** (see "Observability and lifecycle" below). This is read and lifecycle only, not step editing.
- **You CANNOT build or configure workflow steps through this API.** Steps, the JSON schema the payload is validated against, and the reference id are all set up by the user in the maxclicks app (`https://app.maxclicks.ai`). A workflow is a graph whose steps send email, spend credits, and mutate records; it is authored and published by a human there, and driven from here. If the workflow or an incoming-webhook step does not exist yet, tell the user to add it in the app.

## The procedure

1. **Confirm the space** with `maxclicks whoami` (keys are space-scoped).
2. **Get the reference id.** The `<reference>` is the incoming-webhook step's reference id, shown on that step in the workflow editor in the app. It does not come from any list/get endpoint here, so ask the user for it if you do not have it.
3. **Shape the payload** to the step's configured JSON schema. The body is validated against that schema server-side; a mismatch is rejected. Payload fields are whatever the step defines; there is no fixed record shape here. If the workflow's later steps look records up, keep those records flat (see the `maxclicks` skill) and discover schemas/attributes with `schemas list` / `attributes list` before referencing keys.
4. **Trigger it.** Success returns `{ "data": {} }`. The call only **starts** a run; it does not return the run, its id, or any result.
5. **Confirm it landed** with `workflows runs <workflow id>`, since the trigger response tells you nothing about the run.

Triggering needs a **write**-capable key, not just read: the run it starts can send email, spend credits, call AI, mutate contacts and objects, and issue outbound HTTP requests.

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

## Retry-safety

The trigger endpoint accepts an `Idempotency-Key` header, which is the right way to make a retried external webhook delivery safe: reuse the upstream event's own id as the key and a redelivery replays instead of starting a second run. Node source accepts `{ idempotencyKey }` as the third `trigger` argument; other language clients expose different options, so check the installed signature. The CLI's `trigger` command has no `--idempotency-key` flag and `maxclicks api` cannot set headers, so drop to a plain HTTP call there:

```bash
curl -X POST https://api.maxclicks.ai/v1/workflows/onboarding-signup \
  -H "Authorization: Bearer $MAXCLICKS_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: evt_from_the_upstream_system" \
  -d '{"email":"ada@example.com"}'
```

A replayed call comes back with an `Idempotent-Replay` header.

## Raw escape hatch

```bash
maxclicks api POST /workflows/onboarding-signup --data '{"email":"ada@example.com"}'
```

## Observability and lifecycle

List and get workflows and their runs, and pause or unpause a workflow:

```bash
maxclicks workflows list --all
maxclicks workflows get wf_01hx...
maxclicks workflows runs wf_01hx... --all
maxclicks workflows get-run wf_01hx... run_01hx...
maxclicks workflows pause wf_01hx...
maxclicks workflows unpause wf_01hx...
```

The same operations exist on the SDKs: `mc.workflows.list()`, `.get(id)`, `.listRuns(id)`, `.getRun(id, runId)`, `.pause(id)`, `.unpause(id)`.

A `Workflow` carries `name`, `description`, `paused`, `published` and `isDirty`. A run carries status, version, failure reason, parent-run context, `stepCount` and a window of at most 100 `stepHistory` rows, each with an `index`. GET run initially returns the latest window. Pass non-null `nextHistoryBeforeIndex` as `history_before` to read older rows. A failed run can have null `failureReason` when the failed step is outside that window. Current Node/CLI/MCP helpers do not expose this cursor; use direct HTTP for complete history.

This is how you confirm a trigger actually did something: list runs for the workflow and inspect the run's status and step history, instead of relying on side effects or the app's run history. Pausing stops the workflow from starting new runs (runs already in progress finish normally); it does not touch steps, and a paused workflow's trigger reference stops matching (see the gotcha below).

## Gotchas

- **The trigger only starts a run; it does not return it.** There is no run id, status, or output in the trigger response (`data` is an empty object). Use `maxclicks workflows runs <id>` to find and inspect the run afterward, rather than assuming the trigger call tells you anything beyond "accepted."
- **The `<reference>` comes from the app, not from the API.** It is the incoming-webhook step's reference id set in the workflow editor. Nothing here lists references; if you do not have it, ask the user.
- **A 404 on trigger is ambiguous.** `workflow_step_not_found` covers a missing reference, a duplicate one, a workflow that is not published, a step whose request JSON schema was never filled in, and a paused workflow. If a reference that used to work starts 404ing, check `workflows get` for `paused: true` and `published` before assuming the reference is wrong.
- **Unpublished edits do not take effect.** A workflow with `isDirty: true` has app-side changes that are not in the published version your trigger runs; the run executes the last published version.
- **The payload is validated against the step's JSON schema.** A field the schema does not allow, or a missing required field, is rejected with a validation error. Match the schema the user configured; do not assume a contact/record shape.
- **Trigger failures use the standard JSON error envelope.** Inspect the response code/message; preserve operation metadata on an unknown idempotency outcome instead of forcing another run.
- **A successful trigger does not mean the workflow succeeded.** It means the run was accepted and started. Downstream steps run asynchronously and can still fail; check the run's `status` and `failureReason` rather than assuming success from the trigger's 2xx.
- **Triggering is a write operation.** A read-only caller gets a 403; the run can spend credits and send mail, so it is gated accordingly.
- **Step-level configuration is app-only.** Building the workflow and wiring or editing steps happen in the maxclicks app; listing, observing runs, and pausing/unpausing are the lifecycle operations available here.
