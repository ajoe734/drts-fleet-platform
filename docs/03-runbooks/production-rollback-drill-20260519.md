# Production Rollback Drill

Last updated: 2026-05-22
Owner: release engineering
Workflow: `.github/workflows/deploy-prod.yml`
Companion spec: `docs/03-runbooks/production-deploy-rail-spec-20260519.md`

## Purpose

This document defines the executable rollback drill for `WF-PROD-001`.

It is a drill protocol and evidence template, not a claim that production has
already been deployed. The drill proves the operator path, evidence fields, and
decision gates required before a real production rollback can be declared
successful.

## Preconditions

Before any rollback drill, confirm:

1. two ordered `prod/v*` tags exist, so there is a rollback target
2. the `production` GitHub environment reviewer rule is active
3. the previous prod tag is identified as the last known-good version
4. the migration state is reviewed by the database owner

## Rollback Rule

Default rollback mode is application-only redeploy of the previous known-good
`prod/v*` tag with `skip_migration=true`.

Do not run a schema down-migration from GitHub Actions unless:

- a migration-specific down-path has been reviewed
- the database owner explicitly approves it
- the approval is logged in the evidence pack

## Executable Drill Steps

### A. Identify the target pair

List the latest two production tags:

```bash
git ls-remote --tags origin 'refs/tags/prod/v*' | awk '{print $2}' | sort -V | tail -2
```

Record:

- failed or candidate-current tag
- previous known-good tag

### B. Dry-run operator review

Confirm that rollback will use:

```bash
gh workflow run deploy-prod.yml -f tag=<previous-prod-tag> -f skip_migration=true
```

Reviewers must verify:

- previous tag exists on origin
- migration rollback is not required, or a reviewed down-path exists
- human approval gate remains active on environment `production`

### C. Dispatch the rollback

For a real rollback, dispatch:

```bash
gh workflow run deploy-prod.yml -f tag=prod/v2026.05.18.0 -f skip_migration=true
```

### D. Verify the restored version

The rollback only passes when all of the following are green:

1. `drts-api` reaches `Ready=True`
2. `GET ${PROD_CONTROL_PLANE_API_ORIGIN}/health` succeeds with IAP token
3. platform admin identity-context endpoint succeeds
4. ops console identity-context endpoint succeeds
5. operator confirms the restored tag matches the intended previous prod tag

### E. Record evidence

Store evidence under `support/sidecars/WF-PROD-001-LIVE-EXEC/` with:

- rollback trigger reason
- current tag -> restored tag pair
- whether migration was skipped
- workflow run URL
- smoke verification result
- approver / rollback owner
- unresolved incident follow-up, if any

## Verification Checklist

- [ ] previous known-good `prod/v*` tag identified
- [ ] `skip_migration=true` used unless reviewed DB down-path exists
- [ ] environment `production` required-reviewer gate confirmed
- [ ] workflow run URL captured
- [ ] smoke endpoints verified after redeploy
- [ ] evidence written to `WF-PROD-001-LIVE-EXEC`

## Drill Status Vocabulary

- `documented` = commands, gates, and evidence fields exist
- `dry-run reviewed` = command path and reviewer gate were checked without mutating production
- `live executed` = a real production rollback was dispatched and verified

Until a real dispatch occurs, this drill may only claim `dry-run reviewed`.

## Current Evidence Shape For PH1GC-PROD-001

This task ships:

- documented drill steps
- dry-run-reviewed rollback command path
- static verification of the deploy rail contract via `tests/e2e/E2E-009-prod-rail-dry-run.sh`

This task does not ship:

- a real production deploy
- a real production rollback
- post-deploy monitoring from a live production incident

## Reference Anchors

- `.github/workflows/deploy-prod.yml`
- `docs/03-runbooks/production-deploy-rail-spec-20260519.md`
- `docs/03-runbooks/phase1-release-truth-sync-20260519.md`
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
- `support/sidecars/WF-PROD-001-LIVE-EXEC/`
