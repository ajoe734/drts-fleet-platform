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
- **R1**: Original stylesheet defect RESOLVED.
- **R2 (P1)**: PARTIALLY RESOLVED refresh failure boundary. Needs complete shared refresh/retry boundary handling mint/body-read/fetch/parse/HTTP/invalid-token failures.
- **R3 (P1)**: REJECTED LOGOUT STILL REPORTED SUCCESS. Need to revoke actual ACCOUNT session with current credentials, support documented refresh-only logout semantics, propagate rejected revocation.
- **R4 (P1)**: ORIGINAL AUTO-REFRESH TRUSTED-IDENTITY DEFECT RESOLVED.
- **R5 (P1)**: PARTIALLY RESOLVED UI FIXTURE/DESIGN. Need actual marker/location input, represent authoritative registration validity separately. Preserve canvas structure and token requirement. Use tokens from this unblock helper.
- **R6 (P2)**: PARTIALLY RESOLVED PACKAGE ACCEPTANCE. Add executable portability/export check to CI. Clear/update view-model on logout.
- **R7 (P2)**: INCOMPLETE/FAILING TESTS AND EVIDENCE. Need to repair tests against production contracts, decode bodies correctly. Add meaningful specified coverage.

## Local Checks & Evidence
- Git status: `nothing to commit, working tree clean`
- `git diff --check HEAD^ HEAD`: exit 0
- Typecheck: `node /home/lupin/workspace/drts-fleet-platform/.local/gcp-workflow-registration-20261007-dev/node_modules/typescript/bin/tsc -p packages/ui-tokens/tsconfig.json --noEmit --incremental false` -> exit 0
- Target PR #2473 verified pointing to `dev` branch.

## Unblocked Next Step
The parent task `PAX-WEB-SHELL-20261009` should now resume and:
1. Integrate the merged helper branch with a normal merge (`git merge origin/dev`) only if synchronization is necessary after its candidate is reopened. **Do not rebase.**
2. Retain the correct existing token imports (R5 already fixed in parent using `ui-tokens`), and ensure UI fixtures/design map to authorized tokens as coordinated by Supervisor gateway without inventing new palettes.
3. Handle failure cleanup/token validation (R2) and revocation semantics (R3).
4. Implement client portability/view-model (R6) and truthful evidence/tests (R7).
