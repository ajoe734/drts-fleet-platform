# Unblock PAX-WEB-SHELL-20261009

## Diagnosis
The parent task `PAX-WEB-SHELL-20261009` was blocked because it required shared-file scope coordination for `packages/ui-tokens/src/realms.ts` and `packages/ui-tokens/src/colors.ts`. The passenger app UI (`p5-ui.tsx`) uses specific brand colors (`#0B5CAB`) and surfaces that need to be authorized and present in the `@drts/ui-tokens` package. However, modifying these files was outside the `write_scopes` of the parent task, leading to a rejection in the review phase (R8 in the 2nd and 3rd reviews, and R5 in the 4th review).

## Task-Scoped Changes
To clear the blocker, the following canonical changes were made within this unblock task (via PR #2473 targeting `dev`):
- **`packages/ui-tokens/src/realms.ts`**: Added `passenger` to `RealmName`, `REALM_NAMES`, `REALM_DISPLAY_STRINGS`, and defined its colors in `REALM_COLORS` using the authorized brand colors from the P5 canvas (`#0B5CAB`, `#EAF2FB`). Missing palette entries (dark mode, border) were left intentionally empty as `""` with a `FIXME` comment to avoid inventing unauthorized designs.
- **`packages/ui-tokens/src/colors.ts`**: Added `CORE_SURFACES` and `CORE_FOREGROUNDS` exports to authorize the base surface colors required by the passenger app.

These changes provide the passenger app with the necessary authorized UI tokens without requiring the parent task to violate its `write_scopes`.

## Parent Review Findings and Handoff Resolution (AI_COLLABORATION_GUIDE 0.7)

### Helper Scope Findings
| Finding / acceptance | production source and call path | old -> current evidence | repair boundary and required regressions / limits |
|---|---|---|---|
| U1 P1 integration/scope | PR #2473 targets `main` | PR #2473 targeted main, 1247 commits | Retargeted PR #2473 to `dev` using `gh pr edit 2473 --base dev`. Confirmed complete diff is limited to `colors.ts`, `realms.ts` and this artifact document. |
| U2 P2 incorrect diagnosis/unsafe handoff/missing acceptance evidence | Artifact missing parent review findings (R7, R8). | Old artifact missed R7, R8 and coordination steps. | Appended parent review findings (below). Recorded PR/SHA/local checks. Rebase instruction in parent updated to normal merge only if synchronization is necessary. |
| U3 P2 design-source gap | `realms.ts` newly adds passenger `light.border=#D0E1F5`, `dark.fg=#60A5FA` and `dark.border=#1E3A8A` | These values were absent from P5 canvas. | Preserved verified P5 `brand=#0B5CAB`, `brandBg=#EAF2FB`, `surface=#FFFFFF`. Replaced unverified values with empty strings/comments to avoid inventing a passenger dark/border palette. |

### Parent Task Findings (from Review of Parent Task)
Latest parent reviewer worker_outcomes at 2026-10-09T18:26:23Z reviewed `730a5444bb5194eedf25def23eb55e8c13f0bc9c` against `41af9c5847d860659f110f1a4b96b308f5aee2dd`.
- **R1, R2, R3, R4, R5, R6**: Verified FIXED in parent. Session/refresh/logout/traversal/white-token/portability fixes are verified and must be preserved.
- **R7 (P2)**: UNRESOLVED. Exact test/provenance cases remain. Parent must add: retry-call3 network/401 parameterization asserting rotated JWT/trusted body/both deletion cookies; refresh-only/empty/non-string pairs; logout metadata-mint failure; actual Next-decoded POST traversal and allowed-shaped GET oauth encoded-dot rejection with no metadata/API calls; real successful OTP/OAuth/refresh positives and truthful CI/provenance.
- **R8 (P1)**: UNRESOLVED in parent. Shared-file scope coordination for `packages/ui-tokens/src/realms.ts` and `packages/ui-tokens/src/colors.ts`. This unblock helper task delivers the required authorized tokens, providing the exact shared-file scope coordination. Parent will use the tokens merged by this helper to resolve R8 without rewriting out-of-scope files.

## Local Checks & Evidence
- **Helper Identity**: Current helper candidate SHA (`9b6f1a24917d1618b1b7a62d95930d8113407861`, PR #2486) replaces previous adjacent helper candidate (`f2af9693ec7ff438a71d5370fca2a57a6fae8105`, PR #2473) to repair missing commit trailers (U4).
- Git status: `nothing to commit, working tree clean`
- `git diff --check origin/dev...HEAD`: exit 0
- Typecheck: `node /home/lupin/workspace/drts-fleet-platform/.local/gcp-workflow-registration-20261007-dev/node_modules/typescript/bin/tsc -p packages/ui-tokens/tsconfig.json --noEmit --incremental false` -> exit 0
- Target PR #2486 opened against `dev` branch with correct LLM-Agent and Task-ID trailers.

## Unblocked Next Step
The parent task `PAX-WEB-SHELL-20261009` should now resume and:
1. Integrate the merged helper tokens via a normal merge (`git merge origin/dev`) only if synchronization is necessary after its candidate is reopened. **Do not rebase; preserve published history.**
2. Retain the verified R1-R6 product fixes, including the correct existing token imports (R5 already fixed).
3. Repair **R7**: Add the exact test/provenance cases specified in the latest parent review (retry-call3 network/401 parameterization, refresh-only/empty/non-string pairs, logout metadata-mint failure, Next-decoded POST traversal, allowed-shaped GET oauth encoded-dot rejection, and real successful positive tests with truthful CI/provenance).
4. Resolve **R8**: The shared-file conflict is coordinated by Supervisor gateway. The parent task must use the authorized tokens delivered by this helper without rewriting `ui-tokens` files.
