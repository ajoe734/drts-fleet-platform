# MSC-P1-001 Surface Decision Packet

**Task:** MSC-P1-001 — product surface: decide passenger call-point and complaint-entry completion bar  
**Author:** Claude  
**Reviewer:** Codex  
**Date:** 2026-04-20  
**Status:** submitted for review

---

## Purpose

This packet answers the three acceptance criteria required to close MSC-P1-001:

1. State whether Passenger App or Web is in the current Phase 1 completion bar or explicitly deferred.
2. State where call point and concierge workflow should land.
3. State whether complaint hotline and operator handling is complete enough for the PRD claim.

---

## Evidence Sources

| Source                                                                           | Authority                                    |
| -------------------------------------------------------------------------------- | -------------------------------------------- |
| `phase1_prd_detailed_v1.md` §3.1.1, §7.1, §9.1.1, §9.1.3, §9.1.4, §9.1.5, §9.7.3 | L1 Product Truth                             |
| `ROADMAP.md` "Deferred Scope (Phase 2+)"                                         | Seed design doc — surface topology decisions |
| `apps/api/src/modules/complaint/`                                                | Implementation evidence                      |
| `apps/api/src/modules/callcenter/`                                               | Implementation evidence                      |
| `apps/ops-console-web/app/complaints/page.tsx`                                   | Implementation evidence                      |
| `apps/ops-console-web/app/callcenter/page.tsx`                                   | Implementation evidence                      |
| `docs/04-uat/phase1-uat-scenarios.md` §3.3 OC-010, OC-011, OC-012                | Acceptance test coverage                     |
| `docs/03-runbooks/master-system-closeout-checklist.md` §D-3, §F                  | Runbook gate                                 |

---

## Decision 1: Passenger App / Web

**PRD claim:** §3.1.1 lists "Passenger App / Web" as in-scope. §9.1.1 defines full requirements: order creation, ETA, status tracking, history, receipt download, complaint initiation.

**Repo state:** No `apps/passenger-app` or `apps/passenger-web` landing zone exists. No routes, components, or API auth paths specific to an unauthenticated consumer-facing surface have been implemented.

**ROADMAP signal:** The ROADMAP's "Deferred Scope (Phase 2+)" section explicitly marks Passenger App / Web as `missing_surface_future_gated`:

> "No repo landing zone exists; deferred pending human topology decision"

**Decision: DEFERRED — NOT in the current Phase 1 execution completion bar.**

The PRD §9.1.1 requirements are acknowledged but not targeted by the current execution wave. This is an explicit, conscious deferral — not a gap that can be silently treated as complete.

**Gate condition:** A human topology decision must be recorded before implementation begins. The decision must address: standalone consumer app, embedded web route in an existing surface, or third-party white-label.

**What the completion bar must say:** Phase 1 is operationally complete without the Passenger App / Web surface. The surface remains on the master plan as a named future gate.

---

## Decision 2: Call Point / Concierge Portal

**PRD claim:** §3.1.1 and §9.1.3 define a dedicated concierge-assisted entry: site-bound login, fixed station selection, proxy order creation, ETA, dispatch result view, escalation to customer service.

**Repo state (backend):** `apps/api/src/modules/callcenter/` provides a fully implemented callcenter module covering:

- Call session open/close lifecycle
- Agent identity announcement
- Order creation from a phone call
- ETA quoting
- Recording callback linkage
- Callback task management
- Transfer-to-complaint (creating a complaint case from a call session)

This backend fulfills the §9.1.4 (Call Center / CTI Console) requirements. It partially satisfies §9.1.3 as a proxy booking backend.

**Repo state (frontend):** `apps/ops-console-web/app/callcenter/page.tsx` provides:

- Full session intake (open, announce identity, close)
- Phone booking creation linked to a call session
- ETA reply, recording attachment, callback queue
- Transfer-to-complaint with category and severity

