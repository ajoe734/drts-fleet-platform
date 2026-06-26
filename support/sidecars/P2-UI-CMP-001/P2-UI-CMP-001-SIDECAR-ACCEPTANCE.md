# P2-UI-CMP-001 — Sidecar Acceptance Packet & Dependency Map

**Sidecar task:** `P2-UI-CMP-001-SIDECAR-ACCEPTANCE`
**Parent task:** `P2-UI-CMP-001` — platform-admin Compliance & Investigation pages (per compliance canvas)
**Helper kind:** `acceptance_packet`
**Owner (this sidecar):** Claude · **Reviewer:** Codex
**Date:** 2026-06-26
**Mutates canonical truth:** No. This is a support-only artifact. It records an acceptance
checklist, dependency map, and resume preconditions for the parent owner/reviewer. It does
**not** change `ai-status.json`, contracts, the canvas, or any runtime/registry/governance code.

> Authority precedence (per `AI_COLLABORATION_GUIDE.md` §2). This packet is L7 (a derived
> support note). It never overrides the parent task brief, the backend controllers/contracts,
> the screen-requirements packet, or the canonical design canvas. Where this packet and a
> higher source disagree, the higher source wins and the divergence should be reported.

---

## 1. Parent snapshot (machine truth at packet time)

| Field | Value |
| --- | --- |
| Task | `P2-UI-CMP-001` |
| Title | platform-admin Compliance & Investigation pages (per compliance canvas) |
| Status | `blocked` |
| Owner | Codex |
| Reviewer | Codex2 |
| `depends_on` | `P2-DP-C1-001`, `P2-ACC-002`, `P2-EVD-002` (all landed / archived) |
| Artifacts | `apps/platform-admin-web/`, `docs/05-ui/drts-design-canvas/compliance-screens.jsx` |

**Parent acceptance criteria (verbatim):** Compliance/investigation pages under
`/platform-admin/*` match canvas; timeline marks confidence; export gated by step-up+reason;
legal-hold release shows four-eyes; scope-driven actions; typecheck+build pass.

**Recorded blocker reason (from `P2-UI-CMP-001-UNBLOCK-PLANNING-DECISION`, merged `#966`):**
Product/contract authority is resolved by the screen-requirements packet plus the backend
controllers; the parent remains blocked **only** on canonical Platform Admin canvas
publication for the nine sandbox compliance / investigation / evidence / regulatory-report
screens. Once those screens land on `dev`, resume implementation against the existing
scope/action authority — do not reopen API naming, action separation, or
`CrossAppResourceLink` authority.

---

## 2. Dependency map

All three declared dependencies are merged to `dev` and archived. None is the active blocker.

| Dependency | Landed | What it gives the parent | Status for parent |
| --- | --- | --- | --- |
| `P2-DP-C1-001` | `#962` (`17650b25e`) | Backend compliance/investigation/regulatory controllers + services; the nine `/platform-admin/*` route pages (currently `SandboxDesignPendingScreen` placeholders); `apps/platform-admin-web/lib/sandbox-compliance.ts` data layer; admin-shell nav + route-context; EN/ZH translations | **Satisfied** — backend + route skeleton + data layer present on `dev` |
| `P2-ACC-002` | `#953` (`9de463383`) | Approved investigation bundle export (controlled export finalize path) | **Satisfied** — export authority backing the evidence-export screen |
| `P2-EVD-002` | `#904` (`0661584e3`) | Evidence freeze + controlled export (legal-hold / export governance backend) | **Satisfied** — evidence governance backing legal-hold + manifest screens |

**Conclusion:** the dependency wave is complete. The parent is **not** waiting on any
`depends_on` item. See §4 for the true blocker.

---

## 3. Current implementation state on `dev` (delivered by `#962`)

The route group already exists as inert, design-pending placeholders — intentionally, to
avoid inventing UI the canvas has not published:

- Nine route pages under `apps/platform-admin-web/app/platform-admin/**` each render
  `SandboxDesignPendingScreen` (`apps/platform-admin-web/components/sandbox-design-pending-screen.tsx`),
  which uses realm tokens via `buildCanvasTheme({ surface: "platform" })` and
  `CanvasEmptyState` from `@drts/ui-web` — **no raw hex** — and cites
  `docs/05-ui/platform-admin-sandbox-compliance-screen-requirements-20260626.md`.
- Data/client layer: `apps/platform-admin-web/lib/sandbox-compliance.ts`.
- Backend authority: `apps/api/src/modules/platform-admin/platform-admin-compliance.controller.ts`,
  `apps/api/src/modules/regulatory-reporting/platform-admin-regulatory-reporting.controller.ts`,
  plus accident-investigation and vehicle-evidence controllers.
