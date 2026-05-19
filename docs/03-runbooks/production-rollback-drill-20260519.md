# Production Rollback Drill Runbook

Last updated: 2026-05-19
Task ref: `PROD-DRILL-001`
Workflow family: `WF-PROD-001`
Owner: `Codex`
Reviewer: `Gemini`

This runbook operationalises the rollback-drill evidence requirement in
`docs/00-context/phase1-design-blueprint-completion-directive-20260519.md`
§`3.9` for `WF-PROD-001`.

It is the execution companion to:

- `.github/workflows/deploy-prod.yml`
- `docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md`
- `docs/ops/branch-strategy.md` §`7`

A qualifying drill proves that the team can:

- deploy a newer immutable `prod/v<YYYY.MM.DD>.<N>` tag through the protected
  production rail,
- restore the previous known-good `prod/v<...>` tag by manual redispatch,
- verify the restored tag through the same protected health checks, and
- record enough evidence to support the `WF-PROD-001` gate uplift from
  `PASS (dry-run contract evidence)` toward
  `PASS (production dry-run / drill evidence)`.

This document does **not** authorise schema down-migrations, auto-rollback, or
unreviewed production promotion.

## Scope

This runbook is bounded to one production environment and one rollback pair:

- `candidateTag`: the newer `prod/v<...>` tag intentionally deployed for the
  drill window
- `rollbackTag`: the immediately previous known-good `prod/v<...>` tag used as
  the rollback target

It covers:

- the pre-drill checks required before touching production,
- the standard controlled dry-run sequence
  `deploy candidate -> verify -> rollback -> verify`,
- the evidence that must be captured for `WF-PROD-001`, and
- the stop conditions that turn a drill into an incident.

It is out of scope to:

- run schema down-migrations,
- treat a repo-local static walkthrough as sufficient gate evidence,
- claim that every historic prod tag is reversible,
- replace the wider human rollout authority in
  `docs/03-runbooks/phase1-rollout.md`.

## Qualifying Drill Types

Only the following drill types count toward the directive's
"rollback drill 有 evidence" requirement:

### 1. Controlled production dry run

Preferred first qualifying drill.

Sequence:

1. deploy a newer `candidateTag` through `deploy-prod.yml`,
2. confirm the protected health checks pass, and
3. redeploy `rollbackTag` with `skip_migration=true`.

### 2. Live incident rollback

A real rollback during a production incident also qualifies, but only if the
same evidence template in this runbook is completed and the incident reference
is captured.

### 3. Tabletop or repo-local walkthrough

Useful for rehearsal only. It does **not** satisfy `WF-PROD-001` gate uplift on
its own because no protected production rail was exercised.

## Named Roles

The drill must name the following people before the window opens:

- `drillCommander`: owns go/no-go, declares rollback, and closes the window
- `rollbackOperator`: runs `gh workflow run deploy-prod.yml ...`
- `dbOwner`: confirms schema compatibility and blocks any unsafe rollback
- `envApprover`: the GitHub `production` environment reviewer who approves the
  workflow run
- `scribe`: records timestamps, workflow URLs, and outcomes in the evidence log

One person may hold more than one role except that `dbOwner` should remain a
separate approver whenever the candidate deploy includes a schema migration.

## Entry Criteria

Do not open the drill window until every item below is true.

### Rail readiness

- `.github/workflows/deploy-prod.yml` is the active production rail.
- The GitHub `production` environment exists and has a required reviewer gate.
- Required repo variables and secrets from
  `docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md` are configured.
- The GCP project, Artifact Registry, Cloud Run services, Cloud SQL, and Secret
  Manager entries required by the workflow are live.

### Tag readiness

- At least two immutable prod tags exist on origin:

  ```bash
  git ls-remote --tags origin 'refs/tags/prod/v*' | awk '{print $2}' | sort -V
  ```

- `candidateTag` resolves to the newer tag that will be deployed first.
- `rollbackTag` resolves to the previous known-good tag.
- The team has written down the commit SHA for both tags.

