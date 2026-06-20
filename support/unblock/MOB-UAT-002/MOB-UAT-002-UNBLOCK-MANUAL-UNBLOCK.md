# MOB-UAT-002 Manual Unblock Note

Last updated: 2026-06-20
Task: `MOB-UAT-002-UNBLOCK-MANUAL-UNBLOCK`
Parent task: `MOB-UAT-002`
Owner: `Codex`
Reviewer: `Codex2`

## Summary

`MOB-UAT-002` remains blocked for a valid external reason. It is not blocked by
missing `MOB-APP-003` / `MOB-APP-004` implementation, and it does not need
branch or history repair.

`UAT-MOB-IOS-001` in
`docs/02-architecture/phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md`
`§11.4` requires real iOS/device-only behavior checks:

- Low Power Mode
- iOS background indicator
- OS termination
- user force-quit limitation
- reopen recovery

Those checks cannot be produced honestly from this workspace. The correct
unblock action is therefore a human/TestFlight evidence pass on the existing
parent branch, not more repo-local implementation work.

## What Is Already True

- `origin/dev @ 7ca26192adf4b83f74b4d1801d30138077396642` already contains the
  dependency commits:
  - `643257bcd5f7da26776de0f8911de69eddd25e46`
    `MOB-APP-003: driver pre-online permission gate + device/identity reason surfacing`
  - `7f7e97d0ea37563983251bca320ff48a1e0cf747`
    `MOB-APP-004: driver-app restart recovery + tracking-gap detection`
- The parent already has a normal pushed evidence branch:
  - `origin/claude/mob-uat-002 @ 553492bc5624d4772a5b9ef377ef873eda2ffe7a`
  - unique task file:
    `docs/05-ui/driver-app-ios-physical-device-uat-evidence-pack-20260620.md`
- That parent commit is an operator-fillable scaffold, not a pass claim:
  - `553492bc5`
    `MOB-UAT-002: iOS physical-device UAT evidence-pack scaffold (SD §11.4)`
- Relative to `origin/dev`, the parent branch carries exactly one unique task
  commit and does not mix unrelated product-code changes.

## Diagnosis

This is a real external UAT blocker, not a dependency blocker.

1. `MOB-APP-003` and `MOB-APP-004` are already present on trunk, so the parent
   is dependency-ready from a code standpoint.
2. The parent branch already spells out the exact iOS runbook/evidence
   expectations in the pushed scaffold commit.
3. SD `§11.4` requires iOS-only OS behaviors on a physical iPhone:
   Low Power Mode, iOS background indicator, OS termination, user force-quit
   limitation, and reopen recovery.
4. Those behaviors require a signed iOS build, a real iPhone, and a human
   operator or TestFlight tester.
5. No repo-local automation can honestly fabricate that evidence, so the parent
   should remain blocked until the human evidence pass occurs.

## Remaining Blocker

The remaining blocker is external mobile-distribution and handset execution:

- physical iPhone with iOS background-location behavior
- TestFlight or signed dev-client / UDID installation path
- human operator to toggle Low Power Mode, background the app, force-quit it,
  and capture screenshots or recordings
- ops/backend observation during the run to confirm heartbeat continuity and
  honest gap reporting

## Concrete Next Step For `MOB-UAT-002`

Keep the parent blocked, but replace vague dependency language with the actual
operator sequence:

1. Reuse `origin/claude/mob-uat-002 @ 553492bc5`.
2. On a real iPhone, execute the scaffold in
   `docs/05-ui/driver-app-ios-physical-device-uat-evidence-pack-20260620.md`.
3. Fill each scenario row with real capture artifacts and verdicts, especially
   `IOS-LP-01`, `IOS-BG-01`, `IOS-OT-01`, `IOS-FQ-01`, and `IOS-RR-01`.
4. Push the evidence update with a normal non-force push.
5. Hand the parent to `Claude2` for review only after the evidence pack is
   filled with real-device results.

## Non-Claim

This note does not claim that `MOB-UAT-002` already passed iOS UAT, does not
claim that the scaffold file is already on `origin/dev`, and does not mark the
parent `done`.

## Verification Performed

- read `AI_COLLABORATION_GUIDE.md`
- read `docs/ops/branch-strategy.md`
- read `.orchestrator/skills/worker-anchor-commit.md`
- checked machine truth with:
  - `AI_NAME=Codex scripts/ai-status.sh show MOB-UAT-002`
  - `AI_NAME=Codex scripts/ai-status.sh show MOB-UAT-002-UNBLOCK-MANUAL-UNBLOCK`
  - `AI_NAME=Codex scripts/ai-status.sh show MOB-UAT-002-UNBLOCK-HISTORY-REPAIR`
- inspected spec and prior evidence:
  - `sed -n '1680,1785p' docs/02-architecture/phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md`
  - `sed -n '1,220p' docs/04-uat/driver-mobile-real-device-test-report-20260519.md`
  - `git show origin/claude/mob-uat-002:docs/05-ui/driver-app-ios-physical-device-uat-evidence-pack-20260620.md`
- inspected git state:
  - `git fetch origin --quiet`
  - `git rev-parse origin/dev origin/claude/mob-uat-002`
  - `git rev-list --left-right --count origin/dev...origin/claude/mob-uat-002`
  - `git diff --name-only origin/dev...origin/claude/mob-uat-002`
  - `git log --oneline origin/dev..origin/claude/mob-uat-002`
  - `git log --oneline origin/claude/mob-uat-002..origin/dev`
  - `git branch -r --contains 643257bcd5f7da26776de0f8911de69eddd25e46`
  - `git branch -r --contains 7f7e97d0ea37563983251bca320ff48a1e0cf747`
  - `git show --no-patch --format=fuller 553492bc5624d4772a5b9ef377ef873eda2ffe7a 643257bcd5f7da26776de0f8911de69eddd25e46 7f7e97d0ea37563983251bca320ff48a1e0cf747`

No runtime tests were run in this helper task. This change records unblock
diagnosis and machine-truth guidance only.
