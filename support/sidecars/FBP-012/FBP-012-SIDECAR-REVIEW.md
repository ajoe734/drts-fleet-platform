# FBP-012 Review Packet & Evidence Summary

**Sidecar Task:** `FBP-012-SIDECAR-REVIEW`  
**Parent Task:** `FBP-012`  
**Helper Kind:** `review_packet`  
**Current Owner:** Codex  
**Assigned Reviewer:** Claude  
**Parent Reviewer At Closeout:** Claude  
**Last Revised:** 2026-04-16 (UTC)  
**Status:** IN PROGRESS - ready to hand off for review

---

## 1. Purpose

This sidecar is a support-only reviewer packet for the finalized parent task `FBP-012`.

Its job is to preserve the current machine-truth trail, summarize the already-approved parent
closeout, and give the assigned sidecar reviewer a compact evidence map for the public-info /
placard / regulatory-report slice.

This document does **not** modify canonical truth, runtime behavior, contracts, registry state, or
governance state.

Companion artifact:

- `support/sidecars/FBP-012/FBP-012-SIDECAR-ACCEPTANCE.md`

---

## 2. Shared-Truth Baseline

The shared coordination files establish the following baseline:

- `ai-status.json` records parent task `FBP-012` as `done`, Owner=`Codex`, Reviewer=`Claude`,
  `depends_on=[]`, commit=`7f02fe1`, subject=`feat(FBP-012): complete public info and regulatory report flows`.
- The same task row preserves the exact parent acceptance bullets:
  - `public info、placard、regulatory report、filing package 流程對齊 blueprint operator needs`
  - `相關版本化 / artifact / signed download 規則一致`
  - `UI surface 與 backend authority 不再失衡`
- `current-work.md` mirrors that `FBP-012` closed at `2026-04-16T01:40:47Z`, and that
  `FBP-012-SIDECAR-REVIEW` remains the active support slice owned by Codex with reviewer Claude.
- `ai-activity-log.jsonl` preserves the key parent closeout chain:
  - `2026-04-16T01:39:35Z`: Codex handed `FBP-012` to Claude with the review-ready claim for
    public-info CMS, placard lineage, regulatory report jobs, filing-package flows, and
    backend-owned signed downloads
  - `2026-04-16T01:39:47Z`: Claude approved the parent task and explicitly confirmed seven review
    points: draft-only publish guard, placard linkage by `publicInfoVersionId`, backend-issued
    download metadata, complete report/package routes, ops reports parity, switchboard API-client
    parity, and clean typechecks plus 9 passing unit tests
  - `2026-04-16T01:40:47Z`: Codex finalized `FBP-012` to `done`
- `ai-status.json` also records the companion sidecar
  `FBP-012-SIDECAR-ACCEPTANCE` as `done` at `2026-04-16T01:23:52Z`.
- `ai-activity-log.jsonl` records that this review sidecar was auto-created at
  `2026-04-16T01:39:27Z`, then bounced across workers because the parent finalize path preempted
  earlier runs. The practical result is simple: the support artifact was missing and needed to be
  created after the parent already closed.

Important reviewer notes:

- This packet is **not** a working-tree review for a task still waiting on verdict. The parent task
  is already reviewer-approved and finalized in machine truth.
- The correct review scope is the finalized `7f02fe1` delta plus the shared-truth approval trail,
  not a speculative reconstruction of pre-closeout state.
- `support/sidecars/FBP-012/FBP-012-SIDECAR-ACCEPTANCE.md` already covers acceptance framing and
  baseline authority boundaries. This packet focuses on reviewer evidence and post-closeout summary.

---

## 3. Review Scope and Commit Shape

### 3.1 Finalized Commit Scope

`git show --stat --summary 7f02fe1` reports:

- 8 files changed
- 1738 insertions
- 316 deletions
- 1 new file: `apps/api/src/common/controlled-download.ts`

The finalized commit touches exactly these files:

