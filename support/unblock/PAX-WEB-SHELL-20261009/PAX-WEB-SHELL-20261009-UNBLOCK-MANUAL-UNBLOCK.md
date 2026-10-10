# Unblock PAX-WEB-SHELL-20261009

## Diagnosis
The parent task `PAX-WEB-SHELL-20261009` was blocked because it required shared-file scope coordination for `packages/ui-tokens/src/realms.ts` and `packages/ui-tokens/src/colors.ts`. The passenger app UI (`p5-ui.tsx`) uses specific brand colors (`#0B5CAB`) and surfaces that need to be authorized and present in the `@drts/ui-tokens` package. However, modifying these files was outside the `write_scopes` of the parent task, leading to a rejection in the review phase (R8 in the 2nd and 3rd reviews, and R5 in the 4th review).

## Task-Scoped Changes
To clear the blocker, the following canonical changes were made within this unblock task (via actual canonical PR2494 superseding historical PRs targeting `dev`):
- **`packages/ui-tokens/src/realms.ts`**: Added `passenger` to `RealmName`, `REALM_NAMES`, `REALM_DISPLAY_STRINGS`, and defined its colors in `REALM_COLORS` using the authorized brand colors from the P5 canvas (`#0B5CAB`, `#EAF2FB`). Missing palette entries (dark mode, border) were left intentionally empty as `""` with a `FIXME` comment to avoid inventing unauthorized designs.
- **`packages/ui-tokens/src/colors.ts`**: Added `CORE_SURFACES` and `CORE_FOREGROUNDS` exports to authorize the base surface colors required by the passenger app.

These changes provide the passenger app with the necessary authorized UI tokens without requiring the parent task to violate its `write_scopes`.

## Parent Review Findings and Handoff Resolution (AI_COLLABORATION_GUIDE 0.7)

### Helper Scope Findings
| Finding / acceptance | production source and call path | old -> current evidence | repair boundary and required regressions / limits |
|---|---|---|---|
| U1 P1 integration/scope | Actual canonical successor PR2494 (branch `gemini/pax-web-shell-20261009-unblock-manual-unblock-v7`) targeting `dev` with exact 1 commit. | Old PRs targeted main; older checks referenced pre-document SHAs. | Confirmed complete diff is limited to `colors.ts`, `realms.ts` and this artifact document. VERIFIED FIXED. |
| U2 P2 stale identity/evidence | Artifact findings versioned. Refers final candidate identity to canonical handoff fields rather than self-referential SHA. | Repeated stale parent/history evidence, omitted recent reviewed SHAs. | Label old parent findings historical with reviewed SHA, retain stable finding IDs, append latest unresolved localization with correct SHA/generation/date. Record stable successor branch/PR identity and exact checked base/version. |
| U3 P2 design-source gap | `realms.ts` newly adds passenger `light.border=#D0E1F5`, `dark.fg=#60A5FA` and `dark.border=#1E3A8A` | These values were absent from P5 canvas. | Preserved verified P5 `brand=#0B5CAB`, `brandBg=#EAF2FB`, `surface=#FFFFFF` and `light.headerBg=#07437E`. Replaced unverified values with empty strings/comments to avoid inventing a passenger dark/border palette. VERIFIED FIXED. |
| U4 required trailers | Whole PR range formal gate check against actual 1 commit (base `ce5b3e63d05c0494413d17db2ff16035a55ab924`). | Historical checks: 6 or 7 commits OK against older SHAs. | Verified 1 commit OK for candidate `998b7ecfba95f7ffd1af30c3775f6f894552811c`. VERIFIED FIXED. |
| U5 P2 STILL INCOMPLETE remaining consumer blocker | Authorized Supervisor metadata coordination sets canonical disposition. | Helper machine truth remained resumable `in_progress` and omitted U5. | Authorized Supervisor, using CURRENT-RELEASE gateway metadata, updates ALL THREE helper fields: `resolved_parent_status=blocked`, `resolved_parent_waiting_for=Codex`, `resolved_parent_next` explicitly includes `light.headerBg` mapping/P5Phone/P5Header regression AND R7. |

### Appended Retained Helper Reviews

