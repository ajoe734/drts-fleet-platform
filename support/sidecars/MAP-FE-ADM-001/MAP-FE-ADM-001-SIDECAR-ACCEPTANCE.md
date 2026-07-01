# MAP-FE-ADM-001 Sidecar Acceptance Packet

- **Parent Task:** `MAP-FE-ADM-001` - Platform Admin geofence governance UI
- **Sidecar Task:** `MAP-FE-ADM-001-SIDECAR-ACCEPTANCE`
- **Status:** `in_progress`
- **Owner / Reviewer:** `Codex` / `Codex2`
- **Parent Owner / Reviewer:** `Codex2` / `Codex`
- **Scope Guardrail:** support artifact only; no canonical truth, runtime, or parent-branch edits
- **Primary Machine Truth:** `ai-status.json`

## 1. Purpose And Current Posture

This packet consolidates the acceptance checklist, dependency map, and
reviewer-facing status notes for `MAP-FE-ADM-001` without changing the parent
implementation or the canonical task board.

Earlier wording overclaimed a live actionable-task scan. This revision limits
queue statements to a bounded machine-truth snapshot collected after the
`2026-07-01T02:17:36Z` reopen and refreshed through the
`2026-07-01T02:18:19Z` owner progress update.

Scoped snapshot relevant to this packet:

- `MAP-FE-ADM-001-SIDECAR-ACCEPTANCE` is `in_progress` on this worker branch
- `MAP-FE-ADM-001` is `in_progress` after the `2026-07-01T02:07:04Z` reopen
- `MAP-FE-ADM-001-SIDECAR-REVIEW` is `review_approved` and awaiting separate
  owner closeout on its own branch
- `MAP-OBS-001` is already `review` with `reviewer=Codex`

This packet does **not** claim that the broader Codex owner/reviewer queue
remained unchanged after that snapshot window; it only records the task slices
and dependency evidence cited below.

Important posture change:

- the earlier review sidecar for `MAP-FE-ADM-001` described a corrective branch
  that had re-entered `review`
- live machine truth has since moved again
- `MAP-FE-ADM-001` is now back to `in_progress` after the
  `2026-07-01T02:07:04Z` reopen

This acceptance packet therefore reflects the latest reopen state, not the
stale `review` posture captured by the earlier review packet.

## 2. Machine-Truth Snapshot

Snapshot basis for this section:

- live task slices from `scripts/ai-status.sh show` / `list`
- archive evidence for `MAP-BE-006`
- activity-log entries through the `2026-07-01T02:17:47Z` worker-start event
  for the separate `MAP-FE-ADM-001-SIDECAR-REVIEW` closeout dispatch

| Task ID | Status | Owner -> Reviewer | Why it matters now |
| --- | --- | --- | --- |
| `MAP-BE-006` | `done` (archived) | `Codex` -> `Codex2` | Backend service-area lifecycle authority is complete and merged to `origin/dev`; the live board no longer shows it, so this packet must use archive evidence instead of `scripts/ai-status.sh show`. |
| `MAP-UI-002` | `review` | `Codex2` -> `Claude2` | Shared `GeometryEditor` primitive still has an open review state; its `next` note says the sidecar review recommends *not* approving the parent yet. |
| `MAP-UI-002-HARDEN-001` | `review` | `Codex2` -> `Claude2` | Validation hardening evidence exists for coordinate-range checks, self-intersection blocking, and GeoJSON import rejection. |
| `MAP-UI-002-INTEGRATE-001` | `review` | `Codex` -> `Claude2` | Integration branch claims primitive + hardening together, but its own `next` note says this is integration evidence only and not a Gate B production pass. |
| `MAP-FE-ADM-001` | `in_progress` | `Codex2` -> `Codex` | Parent task is reopened. Latest machine-truth blocker summary is the current acceptance baseline. |
| `MAP-FE-ADM-001-SIDECAR-ACCEPTANCE` | `in_progress` | `Codex` -> `Codex2` | This support packet only. Direct sidecar `depends_on` still lists `MAP-BE-006`. |
| `MAP-FE-ADM-001-SIDECAR-REVIEW` | `review_approved` | `Codex` -> `Codex2` | Separate sidecar on another branch already cleared reviewer approval before this packet refresh; its pending owner closeout must not be misrepresented as absent Codex-owned work. |
| `MAP-OBS-001` | `review` | `Codex2` -> `Codex` | Separate parent task was already waiting on `reviewer=Codex` before the earlier acceptance handoff, so this packet cannot claim that no review work was pending globally. |

Latest parent blocker summary from live machine truth:

1. `/service-areas` shipped despite only a fallback screen-requirements note.
2. affected-preview freshness ignores `effectiveFrom` changes.
3. submit-review reason is required in UI but never reaches API audit.
4. GeoJSON import does not surface mutation receipts.

