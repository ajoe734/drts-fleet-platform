# Platform Admin Sandbox Compliance & Investigation — Screen Requirements

**Date:** 2026-06-26  
**Feature:** platform-admin sandbox compliance / investigations / evidence / regulatory reporting  
**Recipient team:** Visual design / UX  
**Status:** Hand-off input. **No visual decisions in this document.**  
**Author lane:** Codex  
**Authority for behaviour/data/API:** `Task Brief P2-DP-C1-001` · `docs/02-architecture/cross-app-navigation-and-shell-topology-20260524.md` · `docs/05-ui/system-design-answers-all-apps-20260524.md`

> This packet exists because `docs/05-ui/drts-design-canvas/Platform Admin.html` and `platform-screens-*.jsx` do **not** contain source screens for the new sandbox compliance route group. Engineering must not invent those visuals. This note defines the required screen set and behaviour so the visual team can add canonical canvas screens later.

---

## 1. Why this packet exists

- `apps/platform-admin-web` now owns a new sandbox route group:
  - `/platform-admin/compliance`
  - `/platform-admin/compliance/trips/[tripId]`
  - `/platform-admin/investigations`
  - `/platform-admin/investigations/[caseId]`
  - `/platform-admin/investigations/[caseId]/timeline`
  - `/platform-admin/evidence/exports`
  - `/platform-admin/evidence/legal-holds`
  - `/platform-admin/evidence/manifests/[manifestId]`
  - `/platform-admin/regulatory-reports`
- The current Platform Admin canvas covers `fleet`, `audit`, `health`, `payments`, and other legacy platform surfaces, but it does not define these sandbox compliance screens.
- Review requirement for `P2-DP-C1-001`: if the canvas lacks the screen, stop visual implementation and write a screen-requirements note instead of inventing UI.

## 2. Roles and scope-sensitive behaviour

These screens are platform-owned. Actual visibility and mutation remain backend-authoritative.

| Capability                                   | Required scope(s)                    | Notes                                                   |
| -------------------------------------------- | ------------------------------------ | ------------------------------------------------------- |
| Read investigations                          | `sandbox.investigation.read`         | used by investigation list/detail/timeline              |
| Read compliance snapshot                     | `sandbox.compliance.read`            | takeover review + discrepancy triage                    |
| Read evidence manifest / export / hold views | `sandbox.evidence.preview`           | read-only evidence governance                           |
| Request controlled export                    | `sandbox.evidence.export.request`    | requester cannot approve same export                    |
| Approve controlled export                    | `sandbox.evidence.export.approve`    | four-eyes separation from requester                     |
| Place legal hold                             | `sandbox.legal_hold.place`           | platform-only mutation                                  |
| Request legal hold release                   | `sandbox.legal_hold.release.request` | requester cannot approve same release                   |
| Approve legal hold release                   | `sandbox.legal_hold.release.approve` | ROC read scope must not release hold                    |
| Read regulatory reports                      | `sandbox.regulatory_report.review`   | platform-admin filing queue / detail review authority   |
| Submit regulatory reports                    | `sandbox.regulatory_report.submit`   | submit remains a distinct privileged action from review |

## 3. Cross-app and deep-link rules

- ROC and other external surfaces must enter these routes using **backend-provided `CrossAppResourceLink`**.
- Frontend must not reconstruct cross-app targets from local query params or client-only lookup tables.
- If a takeover review or discrepancy is already linked to an investigation case, the deep link should land on the **investigation detail route** directly.
- Same-app navigation inside platform-admin may use local typed routes.
- Cross-app opens default to new tab per Q-X03.

## 4. Sitemap to design

