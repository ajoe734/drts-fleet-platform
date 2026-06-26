# P2-UI-ROC-002 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `P2-UI-ROC-002` — ROC Console takeover queue + evidence deep-link + ActionReceipt
**Parent Owner:** `Codex2`
**Parent Reviewer:** `Codex`
**Sidecar Owner:** `Claude2`
**Sidecar Reviewer:** `Codex2`
**Generated:** `2026-06-26` (UTC)
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` — support-only. This packet does not modify
canonical truth, the design canvas, the contracts bundle, runtime behavior, or any L1/L2
product surface. For the live machine-truth status of this sidecar row, read
`ai-status.json -> P2-UI-ROC-002-SIDECAR-ACCEPTANCE.status` directly via
`scripts/ai-status.sh show P2-UI-ROC-002-SIDECAR-ACCEPTANCE`; this packet does not snapshot it.

This packet is the forward-looking acceptance map for parent `P2-UI-ROC-002`. At packet
write the parent is `in_progress` and **reworking after a review failure** — its `next`
field reads: _"Reworking task after review failure: verify canvas availability, remove
invented ROC screen work if needed, and align delivery to design-contract-compliant
requirements packet plus missing action plumbing."_ The packet exists so that when the
parent owner re-hands-off, the acceptance framing, dependency map, **canvas-availability
resolution**, and reviewer evidence anchors are already pinned to current truth. It does
**not** pre-approve the parent diff.

---

## 1. Scope Boundary

In scope:

- Translate the parent's single-line `acceptance` field into a concrete, citation-anchored
  acceptance checklist mapped to the ROC design canvas and the three upstream slices.
- Pin the dependency map and confirm each upstream slice is `done` on `dev`.
- Resolve the parent's open question — **"verify canvas availability"** — with the exact ref,
  blob, and the commit that removed the canvas from `dev`.
- Record the design-contract guardrails that the parent's review failure ("invented ROC
  screen work") tripped, so the re-roll does not repeat them.
- Preserve a reviewer-handoff command block the assigned reviewers can run after the parent
  owner finalizes.

Out of scope:

- editing L1/L2 product truth (`phase1_*`, `packages/contracts/**`), the design canvas
  (`docs/05-ui/drts-design-canvas/**`), or the parent task's machine-truth fields
- editing `apps/roc-console-web/**` or any other parent-write-scope file
- pre-running the parent's acceptance command, opening a parent-scoped commit, or altering
  parent ownership/reviewership
- predicting the exact shape of the parent diff before the parent owner finalizes it

---

## 2. Machine Truth Anchors

`dev` tip at packet write: `d76ef652c` (`P2-DP-S6-001: add KPI baseline collection mode (#970)`).

### Sidecar (this task) — `ai-status.json -> P2-UI-ROC-002-SIDECAR-ACCEPTANCE`

- owner=`Claude2`, reviewer=`Codex2`
- task_class=`sidecar`, helper_parent=`P2-UI-ROC-002`, helper_kind=`acceptance_packet`
- mutates_canonical=`false`, auto_generated=`true`, auto_created_by=`supervisor-underutilization`
- depends_on: `P2-UI-ROC-001`, `P2-CORR-001`, `P2-DP-C1-001` (mirrors the parent set)
- artifacts: `support/sidecars/P2-UI-ROC-002/P2-UI-ROC-002-SIDECAR-ACCEPTANCE.md` (this file)
- acceptance: `Create support artifacts only` · `Do not edit canonical truth` ·
  `Hand off the packet to the assigned reviewer`

### Parent — `ai-status.json -> P2-UI-ROC-002`

- owner=`Codex2`, reviewer=`Codex`, status=`in_progress` (post review-failure rework)
- depends_on: `P2-UI-ROC-001`, `P2-CORR-001`, `P2-DP-C1-001`
- artifacts: `apps/roc-console-web/`, `docs/05-ui/drts-design-canvas/roc-screens-2.jsx`
- acceptance (verbatim, single string):
  > Takeover screen shows 3 non-merged columns; evidence deep-links to platform-admin via
  > backend link; ActionReceipt shown on writes; matches canvas; typecheck+build pass

### Authoritative source documents

- Design canvas (visual truth): `docs/05-ui/drts-design-canvas/roc-screens-1.jsx`
  (`ROC_Takeover`, screen 6 — the 3-column takeover truth), `roc-screens-2.jsx`
  (Evidence/Incidents/Reports), `ROC Console.html`. **See §3 canvas-availability note —
  these are NOT on `dev`.**
- Realm tokens (design contract): `packages/ui-tokens` — ROC realm. Raw hex in
  `globals.css`/components is a DEFECT, not a style choice.
- Phase-2 spec: `docs/02-architecture/phase2-tesla-fsd-sandbox/07_roc_console_and_safety_operator_spec.md`,
  `06_safety_takeover_incident_evidence_spec.md`.

---

## 3. Dependency Map

### Formal upstream dependencies — all `done` on `dev`

| Dep | Final commit (on `origin/dev`) | What it provides to P2-UI-ROC-002 |
|-----|--------------------------------|-----------------------------------|
| `P2-UI-ROC-001` | `1892c1c388a339e2dde19b6721f3d7ceebd1d4d7` (#958) | The `apps/roc-console-web/` shell + **action plumbing** the parent extends. |
| `P2-CORR-001` | `2714f291267477ab34550ffce60a23afc33d78fa` | Backend **3-source takeover correlation** + the **backend deep-link** contract. |
| `P2-DP-C1-001` | `17650b25e144eb44a3d0ac56aa0344feafe39a9b` (#962) | The **platform-admin deep-link target** routes (evidence / investigation / compliance). |

All three commit hashes are confirmed ancestors of `origin/dev` (`d76ef652c`).

**`P2-UI-ROC-001` (app shell + action runtime).** Delivered pages under
`apps/roc-console-web/app/`: `overview`, `liveboard`, `trips`, `vehicles`,
`vehicles/[vehicleId]`, `provider`, `handover`, `control-plane-proxy`. Delivered the
reusable runtime the parent needs:
- `apps/roc-console-web/lib/action-runtime.ts` (write/action runtime)
- `apps/roc-console-web/components/roc-action-rail.tsx` (ActionReceipt host)
- `apps/roc-console-web/components/roc-screen-primitives.tsx`, `lib/roc-theme.ts`,
  `lib/roc-shell-nav.ts`, `lib/roc-page-data.ts`, `lib/api-client.server.ts`
- **Not delivered** (i.e. the parent's net-new screen surface): `takeover`, `alerts`,
  `incidents`, `evidence`, `reports`. The parent's primary deliverable is the
  **`takeover`** screen; the acceptance string names only Takeover + evidence deep-link +
  ActionReceipt.

**`P2-CORR-001` (backend correlation + deep-link contract).** Added
`apps/api/src/modules/roc-operations/**` and `apps/api/src/modules/accident-investigation/**`
plus contracts in `packages/contracts/src/phase2-tesla-fsd-sandbox.ts`. The takeover
correlation object keeps the three sources **separate and un-merged**:
- `teslaEvent` (原廠事件 / tesla), `safetyOperatorTakeoverReport` (安全員回報 / operator),
  `rocTakeoverResponse` (ROC 處置 / roc_response), with `discrepancyCaseIds` preserving
  divergence and `manualCorrelation` for the explicit human link.
- `investigationLink?: CrossAppResourceLink | null` is the **backend-emitted deep-link**;
  `roc-operations.service.ts:2341` emits route `/platform-admin/investigations`.
- E2E: `apps/api/tests/integration/e2e-p2-004-takeover-correlation.test.ts`.

**`P2-DP-C1-001` (deep-link target).** Added the platform-admin routes the ROC evidence
link points at: `apps/platform-admin-web/app/platform-admin/investigations/[caseId]/page.tsx`,
`.../evidence/manifests/[manifestId]/page.tsx`, `.../compliance/trips/[tripId]/page.tsx`,
plus the auth policy guarding them (`apps/api/src/common/auth/auth.policy.ts`).

### ⚠ Canvas availability (resolves the parent's open blocker)

The parent `next` says _"verify canvas availability"_. Verified:

- The ROC design canvas is **absent from `dev`**. `docs/05-ui/drts-design-canvas/roc-*`
  is not tracked at `d76ef652c`.
- It was deleted from `dev` by `5727eef1f` (`P2-SAFE-001: safety-operator takeover +
  offline replay runtime (#930)`) — the same commit family that stripped the CMP canvas.
- It is intact on `origin/phase2-tesla-sandbox-docs-20260625`:
  - `roc-screens-1.jsx` — blob `63937d13e` — **contains `ROC_Takeover` (screen 6), the
    3-column takeover truth** (`原廠事件`/`安全員回報`/`ROC 處置`, "never merged").
  - `roc-screens-2.jsx` — blob `b1d1f11fe` — Evidence/Incidents/Reports/Provider/Handover.
  - `ROC Console.html` — blob `363257b60`.
- **Discrepancy to flag:** the parent's named artifact is `roc-screens-2.jsx`, but the
  **Takeover** screen that the acceptance string is about lives in **`roc-screens-1.jsx`**.
  The re-roll must read `roc-screens-1.jsx` (`ROC_Takeover`) as the visual truth for the
  takeover queue, not invent it from `roc-screens-2.jsx`.

This is the same shape as `P2-UI-CMP-001` and `P2-UI-SAFE-001`: **Step-0 of the re-roll is
to republish the canvas blob(s) from the docs branch into the task tree as a read-only
design input** (so the diff can be self-checked against the realm tokens + canvas), **not**
to invent ROC screens. The prior review failure ("invented ROC screen work") is exactly the
failure mode that canvas-republish-first prevents.

### Formal downstream dependents

None recorded against `P2-UI-ROC-002` in machine truth at packet write. Blast radius of the
parent diff is contained to `apps/roc-console-web/**` plus the canvas republish; the backend
correlation + platform-admin target are already landed and unchanged by the parent.

### Ordering guidance

All three formal blockers are `done` on `dev`. The only non-status precondition is the
**canvas republish** above. There is no remaining upstream code gate.

---

## 4. Acceptance Checklist

Decomposition of the parent's single acceptance string into auditable checks. `[REQUIRED]`
maps to an explicit acceptance clause; `[DERIVED]` is a design-contract / scope obligation.

### A. Takeover screen shows 3 non-merged columns `[REQUIRED]`
- A net-new route exists, e.g. `apps/roc-console-web/app/takeover/page.tsx`.
- Renders **three columns** — `原廠事件` (tesla), `安全員回報` (operator), `ROC 處置`
  (roc_response) — side by side, **never reconciled into a single narrative**. Divergence
  (e.g. provider not exposing a reason while operator/ROC still record) is preserved.
- Visual structure matches `ROC_Takeover` in `roc-screens-1.jsx` (republished canvas).

### B. Columns hydrate from backend correlation, not invented client-side `[REQUIRED→DERIVED]`
- The three columns map to `teslaEvent` / `safetyOperatorTakeoverReport` /
  `rocTakeoverResponse` from the `P2-CORR-001` takeover-correlation payload; `discrepancyCaseIds`
  surfaced. No client-side synthesis of a merged "truth".

### C. Evidence deep-links to platform-admin via backend link `[REQUIRED]`
- The evidence / investigation link is rendered from the **backend-provided**
  `CrossAppResourceLink` (`investigationLink`, and the evidence-manifest link via
  `evidenceManifestId`) — `targetApp` = platform-admin, `route` supplied by the API
  (`/platform-admin/investigations/[caseId]`, `/platform-admin/evidence/manifests/[manifestId]`).
- The URL is **not** hand-constructed in the ROC client. Target routes exist (`P2-DP-C1-001`).

### D. ActionReceipt shown on writes `[REQUIRED]`
- Write actions (`request_evidence`, `create_incident`, `mark_reviewed` per canvas) route
  through `lib/action-runtime.ts`; on success an **ActionReceipt** (contract
  `packages/contracts/src/ui-runtime.ts:203 ActionReceipt`) is rendered via
  `components/roc-action-rail.tsx`.

### E. CTAs are availableActions-driven; no remote driving `[DERIVED]`
- Buttons use `ResourceActionDescriptor` (`enabled` / `disabledReasonCode`); a disabled
  action shows its reason. `remote_drive` is permanently disabled
  (`no_remote_driving_in_sandbox`). This is a phase-2 hard rule.

### F. Matches canvas under the design contract `[REQUIRED]`
- Colors/typography from `@drts/ui-tokens` ROC realm; **no raw hex** in `globals.css`/components.
- Screens match the republished canvas; **no invented screens** beyond what the canvas/spec
  define (the prior review-failure cause).

### G. typecheck + build pass `[REQUIRED]`
- `apps/roc-console-web` typecheck + build green; `packages/contracts` builds (consumed, not
  modified).

### H. Scope containment `[DERIVED]`
- Writes confined to `apps/roc-console-web/**` (+ the canvas republish under
  `docs/05-ui/drts-design-canvas/**`). **No** mutation of L1 truth or `packages/contracts/**`
  (the correlation/deep-link contracts already landed via `P2-CORR-001`).

### I. Commit evidence at parent finalize `[REQUIRED]`
- Closeout commit subject `P2-UI-ROC-002:` (passes `CLOSEOUT_SUBJECT_RE`), trailers
  `LLM-Agent` / `Task-ID` / `Reviewer`, pushed; `INTEGRATION_STATUS` recorded.

---

## 5. Reviewer Evidence Anchors

Run from the parent's worktree after finalize (commands are read-only audits):

```bash
# Upstream slices are done on dev
for c in 1892c1c388a339e2dde19b6721f3d7ceebd1d4d7 \
         2714f291267477ab34550ffce60a23afc33d78fa \
         17650b25e144eb44a3d0ac56aa0344feafe39a9b; do
  git merge-base --is-ancestor "$c" origin/dev && echo "ON dev: $c" || echo "MISSING: $c"
done

# A/B — takeover screen + 3-column wiring
ls apps/roc-console-web/app/takeover/page.tsx
grep -nE "teslaEvent|safetyOperatorTakeoverReport|rocTakeoverResponse|discrepancyCaseIds" \
  apps/roc-console-web/app/takeover/*.tsx apps/roc-console-web/lib/*.ts

# C — backend-provided deep-link (CrossAppResourceLink), not a hand-built URL
grep -rnE "CrossAppResourceLink|investigationLink|evidenceManifestId" apps/roc-console-web
#   expect: render of backend link object; NO string-concatenated "/platform-admin/..." in client

# D/E — ActionReceipt on writes, availableActions-driven, no remote driving
grep -rnE "ActionReceipt|action-runtime|ResourceActionDescriptor|disabledReasonCode" apps/roc-console-web
grep -rnE "remote_drive|no_remote_driving_in_sandbox" apps/roc-console-web

# F — design contract: realm tokens, no raw hex
grep -rnE "#[0-9a-fA-F]{6}" apps/roc-console-web/app apps/roc-console-web/components | grep -v ui-tokens || echo "no raw hex"

# Canvas availability (Step-0 of the re-roll) — republished as read-only design input
git cat-file -e origin/phase2-tesla-sandbox-docs-20260625:docs/05-ui/drts-design-canvas/roc-screens-1.jsx \
  && echo "canvas roc-screens-1.jsx (ROC_Takeover) on docs branch, blob 63937d13e"

# G — gates
pnpm --filter @drts/roc-console-web typecheck && pnpm --filter @drts/roc-console-web build
```

---

## 6. Sidecar Acceptance Checklist (this task)

- [x] Support artifact only — single file under `support/sidecars/P2-UI-ROC-002/`; no
      canonical / contract / runtime / canvas mutation.
- [x] Dependency map pinned; all three blockers confirmed `done` and ancestors of `origin/dev`.
- [x] Parent acceptance string decomposed into auditable checks (§4) anchored to canvas +
      upstream commits.
- [x] Canvas-availability blocker resolved with ref + blobs + removing commit (§3).
- [x] Reviewer handoff commands preserved (§5).
- [ ] Hand off to reviewer `Codex2` via `scripts/ai-status.sh handoff`.

---

## 7. Reviewer Handoff Commands

```bash
# Sidecar reviewer (Codex2) — after reading this packet:
AI_NAME=Codex2 scripts/ai-status.sh approve P2-UI-ROC-002-SIDECAR-ACCEPTANCE "<conclusion>"
# or, if a correction is needed:
AI_NAME=Codex2 scripts/ai-status.sh reopen  P2-UI-ROC-002-SIDECAR-ACCEPTANCE "<reason>"
```

---

## 8. Closeout Note

Support-only packet; `mutates_canonical=false`. Integration status for this sidecar is
`not_applicable` (no runtime/contract change). The parent `P2-UI-ROC-002` remains
`in_progress` and owns its own closeout + `INTEGRATION_STATUS`; this packet does not
pre-approve the parent diff. The single most load-bearing finding for the re-roll: **the
Takeover 3-column screen is `ROC_Takeover` in `roc-screens-1.jsx` (not the parent-named
`roc-screens-2.jsx`), and the whole ROC canvas must be republished from
`origin/phase2-tesla-sandbox-docs-20260625` before any UI is written** — that, plus
sourcing columns + deep-link from the already-landed backend, is what avoids a repeat of the
"invented ROC screen work" review failure.