Practical implication:

- the corrective branch at `origin/codex/map-fe-adm-001-gateb-corrective@69b0980c6`
  proves meaningful repo-local progress
- it is not yet acceptable to close `MAP-FE-ADM-001`
- this sidecar should help the reviewer and parent owner focus on the exact
  remaining acceptance gaps

## 3. Dependency Map

### 3.1 Backend authority already landed: `MAP-BE-006`

`MAP-BE-006` is not present in the live task list anymore, but the archived
task record shows:

- status `done`
- commit `55dad2ca4c79fc7370cf069996efb2ddf2cf704a`
- merge commit `1c06a5cfb56ac94e117d2ed773f5938750be67c0`
- `integration_status=merged_to_dev`
- PR `#1020`

That archived record says the backend already owns:

- service-area boundary and stop-policy draft/review/publish/retire APIs
- effective dating and version refs
- geometry validation and GeoJSON export payloads
- mutation audit
- immediate evaluator refresh for published geometry

Reviewer takeaway:

- `MAP-FE-ADM-001` must not re-specify lifecycle semantics or audit contracts
- the Platform Admin UI is expected to consume this backend authority, not
  invent a parallel governance model

### 3.2 GeometryEditor gate chain is still live

The parent task is gated on more than the sidecar's direct `MAP-BE-006`
dependency:

- `MAP-UI-002` is still `review`
- `MAP-UI-002-HARDEN-001` is still `review`
- `MAP-UI-002-INTEGRATE-001` is still `review`

Machine-truth notes for those tasks matter:

- `MAP-UI-002` still carries blocker language from its sidecar review
- `MAP-UI-002-HARDEN-001` says package-local checks now cover out-of-range
  coordinates, self-intersection, and invalid GeoJSON import
- `MAP-UI-002-INTEGRATE-001` says the integrated branch is ready for review,
  but explicitly warns that this is not itself a Gate B production pass

Reviewer takeaway:

- the current parent branch may use task-scoped geometry UI and helper logic
- it must not claim the shared primitive gate is already closed while the
  `MAP-UI-002*` chain remains in `review`

### 3.3 Current parent dependency posture

`MAP-FE-ADM-001` is currently using the corrective branch to prove repo-local
Platform Admin behavior while depending on:

- archived backend authority from `MAP-BE-006`
- still-open shared-primitive review gates from `MAP-UI-002*`
- later cross-surface and release proof from `MAP-QA-002` and `MAP-REL`

That is a valid corrective posture, but it is not yet a closeout posture.

## 4. Parent Acceptance Crosswalk

| Parent acceptance item | Evidence already present on corrective branch | What is still open in current machine truth |
| --- | --- | --- |
| `admin can publish no-pickup zone without SQL` | `/service-areas` route exists; lifecycle controls and task-scoped `ServiceAreaGeometryEditor` are present in `apps/platform-admin-web/app/service-areas/page.tsx:861-1019`; mocked Playwright smoke drives preview -> publish -> retire in `tests/e2e/platform-admin-service-area-governance.spec.ts:281-370`. | The parent is still reopened. Reviewer must keep rejecting closure while the route is only backed by a fallback requirements note and the submit-review/audit path is incomplete. |
| `published zone affects evaluator` | Affected preview is first-class UI in `page.tsx:1021-1149`; helper logic builds preview samples and summarizes evaluator results in `apps/platform-admin-web/lib/service-area-governance.ts:186-260`; Playwright asserts blocked evaluator decisions and version refs in `platform-admin-service-area-governance.spec.ts:324-345`. | Live blocker says preview freshness ignores `effectiveFrom` changes. Downstream callcenter effect remains a later QA gate and is not proven by this parent branch alone. |
| `audit actor version effect direction effective date visible` | Lifecycle reason input is required in `page.tsx:884-915`; audit/version summary and mutation receipt panels exist at `page.tsx:1200-1294`; screen requirements call for backend `auditId`, generated timestamp, record identity, status, and version ref in `docs/05-ui/platform-admin-service-area-governance-screen-requirements-20260701.md:15-22`. | Live blocker says submit-review reason never reaches API audit. Live blocker also says GeoJSON import does not surface mutation receipts. Those are acceptance failures, not documentation gaps. |
| `platform-admin checks pass` | Corrective branch evidence says `platform-admin` typecheck/lint, `api-client` typecheck, helper unit tests, Playwright smoke, prettier, and contracts build passed; final evidence records the exact command list and scope boundary in `support/sidecars/MAP-FE-ADM-001/MAP-FE-ADM-001-FINAL-EVIDENCE.md`. | Branch-local verification does not override the reopen. Treat the checks as evidence that the corrective slice is executable, not as proof that parent acceptance is complete. |

