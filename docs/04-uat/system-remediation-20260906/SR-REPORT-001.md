# SR-REPORT-001 — baseline and scope dependency

Owner: Codex. Reviewer: Gemini. Recorded: 2026-09-08 UTC.

## Revision and reproduction

- Branch: `codex/sr-report-001` in the supervisor-assigned isolated worktree.
- Fresh `origin/dev` and initial HEAD: `c4c4a35f88907df6bf68e781059dde397c06ba03`.
- No implementation candidate exists yet. This document's commit is a baseline anchor, not a review candidate.
- `SR-ARTIFACT-001` is canonical `done`, merge `3e1904b1318a3252d3f7b5673173608fd6d12f71`.
- `SR-DEPS-001` is canonical `done`, merge `48b4bc4c5fe0f35a343f4b8c24ccb47f46a379c0`.
- Both dependency merges are ancestors of the fresh base. No rebase was necessary because branch HEAD equals `origin/dev`.

Source trace: execution task specification, source `new-gaps.json` N05, and
`capabilities.json` C091. PRD §9.5.6 requires CSV/XLSX/PDF; §9.10.1 lists the
nine existing regulatory reports. PRD §9.10.2 explicitly excludes filing
PDF/ZIP bytes in Phase 1. The historical audit is not used as current truth.

At the base, `reporting-filing.service.ts` still has `xlsx: null`, `pdf: null`,
and `zip: null`; CSV uses the existing shared CSV writer. The existing report
export test exercises actual service calls and confirms that PDF/XLSX/ZIP
creation throws `REPORT_FORMAT_NOT_IMPLEMENTED`. This is still an open
implementation gap, not an already repaired capability.

## Required supervisor coordination before implementation

The current write scopes exclude two necessary integration changes:

1. `packages/contracts/src/index.ts` declares
   `IMPLEMENTED_REPORT_OUTPUT_FORMATS = ["csv"]`. Both the ops picker and
   `apps/tenant-console-web/app/reports/reports-manager.tsx` consume this
   authoritative list. The execution rules reserve shared contract exports
   for SR-CONTRACT integration. Supervisor must assign the format declaration
   update to the contract owner and record the dependency, or explicitly
   expand this task's scope and serialize it with that writer. A local UI
   duplicate would leave tenant and shared API consumers inconsistent.
2. `tests/unit/reporting-filing.test.ts` explicitly asserts that XLSX and PDF
   must fail. Enabling either renderer necessarily invalidates that test.
   Supervisor must allow the focused update of this existing regression
   suite. If the download method becomes asynchronous for ExcelJS/PDFKit,
   its existing synchronous download assertions also need to await results.
   The two download controllers themselves are already within this task's
   reporting-filing scope.

No shared file or production code was modified. After coordination, implement
renderers over the existing job rows, preserve the CSV writer and nine row
builders, await actual bytes in both download routes, and keep ZIP and filing
generation excluded. Add task-scoped parsing, data/filter parity, MIME/extension,
empty data, Unicode, formula safety, and tenant-boundary regressions. Read the
ops design canvas and realm tokens before changing UI behavior or appearance.

## Commands and actual results

| Command | Exit | Result |
| --- | --- | --- |
| `git fetch origin` | 0 | Refreshed remote refs. |
| `git rev-parse HEAD origin/dev` | 0 | Both resolve to the base SHA above. |
| `git merge-base --is-ancestor 3e1904b1318a3252d3f7b5673173608fd6d12f71 origin/dev` | 0 | Artifact dependency integrated. |
| `git merge-base --is-ancestor 48b4bc4c5fe0f35a343f4b8c24ccb47f46a379c0 origin/dev` | 0 | Renderer dependencies integrated. |
| `pnpm exec vitest run tests/unit/reporting-filing.test.ts` | 0 | 1 file, 30 tests passed; duration 7.34 seconds. Includes CSV bytes and current PDF/XLSX rejection. |

