# WF-DRV-MP-001-DEVICE-EVIDENCE Manual Unblock

- Task: `WF-DRV-MP-001-DEVICE-EVIDENCE-UNBLOCK-MANUAL-UNBLOCK`
- Parent: `WF-DRV-MP-001-DEVICE-EVIDENCE`
- Owner: `Claude2`
- Reviewer: `Codex2`
- Date: `2026-05-19`
- Status: `documented remaining external blocker`

## Diagnosis

`WF-DRV-MP-001-DEVICE-EVIDENCE` is no longer blocked by repo code or by its
declared dependency.

- `WF-DRV-MP-001-MATRIX` is already `done` (closeout commit `297d25b`,
  `origin/codex2/wf-drv-mp-001-matrix`), so the dependency gate is satisfied.
- The matrix row in `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
  already cites `E2E-006` and `DRV-DEVICE-001` evidence and carries an explicit
  `remaining-non-claim` for real Android / iPhone, so the documentation rail is
  intact.
- The remaining hold is the live mobile-device evidence flow itself, which is
  externally gated by `EXT-003-BLK-001` through `EXT-003-BLK-007` plus physical
  hardware and a human-in-loop operator that cannot be scheduled from inside
  the repo.

This means the parent should stay blocked until the external hardware +
operator package exists; the unblock action for this child is to record the
missing inputs, the chair-suggested scheduling visibility field, and the exact
next step once hardware + operator arrive.

## Remaining Blocker

The smallest unblockable unit is the real-device evidence run on both device
families with a credentialed human operator. The blocker decomposes into:

1. Expo / Apple / Android distribution credentials and signing inputs already
   tracked under `EXT-003-BLK-001`, `EXT-003-BLK-002`, `EXT-003-BLK-003`, and
   `EXT-003-BLK-005`.
2. Internal tester group with opt-in evidence (`EXT-003-BLK-004`) and release
   channel owner with rollback policy (`EXT-003-BLK-006`).
3. Install evidence — build URL / artifact hash, install log, first-launch
   identity proof (`EXT-003-BLK-007`).
4. Physical Android handset + iPhone with network-conditioning capability
   (weak / offline) and screen-capture access.
5. A scheduled human-in-loop operator to execute and capture the RD-01..RD-13
   scenarios listed in
   `docs/04-uat/driver-mobile-real-device-test-report-20260519.md` §3.
6. An explicit product decision whether `task notify` (RD-08) must be satisfied
   by native push delivery or whether in-app refresh / badge is sufficient for
   release — `apps/driver-app` currently shows no `expo-notifications` / push
   token integration, so the answer changes the evidence shape required.

## Hardware + Human-In-Loop Scheduling Status

(Per chair recommended-focus item at
`.orchestrator/chair-reviews/20260519T151308Z-claude.md`.)

| Field                                  | Current value           |
| -------------------------------------- | ----------------------- |
| Android handset secured                | not scheduled           |
| iPhone handset secured                 | not scheduled           |
| Weak-network test environment          | not scheduled           |
| Credentialed human-in-loop operator    | not scheduled           |
| Tester group / Expo + Apple + Android  | external-gated (EXT-003)|
| Native-push scope decision             | not decided             |

Until at least one Android, one iPhone, and one operator are scheduled, the
parent must remain `blocked`. Next chair triage can use this field to decide
whether to keep HOLD or downgrade evidence scope (for example, accept in-app
refresh only for RD-08).

## Concrete Parent Next Step

Once hardware + operator + native-push scope decision are in place, resume
`WF-DRV-MP-001-DEVICE-EVIDENCE` with this sequence:

1. Resolve `EXT-003-BLK-001` through `EXT-003-BLK-007` and attach the install
   artifacts + tester group + release channel owner evidence under
   `support/sidecars/EXT-003/`.
2. Execute scenarios `RD-01` through `RD-13` in
   `docs/04-uat/driver-mobile-real-device-test-report-20260519.md` §3 on both
   Android and iPhone, attaching the eight follow-up evidence items listed in
   that report §7 (install artifact, registration/binding, presence toggle,
   bind/unbind, owned-task accept, forwarded-task route-locked, completion
   negative-path, weak-network replay, earnings-by-platform).
3. Promote the test report from `provisional` to a real-device pass artifact
   and update its `Overall read` field.
4. Upgrade the matrix row evidence cell in
   `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` from the
   `remaining-non-claim` HOLD note to a real-device PASS citation.

Recommended machine-truth wording for the parent:

> Await Android + iPhone hardware, weak-network environment, credentialed
> human-in-loop operator, and `EXT-003-BLK-001..007` resolution. Once available,
> execute RD-01..RD-13 from the driver mobile real-device test report and
> promote that report plus the matrix row evidence cell.

## Why No Canonical Code Change Was Needed

The blocker is external resource sourcing plus one scope decision, not missing
repo implementation:

- The chair review at `.orchestrator/chair-reviews/20260519T151308Z-claude.md`
  classified this as `manual_unblock`, not `planning_decision`, because the
  product / contract / canonical decision rail is already complete.
- The matrix row, the driver mobile real-device test report, the mobile
  distribution gate sidecar, and the native dev runbook already encode the
  evidence shape; only the live execution remains.
- The repo correctly carries `remaining-non-claim` instead of overclaiming a
  real-device PASS, so no semantic correction is needed.

## Source Pointers

- `ai-status.json` entry for `WF-DRV-MP-001-DEVICE-EVIDENCE`
- `ai-status.json` entry for `WF-DRV-MP-001-MATRIX` (dependency, now `done`)
- `.orchestrator/chair-reviews/20260519T151308Z-claude.md`
- `support/sidecars/EXT-003/EXT-003-MOBILE-DISTRIBUTION-GATE.md`
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
- `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`
- `docs/04-uat/driver-mobile-real-device-test-report-20260519.md`
- `docs/03-runbooks/driver-app-native-dev-runbook.md`