### Schema safety

- `dbOwner` confirms the rollback is application-only and safe with
  `skip_migration=true`, or
- `dbOwner` explicitly blocks the drill because the candidate deploy includes a
  forward-only migration or data-shape change that cannot be safely rolled back
  by tag redispatch alone.

If schema safety is not cleared, stop. The drill is blocked, not deferred.

### Operational readiness

- A change window, incident bridge, or equivalent live coordination channel is
  open.
- Monitoring for `drts-api`, `drts-platform-admin-web`, and
  `drts-ops-console-web` is available.
- The evidence document header is pre-filled before the first workflow run is
  approved.

## Standard Controlled Drill

This is the default sequence for the first qualifying `WF-PROD-001` rollback
drill.

### Phase 1 - Select the rollback pair

1. Pick `candidateTag` and `rollbackTag`.
2. Resolve and record their SHAs:

   ```bash
   git rev-list -n 1 <candidateTag>
   git rev-list -n 1 <rollbackTag>
   ```

3. Confirm `rollbackTag` is the last known-good production release, not merely
   the previous chronological tag.
4. Confirm `dbOwner` cleared the pair for `skip_migration=true` rollback.

### Phase 2 - Capture the baseline

1. Record the currently serving prod tag before the new deploy begins.
2. Record the current health state of:
   - `GET <PROD_CONTROL_PLANE_API_ORIGIN>/health`
   - `GET <PROD_PLATFORM_ADMIN_ORIGIN>/control-plane-proxy/identity/context`
   - `GET <PROD_OPS_CONSOLE_ORIGIN>/control-plane-proxy/identity/context`
3. Record any open incident, change ticket, or known degraded condition. A
   drill must not claim a clean rollback if the environment was already
   degraded for unrelated reasons.

### Phase 3 - Deploy the candidate tag

1. Trigger the candidate deploy:

   ```bash
   gh workflow run deploy-prod.yml -f tag=<candidateTag>
   ```

2. Wait for the workflow to pass:
   - `validate-config`
   - `build-push`
   - `migrate` unless intentionally absent
   - `deploy`
   - `health-check`
3. Record:
   - workflow run URL,
   - whether migration ran,
   - GitHub environment approver,
   - the protected health-check result.
4. Observe the candidate tag long enough for the drill commander to declare the
   candidate healthy enough to roll back from. The soak interval should be
   explicit in the evidence log.

If the candidate deploy fails after production was already updated, move
immediately to Phase 4 and treat the action as a real rollback with evidence.

### Phase 4 - Execute the rollback

1. The `drillCommander` explicitly declares rollback and states the target tag.
2. Trigger rollback to the previous known-good tag:

   ```bash
   gh workflow run deploy-prod.yml -f tag=<rollbackTag> -f skip_migration=true
   ```

3. Wait for the rollback workflow to pass:
   - `validate-config`
   - `build-push`
   - `deploy`
   - `health-check`
4. Confirm `migrate` was skipped. A standard rollback drill must not attempt a
   schema down-migration.
5. Record the rollback workflow run URL and approval evidence.

### Phase 5 - Verify the restored state

1. Re-run the protected health checks against the restored tag.
2. Confirm the API, platform-admin, and ops-console surfaces are reachable and
   report the restored state.
3. Confirm the production environment now serves `rollbackTag`, not
   `candidateTag`.
4. Record elapsed time:
   - deploy start -> deploy healthy
   - rollback start -> rollback healthy
5. Capture any manual follow-up still required after the rollback.

## Stop Conditions

Stop the drill and declare an incident if any of the following occurs:

- the candidate deploy succeeds partially but post-deploy health checks fail,
- the rollback workflow fails or hangs beyond the agreed timeout,
- the restored tag fails protected health verification,
- the database owner withdraws schema-safety approval,
- the team cannot prove which prod tag is currently serving traffic.

When a stop condition is hit:

