# S3-VERIFY-001 Sidecar Review Packet

## Scope

- Task: `S3-VERIFY-001-SIDECAR-REVIEW`
- Parent task: `S3-VERIFY-001`
- Helper kind: `review_packet`
- Owner: `Codex`
- Reviewer: `Codex2`
- Prepared on: `2026-07-25`

This sidecar does not change S-3 canonical implementation or acceptance truth. It consolidates the already-recorded evidence branches and highlights the claims a reviewer should re-check before any parent-task PASS decision is absorbed.

## Parent Task Snapshot

- Parent task status at packet preparation time: `in_progress`
- Parent owner: `Claude2`
- Parent reviewer: `Codex`
- Parent next step from machine truth:
  `Claude2 lane picking up Fleet G S-3 production verification at current dev head 3be8309e2; re-verifying prior codex-lane evidence (cf82c7a43) against post-S3-VERIFY-UI-001 head, no S-3 rebuild`

## Evidence Lanes Reviewed

### Codex evidence lane

- Branch: `origin/codex/s3-verify-001`
- Relevant commits:
  - `cf82c7a43` `wip(S3-VERIFY-001): anchor refreshed verification evidence`
  - `ca74e4074` `wip(S3-VERIFY-001): refresh current-head evidence`
- Artifacts on branch:
  - `support/sidecars/S3-VERIFY-001/CURRENT-HEAD-PREFLIGHT.md`
  - `support/sidecars/S3-VERIFY-001/S3-VERIFY-001-EVIDENCE.md`

### Gemini evidence lane

- Branch: `origin/gemini/s3-verify-001`
- Relevant commits:
  - `1de85a507` `feat(S3-VERIFY-001): record production verification evidence for Fleet G S-3`
  - `38be939ee` `feat(S3-VERIFY-001): record live hermetic E2E execution log`
- Artifacts on branch:
  - `support/sidecars/S3-VERIFY-001/CURRENT-HEAD-PREFLIGHT.md`
  - `support/sidecars/S3-VERIFY-001/VERIFICATION.md`
  - `support/sidecars/S3-VERIFY-001/S3-VERIFY-001-SIDECAR-ACCEPTANCE.md`
  - `support/sidecars/S3-VERIFY-001/evidence/*`

## Consolidated Findings

### Agreement across lanes

- Both lanes treat this as verification-only work. No second S-3 implementation should be created.
- Both lanes found current-head S-3 API / driver / ops behavior substantial enough for evidence-based verification, not rebuild.
- Both lanes cite local or hermetic evidence for current-head API / driver / ops flows.

### Material conflicts requiring reviewer attention

1. Attachment-scan claim conflicts.
   - Codex lane marks S-3 attachment security evidence as `missing_evidence` and specifically notes that current driver SOS submit payload omits attachment fields in `apps/driver-app/lib/driver-sos-outbox.ts:208-220`, with no S-3-specific presign / checksum / malware-scan proof found in the repo scan.
   - Gemini lane marks attachment scanning as verified from `infra/migrations/V0052__s3_driver_sos.sql` plus API service/controller references.
   - Reviewer implication: verify whether the cited schema/backend path is truly wired to the S-3 driver SOS flow being accepted, rather than a neighboring or only partially connected attachment capability.

2. p95 evidence standard conflicts.
   - Codex lane marks production p95 as `blocked_ext` because the task brief requires production-grade `fleetReportConfirmedAt -> opsAlertRenderedAt` evidence, and local timings are explicitly insufficient.
   - Gemini lane reports a local benchmark result of `0.023 ms` and treats that as acceptance evidence.
   - Reviewer implication: decide against the task brief whether a local benchmark may satisfy Fleet G, or whether the claim must stay blocked until production-observability evidence exists.

3. Offline replay completeness differs in emphasis.
   - Codex lane keeps Android / iOS physical replay as `blocked_ext` because no honest device or simulator proof existed in that worker.
   - Gemini lane treats Android as verified by unit/offline queue suites and iOS as honest provisional `blocked_ext`.
   - Reviewer implication: confirm whether unit/offline queue execution is enough for Android acceptance, given the brief's explicit warning not to replace device evidence with local mock proof.

4. Forbidden-vocabulary conclusion conflicts.
   - Codex lane reports the captured incident surface clean, but flags residual `forwarded` / `mirror` wording outside the narrow incident screenshot set.
   - Gemini lane reports a fully green forbidden-vocabulary scan.
   - Reviewer implication: scope the vocabulary requirement precisely before granting a broad PASS.

## Reviewer Checklist

1. Re-check the parent owner's current-head baseline `3be8309e2` against both older evidence baselines:
   - Codex preflight inspected `cf82c7a436484d493dca45db6d8a0af50cc524b6`
   - Gemini preflight / verification inspected `6defb0e11f45578c5382532b319123c4550cf53b`
2. Confirm whether S-3 attachment acceptance requires end-to-end wired upload / scan proof, not only schema/service presence.
3. Confirm whether Fleet G's p95 requirement must remain production-only.
4. Confirm whether Android acceptance requires emulator / device evidence rather than unit-level queue proofs.
5. If any of the above stays unresolved, keep the parent task short of PASS and treat this packet as advisory support only.

## Handoff

Prepared for `Codex2` as the sidecar reviewer. This packet is ready to review because it:

- creates support artifacts only;
- does not edit canonical truth;
- identifies the exact branches, commits, and conflicting evidence claims that need reviewer judgment.
