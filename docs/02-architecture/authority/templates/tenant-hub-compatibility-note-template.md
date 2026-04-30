# Tenant Hub Compatibility Note Template

Status: template  
Audience: `drts-fleet-platform` and `tenant-commute-hub` maintainers

Use this file when a contract change is behavior-tightening or breaking for the
external tenant consumer.

## Metadata

- Date:
- Change owner:
- Reviewer:
- Affected core task:
- Affected consumer repo:
- Snapshot refresh required: yes / no

## Contract Change Summary

- Canonical source file(s):
- Changed export(s):
- Change class: additive / behavior-tightening / breaking

## Consumer Impact

- Which tenant pages or flows are affected?
- Does the shared client need code changes?
- Does standalone snapshot consumption change?

## Required Consumer Action

1. Refresh snapshot with `npm run sync:contracts`.
2. Update consumer code paths listed above.
3. Re-run `scripts/tenant-hub-contract-sync-smoke.sh` from the core repo.

## Rollout / Compatibility Window

- Backward-compatible until:
- Hard cutover date:
- Fallback allowed during rollout:

## Verification

- Core verification:
- Consumer verification:
- Open risks:

## References

- `docs/02-architecture/authority/rgp-003-contract-sync-lifecycle.md`
- `docs/02-architecture/authority/rgp-002-authority-map.md`
- `docs/02-architecture/tenant-commute-hub-boundary.md`
