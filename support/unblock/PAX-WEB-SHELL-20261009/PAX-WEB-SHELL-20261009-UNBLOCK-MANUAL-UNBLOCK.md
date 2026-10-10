# Unblock PAX-WEB-SHELL-20261009

## Diagnosis
The parent task `PAX-WEB-SHELL-20261009` was blocked because it required shared-file scope coordination for `packages/ui-tokens/src/realms.ts` and `packages/ui-tokens/src/colors.ts`. The passenger app UI (`p5-ui.tsx`) uses specific brand colors (`#0B5CAB`) and surfaces that need to be authorized and present in the `@drts/ui-tokens` package. However, modifying these files was outside the `write_scopes` of the parent task, leading to a rejection in the review phase (R8 in the 2nd and 3rd reviews, and R5 in the 4th review).

## Task-Scoped Changes
To clear the blocker, the following canonical changes were made within this unblock task (via actual canonical PR2487 at e952db0ad4e5 superseding historical PRs #2492/#2486/#2473 targeting `dev`):
- **`packages/ui-tokens/src/realms.ts`**: Added `passenger` to `RealmName`, `REALM_NAMES`, `REALM_DISPLAY_STRINGS`, and defined its colors in `REALM_COLORS` using the authorized brand colors from the P5 canvas (`#0B5CAB`, `#EAF2FB`). Missing palette entries (dark mode, border) were left intentionally empty as `""` with a `FIXME` comment to avoid inventing unauthorized designs.
- **`packages/ui-tokens/src/colors.ts`**: Added `CORE_SURFACES` and `CORE_FOREGROUNDS` exports to authorize the base surface colors required by the passenger app.

These changes provide the passenger app with the necessary authorized UI tokens without requiring the parent task to violate its `write_scopes`.

## Parent Review Findings and Handoff Resolution (AI_COLLABORATION_GUIDE 0.7)

### Helper Scope Findings
| Finding / acceptance | production source and call path | old -> current evidence | repair boundary and required regressions / limits |
|---|---|---|---|
| U1 P1 integration/scope | Actual canonical current candidate is PR2487 at e952db0ad4e5 (generation 99a64ea9be504da2ba274a5de7cad673). Historical PR2492/PR2486/PR2473 labeling retained. | Old PRs targeted main; older checks referenced pre-document SHAs. | Confirmed complete diff is limited to `colors.ts`, `realms.ts` and this artifact document. VERIFIED FIXED. |
| U2 P2 stale identity/evidence | Document references immutable canonical handoff identity (candidate_sha: e952db0ad4e5, generation: 99a64ea9be504da2ba274a5de7cad673, PR2487). | Referenced final delivery via historical PR2492 (f8055c59). | Preserved latest unresolved U2/U5 localization and partial credits. Recorded real current scoped check version/results and honest hosted status. |
| U3 P2 design-source gap | `realms.ts` newly adds passenger `light.border=#D0E1F5`, `dark.fg=#60A5FA` and `dark.border=#1E3A8A` | These values were absent from P5 canvas. | Preserved verified P5 `brand=#0B5CAB`, `brandBg=#EAF2FB`, `surface=#FFFFFF`. Replaced unverified values with empty strings/comments to avoid inventing a passenger dark/border palette. |
| U4 required trailers | Whole PR range formal gate check against actual 7 commits. | Historical checks: 6 commits OK against older SHA `f8055c59`. | Verified 7 commits OK for candidate `e952db0ad4e514d944839c5f0828abf119668168`. VERIFIED FIXED. |
| U5 P2 STILL INCOMPLETE remaining consumer blocker | Artifact must acknowledge that gateway coordination is pending. | Claimed helper disposition was already aligned, but machine truth remained resumable and omitted U5. | Preserved delivered `light.headerBg`. Documented that Supervisor gateway coordination for updating helper metadata (blocked, waiting for Codex, retaining U5/R7 next) is pending. |

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
- **R1**: Original stylesheet defect RESOLVED.
- **R2 (P1)**: PARTIALLY RESOLVED refresh failure boundary. Needs complete shared refresh/retry boundary handling mint/body-read/fetch/parse/HTTP/invalid-token failures.
- **R3 (P1)**: REJECTED LOGOUT STILL REPORTED SUCCESS. Need to revoke actual ACCOUNT session with current credentials, support documented refresh-only logout semantics, propagate rejected revocation.
- **R4 (P1)**: ORIGINAL AUTO-REFRESH TRUSTED-IDENTITY DEFECT RESOLVED.
- **R5 (P1)**: PARTIALLY RESOLVED UI FIXTURE/DESIGN. Need actual marker/location input, represent authoritative registration validity separately. Preserve canvas structure and token requirement. Use tokens from this unblock helper.
- **R6 (P2)**: PARTIALLY RESOLVED PACKAGE ACCEPTANCE. Add executable portability/export check to CI. Clear/update view-model on logout.
- **R7 (P2)**: INCOMPLETE/FAILING TESTS AND EVIDENCE. Need to repair tests against production contracts, decode bodies correctly. Add meaningful specified coverage.

## Local Checks & Evidence
- Git status: `nothing to commit, working tree clean`
- `git diff --check origin/dev...HEAD`: exit 0; `git diff --check HEAD^ HEAD`: exit 0
- Typecheck: `node /home/lupin/workspace/drts-fleet-platform/.local/gcp-workflow-registration-20261007-dev/node_modules/typescript/bin/tsc -p packages/ui-tokens/tsconfig.json --noEmit --incremental false` -> exit 0
- Target PR2487 verified pointing to `dev` branch.
- Whole-range trailer gate `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head e952db0ad4e514d944839c5f0828abf119668168` exit 0 (7 commits OK).
- Historical Checks: PR2492 / f8055c59 had 6 commits OK, hosted CI 38008021788/38008022091.
- Current Hosted CI: Owner-push same-SHA (e952db0ad4e5) CI 38008568725 and integration 38008568562 are in_progress/conclusion null; earlier same-SHA 38008562825/38008562877 completed/cancelled. NOT a full CI pass. No reviewer-started jobs remain pending.

## Unblocked Next Step
The parent task `PAX-WEB-SHELL-20261009` code unit remains R7: retry-call3 network/401 with rotated JWT/trusted refresh body/both deletion cookies; refresh-only/empty/non-string token pairs; logout metadata mint failure; actual Next-decoded POST traversal and allowed-shaped GET oauth encoded-dot rejection with zero metadata/API calls; successful OTP/OAuth/refresh positives and truthful same-SHA CI/provenance. Preserve existing session/logout/traversal/token/portability fixes.
U5 Consumer Blocker: Original parent owner later consumes `light.headerBg` within parent scope and verifies actual P5Phone/P5Header composition (mapping REALM_COLORS.passenger.dark.bg -> P5.brandDark to light.headerBg); do not ask parent to edit ui-tokens outside its scope.
Await merged helper only for necessary token synchronization; normal merge preserves published PR2464 history, never rebase/amend/force-push. Truthful current disposition: Supervisor gateway coordination has set `resolved_parent_status=blocked`, `resolved_parent_waiting_for=Codex`, and `resolved_parent_next` explicitly retaining U5 parent mapping/P5Phone/P5Header regression plus R7.