- `apps/api/src/common/controlled-download.ts`
- `apps/api/src/modules/platform-admin/platform-admin.service.ts`
- `apps/api/src/modules/reporting-filing/download-signing.util.ts`
- `apps/ops-console-web/app/reports/page.tsx`
- `apps/platform-admin-web/app/switchboard/page.tsx`
- `packages/api-client/src/index.ts`
- `packages/contracts/src/index.ts`
- `tests/unit/platform-admin.test.ts`

### 3.2 Baseline-vs-Delta Guardrail

This matters because the parent slice sits on top of earlier authority work:

- controller-level public-info / placard routes and reporting-filing routes already existed before
  `7f02fe1`
- the companion acceptance packet already catalogs those pre-existing authority anchors
- the `FBP-012` closeout delta is therefore best understood as the operator-completion overlay:
  stronger platform-admin version semantics, shared signed-download utility consolidation, richer
  typed contract/api-client coverage, and operator-complete UI surfaces

Review should stay scoped to:

- the 8 files above
- the parent approval and done messages already recorded in shared truth
- the companion acceptance packet for baseline context

---

## 4. Implementation Evidence Snapshot

### 4.1 Backend-Owned Versioning and Signed Download Metadata

`apps/api/src/modules/platform-admin/platform-admin.service.ts` contains the core state-authority
changes that the parent reviewer approved:

- `listPublicInfoVersions()` at lines 236-240 exposes the current disclosure history
- `createPublicInfoVersion(...)` at lines 242-293 creates draft-only public-info records with audit
  evidence
- `publishPublicInfoVersion(...)` at lines 295-373 enforces the draft-only transition
  (`PUBLIC_INFO_VERSION_NOT_DRAFT` at lines 301-310), retires the previous live version at
  lines 313-345, and records immutable publish audit evidence at lines 346-370
- `generatePlacardVersion(...)` at lines 381-461 requires `publicInfoVersionId`, rejects duplicate
  `versionCode`, derives publication lineage from the source public-info version, and writes
  placard audit evidence
- `clonePlacardVersion(...)` at lines 895-927 backfills `artifactManifestHash`,
  `artifactDownloadUrl`, `artifactExpiresAt`, and `downloadMetadata` even for persisted legacy
  records
- `createPlacardDownloadMetadata(...)` at lines 955-969 centralizes placard signed-download
  issuance through the shared controlled-download utility

`apps/api/src/common/controlled-download.ts` is the new shared signing primitive:

- defaults for host / TTL / keying live at lines 3-9
- `createControlledDownloadMetadata(...)` at lines 38-87 builds immutable signed metadata,
  including `keyId`, `expiresAt`, `signatureVersion`, and `downloadUrl`
- `buildControlledDownloadUrl(...)` at lines 97-117 standardizes the issued query parameters
  (`signed_at`, `expires_at`, `key_id`, `sig`, `sig_v`)

`apps/api/src/modules/reporting-filing/download-signing.util.ts` at line 1 now simply re-exports
the shared utility, which is the evidence that report/package download signing no longer forks its
own logic away from the common backend authority path.

### 4.2 Switchboard Operator Surface

`apps/platform-admin-web/app/switchboard/page.tsx` is now the operator-complete public-info /
placard surface rather than a thin placeholder:

- `loadData()` at lines 83-98 loads public-info and placard history from the API client, not local
  mock data
- `handleCreatePublicInfo(...)` at lines 136-161 creates draft disclosure versions through
  `client.createPublicInfoVersion(...)`
- `handlePublish(...)` at lines 163-176 publishes a selected draft through
  `client.publishPublicInfoVersion(...)`
- `handleGeneratePlacard(...)` at lines 178-201 generates placard versions through
  `client.generatePlacardVersion(...)`
- the page header and summary cards at lines 207-267 frame the surface as the authoritative admin
  control plane for disclosures and seat-back placards
- the public-info table at lines 533-604 shows lifecycle, effective dates, publish actor, and
  immutable-history behavior
- the placard table at lines 608-685 shows source `publicInfoVersionId` lineage, manifest hash,
  signed download URL, expiry time, and published-vs-draft state directly from the backend record

Reviewer hotspot:

- lines 596-598 intentionally render `Immutable history` for non-draft public-info rows instead of
  exposing edit/publish actions on already-published records

### 4.3 Reports & Filing Operator Surface

`apps/ops-console-web/app/reports/page.tsx` now exposes the regulatory-report and filing-package
operator workflow breadth approved by Claude:

- `loadData()` at lines 169-199 loads report jobs and filing packages together from the API client
- `handleReportSubmit(...)` at lines 230-255 creates background report jobs via
  `client.createReportJob(...)`
- `handlePackageSubmit(...)` at lines 257-275 generates immutable filing packages via
  `client.generateFilingPackage(...)`
- the page description at lines 293-296 explicitly frames the surface around authoritative
  reporting service outputs and signed artifacts
- report detail at lines 465-585 renders backend-returned status, filters, manifest hash, expiry,
  and signed artifact download metadata
- package detail at lines 589-733 renders immutable package state, signed ZIP/PDF downloads, and
  manifest entries with per-item artifact IDs and hashes
- the list tables at lines 737-935 expose report/package status, manifest presence, artifact links,
  and inspect actions using API data only

Reviewer hotspot:

- lines 628-669 and 673-725 are the strongest evidence that signed downloads and immutable
  manifests remain backend-owned; the UI only renders issued metadata and does not synthesize it

### 4.4 Shared Contracts and API-Client Parity

`packages/api-client/src/index.ts` carries the typed bridge the two UIs use:

- report / filing methods at lines 717-767:
  - `createReportJob`
  - `listReportJobs`
  - `getReportJob`
  - `generateFilingPackage`
  - `listFilingPackages`
  - `getFilingPackage`
- public-info / placard methods at lines 897-934:
  - `listPublicInfo`
  - `createPublicInfoVersion`
  - `publishPublicInfoVersion`
  - `listPlacards`
  - `generatePlacardVersion`

`packages/contracts/src/index.ts` provides the corresponding truth-shaped types:

- `PublicInfoVersionRecord` and its status model at lines 918-957
- `PlacardVersionRecord` and `GeneratePlacardVersionCommand` at lines 959-980
- `REGULATORY_REPORT_JOB_TYPES` at lines 1315-1325
- `ReportJobRecord` / `ReportJobDetailRecord` with controlled-download metadata at
  lines 1381-1408
- `FILING_PACKAGE_TYPES` plus `FilingPackageRecord` / `FilingPackageDetailRecord` at
  lines 1410-1480

This is the contract evidence behind Claude's approval note that
`FILING_PACKAGE_TYPES` / `REGULATORY_REPORT_JOB_TYPES` are fully present and that both operator UIs
run through `@drts/api-client`.

### 4.5 Test and Validation Evidence

`tests/unit/platform-admin.test.ts` adds focused platform-admin authority coverage:

- publish immutability and audit evidence at lines 7-39
- repository rehydration plus placard signed-download metadata persistence at lines 41-101
- legacy placard metadata backfill at lines 103-160

Shared machine truth records the rest of the validation outcome:

- Claude's `review_approved` note states `@drts/platform-admin-web` and
  `@drts/ops-console-web` typechecks were clean
- Codex's `done` closeout states `@drts/api`, `@drts/platform-admin-web`, and
  `@drts/ops-console-web` typechecks passed
- Claude's review note and Codex's closeout both record that 9 unit tests passed

Practical interpretation:

- the commit itself adds targeted platform-admin unit coverage
- the parent review verdict confirms the broader report/package/platform-admin validation set

---

## 5. Parent Acceptance Criteria Readout

Using only current machine truth plus the finalized `7f02fe1` evidence map:

