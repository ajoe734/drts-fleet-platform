# Unblock PAX-WEB-SHELL-20261009

## Diagnosis
The parent task `PAX-WEB-SHELL-20261009` was blocked because it required shared-file scope coordination for `packages/ui-tokens/src/realms.ts` and `packages/ui-tokens/src/colors.ts`. The passenger app UI (`p5-ui.tsx`) uses specific brand colors (`#0B5CAB`) and surfaces that need to be authorized and present in the `@drts/ui-tokens` package. However, modifying these files was outside the `write_scopes` of the parent task, leading to a rejection in the review phase (R8 in the 2nd and 3rd reviews, and R5 in the 4th review).

## Task-Scoped Changes
To clear the blocker, the following canonical changes were made within this unblock task (via current successor dev delivery superseding historical PRs #2487/#2492/#2486/#2473):
- **`packages/ui-tokens/src/realms.ts`**: Added `passenger` to `RealmName`, `REALM_NAMES`, `REALM_DISPLAY_STRINGS`, and defined its colors in `REALM_COLORS` using the authorized brand colors from the P5 canvas (`#0B5CAB`, `#EAF2FB`). Missing palette entries (dark mode, border) were left intentionally empty as `""` with a `FIXME` comment to avoid inventing unauthorized designs.
- **`packages/ui-tokens/src/colors.ts`**: Added `CORE_SURFACES` and `CORE_FOREGROUNDS` exports to authorize the base surface colors required by the passenger app.

These changes provide the passenger app with the necessary authorized UI tokens without requiring the parent task to violate its `write_scopes`.

## Parent Review Findings and Handoff Resolution (AI_COLLABORATION_GUIDE 0.7)

### Helper Scope Findings
| Finding / acceptance | production source and call path | old -> current evidence | repair boundary and required regressions / limits |
|---|---|---|---|
| U1 P1 integration/scope | Actual canonical current candidate targets dev branch. Historical PR2487/PR2492/PR2486 labeling retained. | Old PRs targeted main or had bloated history. | Confirmed complete diff is limited to `colors.ts`, `realms.ts` and this artifact document. VERIFIED FIXED. |
| U2 P2 stale identity/evidence | Document references immutable canonical handoff fields and actual remote PR head. | Referenced self-referential SHAs that became stale. | Preserved latest unresolved U2/U5 localization. Recorded real current scoped check version/results and honest hosted status. |
| U3 P2 design-source gap | `realms.ts` intentionally leaves unverified palette entries empty. | Earlier candidates invented values absent from P5 canvas. | Preserved verified P5 `brand=#0B5CAB`, `brandBg=#EAF2FB`, `surface=#FFFFFF`. Replaced unverified values with empty strings/comments to avoid inventing a passenger dark/border palette. |
| U4 required trailers | Whole PR range formal gate check passing for current task-scoped dev delivery. | Historical checks (e.g., PR2487) had invalid published ancestors. | Validated WHOLE final actual PR range before handoff. VERIFIED FIXED. |
| U5 P2 STILL INCOMPLETE remaining consumer blocker | Artifact must truthfully acknowledge that gateway coordination is pending. | Claimed helper disposition was already aligned, but machine truth remained resumable and omitted U5. | Preserved delivered `light.headerBg`. Documented that Supervisor gateway coordination for updating helper metadata (blocked, waiting for Codex, retaining U5/R7 next) is pending. |

### Appended Retained Helper Reviews

#### Codex Independent Review REOPEN (2026-10-10T00:41:27Z, generation b943a1a9bec34004a7360e129b45a09d)
- Adjacent candidate = `6b40421c14bc46a79ce41b647512ffad48e23a6c`, generation `f7c3a61af49240949a60b0c861abd845` (review 2026-10-10T00:38:23Z).
- **U1/U3 VERIFIED**: Scoped dev delivery and authorized palette retained.
- **U2 P2 STILL INCOMPLETE**: Stale current/provenance failure. Candidate claimed 7 commits pass but PR2487 range was 16 and failed. Document needs stable wording.
- **U4 P2 STILL FAILED**: Same invalid published ancestors in PR2487. Required task-scoped successor dev delivery.
- **U5 P2 STILL INCOMPLETE**: Candidate claimed coordination has set, but machine truth remained `in_progress`/resumable.

#### Codex Independent Review REOPEN (2026-10-10T00:14:16Z, generation a82cf239cb5d45f2a13e91b103e9ecb5)
- Historical helper candidate = `f8055c5922200b4cc99f44a6ba67f3f41f9e5adb`.
- Adjacent helper candidate = `629f9874dec01b481785883273c419d83bd0f4cb`.

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
- Target PR pointing to `dev` branch.
- Whole-range trailer gate `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD` exit 0 (task-scoped successor dev delivery).
- Historical Checks: PR2487 (16 commits) failed U4 trailer gate.
- Current Hosted CI: Pending owner-push on fresh candidate.

## Unblocked Next Step
The parent task `PAX-WEB-SHELL-20261009` code unit remains R7: retry-call3 network/401 with rotated JWT/trusted refresh body/both deletion cookies; refresh-only/empty/non-string token pairs; logout metadata mint failure; actual Next-decoded POST traversal and allowed-shaped GET oauth encoded-dot rejection with zero metadata/API calls; successful OTP/OAuth/refresh positives and truthful same-SHA CI/provenance. Preserve existing session/logout/traversal/token/portability fixes.
U5 Consumer Blocker: Original parent owner later consumes `light.headerBg` within parent scope and verifies actual P5Phone/P5Header composition (mapping REALM_COLORS.passenger.dark.bg -> P5.brandDark to light.headerBg); do not ask parent to edit ui-tokens outside its scope.
Await merged helper only for necessary token synchronization; normal merge preserves published PR2464 history, never rebase/amend/force-push.
Truthful current disposition: Supervisor gateway coordination is still pending to set `resolved_parent_status=blocked`, `resolved_parent_waiting_for=Codex`, and `resolved_parent_next` explicitly retaining U5 parent mapping/P5Phone/P5Header regression plus R7. The machine truth currently shows `resolved_parent_status=in_progress`, `resolved_parent_waiting_for=Gemini`, and `resolved_parent_next=R7` only. This helper must not fix out-of-scope parent source.