## 5. Corrective Branch Evidence Anchors

These repo-visible anchors are useful for reviewer `Codex2`, but they must be
read alongside the latest parent reopen:

- `apps/platform-admin-web/app/service-areas/page.tsx`
  - submit-review / publish / retire controls at `505-580` and `861-949`
  - task-scoped geometry editor panel at `951-1019`
  - affected evaluator preview at `1021-1149`
  - GeoJSON import/export panel at `1151-1198`
  - audit/version summary plus mutation receipt at `1200-1294`
- `apps/platform-admin-web/lib/service-area-governance.ts`
  - geometry validation at `65-103`
  - affected sample generation at `186-231`
  - evaluator summary rollup at `233-260`
- `tests/unit/platform-admin-service-area-governance.test.ts:33-109`
  - self-intersection rejection
  - affected-sample version refs
  - evaluator summary aggregation
- `tests/e2e/platform-admin-service-area-governance.spec.ts:281-370`
  - `/service-areas` route boot
  - fresh affected preview
  - publish receipt
  - retire receipt
- `docs/05-ui/platform-admin-service-area-governance-screen-requirements-20260701.md:13-46`
  - fallback requirements for route regions, publish safety rules, and evidence
    boundary
- `support/sidecars/MAP-FE-ADM-001/MAP-FE-ADM-001-FINAL-EVIDENCE.md`
  - branch-local command record
  - explicit "do not claim full production readiness" boundary

One evidence hotspot directly matches the latest reopen:

- UI requires an audit reason before submit review in
  `apps/platform-admin-web/app/service-areas/page.tsx:505-522`
- but the typed client submit-review methods in
  `packages/api-client/src/index.ts:2966-3028` take only the record ID and send
  no body payload

That mismatch is consistent with the live parent blocker:

- "submit-review reason is required in UI but never reaches API audit"

## 6. Reviewer Handoff Notes

When `Codex2` reviews this sidecar packet, the expected decision is narrow:

1. confirm this packet matches the *current* parent state: `MAP-FE-ADM-001` is
   `in_progress`, not `review`
2. confirm `MAP-BE-006` dependency status is sourced from
   `ai-task-archive.jsonl`, because the live board no longer contains a showable
   task slice
3. confirm the `MAP-UI-002`, `MAP-UI-002-HARDEN-001`, and
   `MAP-UI-002-INTEGRATE-001` review gates are still called out explicitly
4. confirm the packet distinguishes repo-local corrective evidence from the
   four still-open parent blockers
5. confirm the packet stays support-only and does not mutate canonical truth or
   the parent implementation

This packet should not be read as:

- approval of the parent branch
- proof that Gate B is closed
- proof that `MAP-QA-002` or `MAP-REL` are finished

## 7. Sidecar Verification

This pass adds only:

- `support/sidecars/MAP-FE-ADM-001/MAP-FE-ADM-001-SIDECAR-ACCEPTANCE.md`

Verification used for this packet:

- `AI_NAME=Codex scripts/ai-status.sh show MAP-FE-ADM-001-SIDECAR-ACCEPTANCE`
- `AI_NAME=Codex scripts/ai-status.sh show MAP-FE-ADM-001`
- `AI_NAME=Codex scripts/ai-status.sh show MAP-UI-002`
- `AI_NAME=Codex scripts/ai-status.sh show MAP-UI-002-HARDEN-001`
- `AI_NAME=Codex scripts/ai-status.sh show MAP-UI-002-INTEGRATE-001`
- `AI_NAME=Codex scripts/ai-status.sh show MAP-FE-ADM-001-SIDECAR-REVIEW`
- `AI_NAME=Codex scripts/ai-status.sh list --status in_progress`
- `AI_NAME=Codex scripts/ai-status.sh list --status review`
- `AI_NAME=Codex scripts/ai-status.sh list --status review_approved`
- `grep -n 'MAP-BE-006' "$AI_STATUS_ROOT/ai-task-archive.jsonl"`
- `grep -n 'MAP-FE-ADM-001-SIDECAR-ACCEPTANCE\|MAP-FE-ADM-001-SIDECAR-REVIEW\|MAP-OBS-001' "$AI_STATUS_ROOT/ai-activity-log.jsonl" | tail -n 20`
- `git show origin/codex/map-fe-adm-001-gateb-corrective:...` for the cited
  page, helper, test, screen-requirements, final-evidence, and api-client files
- `git diff --check -- support/sidecars/MAP-FE-ADM-001/MAP-FE-ADM-001-SIDECAR-ACCEPTANCE.md`

No runtime checks were run for this sidecar itself because it is a support-only
artifact and does not change executable behavior.