The tests use isolated in-memory service data; a generated order event resource
ID observed in this run was `908a0a1e-de3b-4dec-afc4-1504d544c878`. This is a test
resource, not a live report/download resource. No live resource IDs, PDF/XLSX
artifacts, browser/physical-device checks, deployment, or acceptance evidence
are claimed. API/ops typechecks and the new task-scoped suite have not been run;
implementation has not started pending the scope coordination above.

## Resumed dispatch verification — 2026-09-08 15:35 UTC

History repair PR #1753 resolves the older Codex2 branch continuation issue;
it explicitly leaves the shared contract and central test scope unresolved.
The current canonical task slice still grants only the four original scopes
and depends only on SR-ARTIFACT-001 and SR-DEPS-001. Therefore the scope
coordination described above remains required before enabling the formats.

- Fresh base: `52e8096e4441386901e57415ba06f6a2aabe4d0e` (`origin/dev`).
- Dispatched HEAD: `33c8b1d135cd7eacef81a89a3a4018af00705ca7`.
- Existing implementation inspected at `ecd9125a41d69c5045dfcbec52b33a56eb009e5f`
  on the preserved local Codex2 branch: reusable renderers, asynchronous service
  and controller integration, and task parsing tests. It does not update the
  shared format declaration or central synchronous download assertions.
- Current base still has null PDF/XLSX renderers, a CSV-only authoritative
  implemented-format list, and central tests requiring PDF/XLSX rejection.
  Enabling the old implementation alone would leave the picker unavailable and
  break the existing regression suite. No production changes were restored.
- Source trace rechecked: execution rules § shared-file rule 4; N05; C091;
  PRD §9.5.6 and §9.10.1–2. No UI changed.

| Actual command | Exit | Result |
| --- | --- | --- |
| `git fetch origin` | 0 | Refreshed base above. |
| `git rebase origin/dev` | 0 | Rebased the one baseline evidence commit. |
| `git rev-list --left-right --count origin/codex/sr-report-001...HEAD` (after rebase) | 0 | `1 3`; published baseline required preservation for ordinary push. |
| `git merge --no-ff origin/codex/sr-report-001` (with task message and trailers) | 0 | Clean merge preserving the published baseline; no force push or reset. |
| `pnpm exec vitest run tests/unit/reporting-filing.test.ts` | 0 | 1 file, 30 tests passed, duration 3.03s; current unsupported-format rejection reproduced. |

Example resource observed: order event
`4fc6c164-fbe9-4b29-af28-1cfa0d60e7cf` is from the in-memory test run only.
No live report IDs, live downloads, browser/device checks, deployment, PDF/XLSX
acceptance, or completed implementation candidate are claimed. API/ops
typechecks and the historical task-scoped renderer suite were not run because
the renderer changes have not been integrated into this branch.

Required supervisor action: authorize the focused format declaration and
central reporting-test updates through expanded scopes plus necessary writer
dependencies, or assign coordinated integration children. Keep the task blocked
on that scope decision, rather than reopening solely on history repair.
The commit containing this section is evidence only, not a handoff candidate;
its pushed SHA is recorded in the task blocker note.

## Redispatch verification — 2026-09-08 15:47 UTC

- Dispatch again cites history repair; the canonical task still has the same
  four write scopes and two dependencies. The repair document's procedure §7
  explicitly requires supervisor expansion for shared contracts/central tests.
- Fresh base: `3f182f7e314b5ddb4c37f1c3f5dc214a6d0edf0e`; dispatched HEAD:
  `92215f9fd` (evidence only). No implementation candidate is claimed.
- `git fetch origin` and `git rebase origin/dev`: exit 0. Published evidence
  was preserved with `git merge --no-ff origin/codex/sr-report-001` (exit 0),
  allowing an ordinary push without rewriting published history.
- Current service still declares null XLSX/PDF renderers; shared contracts
  declare CSV only; the central test still requires XLSX/PDF/ZIP rejection.
- `pnpm exec vitest run tests/unit/reporting-filing.test.ts`: exit 0,
  30 tests in one file passed, duration 3.33s. Example in-memory order event:
  `921df141-c3d7-47b3-a10a-574f725fff0d`. This reproduces the missing formats,
  not PDF/XLSX acceptance. No live resource or browser/device check was run.
