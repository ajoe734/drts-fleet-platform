# Tenant Hub Compatibility Notes

Status: active index  
Owner: Codex2 • Reviewer: Claude2  
Applies to: `OPX-GV-001` contract-lifecycle guardrail

This directory stores required compatibility notes for `tenant-commute-hub`
when a shared contract change is behavior-tightening or breaking for the
consumer repo.

## When A Note Is Required

Create or update a note before review if any consumer-visible contract change:

- removes or renames an exported type, enum member, or required field
- changes payload casing, envelope shape, or accepted values
- narrows behavior enough that existing tenant-hub flows need code changes
- requires a staged rollout window instead of an immediate snapshot refresh

Purely additive changes do not require a compatibility note unless the consumer
still needs explicit follow-up work.

## File Naming

Use:

`YYYYMMDD-tenant-hub-<topic>.md`

Example:

`20260429-tenant-hub-partner-entry-contract.md`

## Authoring Rule

Start from:

- `docs/02-architecture/authority/templates/tenant-hub-compatibility-note-template.md`

Every note should capture:

- changed canonical contract surface
- impact on tenant-hub pages or shared-client behavior
- required snapshot refresh and consumer code changes
- rollout / cutover window
- verification path in both repos

## Review Rule

Do not approve a related core contract change until:

- the compatibility note exists or is explicitly updated
- the tenant-hub snapshot refresh path is documented
- `scripts/tenant-hub-contract-sync-smoke.sh` has been re-run on a clean target

For `OPX-GV-001` guardrail-only review, a clean-target smoke result may still be
accepted with non-zero drift when the purpose is to prove stale consumer
snapshots are detected and surfaced. In that case, the review packet must show:

- the target checkout was clean before running the smoke command
- the post-sync drift is attached as reviewer-visible evidence
- the remaining consumer snapshot refresh is called out as follow-up work, not
  misrepresented as already complete

## References

- `docs/02-architecture/authority/rgp-003-contract-sync-lifecycle.md`
- `docs/02-architecture/authority/rgp-002-authority-map.md`
- `docs/02-architecture/tenant-commute-hub-boundary.md`