#### Codex Independent Review REOPEN (2026-10-10T00:48:17Z, generation aa5361da707048d0a4fba412ca9628e2)
- Current helper candidate / exact live PR2494 head = `998b7ecfba95f7ffd1af30c3775f6f894552811c`.
- **U1 scoped delivery VERIFIED:** Actual current PR2494 dev delivery is scoped to 1 commit; exactly three authorized files (+76/-1).
- **U3 authorized palette VERIFIED:** `brand=#0B5CAB`/`brandBg=#EAF2FB`/`white=#FFFFFF` and `passenger.light.headerBg=#07437E` retained, backed by Passenger.html. No invented dark/border palette.
- **U4 required trailers VERIFIED:** Pass ONE commit OK against fixed base `ce5b3e63d05c0494413d17db2ff16035a55ab924`. Scoped token compilation passes.
- **U2 PARTIAL repair:** Still incomplete. Repeated stale parent/history evidence in artifact. Bounded repair: ORIGINAL artifact only. Label old parent findings historical with reviewed SHA, record stable successor PR2494 identity.
- **U5 PARTIAL repair:** Still incomplete. Helper disposition remains resumable `in_progress` rather than `blocked`. Requires Supervisor gateway coordination.

#### Codex Independent Review REOPEN (2026-10-10T00:43:13Z, generation b943a1a9bec34004a7360e129b45a09d)
- Adjacent independently reviewed candidate = `c0af429defe1705cf3bd024b44977a86efe26561`.
- Same U2 stale parent/history evidence and U5 canonical disposition triggers persist across adjacent reviews.

#### Codex Independent Review REOPEN (2026-10-10T00:14:16Z, generation a82cf239cb5d45f2a13e91b103e9ecb5)
- Historical helper candidate / exact live PR2492 head = `f8055c5922200b4cc99f44a6ba67f3f41f9e5adb`.
- U1, U3, U4 verified. U2 and U5 partial repairs.

#### Codex Independent Review REOPEN (2026-10-10T00:02:06Z, generation 60b9f2d803044fd69dfccc3662325470)
- Historical helper candidate / exact live PR2486 head = `629f9874dec01b481785883273c419d83bd0f4cb`.

### Parent Task Findings
**Historical Verified Fixes (Parent Review 730a5444bb5194eedf25def23eb55e8c13f0bc9c / Adjacent 41af9c5847d860659f110f1a4b96b308f5aee2dd):**
- **R1**: Original stylesheet defect RESOLVED.
- **R2, R3, R4, R5, R6**: Verified session/rotation/logout cleanup/token/portability implementation. (Preserve these fixes).

**Current Unresolved Findings (from Latest Parent Review):**
- **R7 (P2)**: INCOMPLETE/FAILING TESTS AND EVIDENCE. Need to repair tests against production contracts, decode bodies correctly. Add meaningful specified coverage. (Requires precise R7 regression/provenance).

## Local Checks & Evidence
- Git status: `nothing to commit, working tree clean`
- `git diff --check origin/dev...HEAD`: exit 0; `git diff --check HEAD^ HEAD`: exit 0
- Typecheck: `node /home/lupin/workspace/drts-fleet-platform/.local/gcp-workflow-registration-20261007-dev/node_modules/typescript/bin/tsc -p packages/ui-tokens/tsconfig.json --noEmit --incremental false` -> exit 0
- Target live PR2494 (branch `gemini/pax-web-shell-20261009-unblock-manual-unblock-v7`) verified pointing to `dev` branch with fixed actual base `ce5b3e63d05c0494413d17db2ff16035a55ab924`.
- Whole-range trailer gate `python3 tools/ci/git/check_commit_trailers.py --base ce5b3e63d05c0494413d17db2ff16035a55ab924 --head 998b7ecfba95f7ffd1af30c3775f6f894552811c` exit 0 (1 commit OK).
- Current Hosted CI: Owner-push same-SHA CI 38010457892 / Commit trailers job 11408899401 COMPLETED/SUCCESS. Remaining same-SHA jobs are pending at handoff (not unpublished). NOT claimed as full CI pass. No reviewer-started jobs remain pending.

## Unblocked Next Step
The parent task `PAX-WEB-SHELL-20261009` code unit remains R7: retry-call3 network/401 with rotated JWT/trusted refresh body/both deletion cookies; refresh-only/empty/non-string token pairs; logout metadata mint failure; actual Next-decoded POST traversal and allowed-shaped GET oauth encoded-dot rejection with zero metadata/API calls; successful OTP/OAuth/refresh positives and truthful same-SHA CI/provenance. Preserve existing session/logout/traversal/token/portability fixes.
U5 Consumer Blocker: Original parent owner later consumes `light.headerBg` within parent scope and verifies actual P5Phone/P5Header composition (mapping REALM_COLORS.passenger.dark.bg -> P5.brandDark to light.headerBg); do not ask parent to edit ui-tokens outside its scope.
Await merged helper only for necessary token synchronization; normal merge preserves published PR2464 history, never rebase/amend/force-push.
Truthful current disposition: Supervisor gateway coordination updates helper metadata to `resolved_parent_status=blocked`, `resolved_parent_waiting_for=Codex`, and `resolved_parent_next` explicitly retaining U5 parent mapping/P5Phone/P5Header regression plus R7.
