# PH1GC-DRV-MP-002 Manual Unblock

## Scope

- Task: `PH1GC-DRV-MP-002-UNBLOCK-MANUAL-UNBLOCK`
- Parent: `PH1GC-DRV-MP-002`
- Owner: `Codex2`
- Reviewer: `Codex`
- Audit date: `2026-05-22`

## Diagnosis

`PH1GC-DRV-MP-002` is not blocked by a missing repo-local implementation change.
It remains blocked because the acceptance for directive `§C DRV-MP-002` requires
real mobile-device and distribution evidence that cannot be produced from this
workspace.

1. The dependency gate is already cleared in machine truth. `PH1GC-DRV-MP-001`
   is `done` in `ai-status.json`, with the E2E-006 seed hardening recorded at
   commit `056e79f4d499d60e349939fec928f46bff083e1f` and PR `#239` open against
   `dev` as of `2026-05-22`.
2. The parent acceptance for `PH1GC-DRV-MP-002` explicitly requires
   `support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE/` on `origin/dev` with all
   11 directive `§C` evidence items, including Android install/signing, iOS
   install/TestFlight, push delivery, location permission, weak-network retry,
   forwarded task display, and earnings display.
3. The implementation spec at
   `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md`
   lists the same 11 evidence items and does not allow a repo-local fixture or
   synthetic substitute.
4. The status-truth audit at
   `docs/00-context/phase1-origin-dev-gap-closure-status-truth-20260522.md`
   still marks `support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE/` as missing.
5. The wave-planning runbook at
   `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`
   already classifies `WF-DRV-MP-001-DEVICE-EVIDENCE` as held on physical
   Android + iPhone hardware, weak-network test environment, and a
   human-in-loop run.

## Remaining Blocker

The remaining blocker is external provisioning, not code:

- physical Android and iPhone test devices
- Expo/EAS access for the build profile evidence
- Apple team / TestFlight signing access
- weak-network test environment for retry evidence
- human-in-loop execution to capture masked screenshots/video/logs

## Parent Resume Sequence

Once the external prerequisites are available:

1. Confirm `PH1GC-DRV-MP-001` remains merged or otherwise present on the branch
   used for evidence capture so the hardened E2E-006 behavior is the active
   baseline.
2. Create `support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE/` and populate all
   11 directive `§C` evidence items.
3. Apply PII masking to driver name and phone details in every artifact.
4. Update the corresponding `WF-DRV-MP-001` evidence/gate references so the row
   can move to `PASS (sandbox + device evidence)`.

## Conclusion

This helper does not unblock the parent by changing product code. It records
that `PH1GC-DRV-MP-002` is correctly `blocked` on external device-lab and
distribution prerequisites, and it defines the exact next step once those
resources exist.
