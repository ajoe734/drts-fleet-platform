# PARTNER-ELIG-LIVE-001 — Manual Unblock Note

Status: owner diagnosis for `PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK`  
Date: 2026-05-19  
Owner: `Codex2`  
Reviewer: `Claude2`

## Summary

`PARTNER-ELIG-LIVE-001` is not actually "dependency-ready" yet in machine
truth. The parent depends on `PRT-SPEC-001`, and that dependency is still
`review`, not `done`, in `ai-status.json`.

After `PRT-SPEC-001` closes, the remaining hold is the already-documented live
issuer external gate in `EXT-001`, not a missing repo implementation.

## Diagnosis

### 1. Immediate blocker: dependency is still open

`ai-status.json` currently records:

- `PRT-SPEC-001` status = `review`
- artifact path = `docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md`
- latest next field = wording reconciliation anchored at commit `94eefd1`

That means the parent helper was created under the assumption that the spec
dependency was already satisfied, but current machine truth says otherwise.
Until `PRT-SPEC-001` is review-approved and closed, `PARTNER-ELIG-LIVE-001`
should not be described as dependency-ready.

### 2. Remaining blocker after dependency close: external issuer inputs

The live hold is still the `EXT-001` packet:

- `EXT-001-BLK-001` issuer / bank API contract authority
- `EXT-001-BLK-002` sandbox credentials and network allowlist
- `EXT-001-BLK-003` allowed eligible / ineligible / timeout fixture matrix
- `EXT-001-BLK-004` timeout and retry behavior confirmation
- `EXT-001-BLK-005` manual-review fallback business sign-off
- `EXT-001-BLK-006` sensitive-data handling and retention approval

Those blockers are explicitly called out in:

- `support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md`
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
- `docs/03-runbooks/master-system-closeout-checklist.md` §D-4a

## What This Helper Changes

This helper does not change the product contract or claim live issuer closure.
It only documents the real unblock sequence so the parent task can carry the
correct next step.

## Concrete Next Step For Parent

1. Finish `PRT-SPEC-001` review/closeout so the partner eligibility spec is
   durable in machine truth as a completed dependency.
2. Keep `PARTNER-ELIG-LIVE-001` in `blocked` status after that closeout,
   because live issuer proof still depends on `EXT-001-BLK-001` through
   `EXT-001-BLK-006`.
3. When issuer/bank inputs arrive, attach the credential/fixture/sign-off
   evidence under `support/sidecars/PARTNER-ELIG-LIVE-001/` and resume the live
   sandbox / issuer proof task from that packet.

## Non-Claims

- This helper does not claim issuer sandbox proof exists.
- This helper does not treat `manual_review` as issuer approval.
- This helper does not reopen product planning; the remaining gap is execution
  evidence plus external credentials.

## Evidence Read

- `ai-status.json`
- `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
- `docs/03-runbooks/master-system-closeout-checklist.md`
- `docs/02-architecture/phase1-issuer-eligibility-integration-contract-20260429.md`
- `support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md`
- `git show 618d7c9:docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md`
- `git show 94eefd1:docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md`