| Screen                   | Route                                              | Purpose                                                                                    |
| ------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Compliance overview      | `/platform-admin/compliance`                       | sandbox-wide triage across investigations, takeover reviews, discrepancies, holds, exports |
| Trip compliance detail   | `/platform-admin/compliance/trips/[tripId]`        | trip-centric read model across accident case, takeover review, discrepancy, evidence state |
| Investigation queue      | `/platform-admin/investigations`                   | case list + ROC-linked entry handling                                                      |
| Investigation detail     | `/platform-admin/investigations/[caseId]`          | one accident case summary and linked evidence/report state                                 |
| Investigation timeline   | `/platform-admin/investigations/[caseId]/timeline` | synchronized fact timeline for one case                                                    |
| Evidence exports         | `/platform-admin/evidence/exports`                 | controlled export request / approval queue                                                 |
| Legal holds              | `/platform-admin/evidence/legal-holds`             | active holds, release requests, approvals                                                  |
| Evidence manifest detail | `/platform-admin/evidence/manifests/[manifestId]`  | chain-of-custody view for one manifest                                                     |
| Regulatory reports       | `/platform-admin/regulatory-reports`               | filing queue / status / linked case view                                                   |

## 5. Per-screen functional briefs

### 5.1 Compliance overview — `/platform-admin/compliance`

- **Purpose:** one platform-admin sandbox triage entry across investigations, takeover review correlation, discrepancy review, evidence freeze posture, and reporting backlog.
- **Primary personas:** compliance governance, ops risk governance.
- **Data to surface:** KPI summary counts; newest/open investigations; correlated takeover reviews; discrepancy queue; active legal holds; pending controlled exports; filing status summary.
- **Actions:** open trip detail; open investigation; open evidence manifest; open export queue; open legal hold queue; open regulatory report detail or list.
- **States:** loading; no-data; permission-denied; fetch-failed; degraded backend data freshness.
- **Constraints:** this is a navigation/triage screen, not the final authority for evidence mutation.

### 5.2 Trip compliance detail — `/platform-admin/compliance/trips/[tripId]`

- **Purpose:** explain one sandbox trip across accident investigation, takeover correlation, discrepancy, legal hold, and manifest state.
- **Data to surface:** trip id; vehicle; linked investigation case; linked takeover review; open discrepancy count; manifest id; legal hold state; regulatory report state; key derived checks with pass/fail.
- **Actions:** open linked investigation; open manifest; open legal hold queue; open report queue.
- **States:** loading; trip-not-found; no-linked-investigation; no-linked-manifest; permission-denied.
- **Constraints:** read-focused drilldown; no direct mutation required by this task.

### 5.3 Investigation queue — `/platform-admin/investigations`

- **Purpose:** operational queue for accident cases plus ROC-originated takeover/discrepancy entry points.
- **Data to surface:** investigation list; severity; status; linked trip; linked evidence manifest; discrepancy count; takeover review summary; recent ROC-linked focus banner when entered from cross-app deep link.
- **Actions:** open case detail; open timeline; open trip detail; open manifest.
- **States:** loading; empty; stale ROC deep-link target; permission-denied.
- **Constraints:** ROC-originated intent should be represented from backend-provided link metadata, not from client-composed query conventions.

### 5.4 Investigation detail — `/platform-admin/investigations/[caseId]`

- **Purpose:** canonical detail page for one sandbox accident case.
- **Data to surface:** case id; status; severity; occurred/reported timestamps; vehicle; trip; takeover correlation id; manifest id; report id; summary; linked discrepancy ids; linked external document ids.
- **Actions:** open synchronized timeline; open evidence manifest; open regulatory report; open trip compliance detail.
- **States:** loading; case-not-found; permission-denied; linked-resource-missing.
- **Constraints:** backend case record is the source of truth; no client-side reconstruction of related case identity.

### 5.5 Investigation timeline — `/platform-admin/investigations/[caseId]/timeline`

- **Purpose:** fact-by-fact timeline for cross-source investigation evidence.
- **Data to surface:** ordered facts with labels, timestamps, confidence, source system, derivation, discrepancy tags, external document references.
- **Actions:** return to case detail; inspect manifest/report if linked.
- **States:** loading; no-timeline-facts; case-not-found; permission-denied.
- **Constraints:** timeline may contain system-derived and provider-reported facts; confidence/source treatment must be visually explicit once designed.

