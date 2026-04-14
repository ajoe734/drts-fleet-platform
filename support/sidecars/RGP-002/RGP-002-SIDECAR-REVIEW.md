# RGP-002 Sidecar Review Packet

> Parent Task: `RGP-002` — Produce durable cross-repo authority map  
> Parent Owner / Reviewer: `Codex` / `Claude`  
> Sidecar Owner / Reviewer: `Codex` / `Claude`  
> Helper Kind: `review_packet`  
> Mutates Canonical: `false`  
> Created: 2026-04-13  
> Source of task truth: `ai-status.json`, `current-work.md`, `.orchestrator/task-briefs/RGP-002-SIDECAR-REVIEW.md`

This is a support artifact only. It does not modify L1 product truth, core contracts, or primary runtime/governance implementation. It packages the evidence and a concise checklist for Claude to review the authority map prepared under `RGP-002`.

---

## 1) Parent Task Posture

- Shared-truth status: `RGP-002` is in `review` with reviewer `Claude` (updated `2026-04-13T15:37:03Z`).
- Deliverable drafted at: `docs/02-architecture/authority/rgp-002-authority-map.md` (planning artifact; citeable; no code changes).
- Annex audit follow-up: `RGX-010` is `blocked` pending repo access for `tenant-commute-hub` (recorded in task board; not a gate for this review).

Why this packet: Provide a single, cited vantage for the review, confirm alignment to accepted Phase 1 truth, and list explicit review checks without altering canonical documents.

---

## 2) Evidence Inventory (Cited Sources)

- Authority map (subject of this review):
  - `docs/02-architecture/authority/rgp-002-authority-map.md`
- Accepted truth and execution rules referenced by the map:
  - `phase1_service_contracts_v1.md` (sections across §3.x, §4.x, §7.x)
  - `phase1_prd_detailed_v1.md` (info architecture; auth/RBAC posture)
  - `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/03_api_examples_and_error_contracts.md` (envelopes, error contracts, snake_case, headers/idempotency)
  - `docs/02-architecture/consensus/sessions/20260413T025550Z-repo-gap-reassessment-v3/consensus-packet.md` (Bucket A decisions, C4 boundary notes, Human Gate outcome)
- Related sidecar (earlier helper, already approved):
  - `support/sidecars/RGP-002/RGP-002-SIDECAR-ACCEPTANCE.md`

---

## 3) Reviewer Checklist (Pass/Fail per item)

Confirm the authority map:

- Surfaces: Enumerates all Phase‑1‑relevant domains with clear SoT per surface (identity/scopes; tenant directory; registry; product/rule catalog; orders/bookings; dispatch; forwarder mirror; driver tasks/shifts/earnings; callcenter/recording index; complaints; billing/settlement; reporting/filing; audit/notification).
- Producer/Consumer matrix: For each surface, marks `drts-fleet-platform` as Producer/SoT and `tenant-commute-hub` as Consumer, with rationale and citation.
- Forbidden leaks: Lists explicit “not allowed” authority drifts (no direct DB writes from UI; no local business‑rule evaluation; snake_case enum fidelity; standard envelope + pagination; signed downloads and webhook keys not proxied by UI; idempotency semantics observed; forwarded orders keep native authority).
- Guardrails for the consumer: Headers (`Authorization`, `X-Request-Id`, `Idempotency-Key`, optional `X-Tenant-Code`), envelopes (`data/meta`, `items[]`, `page_info`), error handling, enum casing, auth scopes.
- Governance & change control: Names owner/reviewer, when updates are required, and the required discussion → consensus → update path.
- Alignment with accepted consensus: States that Phase‑1 closeout remains core‑repo‑scoped; tenant repo’s code‑level posture is deferred to blocked annex (`RGX-010`).
- Open questions: Tracks annex audit as an open item and any future‑phase cross‑repo flows.
- File location: Declares citeable path under `docs/02-architecture/authority/`.

If all above are satisfied, the document is sufficient as a durable planning artifact for onboarding and future reopen/annex work.

---

## 4) Independent Spot‑Check by Sidecar

The sidecar verified that `rgp-002-authority-map.md` includes, verbatim or equivalent headings/sections:

- “Source‑of‑Truth Surfaces (by domain)”
- “Producer / Consumer Matrix”
- “Authority Boundaries & Forbidden Leaks”
- “Integration Guardrails (Consumer Obligations)”
- “Governance & Change Control”
- “Alignment With Accepted Consensus”
- “Open Questions (tracked)”
- “File Location”

And that the document cites each of: `phase1_service_contracts_v1.md`, `phase1_prd_detailed_v1.md`, `phase1_llm_dev_pack_extracted/.../03_api_examples_and_error_contracts.md`, and the active session `consensus-packet.md`.

---

## 5) Observations / Suggestions (Non‑blocking)

- Optional: Add a tiny preface table that maps each surface to 1–2 canonical section references to speed onboarding.
- Optional: Link to a minimal client‑obligations snippet (headers/envelope example) in the dev‑pack to make consumer guardrails immediately concrete.

---

## 6) Handoff

- Reviewer: `Claude`
- Action: Review `docs/02-architecture/authority/rgp-002-authority-map.md` against Checklist (Section 3). If satisfied, approve the parent `RGP-002` task in normal workflow.

Status commands (already reflected by the helper after preparing this packet):

```
AI_NAME=Codex ./scripts/ai-status.sh start RGP-002-SIDECAR-REVIEW "Drafting sidecar review packet and evidence summary"
AI_NAME=Codex ./scripts/ai-status.sh handoff RGP-002-SIDECAR-REVIEW Claude "Packet ready: review map at docs/02-architecture/authority/rgp-002-authority-map.md; see checklist in support/sidecars/RGP-002/RGP-002-SIDECAR-REVIEW.md"
```

---

## 7) Review File

- `support/sidecars/RGP-002/RGP-002-SIDECAR-REVIEW.md`

_Sidecar review packet complete. Ready for Claude’s review; parent owner will decide on any optional suggestions._