1. treat the event as production-impacting work, not as a documentation drill,
2. follow `docs/03-runbooks/incident-escalation-service-recovery-runbook.md`,
3. keep the evidence log open and mark the drill result as `failed`,
4. do not upgrade the `WF-PROD-001` gate claim.

## Evidence Requirements

A qualifying drill must capture at minimum:

- `candidateTag` and resolved candidate SHA
- `rollbackTag` and resolved rollback SHA
- whether the candidate deploy ran migrations
- confirmation that rollback used `skip_migration=true`
- both workflow run URLs
- the GitHub `production` environment approver
- protected health-check result before deploy, after deploy, and after rollback
- named `drillCommander`, `rollbackOperator`, `dbOwner`, and `scribe`
- any incident / change / regression reference
- explicit non-claims if the drill was partial or degraded

If any item above is missing, the evidence is incomplete and must not be used
to claim `PASS (production dry-run / drill evidence)`.

## Evidence Template

Store the completed evidence alongside the release or live-exec closeout. A
recommended path is
`support/sidecars/WF-PROD-001-LIVE-EXEC/PROD-ROLLBACK-DRILL-EVIDENCE-<YYYYMMDD>.md`,
but any path is acceptable if it is durable and linked from the gate update.

```md
# WF-PROD-001 Rollback Drill Evidence

- Date:
- Drill type: `controlled_dry_run` | `incident_rollback`
- Result: `pass` | `failed` | `partial`
- Drill commander:
- Rollback operator:
- DB owner:
- Environment approver:
- Scribe:
- Change ticket / incident ref:

## 1. Tag pair

- Candidate tag:
- Candidate SHA:
- Rollback tag:
- Rollback SHA:
- Serving tag before drill:

## 2. Entry checks

| Check | Result | Notes |
| --- | --- | --- |
| Production environment reviewer gate configured | pass / fail | |
| Required prod vars/secrets present | pass / fail | |
| At least two prod tags exist | pass / fail | |
| DB owner cleared `skip_migration=true` rollback | pass / fail | |
| Monitoring + coordination channel ready | pass / fail | |

## 3. Baseline verification

- API health before deploy:
- Platform Admin identity/context before deploy:
- Ops Console identity/context before deploy:
- Known pre-existing degradation:

## 4. Candidate deploy

- Workflow run URL:
- Candidate deploy approved by:
- Migration executed: `yes` | `no`
- Candidate deploy start time:
- Candidate healthy time:
- Candidate protected health-check result:
- Notes:

## 5. Rollback execution

- Rollback declared at:
- Rollback workflow run URL:
- Rollback approved by:
- `skip_migration=true` confirmed: `yes` | `no`
- Rollback start time:
- Rollback healthy time:
- Rollback protected health-check result:
- Notes:

## 6. Restored-state verification

- Serving tag after rollback:
- API health after rollback:
- Platform Admin identity/context after rollback:
- Ops Console identity/context after rollback:
- Manual follow-up required:

## 7. Outcome

- Outcome summary:
- Drill duration:
- Production impact observed:
- Follow-up tasks:

## 8. Non-claims

- No schema down-migration was executed unless separately approved and cited.
- This drill proves only the tested rollback pair.
- Any failed or partial checks above block gate uplift until resolved.
```

## Non-Claims

Even when the drill passes, this runbook does **not** claim:

- that the production rail is fully automated,
- that rollback is safe for every future migration,
- that down-migrations are approved,
- that production deploys no longer require a human reviewer gate,
- that `WF-PROD-001` is live-pass without the corresponding evidence file.

## References

- `docs/00-context/phase1-design-blueprint-completion-directive-20260519.md`
  §`3.9`
- `docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md`
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
- `docs/03-runbooks/phase1-rollout.md`
- `docs/03-runbooks/incident-escalation-service-recovery-runbook.md`
- `docs/ops/branch-strategy.md` §`7`
- `.github/workflows/deploy-prod.yml`