There is no separate concierge portal app or dedicated route for site-bound (hotel/hospital/community) operators.

**ROADMAP signal:** The ROADMAP's "Deferred Scope (Phase 2+)" section explicitly marks Call Point / Concierge Portal as `missing_surface_future_gated`:

> "Backend callcenter module exists but no dedicated frontend surface"  
> "Deferred pending human topology decision (extend ops-console-web vs. new app)"

**Decision: SPLIT — backend is Phase 1 complete; dedicated concierge frontend surface is DEFERRED.**

The callcenter backend (§9.1.4 coverage) and the ops-console callcenter page are Phase 1 complete. The dedicated Call Point / Concierge Portal (§9.1.3) — a site-bound entry point for hotels, hospitals, community security — requires a human topology decision before it can be built:

- **Option A:** Extend `ops-console-web` with a restricted "concierge" role/view
- **Option B:** Create a new `apps/callpoint-web` or `apps/concierge-web` surface

Until that decision is recorded, the concierge-specific portal remains deferred. The Phase 1 completion bar must state:

- Call center agent workflow (CTI, booking, recording, complaint transfer) → Phase 1 complete in ops-console-web
- Concierge / call-point site-bound entry portal → deferred pending human topology decision

---

## Decision 3: Complaint Hotline Console and Operator Handling

**PRD claim:** §9.1.5 defines a Complaint Hotline Console: receive hotline calls, create case number, link to dispatch order, assign handler, set SLA, record timeline, close and export for compliance. §9.7.3 (Complaint Case Center) defines the case lifecycle: serial number generation, category, order linkage, SLA, timeline, resolution, reopen. §12.5 defines the Complaint Specialist role.

**Repo state (backend):** `apps/api/src/modules/complaint/complaint.controller.ts` provides:

- `POST /complaints` — create case with caseSource, category, severity, description, optional relatedOrderId / relatedCallId
- `GET /complaints` — list all cases
- `GET /complaints/:caseNo` — case detail
- `GET /complaints/:caseNo/timeline` — timeline entries
- `POST /complaints/:caseNo/assign` — assign to handler
- `POST /complaints/:caseNo/notes` — add investigation note
- `GET /complaints/:caseNo/export` — export view with `readyForAudit` flag
- `POST /complaints/:caseNo/reopen` — reopen with reason
- `POST /complaints/:caseNo/resolve` — resolve with code + note
- `POST /complaints/:caseNo/close` — close
- `POST /complaints/:caseNo/sla-breach` — mark SLA breach

`apps/api/src/modules/callcenter/callcenter.controller.ts` includes `POST /callcenter/sessions/:callId/transfer-to-complaint` which creates a complaint case from a call session in a single operation, linking `relatedCallId` and optionally `relatedOrderId`.

**Repo state (frontend):** `apps/ops-console-web/app/complaints/page.tsx` provides:

- Summary dashboard: active cases, hotline-linked count, SLA breached, closed/audit-ready
- Filter by status and category, full-text search
- Create complaint form (caseSource: ops/phone/web/app, category, severity, order/call linkage, description)
- Case list with assignee, order, hotline-linked, created-at
- Case detail: SLA due date, SLA breach, assignee, resolution, description
- Assign case form with note
- Add investigation note form
- Resolve / Close form with resolution code and closing note
- Reopen form
- Timeline view per case
- Export view with `readyForAudit` flag

**UAT coverage:** `docs/04-uat/phase1-uat-scenarios.md` §3.3 includes:

- OC-010 — Create complaint case (category, order link, unique case no, SLA timer starts)
- OC-011 — Reopen closed complaint (status → reopened, original case no retained, timeline entry)
- OC-012 — SLA breach flag visible (sla_breach visible, main status not overwritten)

**Gap assessment:**

