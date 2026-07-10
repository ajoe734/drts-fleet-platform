# E2E-FIX-D-001 Review Packet & Evidence Summary

**Sidecar Task:** `E2E-FIX-D-001-SIDECAR-REVIEW`  
**Parent Task:** `E2E-FIX-D-001`  
**Helper Kind:** `review_packet`  
**Current Sidecar Owner:** `Codex`  
**Assigned Sidecar Reviewer:** `Gemini`  
**Parent Owner / Reviewer:** `Gemini` / `Claude`  
**Last Revised:** `2026-07-10 (UTC)`  
**Status:** `REVIEW-STAGE SUPPORT ARTIFACT` - support-only packet for reviewer handoff; no canonical truth, runtime, or contract files changed.

---

## 1. Scope Boundary

This sidecar exists to prepare a reviewer-facing packet for the current parent review candidate.

In scope:

- freeze the machine-truth snapshot for the sidecar and the parent task
- summarize what the parent review branch actually changed
- distinguish direct evidence from owner handoff claims
- point the reviewer to the highest-signal verification hotspots

Out of scope:

- changing `apps/api/**`, `infra/migrations/**`, `tests/**`, or any canonical truth
- approving or reopening the parent task from this sidecar
- inventing missing verification evidence that is not already in machine truth, git history, or repo-local logs

---

## 2. Machine-Truth Snapshot

### Parent task - `E2E-FIX-D-001`

- status=`review`
- owner=`Gemini`
- reviewer=`Claude`
- acceptance=`create driver 回 200/201;E2E-019 整支通過;補單元測試;typecheck 綠`
- `ai-activity-log.jsonl` records:
  - `2026-07-10T14:08:38Z` - `Gemini` `start`: `Start fixing E2E-019 driver creation 500 error`
  - `2026-07-10T14:08:42Z` - `Gemini` `handoff`: `Handoff to Claude: Completed fix, unit tests, and verified E2E-019 passing`
  - `2026-07-10T14:08:50Z` - Orchestrator marked the Gemini worker completed after the task advanced to `review`

### Sidecar task - `E2E-FIX-D-001-SIDECAR-REVIEW`

- original owner=`Copilot`, reviewer=`Gemini`
- `ai-activity-log.jsonl` records two Copilot worker failures at `2026-07-10T14:09:03Z` and `2026-07-10T14:09:27Z`
- `2026-07-10T14:12:37Z` - chair reassigned the sidecar owner from `Copilot` to `Codex`
- `2026-07-10T14:13:06Z` - `Codex` recorded `start`: `Preparing sidecar review packet and evidence summary for Gemini handoff`

### Companion acceptance sidecar

- task=`E2E-FIX-D-001-SIDECAR-ACCEPTANCE`
- status=`review`
- branch=`origin/codex2/e2e-fix-d-001-sidecar-acceptance`
- pushed commit=`5e391823f226ddfde096b0367f2529ea1b607a49`
- commit subject=`E2E-FIX-D-001-SIDECAR-ACCEPTANCE: prepare reviewer packet`
- machine-truth `next` says that packet already captured:
  - acceptance checklist
  - dependency map
  - drift notes
  - `bash -n tests/e2e/E2E-019-fleet-supply-onboarding.sh`
  - `pnpm --dir apps/api exec vitest run tests/unit/fleet-partner.controller.test.ts` (`1` file / `10` tests passed)

Practical meaning:

- the parent task is already in `review`
- the current question is not whether a fix branch exists, but whether the review candidate's evidence is sufficient for the parent acceptance bars
- this review packet complements the acceptance sidecar rather than replacing it

---

## 3. Parent Review Candidate Snapshot

Current parent review candidate:

- branch=`origin/gemini/e2e-fix-d-001`
- branch tip=`8f11115b29de6dcf55aa37e6950c4416aa41988b`
- local and remote refs match at the same commit
- commit subject=`fix(E2E-FIX-D-001): resolve duplicate V0036 migration collision and add unit tests`
- commit trailers=`LLM-Agent: Gemini`, `Task-ID: E2E-FIX-D-001`, `Reviewer: Claude`

Files changed by the parent review candidate:

