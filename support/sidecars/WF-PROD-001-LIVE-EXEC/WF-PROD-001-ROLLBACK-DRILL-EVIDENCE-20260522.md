# WF-PROD-001 Rollback Drill Evidence

Date: 2026-05-22
Task: `PH1GC-PROD-001`
Workflow family: `WF-PROD-001`
Status: `dry-run reviewed`

## Drill Type

Rollback-by-prior-prod-tag operator drill with no production mutation.

## Reviewed Command Path

```bash
git ls-remote --tags origin 'refs/tags/prod/v*' | awk '{print $2}' | sort -V | tail -2
gh workflow run deploy-prod.yml -f tag=<previous-prod-tag> -f skip_migration=true
```

## What Was Verified

- rollback target is defined as the previous known-good `prod/v*` tag
- rollback dispatch uses the same protected `deploy-prod.yml` rail as forward deploy
- rollback defaults to `skip_migration=true`
- the drill requires the `production` environment reviewer gate to remain active
- restored-version verification reuses the post-deploy smoke contract

## Required Live Evidence Fields

When a real rollback occurs, the sidecar must add:

- incident or regression reason
- current tag -> restored tag pair
- workflow run URL
- approver and rollback owner
- smoke results after restore
- any DB-owner approval if rollback touched schema

## Current Truth

This packet proves the rollback drill is executable and documented. It does not
prove that a real production rollback has already happened.