| Parent AC                                                                                   | Review posture        | Evidence                                                                                                                                                             |
| ------------------------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public info、placard、regulatory report、filing package 流程對齊 blueprint operator needs` | `REVIEWED_AND_CLOSED` | switchboard draft/publish/generate flows, ops reports job/package create+inspect flows, contract constants and typed client parity, Claude parent approval           |
| `相關版本化 / artifact / signed download 規則一致`                                          | `REVIEWED_AND_CLOSED` | draft-only publish guard, previous-version retirement, `publicInfoVersionId` placard lineage, shared controlled-download utility, immutable package/detail rendering |
| `UI surface 與 backend authority 不再失衡`                                                  | `REVIEWED_AND_CLOSED` | switchboard and reports pages read/write through `@drts/api-client`, signed downloads/manifests/statuses rendered from API data, reviewer-confirmed clean typechecks |

---

## 6. Reviewer Focus

Claude should review this helper packet against four questions:

1. Does the packet stay support-only and avoid rewriting canonical truth or mainline runtime?
2. Does it clearly distinguish the pre-existing authority baseline from the finalized `7f02fe1`
   operator-completion delta?
3. Do the evidence anchors support the exact seven review claims already recorded on the parent
   task?
4. Is the companion relationship with
   `support/sidecars/FBP-012/FBP-012-SIDECAR-ACCEPTANCE.md` clear enough for downstream consumers
   such as `FBP-013`?

Suggested approval wording:

> `審查通過：FBP-012 sidecar review packet 已正確彙整 shared-truth closeout、7f02fe1 的 8-file evidence scope、public-info/placard/reporting signed-download authority 錨點，以及 switchboard / ops reports reviewer hotspots；support artifact only，未改 canonical truth。回到 owner（Codex）以 NO_COMMIT_REQUIRED=1 做 done closeout。`

Suggested reopen wording:

> `packet needs revision: [specify machine-truth drift / evidence-anchor mismatch / baseline-vs-delta confusion / scope violation]`

---

## 7. Handoff / Review / Closeout Commands

Owner handoff to Claude:

```bash
AI_NAME=Codex python3 scripts/ai_status.py handoff FBP-012-SIDECAR-REVIEW Claude "FBP-012 review packet ready in support/sidecars/FBP-012/FBP-012-SIDECAR-REVIEW.md. It captures the finalized parent closeout at commit 7f02fe1, the 8-file evidence scope, the shared controlled-download authority path, and the switchboard / ops reports reviewer hotspots without changing canonical truth."
```

Reviewer approval:

```bash
AI_NAME=Claude \
REVIEW_FILE=support/sidecars/FBP-012/FBP-012-SIDECAR-REVIEW.md \
REVIEW_NOTES_ZH='審查通過：FBP-012 sidecar review packet 已正確彙整 shared-truth closeout、7f02fe1 的 8-file evidence scope、public-info/placard/reporting signed-download authority 錨點，以及 switchboard / ops reports reviewer hotspots；support artifact only，未改 canonical truth。|回到 owner（Codex）以 NO_COMMIT_REQUIRED=1 做 done closeout。' \
python3 scripts/ai_status.py approve FBP-012-SIDECAR-REVIEW \
  "Review approved. The packet preserves the finalized FBP-012 closeout, the exact 7f02fe1 evidence scope, and the backend-authority guardrails for public info, placards, report jobs, and filing packages without changing canonical truth."
```

Reviewer reopen:

```bash
AI_NAME=Claude python3 scripts/ai_status.py reopen FBP-012-SIDECAR-REVIEW \
  "packet needs revision: [specify machine-truth drift / evidence-anchor mismatch / baseline-vs-delta confusion / scope violation]"
```

Owner closeout after approval:

```bash
AI_NAME=Codex NO_COMMIT_REQUIRED=1 python3 scripts/ai_status.py done FBP-012-SIDECAR-REVIEW \
  "Done: FBP-012 review packet recorded the finalized parent closeout, reviewer evidence scope, and support-only handoff guidance without changing canonical truth."
```

---

## 8. Change Log

- 2026-04-16 — Codex created this review packet after the parent `FBP-012` closeout was already
  recorded in shared truth; earlier sidecar worker runs were superseded while the parent review and
  finalize path took priority.
- 2026-04-16 — Packet anchored the reviewer summary to the finalized commit `7f02fe1`, the shared
  approval trail, the 8-file delta, and the companion acceptance artifact.