- `infra/migrations/V0036A__supply_external_ids_as_varchar.sql`
- `infra/migrations/V0037__service_area_review_lifecycle.sql` (deleted)
- `infra/migrations/V0047__service_area_baseline_seed.sql` (deleted)
- `tests/e2e/run-e2e-hermetic.sh`
- `tests/unit/supply-submission.test.ts`

Sanity check:

- `git diff --check c75c7fc164f5c4cbf2a9b3e36eed14e44aed76ea..gemini/e2e-fix-d-001` returned clean output

Important scope note:

- the parent review candidate does **not** change `fleet-partner.controller.ts` or `supply-submission.service.ts`
- the claimed fix is therefore centered on migration/runtime bootstrapping plus added unit coverage, not a new controller/service implementation path

---

## 4. Direct Evidence Summary

### E-1. Migration collision was real on `dev`

Duplicate migration version prefixes present on the base tree:

- `V0036`
- `V0037`
- `V0047`

This was verified by enumerating `infra/migrations` on the current `dev` snapshot.

### E-2. The parent review branch removes those duplicate prefixes

On `origin/gemini/e2e-fix-d-001`, the duplicate-prefix check returns no duplicates.

The review branch resolves the collision by:

- renaming `V0036__supply_external_ids_as_varchar.sql` to `V0036A__supply_external_ids_as_varchar.sql`
- deleting `V0037__service_area_review_lifecycle.sql`
- deleting `V0047__service_area_baseline_seed.sql`

### E-3. The deleted service-area migrations are redundant, not net-new removals

The deleted files match later canonical-numbered service-area migrations already present on `dev`:

- `V0048__service_area_review_lifecycle.sql`
- `V0049__service_area_baseline_seed.sql`

That means the parent branch is removing duplicate numbering, not removing the service-area lifecycle/seed behavior entirely.

### E-4. The unit-test delta is narrow and explicit

`tests/unit/supply-submission.test.ts` adds three `SupplySubmissionService` tests:

1. create driver draft successfully
2. reject duplicate driver identity
3. update driver draft and bump revision number

This directly supports the acceptance bullet `補單元測試`, but only at the service layer.

### E-5. The hermetic runner change is reproducibility support

`tests/e2e/run-e2e-hermetic.sh` now:

- exports default JWT / signing / ingress-key env vars before boot
- falls back to `docker compose ... postgres psql` when host `psql` is unavailable

This is useful for reproducing `E2E-019` locally, but it is helper-surface work rather than the business fix itself.

### E-6. Existing repo anchors already encode the expected happy path

Current repo code already includes the broader path the parent acceptance talks about:

- `tests/e2e/E2E-019-fleet-supply-onboarding.sh` directly calls `POST /fleet-partner/supply-submissions/drivers`, asserts `200|201`, and continues through submit/revision/approve/readiness
- `apps/api/tests/unit/fleet-partner.controller.test.ts` already exercises the full in-memory write/review/provision/readiness chain

This sidecar therefore treats the parent review candidate as a runtime/migration repair on top of an already-existing implementation surface.

### E-7. Verification provenance is partly machine truth, partly raw worker trace

Durable sources found for the parent review handoff:

- `ai-status` task slice for `E2E-FIX-D-001`
- `ai-activity-log.jsonl` start/handoff events
- pushed branch tip `origin/gemini/e2e-fix-d-001`
- raw worker log: `.orchestrator/logs/20260710T134857471245Z-gemini-gemini-bf5c91.log`

Not found during this sidecar pass:

- a standalone `.orchestrator/evidence/*.json` file for the Gemini parent run
- a repo-local artifact on the parent branch that records the exact `E2E-019` or `typecheck` command outputs

---

## 5. Acceptance Mapping

| Parent acceptance | Current evidence posture |
| --- | --- |
| `create driver 回 200/201` | claimed by the parent handoff summary and encoded in `tests/e2e/E2E-019-fleet-supply-onboarding.sh`; not independently re-run by this sidecar |
| `E2E-019 整支通過` | claimed by the parent handoff summary; the branch improves hermetic reproducibility, but this packet did not find a dedicated command-output artifact on the review branch |
| `補單元測試` | directly evidenced by `tests/unit/supply-submission.test.ts` |
| `typecheck 綠` | claimed by the parent handoff summary and narrated in the raw worker log; no dedicated repo-local proof artifact was found during this sidecar pass |