### 5.6 Evidence exports — `/platform-admin/evidence/exports`

- **Purpose:** controlled export queue with request/approve separation.
- **Data to surface:** request id; linked case/manifest/report; recipient; reason; status; requester; approver; timestamps; checksum/artifact metadata.
- **Actions:** request controlled export; approve request.
- **States:** loading; empty; permission-denied; self-approval forbidden; conflict if item no longer pending.
- **Constraints:** request and approval must remain separated actors; the screen must clearly show the four-eyes rule and why an actor is blocked.

### 5.7 Legal holds — `/platform-admin/evidence/legal-holds`

- **Purpose:** preserve or release sandbox evidence under legal hold governance.
- **Data to surface:** hold id; case id; manifest id; scope summary; reason; status; placed/release-request/released actors and timestamps; expiration.
- **Actions:** place hold; request release; approve release.
- **States:** loading; empty; permission-denied; already-released; release-already-requested; self-approval forbidden.
- **Constraints:** ROC read scope cannot release holds; request and approval are separate steps and separate actors.

### 5.8 Evidence manifest detail — `/platform-admin/evidence/manifests/[manifestId]`

- **Purpose:** audit-style chain-of-custody view for one manifest.
- **Data to surface:** manifest id; linked case; vehicle; time window; custody state; legal-hold flag; known gap count; item list with source, captured time, custody state, signature/checksum references.
- **Actions:** return to linked case; open legal hold queue; request controlled export if permitted.
- **States:** loading; manifest-not-found; permission-denied; linked-case-missing.
- **Constraints:** this is evidence governance, not media-player design; integrity metadata must stay legible.

### 5.9 Regulatory reports — `/platform-admin/regulatory-reports`

- **Purpose:** filing queue for regulator-facing reports derived from investigation cases.
- **Data to surface:** report id; jurisdiction; status; linked case; due/submitted/accepted/rejected timestamps; submission channel; rejection reason if any.
- **Actions:** open linked case; open manifest; submit or re-submit when allowed by backend authority.
- **States:** loading; empty; permission-denied; draft; generated; submitted; accepted; rejected.
- **Constraints:** status progression and filing timestamps are the primary truth; visual design must make regulator lifecycle obvious.

## 6. Open visual questions for design

- How should the sandbox compliance group sit inside the existing Platform Admin IA without colliding with the older `fleet` and `audit` screens?
- Should investigation queue and compliance overview be visually distinct surfaces, or should one be a queue-first view and one be a program-health dashboard?
- What is the clearest visual treatment for fact confidence and multi-source discrepancy state on the timeline screen?
- How should four-eyes separation be surfaced on export approval and legal hold release so the blocking rule is obvious before the user clicks?
- What visual pattern best communicates that a link came from ROC via `CrossAppResourceLink` and already resolved to a backend-authoritative destination?

## 7. Out of scope

- No visual palette changes beyond the existing Platform Admin realm/token system.
- No ROC screen design in this packet.
- No new product semantics beyond the backend/API contracts already accepted for `P2-DP-C1-001`.

## 8. Planning resolution recorded on 2026-06-26

- The remaining product/contract ambiguity for regulatory reporting scopes is
  resolved by the backend controller contract, not left open for frontend
  invention:
  - `GET /platform-admin/regulatory-reports` uses
    `sandbox.regulatory_report.review`
  - `POST /platform-admin/regulatory-reports/:reportId/submit` uses
    `sandbox.regulatory_report.submit`
- The parent implementation blocker is therefore **not** missing scope naming or
  action authority semantics. Those are already fixed by accepted backend/API
  surfaces plus the route list in this packet.
- The unresolved blocker that still requires follow-up is canonical visual
  publication: `docs/05-ui/drts-design-canvas/Platform Admin.html` and
  `platform-screens-*.jsx` still need first-class sandbox compliance /
  investigation / evidence / regulatory-report screens before engineering can
  implement the parent task without inventing UI.
