# OPX-GV-001 Review Packet

Owner: `Codex`  
Reviewer: `Codex2`  
Date: `2026-04-30`  
Task status: `review`

## Scope

`OPX-GV-001` is a governance guardrail task for cross-repo contract authority.
It is not a claim that the external `tenant-commute-hub` snapshot is already
refreshed.

## Acceptance framing

This task is reviewable when all of the following are true:

1. The core repo documents one canonical lifecycle for contract portability from
   `drts-fleet-platform` into `tenant-commute-hub`.
2. Breaking or behavior-tightening consumer impact requires a compatibility note
   under `docs/02-architecture/authority/compatibility-notes/`.
3. The core-owned smoke command proves stale consumer snapshots are surfaced
   instead of being silently ignored.

For this guardrail-only review, a clean-target smoke result may remain non-zero
when the evidence proves the consumer snapshot is stale. The non-zero result is
expected evidence, not a failure of the guardrail itself.

## Delivered artifacts

- [docs/02-architecture/authority/rgp-003-contract-sync-lifecycle.md](/home/edna/workspace/drts-fleet-platform/docs/02-architecture/authority/rgp-003-contract-sync-lifecycle.md:1)
- [docs/02-architecture/authority/compatibility-notes/README.md](/home/edna/workspace/drts-fleet-platform/docs/02-architecture/authority/compatibility-notes/README.md:1)
- [docs/02-architecture/authority/templates/tenant-hub-compatibility-note-template.md](/home/edna/workspace/drts-fleet-platform/docs/02-architecture/authority/templates/tenant-hub-compatibility-note-template.md:1)
- [docs/02-architecture/authority/rgp-002-authority-map.md](/home/edna/workspace/drts-fleet-platform/docs/02-architecture/authority/rgp-002-authority-map.md:84)
- [docs/02-architecture/tenant-commute-hub-boundary.md](/home/edna/workspace/drts-fleet-platform/docs/02-architecture/tenant-commute-hub-boundary.md:154)
- [scripts/tenant-hub-contract-sync-smoke.sh](/home/edna/workspace/drts-fleet-platform/scripts/tenant-hub-contract-sync-smoke.sh:1)
- [support/sidecars/OPX-GV-001/OPX-GV-001-HANDOFF.md](/home/edna/workspace/drts-fleet-platform/support/sidecars/OPX-GV-001/OPX-GV-001-HANDOFF.md:1)

## Evidence

### Lifecycle and ownership

- `RGP-003` defines the only allowed snapshot-refresh lifecycle and explicitly
  distinguishes additive, behavior-tightening, and breaking changes.
- `RGP-002` and `tenant-commute-hub-boundary.md` now route standalone fallback
  contract consumption through `RGP-003` instead of treating repo-local shims as
  independent authority.

### Compatibility-note gate

- `compatibility-notes/README.md` states when a note is required and blocks
  review until the note, snapshot-refresh path, and clean-target smoke rerun
  exist.
- The README and `RGP-003` both now state that `OPX-GV-001` guardrail-only
  review may accept clean-target non-zero smoke evidence when the purpose is to
  prove stale consumer snapshots are detected and attached.

### Smoke guardrail

Command used on `2026-04-30`:

```sh
tmpdir=$(mktemp -d)
git clone --quiet ../tenant-commute-hub "$tmpdir/tenant-commute-hub"
TENANT_HUB_REPO_PATH="$tmpdir/tenant-commute-hub" \
  scripts/tenant-hub-contract-sync-smoke.sh
```

Observed result:

- target checkout started clean
- sync completed successfully
- command exited `2`
- post-sync drift remained in `src/lib/drts-shim/generated/index.ts`
- diff stat was `988 insertions(+), 9 deletions(-)`

Interpretation:

- the smoke script is proving the consumer snapshot is stale on a clean target
- the script is not masking drift behind a dirty local checkout
- the intended guardrail behavior is present: stale snapshot state becomes
  reviewer-visible evidence

## Reviewer decision rule

Approve `OPX-GV-001` if you agree that:

1. Contract authority remains core-repo-owned.
2. Consumer-impacting changes now have an explicit compatibility-note path.
3. The smoke command rejects dirty targets and surfaces stale clean-target
   snapshots with reviewer-visible diff evidence.

Do not require this task to refresh the external tenant snapshot to exit `0`.
That is future contract-refresh closeout work, not the governance guardrail
itself.

## Remaining follow-up after approval

- A future tenant-hub snapshot refresh should make the same smoke command return
  `0` on a clean target.
- Any breaking or behavior-tightening contract change must file a compatibility
  note before review approval.