Reviewer reading:

- the parent diff clearly satisfies the unit-test addition
- the migration fix is plausibly tied to the original 500
- the strongest remaining review question is whether the `E2E-019` / `typecheck` claims need rerun or cleaner evidence before approval

---

## 6. Reviewer Hotspots

For sidecar reviewer `Gemini`, the most important checks are:

1. This packet must not overstate proof. `E2E-019` green and `typecheck` green are currently recorded as owner handoff claims, not as a committed evidence artifact on the parent branch.
2. The packet must accurately frame the parent fix as a migration-collision/runtime-boot repair plus service-level unit tests, not as a fresh controller/service feature implementation.
3. The packet must keep the service-area migration deletions in the correct context: duplicate-number cleanup because `V0048` / `V0049` remain on `dev`.
4. The packet must stay support-only and should not reinterpret parent machine truth, reopen the parent task, or claim parent approval.

For downstream parent reviewer `Claude`, the main technical focus remains:

1. confirm the migration collision was the actual cause of the create-driver 500 in the intended hermetic stack
2. decide whether the handoff summary is sufficient evidence for `E2E-019` / `typecheck`, or whether those checks should be re-run during review
3. verify the `run-e2e-hermetic.sh` helper changes are acceptable incidental scope and do not hide a broader environment dependency problem

Suggested reopen wording if evidence is judged insufficient:

> `review packet is accurate, but parent review still needs explicit E2E-019/typecheck proof or a reviewer rerun before approval`

---

## 7. Verification Performed For This Sidecar

Commands and reads performed while preparing this support packet:

- `AI_NAME=Codex scripts/ai-status.sh show E2E-FIX-D-001-SIDECAR-REVIEW`
- `AI_NAME=Codex scripts/ai-status.sh show E2E-FIX-D-001`
- `AI_NAME=Codex scripts/ai-status.sh show E2E-FIX-D-001-SIDECAR-ACCEPTANCE`
- `git log --oneline --decorate gemini/e2e-fix-d-001`
- `git show --stat --summary --format=fuller gemini/e2e-fix-d-001`
- `git diff --name-only c75c7fc164f5c4cbf2a9b3e36eed14e44aed76ea..gemini/e2e-fix-d-001`
- `git diff --check c75c7fc164f5c4cbf2a9b3e36eed14e44aed76ea..gemini/e2e-fix-d-001`
- duplicate-prefix inventory on `infra/migrations` for base vs parent review branch
- targeted reads of:
  - `tests/unit/supply-submission.test.ts`
  - `tests/e2e/run-e2e-hermetic.sh`
  - `tests/e2e/E2E-019-fleet-supply-onboarding.sh`
  - `apps/api/src/modules/fleet-partner/fleet-partner.controller.ts`
  - `apps/api/src/modules/fleet-partner/supply-submission.service.ts`
  - `apps/api/tests/unit/fleet-partner.controller.test.ts`
  - companion acceptance sidecar on `codex2/e2e-fix-d-001-sidecar-acceptance`
  - `/home/edna/workspace/drts-fleet-platform/ai-activity-log.jsonl`
  - `/home/edna/workspace/drts-fleet-platform/.orchestrator/logs/20260710T134857471245Z-gemini-gemini-bf5c91.log`

No runtime, migration, canonical-truth, or parent-branch files were modified during this sidecar pass.

---

## 8. Handoff Note

This packet is ready to hand off to sidecar reviewer `Gemini`.

What this packet gives the reviewer:

- a frozen snapshot of the parent review candidate branch and commit
- a direct explanation of what the parent diff really changed
- a clear split between direct repo evidence and owner handoff claims
- the companion acceptance-sidecar context already prepared on the `codex2` branch

What this packet deliberately does **not** do:

- claim the parent task is approved
- claim `E2E-019` / `typecheck` proof is stronger than the currently recorded evidence
- alter canonical truth or reopen the parent task by itself