- API/ops typechecks and renderer parsing suite were not run; production code
  remains unchanged pending the required shared-file coordination.

Supervisor action remains: add focused write scopes for the authoritative
format list and central regression updates plus writer dependencies, or assign
coordinated children. History repair alone does not satisfy that prerequisite.
This update is an evidence anchor, not a review handoff.

## Redispatch verification — 2026-09-08 16:04 UTC

- Fresh origin/dev base: `3fb9b06461dc2bf92043144974eedbbc9f69d0f3`;
  dispatched HEAD: `49952f0e4894b3ff808924f5e32625bb8bdde206`.
- Canonical `show SR-REPORT-001` still grants only the four original scopes
  and two dependencies. History repair procedure §7 explicitly retains the
  shared-file restriction. Required supervisor action remains expansion for
  packages/contracts/src/index.ts and tests/unit/reporting-filing.test.ts,
  with the necessary writer dependencies, or coordinated integration children.
- Current service has null PDF/XLSX renderers; contracts declare CSV only;
  the central regression expects PDF/XLSX rejection. This is a scope blocker,
  distinct from the resolved history repair. No production/UI changes made.
- `git fetch origin`: exit 0. `git rebase origin/dev`: initially exit 1 on
  duplicated evidence commits; resolved by preserving the entire dispatched
  evidence document. Final `GIT_EDITOR=true git rebase --continue`: exit 0.
  `git merge --no-ff origin/codex/sr-report-001` with task trailers: exit 0;
  published history preserved for normal push.
- `pnpm exec vitest run tests/unit/reporting-filing.test.ts`: exit 0;
  30 tests / 1 file passed in 2.73s. Example in-memory order event resource:
  `7375bc1e-ff31-4ac7-af27-8fe5a0875b72`. This verifies current rejection,
  not successful PDF/XLSX generation. No live resources or device/browser
  checks, deployment, typechecks, or renderer parsing tests claimed.
- This document remains an evidence anchor, not an implementation candidate.
  Its ordinary-pushed SHA is recorded in canonical blocker status.

## Redispatch verification — 2026-09-08 16:07 UTC

- Fresh base: `c07d24e021aea847a988646427cdc534ccf4e496` (`origin/dev`);
  dispatched HEAD: `127fdc987aa9cbeb3500a2093518bde663d4bdc2`.
- Canonical `show SR-REPORT-001` still grants only the original four scopes
  and two dependencies. The history-repair resume does not authorize shared
  writes under execution rules §4. Required coordination remains unchanged:
  authorize `packages/contracts/src/index.ts` (implemented formats) and
  `tests/unit/reporting-filing.test.ts` (format and asynchronous assertions),
  with writer dependencies, or assign integration children for those changes.
- Current source rechecked against PRD §9.5.6 / §9.10.2, N05, and C091:
  PDF/XLSX/ZIP renderer entries remain null, authoritative formats remain
  CSV-only, and the central regression still requires PDF/XLSX rejection.
- `git fetch origin`: exit 0. `git rebase origin/dev` initially exited 1 on
  repeated evidence-document conflicts; preserved the complete dispatched
  document and resolved each conflict with `git add` / `GIT_EDITOR=true git
  rebase --continue`. Final continuation exited 0. No production code changed.
- `git merge --no-ff origin/codex/sr-report-001` with task trailers: exit 0;
  preserves published history for a normal non-force push.
- `pnpm exec vitest run tests/unit/reporting-filing.test.ts`: exit 0;
  1 file, 30 tests passed, duration 5.92s. Example in-memory order event:
  `d6ab5666-7ba0-4049-aa1f-ee48f013b9a2`. This reproduces unsupported formats,
  not successful PDF/XLSX generation.
- No live resource, browser/device, deployment, API/ops typecheck, or new
  renderer parsing verification was performed. There is no implementation
  candidate; this evidence anchor SHA is recorded in the machine blocker note.
