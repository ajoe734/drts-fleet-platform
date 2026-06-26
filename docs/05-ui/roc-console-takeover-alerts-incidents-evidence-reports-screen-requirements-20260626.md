# ROC Console — Takeover / Alerts / Incidents / Evidence / Reports (Design Hand-off)

**Date:** 2026-06-26  
**Feature:** ROC Console response surfaces for takeover governance, alert triage, incident escalation, evidence review, and report packaging  
**Recipient team:** Visual design / UX  
**Status:** Hand-off input. **No visual decisions in this document.**  
**Author lane:** Codex2  
**Authority for behaviour/data/API:** `Task Brief P2-UI-ROC-002` · `docs/02-architecture/cross-app-navigation-and-shell-topology-20260524.md` · `docs/02-architecture/ui-authority-actions-contract-20260524.md` · `apps/roc-console-web/README.md`
**Visual authority available today:** shared ROC shell / tokens only. `docs/05-ui/drts-design-canvas/roc-screens-2.jsx` is absent, and `docs/05-ui/drts-design-canvas/` contains no canonical source screens for these route groups.

> This packet exists because the task brief names `docs/05-ui/drts-design-canvas/roc-screens-2.jsx` as the design source, but that file does not exist in the repository. Per the UI design contract, engineering must not invent or substitute visual designs when the canvas is missing. This note defines the required screen set and behaviour so the visual team can add canonical ROC source screens later.

---

## 1. Why this packet exists

- The ROC Console already has route landings for:
  - `/takeover`
  - `/alerts`
  - `/incidents`
  - `/evidence`
  - `/reports`
- The shell/chrome exists from earlier ROC scaffold work, but the design-canvas directory does not include `roc-screens-2.jsx` or any other canonical ROC source screens for these response surfaces.
- Review requirement for `P2-UI-ROC-002`: when the referenced canvas is absent, stop visual invention and produce a screen-requirements hand-off instead.

## 2. Roles and operating boundaries

Primary personas:

- `roc_duty_operator` — monitors takeover truth, triages alerts, and triggers allowed actions.
- `roc_shift_lead` — reviews escalations, discrepancy posture, and unresolved evidence/report items.
- `roc_compliance_reviewer` — reviews evidence freeze state and filing package readiness, but does not replace platform-admin investigation authority.

Operating boundaries:

- ROC is a **read-only monitoring and governance console** for sandbox AV operations. It is not a remote-driving cockpit.
- Investigation detail, evidence manifest drilldown, legal hold, and regulator submission authority remain platform-admin owned.
- Same-resource write CTAs shown inside ROC must come only from backend-provided `availableActions`.

## 3. Cross-app and write-contract rules

- The frontend must consume backend-provided `CrossAppResourceLink` for investigation / platform-admin deep links. It must not compose platform-admin URLs from local ids.
- When a row exposes an `investigationLink`, the link target is already backend-authoritative and may open in a new tab.
- Every write CTA rendered on these surfaces must be derived directly from the same record's `availableActions`.
- Successful writes must surface the backend-returned `ActionReceipt` inline on the screen; the frontend must not synthesize a fake accepted state.
- If a resource has no supported `availableActions`, the screen shows no write affordance for that row/context.

## 4. Sitemap to design

| Screen         | Route        | Purpose                                                                                |
| -------------- | ------------ | -------------------------------------------------------------------------------------- |
| Takeover queue | `/takeover`  | three-source governance review for correlated takeover cases                           |
| Alerts         | `/alerts`    | active alert triage and per-alert action entry                                         |
| Incidents      | `/incidents` | discrepancy / escalation review that stays ROC-owned until linked investigation closes |
| Evidence       | `/evidence`  | compact evidence roster with summary and freeze posture only                           |
| Reports        | `/reports`   | filing-package and takeover-summary readiness derived from ROC evidence state          |

## 5. Per-screen functional briefs

### 5.1 Takeover queue — `/takeover`

- **Purpose:** review correlated sandbox takeover cases without collapsing source truth.
- **Non-negotiable layout rule:** each case must present **three parallel columns** and must not merge them into one narrative:
  - Tesla original event
  - Safety-operator report
  - ROC disposition