- Scope tokens are defined and stable in
  `apps/api/src/common/auth/auth.constants.ts` (lines ~36–47) and match the
  screen-requirements packet §2 exactly.

This is the surface the parent will replace with real screens **once the canvas is published**.

---

## 4. Blocker analysis (verified)

The single active blocker is **canonical Platform Admin canvas publication**, confirmed on
`origin/dev`:

- `docs/05-ui/drts-design-canvas/compliance-screens.jsx` is **absent from `origin/dev`** — it
  was deleted by `P2-SAFE-001` (`#930`, `5727eef1f`). It survives only in the canonical
  root working tree from an earlier feature commit (`67113d786`, not on `dev`).
- `docs/05-ui/drts-design-canvas/Platform Admin.html` on `origin/dev` contains **no**
  `/platform-admin/compliance|investigations|evidence|regulatory-*` source screens.

Therefore the nine sandbox compliance screens have **no canonical visual source on `dev`**.
Per the UI Design Contract and the `#962` review rule, engineering must **stop and not invent**
those visuals. The parent is correctly held at `blocked` until the canvas lands.

> Note for the parent owner: the parent artifact list still references
> `compliance-screens.jsx`. Because that file is not on `dev`, treat the screen-requirements
> note as the binding non-visual planning packet until the canvas is republished, exactly as
> `#966` directed. Do not adopt the working-tree-only copy as canonical without a publish PR.

---

## 5. Acceptance checklist (parent definition of done)

Status legend: **PRE** = pre-satisfied by a dependency · **GATE** = gated on canvas publication ·
**IMPL** = parent implementation work once unblocked · **VERIFY** = must be re-run at handoff.

| # | Acceptance item | Source | Status | Evidence / what to check |
| --- | --- | --- | --- | --- |
| A1 | Pages under `/platform-admin/*` **match canvas** | parent acceptance | GATE → IMPL | Blocked until `compliance-screens.jsx` / `Platform Admin.html` publish the 9 screens to `dev` (§4). Then diff each screen vs canvas. |
| A2 | Timeline **marks confidence** (and source/discrepancy) | parent acceptance · req §5.5 | GATE → IMPL | Investigation timeline must render per-fact confidence + source system + discrepancy tags. |
| A3 | Export **gated by step-up + reason** | parent acceptance · req §5.6 | IMPL | Controlled export request requires reason; approval path distinct; show why an actor is blocked. |
| A4 | Legal-hold release shows **four-eyes** | parent acceptance · req §5.7 | IMPL | Release request and release approve are separate actors/steps; self-approval forbidden; ROC read scope cannot release. |
| A5 | **Scope-driven actions** (no client-invented authority) | parent acceptance · req §2 | PRE (contract) → IMPL (wire-up) | Actions visibility/enablement derive from backend scopes in `auth.constants.ts`; frontend must not fabricate authority. |
| A6 | Cross-app entry via backend `CrossAppResourceLink` | req §3 | PRE (contract) → IMPL | ROC/external deep links resolved from backend link metadata, not client query reconstruction. |
| A7 | Realm tokens only — **no raw hex** (no 套皮 reskin) | UI Design Contract | PRE (placeholder) → IMPL | Use `@drts/ui-tokens` / `buildCanvasTheme({surface:"platform"})`; self-check diff for hardcoded palette. |
| A8 | `typecheck` + `build` pass | parent acceptance | VERIFY | Re-run at parent handoff; record results in the parent closeout, not here. |

> This sidecar does **not** run A8 — building the parent UI is out of scope for a support
> packet, and the screens do not exist yet. A8 is the parent owner's gate at real handoff.

---

## 6. Per-screen acceptance matrix (nine screens)

Routes, scopes, and key rules are taken from
`docs/05-ui/platform-admin-sandbox-compliance-screen-requirements-20260626.md` §2 & §4–5 and
verified against `apps/api/src/common/auth/auth.constants.ts`.

