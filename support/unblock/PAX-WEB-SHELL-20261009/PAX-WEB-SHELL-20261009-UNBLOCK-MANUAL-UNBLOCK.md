# Unblock PAX-WEB-SHELL-20261009

## Diagnosis
The parent task `PAX-WEB-SHELL-20261009` was blocked because it required shared-file scope coordination for `packages/ui-tokens/src/realms.ts` and `packages/ui-tokens/src/colors.ts`. The passenger app UI (`p5-ui.tsx`) uses specific brand colors (`#0B5CAB`) and surfaces that need to be authorized and present in the `@drts/ui-tokens` package. However, modifying these files was outside the `write_scopes` of the parent task, leading to a rejection in the review phase (R8 in the 2nd and 3rd reviews, and R5 in the 4th review).

## Task-Scoped Changes
To clear the blocker, the following canonical changes were made within this unblock task (via actual canonical PR #2492 on v5 at f8055c59 superseding historical PRs #2486/#2473 targeting `dev`):
- **`packages/ui-tokens/src/realms.ts`**: Added `passenger` to `RealmName`, `REALM_NAMES`, `REALM_DISPLAY_STRINGS`, and defined its colors in `REALM_COLORS` using the authorized brand colors from the P5 canvas (`#0B5CAB`, `#EAF2FB`). Missing palette entries (dark mode, border) were left intentionally empty as `""` with a `FIXME` comment to avoid inventing unauthorized designs.
- **`packages/ui-tokens/src/colors.ts`**: Added `CORE_SURFACES` and `CORE_FOREGROUNDS` exports to authorize the base surface colors required by the passenger app.

These changes provide the passenger app with the necessary authorized UI tokens without requiring the parent task to violate its `write_scopes`.

## Parent Review Findings and Handoff Resolution (AI_COLLABORATION_GUIDE 0.7)

### Helper Scope Findings
| Finding / acceptance | production source and call path | old -> current evidence | repair boundary and required regressions / limits |
|---|---|---|---|
| U1 P1 integration/scope | Actual canonical current PR #2492 on v5 at f8055c59 targets `dev`. Historical PR #2486/PR #2473 labeling retained. | Old PRs targeted main; older checks referenced pre-document SHAs. | Confirmed complete diff is limited to `colors.ts`, `realms.ts` and this artifact document. VERIFIED FIXED. |
| U2 P2 stale identity/evidence | Document referenced prior PR/candidate as current, reducing unresolved findings. | Labeled PR2486/v2/629f9874 checks and hosted observations historical. Referenced final delivery via actual PR2492/v5 (f8055c59 / a82cf239cb5d45f2a13e91b103e9ecb5). | Preserved latest unresolved U2/U5 localization and partial credits. Recorded real current scoped check version/results and honest hosted status. |
| U3 P2 design-source gap | `realms.ts` newly adds passenger `light.border=#D0E1F5`, `dark.fg=#60A5FA` and `dark.border=#1E3A8A` | These values were absent from P5 canvas. | Preserved verified P5 `brand=#0B5CAB`, `brandBg=#EAF2FB`, `surface=#FFFFFF`. Replaced unverified values with empty strings/comments to avoid inventing a passenger dark/border palette. |
| U4 required trailers | Whole PR range formal gate check against actual 6 commits. | Historical checks: 2-3 commits OK against older SHAs `1cbef7c`, `d0b132`; 5 commits for `629f9874`. | Verified 6 commits OK for candidate `f8055c5922200b4cc99f44a6ba67f3f41f9e5adb`. VERIFIED FIXED. |
| U5 P2 STILL INCOMPLETE remaining consumer blocker | Artifact and canonical helper/parent disposition must explicitly agree on consuming the light-header token. | Helper supplied token but disposition remained resumable and omitted U5. | Preserved delivered `light.headerBg`. Recorded helper `resolved_parent_status=blocked`, `resolved_parent_waiting_for=Codex`, and `resolved_parent_next` explicitly retaining U5 parent consumption/P5Phone/P5Header regression plus R7. |

### Appended Retained Helper Reviews

#### Codex Independent Review REOPEN (2026-10-10T00:14:16Z, generation a82cf239cb5d45f2a13e91b103e9ecb5)
- Current helper candidate / exact live PR2492 head = `f8055c5922200b4cc99f44a6ba67f3f41f9e5adb`.
- **U1 scoped delivery VERIFIED:** Actual current PR2492 dev delivery is scoped; retain normal published history.
- **U3 authorized palette VERIFIED:** `brand=#0B5CAB`/`brandBg=#EAF2FB`/`white=#FFFFFF` and `passenger.light.headerBg=#07437E` retained, backed by Passenger.html. No invented dark/border palette.
- **U4 required trailers VERIFIED:** Pass SIX commits; scoped token compilation passes.
- **U2 PARTIAL repair:** Removed explicit old literal CURRENT candidate SHA; latest 629f9874 review identity now present.
- **U5 PARTIAL repair:** Artifact explicitly retains original parent-owner headerBg consumption and mentions blocked disposition, but helper machine truth remained resumable.

#### Codex Independent Review REOPEN (2026-10-10T00:02:06Z, generation 60b9f2d803044fd69dfccc3662325470)
- Historical helper candidate / exact live PR2486 head = `629f9874dec01b481785883273c419d83bd0f4cb`.
- **U1 scoped delivery RETAINED:** Exact current head/remote v2 match, 5 commits, historical PR2473 labeling retained.
- **U3 authorized palette RETAINED:** `brand=#0B5CAB`/`brandBg=#EAF2FB`/`white=#FFFFFF` retained; NEW `passenger.light.headerBg=#07437E` correctly backed by canonical canvas.
- **U4 required trailers VERIFIED:** Pass FIVE commits.
- **U2 P2 STILL INCOMPLETE:** Current delivery/evidence context still references the prior PR/candidate (PR2486/629f9874 instead of PR2492/f8055c59), and latest unresolved findings remain reduced to partial/all-fixed assertions.
- **U5 P2 STILL INCOMPLETE:** Remaining-blocker helper disposition still contradicts the canonical parent and artifact. Helper disposition remains resumable and omits U5. Document newly claimed resolved_parent_status=blocked but this did NOT occur in helper machine truth.

#### Codex Independent Review REOPEN (2026-10-09T23:49:33Z, generation e1217f5f6a6c484bbe33771382251ba5)
- Adjacent candidate = `23739291f1c6d6c12f0ffb781adc9b607c625375`.
- Highlighted U2/U5 still incomplete and required retaining precise repair boundaries.

#### Codex Independent Review REOPEN (2026-10-09T23:38:41Z, generation 2e88bf4ee8f8453fb33ffbc848ece594)
- Historical helper candidate = `d0b132eecdbf1ad6d5706d8eb14e8f0c0c0b1373`.
- Adjacent independently reviewed helper: `1cbef7cdf5d6863d0fdd0fc8c76bd8793e58dc22`, generation `7130fdb84afc4ae9b4b462d0acc61cbc`.

### Parent Task Findings (from Review of Parent Task)
Latest parent reviewer worker_outcomes at 2026-10-09T18:26:23Z reviewed `730a5444bb5194eedf25def23eb55e8c13f0bc9c` against `41af9c5847d860659f110f1a4b96b308f5aee2dd`.
- **R1, R2, R3, R4, R5, R6**: Verified FIXED in parent. Session/refresh/logout/traversal/white-token/portability fixes are verified and must be preserved.
- **R7 (P2)**: UNRESOLVED. Exact test/provenance cases remain. Parent must add: retry-call3 network/401 parameterization asserting rotated JWT/trusted body/both deletion cookies; refresh-only/empty/non-string pairs; logout metadata-mint failure; actual Next-decoded POST traversal and allowed-shaped GET oauth encoded-dot rejection with no metadata/API calls; real successful OTP/OAuth/refresh positives and truthful CI/provenance.
- **R8 (P1)**: UNRESOLVED in parent. Shared-file scope coordination for `packages/ui-tokens/src/realms.ts` and `packages/ui-tokens/src/colors.ts`. This unblock helper task delivers the required authorized tokens, providing the exact shared-file scope coordination. Parent will use the tokens merged by this helper to resolve R8 without rewriting out-of-scope files.

## Local Checks & Evidence
- Git status: `nothing to commit, working tree clean`
- `git diff --check origin/dev...HEAD`: exit 0; `git diff --check HEAD^ HEAD`: exit 0
- Typecheck: `node /home/lupin/workspace/drts-fleet-platform/.local/gcp-workflow-registration-20261007-dev/node_modules/typescript/bin/tsc -p packages/ui-tokens/tsconfig.json --noEmit --incremental false` -> exit 0
- Target PR #2492 verified pointing to `dev` branch.
- Whole-range trailer gate `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head f8055c5922200b4cc99f44a6ba67f3f41f9e5adb` exit 0 (6 commits OK).
- Historical Checks: PR2486 / 629f9874 had 5 commits OK, hosted CI 38007054649/38007054704.
- Current Hosted CI: Owner-push same-SHA CI 38008021788 completed/CANCELLED; integration 38008022091 queued/conclusion null, both head_sha f8055c59. NOT a full CI pass. No reviewer-started jobs remain pending.

## Unblocked Next Step
The parent task `PAX-WEB-SHELL-20261009` code unit remains R7: retry-call3 network/401 with rotated JWT/trusted refresh body/both deletion cookies; refresh-only/empty/non-string token pairs; logout metadata mint failure; actual Next-decoded POST traversal and allowed-shaped GET oauth encoded-dot rejection with zero metadata/API calls; successful OTP/OAuth/refresh positives and truthful same-SHA CI/provenance. Preserve existing session/logout/traversal/token/portability fixes.
U5 Consumer Blocker: Original parent owner later consumes `light.headerBg` within parent scope and verifies actual P5Phone/P5Header composition (mapping REALM_COLORS.passenger.dark.bg -> P5.brandDark to light.headerBg); do not ask parent to edit ui-tokens outside its scope.
Await merged helper only for necessary token synchronization; normal merge preserves published PR2464 history, never rebase/amend/force-push. Truthful current blocked disposition (`resolved_parent_status=blocked`, waiting for Codex) is aligned through the authorized roles.