| PRD requirement                    | Implementation state                                           |
| ---------------------------------- | -------------------------------------------------------------- |
| Receive hotline call → create case | `transfer-to-complaint` endpoint + ops callcenter page         |
| Case serial number                 | `caseNo` generated on create                                   |
| Link to dispatch order             | `relatedOrderId` on case; `relatedCallId` for phone source     |
| Assign handler                     | `POST /assign` + UI form                                       |
| Set SLA                            | SLA configured at case creation; `slaDueAt` tracked            |
| Record timeline                    | Timeline entries on all mutations; `GET /timeline`             |
| Close + export for compliance      | `POST /close` + `GET /export` with `readyForAudit`             |
| Reopen                             | `POST /reopen` + reason                                        |
| SLA breach alert                   | `POST /sla-breach` + breach flag visible in UI                 |
| Incident ≠ complaint (Hard Rule 4) | Verified by UAT scenario OC-009                                |
| Complaint Specialist role          | Covered by complaint module RBAC scope; not blocked by surface |

**The one acknowledged gap:** The PRD §9.1.5 envisions a phone-CTI screen-pop that automatically surfaces the case form when the hotline number is called. No real CTI integration (SIP/PSTN) exists. The `callcenter` module models the session manually. This is an operational integration gap (requires real telephony vendor), not a software completeness gap. It is out of scope for the current execution wave.

**Decision: COMPLETE enough for the Phase 1 PRD completion bar.**

The complaint backend API, ops-console-web complaint page, callcenter-to-complaint transfer flow, and UAT scenarios collectively satisfy PRD §9.1.5 and §9.7.3 to the level required for Phase 1 operational completeness. The absence of a live telephony CTI pop-screen is noted and deferred as a real-world integration dependency, not a code gap.

---

## Summary Table

| Surface                                       | PRD ref        | Phase 1 completion bar? | Decision                                                                                                     |
| --------------------------------------------- | -------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| Passenger App / Web                           | §9.1.1         | NO                      | Explicitly deferred — `missing_surface_future_gated`; no repo landing zone; human topology decision required |
| Call Point / Concierge Portal (frontend)      | §9.1.3         | NO                      | Explicitly deferred — human topology decision required (extend ops-console vs. new app)                      |
| Call Center Agent workflow (backend + ops UI) | §9.1.4         | YES                     | Complete in `callcenter` module + `ops-console-web/callcenter`                                               |
| Complaint Hotline Console / Case Center       | §9.1.5, §9.7.3 | YES                     | Complete in `complaint` module + `ops-console-web/complaints` + callcenter transfer                          |

---

## Open Items and Escalations

The following items are not blocking Phase 1 completion but must be tracked to avoid silent drift:

| Item                                                            | Status               | Owner    |
| --------------------------------------------------------------- | -------------------- | -------- |
| Human topology decision: Passenger App surface                  | `human_required`     | Human    |
| Human topology decision: Call Point / Concierge Portal topology | `human_required`     | Human    |
| Real telephony / CTI integration for complaint hotline          | Out of Phase 1 scope | Deferred |

These items should be captured in `PHASE1_OPEN_QUESTIONS.md` and `ai-status.json` as named future gates before Phase 1 is declared operationally complete.

---

## Reviewer Notes (for Codex)

Please verify:

1. That the ROADMAP "Deferred Scope" language is consistent with the decision recorded here (Passenger App / Web and Call Point portal both carry `missing_surface_future_gated`).
2. That the complaint backend contracts (`CreateComplaintCaseCommand`, `ComplaintCaseRecord`, `ComplaintTimelineEntry`, `ComplaintExportViewRecord`) satisfy the §9.7.3 state machine without mixing with the incident lifecycle.
3. That the two human-required open items are recorded in `ai-status.json` or `PHASE1_OPEN_QUESTIONS.md` before Phase 1 completion is claimed.

If you agree with all three decisions, approve and return to Claude for `done` closure with `NO_COMMIT_REQUIRED=1` (this is a review/decision artifact, not a primary implementation slice).