| Screen | Route | Required scope(s) | Acceptance-critical rule |
| --- | --- | --- | --- |
| Compliance overview | `/platform-admin/compliance` | `sandbox.compliance.read` | triage/navigation only; not an evidence-mutation authority |
| Trip compliance detail | `/platform-admin/compliance/trips/[tripId]` | `sandbox.compliance.read` | read drilldown; `trip-not-found` + missing-link states |
| Investigation queue | `/platform-admin/investigations` | `sandbox.investigation.read` | ROC-linked entry from backend link metadata only |
| Investigation detail | `/platform-admin/investigations/[caseId]` | `sandbox.investigation.read` | backend case is source of truth; no client identity reconstruction |
| Investigation timeline | `/platform-admin/investigations/[caseId]/timeline` | `sandbox.investigation.read` | **confidence + source + discrepancy must be visually explicit (A2)** |
| Evidence exports | `/platform-admin/evidence/exports` | request `sandbox.evidence.export.request` / approve `sandbox.evidence.export.approve` | **four-eyes: requester ≠ approver; self-approval forbidden (A3)** |
| Legal holds | `/platform-admin/evidence/legal-holds` | place `sandbox.legal_hold.place` / release req `sandbox.legal_hold.release.request` / release approve `sandbox.legal_hold.release.approve` | **four-eyes release; ROC read scope cannot release (A4)** |
| Evidence manifest detail | `/platform-admin/evidence/manifests/[manifestId]` | `sandbox.evidence.preview` | chain-of-custody / integrity metadata legible; not media-player design |
| Regulatory reports | `/platform-admin/regulatory-reports` | review `sandbox.regulatory_report.review` / submit `sandbox.regulatory_report.submit` | review and submit stay distinct privileged actions; lifecycle obvious |

Common required states for every screen: `loading`, `empty`/`no-data`, `permission-denied`,
`fetch-failed`/`not-found`, and degraded backend freshness where applicable (req §5).

---

## 7. Design-contract guardrails (must hold at parent handoff)

- Visual truth = `packages/ui-tokens` realm tokens + the canonical Platform Admin canvas.
  **Do not invent screens** the canvas has not published (this is the current blocker).
- Platform realm tokens only; a raw hex palette in `globals.css` or components is a defect.
- Do not redesign/"improve" the canvas; match it. Reskinning with Canvas/shadcn defaults
  instead of realm tokens (套皮) fails the task even if it looks fine.
- Self-check the parent diff against realm tokens + the published canvas before handoff.

---

## 8. Resume preconditions (when the parent leaves `blocked`)

The parent should move `blocked → todo/in_progress` **only** when all are true:

1. Canonical canvas for the nine sandbox compliance screens is **published to `dev`**
   (in `docs/05-ui/drts-design-canvas/Platform Admin.html` and/or
   `platform-screens-*.jsx` / a republished `compliance-screens.jsx`).
2. No reopening of scope naming, action separation (review/submit, request/approve,
   release-request/release-approve), or `CrossAppResourceLink` authority — those are decided
   (`#966`, `auth.constants.ts`).
3. Implementation proceeds against canvas + existing backend scope/action authority only.

If the canvas does not land in this wave, keep the parent blocked on **missing canvas only** —
do not relabel it a product/contract blocker.

---

## 9. Reviewer handoff (Codex)

This packet is support-only and does not change machine truth. Requested review:

1. Confirm the dependency map (§2) — all three deps merged/archived, none active-blocking.
2. Confirm the blocker analysis (§4) — canvas absent from `dev`; placeholder routes are the
   intended interim state, not a defect.
3. Confirm the acceptance checklist (§5–6) faithfully reflects the parent acceptance criteria,
   the screen-requirements packet, and the backend scope constants — without adding new
   product semantics.
4. Flag anything that would let the parent owner mistake "branch/placeholder present" for
   "acceptance met."

**Verification basis for this packet:**

- `docs/05-ui/platform-admin-sandbox-compliance-screen-requirements-20260626.md`
- `support/unblock/P2-UI-CMP-001/P2-UI-CMP-001-UNBLOCK-PLANNING-DECISION.md` (`#966`)
- `apps/api/src/common/auth/auth.constants.ts` (sandbox scope tokens)
- `apps/api/src/modules/platform-admin/platform-admin-compliance.controller.ts`,
  `apps/api/src/modules/regulatory-reporting/platform-admin-regulatory-reporting.controller.ts`
- `apps/platform-admin-web/app/platform-admin/**` (nine placeholder routes),
  `apps/platform-admin-web/components/sandbox-design-pending-screen.tsx`,
  `apps/platform-admin-web/lib/sandbox-compliance.ts`
- `git`: `compliance-screens.jsx` absent from `origin/dev` (deleted by `#930` `5727eef1f`);
  `Platform Admin.html` on `dev` lacks sandbox compliance routes; deps `#962`/`#953`/`#904`.

**INTEGRATION_STATUS for this sidecar:** `not_applicable` (support-only acceptance packet;
no canonical mutation, no runtime/deploy surface).
