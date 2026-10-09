# Unblock PAX-WEB-SHELL-20261009

## Diagnosis
The parent task `PAX-WEB-SHELL-20261009` was blocked because it required shared-file scope coordination for `packages/ui-tokens/src/realms.ts` and `packages/ui-tokens/src/colors.ts`. The passenger app UI (`p5-ui.tsx`) uses specific brand colors (`#0B5CAB`) and surfaces that need to be authorized and present in the `@drts/ui-tokens` package. However, modifying these files was outside the `write_scopes` of the parent task, leading to a rejection in the review phase (R8 in the 2nd and 3rd reviews, and R5 in the 4th review).

## Task-Scoped Changes
To clear the blocker, the following canonical changes were made within this unblock task (via PR #2486 targeting `dev`, superseding historical PR #2473):
- **`packages/ui-tokens/src/realms.ts`**: Added `passenger` to `RealmName`, `REALM_NAMES`, `REALM_DISPLAY_STRINGS`, and defined its colors in `REALM_COLORS` using the authorized brand colors from the P5 canvas (`#0B5CAB`, `#EAF2FB`). Missing palette entries (dark mode, border) were left intentionally empty as `""` with a `FIXME` comment to avoid inventing unauthorized designs.
- **`packages/ui-tokens/src/colors.ts`**: Added `CORE_SURFACES` and `CORE_FOREGROUNDS` exports to authorize the base surface colors required by the passenger app.

These changes provide the passenger app with the necessary authorized UI tokens without requiring the parent task to violate its `write_scopes`.

## Parent Review Findings and Handoff Resolution (AI_COLLABORATION_GUIDE 0.7)

### Helper Scope Findings
| Finding / acceptance | production source and call path | old -> current evidence | repair boundary and required regressions / limits |
|---|---|---|---|
| U1 P1 integration/scope | Live PR #2486 targets `dev`, head bff72315a11991513a351857563e7159c23ec852 matched exactly twice. | PR #2473 targeted main, 1247 commits | Confirmed complete diff is limited to `colors.ts`, `realms.ts` and this artifact document. VERIFIED FIXED. |
| U2 P2 incorrect diagnosis/unsafe handoff/missing acceptance evidence | Document correctly cites FULL latest parent review at 2026-10-09T18:26:23Z, and appended retained helper review below. | Old artifact missed R7, R8 and used mixed current/historical identities. | Both parent concrete next and helper resolved_parent_next updated via CLI/canonical metadata. Parent next code unit remains R7. Rebase instruction updated to normal merge only. |
| U3 P2 design-source gap | `realms.ts` passenger palette. | Unverified `dark` and `border` values were absent from P5 canvas. | Preserved verified P5 `brand=#0B5CAB`, `brandBg=#EAF2FB`, `surface=#FFFFFF`. Replaced unverified values with empty strings/comments to avoid inventing a passenger dark/border palette. VERIFIED RETAINED. |
| U4 P1 required trailers | Whole-range trailer gate `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head bff72315a11991513a351857563e7159c23ec852` exit0. | Historical 1cbef7c checks: 2 commits OK, job 114064036045 SUCCESS. | Verified 4 commits OK. Commit trailers job 114072203044 SUCCESS (for 3 commits, pending for 4). VERIFIED FIXED. |
| U5 P2 NEW consumer composition gap | Artifact explicitly mentions the missing `#07437E` light-screen header contract. | Canonical Passenger.html loads `#07437E` into `brandDark`, but P5 uses it as a light-screen header/phone background. Helper supplied empty `dark.bg`. | Left product sources unchanged. Coordinated U5 consumer blocker. Parent next updated via canonical metadata to include consuming a properly named canvas-backed light-header token. |

### Appended Retained Helper Reviews

#### Codex Independent Review REOPEN (2026-10-09T23:38:41Z, generation 2e88bf4ee8f8453fb33ffbc848ece594)
- Current helper candidate / exact remote PR head = `bff72315a11991513a351857563e7159c23ec852`.
- Adjacent independently reviewed helper: `1cbef7cdf5d6863d0fdd0fc8c76bd8793e58dc22`, generation `7130fdb84afc4ae9b4b462d0acc61cbc`.
- **U1 scoped delivery RETAINED:** PR2486 OPEN targets dev, 3 commits, exact candidate head, exactly the 3 authorized files (+60/-1). Historical PR2473 is explicitly historical.
- **U3 unauthorized palette removal RETAINED:** Token sources unchanged from previous candidate. Unsupported passenger border/dark entries remain explicit empty placeholders.
- **U4 required trailers VERIFIED:** `check_commit_trailers.py` against `d0b132eecdbf1ad6d5706d8eb14e8f0c0c0b1373` exit 0, 3 commits OK. Hosted CI job 114072203044 SUCCESS.
- **U2 parent R7 next/normal-merge correction RETAINED:** Parent next and helper resolved_parent_next match R7 cases and verified product fixes.
- **U5 artifact disclosure subfinding FIXED:** Artifact now explicitly mentions the missing `#07437E` light-screen header contract.

### Parent Task Findings (from Review of Parent Task)
Latest parent reviewer worker_outcomes at 2026-10-09T18:26:23Z reviewed `730a5444bb5194eedf25def23eb55e8c13f0bc9c` against `41af9c5847d860659f110f1a4b96b308f5aee2dd`.
- **R1, R2, R3, R4, R5, R6**: Verified FIXED in parent. Session/refresh/logout/traversal/white-token/portability fixes are verified and must be preserved.
- **R7 (P2)**: UNRESOLVED. Exact test/provenance cases remain. Parent must add: retry-call3 network/401 parameterization asserting rotated JWT/trusted body/both deletion cookies; refresh-only/empty/non-string pairs; logout metadata-mint failure; actual Next-decoded POST traversal and allowed-shaped GET oauth encoded-dot rejection with no metadata/API calls; real successful OTP/OAuth/refresh positives and truthful CI/provenance.
- **R8 (P1)**: UNRESOLVED in parent. Shared-file scope coordination for `packages/ui-tokens/src/realms.ts` and `packages/ui-tokens/src/colors.ts`. This unblock helper task delivers the required authorized tokens, providing the exact shared-file scope coordination. Parent will use the tokens merged by this helper to resolve R8 without rewriting out-of-scope files.

## Local Checks & Evidence
- **Helper Identity**: Current helper candidate SHA (`bff72315a11991513a351857563e7159c23ec852`, PR #2486) replaces the historical PR #2473. The earlier v2 anchor `1cbef7cdf5d6863d0fdd0fc8c76bd8793e58dc22` is historical.
- Git status: `nothing to commit, working tree clean`
- `git diff --check origin/dev...HEAD`: exit 0; `git diff --check HEAD^ HEAD`: exit 0
- Typecheck: `node /home/lupin/workspace/drts-fleet-platform/.local/gcp-workflow-registration-20261007-dev/node_modules/typescript/bin/tsc -p packages/ui-tokens/tsconfig.json --noEmit --incremental false` -> exit 0
- Target PR #2486 verified pointing to `dev` branch.
- Whole-range trailer gate `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head bff72315a11991513a351857563e7159c23ec852` exit 0 (4 commits OK).
- Commit trailers job 114072203044 SUCCESS (for 3 commits, pending for 4).

## Unblocked Next Step
The parent task `PAX-WEB-SHELL-20261009` should now resume and:
1. Integrate the merged helper tokens via a normal merge (`git merge origin/dev`) only if synchronization is necessary after its candidate is reopened. **Do not rebase; preserve published PR2464 history, never amend/force-push.**
2. Retain the verified R1-R6 product fixes, including the correct existing token imports (R5 already fixed).
3. Repair **R7**: Add the exact test/provenance cases specified in the latest parent review (retry-call3 network/401 parameterization, refresh-only/empty/non-string pairs, logout metadata-mint failure, Next-decoded POST traversal, allowed-shaped GET oauth encoded-dot rejection, and real successful positive tests with truthful CI/provenance).
4. Resolve **R8**: The shared-file conflict is coordinated by Supervisor gateway. The parent task must use the authorized tokens delivered by this helper without rewriting `ui-tokens` files.
5. Address **U5 Consumer Composition Gap**: The parent task must document or resolve the remaining consumer requirement where the parent relies on `#07437E` (previously `dark.bg`) as the light-screen header background, coordinating resolution through the Supervisor gateway if additional token support is needed from the design system. Choose a truthful current blocked/ready disposition through the authorized roles; do not claim helper merge or all parent acceptance completed.