- **Data to surface:** takeover case id; vehicle; order/trip reference when available; correlation priority; timestamps by source; Tesla takeover correlation id and transition; safety-operator reason/disposition/notes; ROC response type/outcome; discrepancy flag; matching method.
- **Actions:** open backend-provided linked investigation when available.
- **States:** loading; empty queue; discrepancy present; investigation link absent; fallback data freshness warning.
- **Constraints:** the three columns are separate truth sources, not a single reconciled story.

### 5.2 Alerts — `/alerts`

- **Purpose:** operational alert queue for current ROC duty review.
- **Data to surface:** alert title; vehicle; severity; source tag; status; updated time; count or presence of `availableActions`.
- **Actions:** invoke only backend-exposed actions from `availableActions`; show returned `ActionReceipt` inline after success.
- **States:** loading; empty; action pending; action failed; action success with receipt; fallback freshness warning.
- **Constraints:** this screen is ROC triage only; no remote-driving or manual control affordance.

### 5.3 Incidents — `/incidents`

- **Purpose:** hold takeover discrepancies and escalations that still require ROC governance review.
- **Data to surface:** incident id; vehicle; title; source (`takeover_discrepancy` or alert-driven escalation); status; summary; investigation link when available.
- **Actions:** open linked platform-admin investigation via backend `CrossAppResourceLink`.
- **States:** loading; empty; permission-limited link absent; stale/degraded data warning.
- **Constraints:** a persistent guardrail message should make clear that platform-admin owns the canonical investigation, while ROC retains the queue until closure.

### 5.4 Evidence — `/evidence`

- **Purpose:** review evidence posture relevant to ROC without exposing raw evidence browsing inside ROC.
- **Data to surface:** evidence id; vehicle; **summary**; **freeze status**; linked investigation when available.
- **Actions:** open platform-admin investigation/evidence context through backend `investigationLink`; invoke freeze-related write actions only when exposed through `availableActions`.
- **States:** loading; empty; no investigation link; action pending/success/failure; fallback freshness warning.
- **Constraints:** ROC must **not** render raw evidence objects, playback, or deep manifest browsing here. This screen shows summary + freeze posture only; original evidence drilldown belongs to platform-admin.

### 5.5 Reports — `/reports`

- **Purpose:** track regulator-facing package readiness and takeover summary outputs derived from evidence/investigation state.
- **Data to surface:** report id; report kind; subject; evidence/time window label; status (`ready` / `pending_review` and any future backend states); evidence count; linked investigation when available.
- **Actions:** open linked investigation via backend link.
- **States:** loading; empty; report pending review; ready; investigation link absent; fallback freshness warning.
- **Constraints:** filing readiness is downstream from evidence/investigation state; ROC report rows are not a substitute for platform-admin filing detail.

## 6. Shared copy / state intent for design

- ROC screens should explicitly communicate that the surface is **monitoring/governance only**.
- Data freshness / fallback mode should be visible on every screen because these routes may render with fallback snapshots if control-plane data is unavailable.
- Cross-app exits to platform-admin should be visually distinguishable from same-surface actions once the canvas exists.
- Where writes are allowed, receipt/audit tracking must have a clear post-success location in the row or side rail.

## 7. Open visual questions for design

- How should the three-column takeover truth be laid out on desktop and on narrower widths without visually implying a merged narrative?
- What visual treatment should distinguish backend-authoritative cross-app investigation links from same-surface actions?
- How should `availableActions` density be presented on alerts/evidence so action count, disabled state, pending state, and `ActionReceipt` are all legible?
- What is the clearest pattern for showing ROC-owned queue status versus platform-admin-owned investigation authority on the incidents and reports surfaces?
- How should fallback freshness warnings integrate with the shared ROC shell without masking the operational tables/cards beneath them?

## 8. Out of scope

- No new visual palette beyond ROC realm tokens / existing shared shell tokens.
- No invention of missing ROC screen layouts in engineering code or docs beyond functional requirements.
- No raw evidence browser, media player, or platform-admin manifest UI inside ROC.
- No product-semantic changes beyond the existing backend contracts and task brief.
