# RGP-002 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `RGP-002` — Produce durable cross-repo authority map
**Prepared By:** Codex (Lane: contracts / schema / acceptance)
**Reviewer:** Qwen
**Generated:** 2026-04-13
**Status:** READY_FOR_REVIEW — packet prepared; awaiting reviewer approval

---

## 1) Scope Boundary (Non‑Negotiable)

This helper creates a support packet only. It must not modify L1 canonical truth or core runtime/registry/governance implementations. The acceptance here defines what “done” means for the cross‑repo authority map and how to verify it objectively.

- In scope: acceptance checklist, dependency map, evidence inventory, reviewer guidance, a recommended outline/template for the authority map deliverable.
- Out of scope: changing product semantics, altering supervisor state, editing canonical contracts, or shipping runtime code.

---

## 2) Current State Baseline (Machine Truth)

What the repo declares as of 2026-04-13 (UTC):

- Parent `RGP-002` exists and is `todo`, intended to document authority boundaries between `drts-fleet-platform` and `tenant-commute-hub`.
  - Source: `.orchestrator/task-briefs/RGP-002.md`, `current-work.md` mirrors.
- Consensus packet places `RGP-002` in Bucket A as an execution‑safe planning artifact with no code change.
  - Source: `docs/02-architecture/consensus/sessions/20260413T025550Z-repo-gap-reassessment-v3/consensus-packet.md` (Bucket A table).
- Planning acknowledges a UI‑only intent for `tenant-commute-hub` that consumes contracts from `drts-fleet-platform`; a blocked annex audit (`RGX-010`) will later confirm code‑level posture.
  - Source: consensus packet C4 notes and RGX‑010 sidecar brief; see also `.orchestrator/task-briefs/RGX-010-SIDECAR-ACCEPTANCE.md`.

Implication: `RGP-002` is to produce a durable, cite‑able authority map that stands on accepted Phase 1 truth, without changing it.

---

## 3) Acceptance Checklist (Evidence‑Backed)

AC‑1 — Deliverable exists and is clearly locateable

- [ ] A single document named “Cross‑Repo Authority Map” exists as a planning artifact (no code change).
- [ ] Recommended path recorded in the doc header (non‑binding): `docs/02-architecture/authority/rgp-002-authority-map.md` or `docs/02-architecture/consensus/sessions/<active>/annexes/rgp-002-authority-map.md`.
- Evidence: the document file and its repo path.

AC‑2 — Source‑of‑truth and contract surfaces are enumerated

- [ ] Lists authoritative sources for domains, APIs, DTOs, events, read models, and identity/scopes.
- [ ] For each surface, identifies producer repo(s) and consumer repo(s) with a one‑line rationale and citation to L1/L2 docs.
- Evidence: “Producer/Consumer Matrix” section with citations to `phase1_service_contracts_v1.md`, dev‑pack `03_api_examples_and_error_contracts.md`.

AC‑3 — Authority boundary rules are explicit and testable

- [ ] Rules capture where domain decisions and write paths live (e.g., domain logic and writes in `drts-fleet-platform`; UI composition in `tenant-commute-hub`).
- [ ] Lists “forbidden authority leaks” with concrete examples to watch for (e.g., backend state mutation, business‑rule evaluation, non‑UI data caching in `tenant-commute-hub`).
- [ ] Includes identity/scope expectations for client calls per W7‑001B rules.
- Evidence: “Authority Boundaries & Non‑Goals” section, citing PRD and service contracts.

AC‑4 — Producer/Consumer matrix is complete and minimal

- [ ] Each API surface and DTO family appears exactly once as a producer definition with downstream consumers.
- [ ] No ambiguous dual‑ownership is left unresolved; if uncertainty remains, an “Open Question” entry is recorded with a pointer to the canonical doc that must decide it.
- Evidence: matrix table + “Open Questions” section.

AC‑5 — Change‑control and maintenance path are documented

- [ ] Defines when the authority map must be updated (e.g., adding a new API, moving a surface between repos).
- [ ] Names the owning lane for updates (default `Codex` for contracts; confirm with supervisor if reassigned).
- Evidence: “Governance & Change Control” section referencing collaboration rules.

AC‑6 — Citations and links are present

- [ ] Each rule and matrix entry cites a canonical source (L1 PRD/Service Contracts or L2 dev‑pack) or the accepted consensus packet.
- [ ] Links resolve locally in this repo where applicable.
- Evidence: inline citations with file paths.

AC‑7 — Reviewer handoff is prepared

- [ ] This packet exists at `support/sidecars/RGP-002/RGP-002-SIDECAR-ACCEPTANCE.md` and points to the deliverable path once created.
- [ ] Handoff note to `Qwen` describes what to confirm and where to leave any corrections.
- Evidence: this file’s Section 7.

---

## 4) Dependency Map (Normative Truth Sources)

- D‑1: Phase 1 Service Contracts and DTOs
  - `phase1_service_contracts_v1.md`, dev‑pack `03_api_examples_and_error_contracts.md`
- D‑2: Acceptance scenarios and behavior baselines
  - `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md`
- D‑3: Identity and scopes posture
  - W7‑001B rules as captured in PRD/Service Contracts; client headers/scopes expectations.
- D‑4: Consensus packet outcomes
  - `docs/02-architecture/consensus/sessions/20260413T025550Z-repo-gap-reassessment-v3/consensus-packet.md` (Bucket A entry for `RGP-002`; C4 notes for tenant‑hub posture).
- D‑5: Annex audit follow‑up (blocked)
  - `RGX-010` sidecar (acceptance packet) describing code‑level audit once `tenant-commute-hub` access is granted.

None of these require code changes in this repo for the sidecar itself; they are verification dependencies.

---

## 5) Evidence Inventory (Prepared Now)

- Task truth: `.orchestrator/task-briefs/RGP-002.md` (todo; planning artifact).
- Planning truth: consensus packet lists `RGP-002` as execution‑safe planning work with high confidence.
- Process truth: `AI_COLLABORATION_GUIDE.md` mandates packets like this remain support‑only and that status transitions use `scripts/ai-status.sh`.

---

## 6) Recommended Outline for the Authority Map (Template)

Use this outline to draft the authority map document (non‑binding, supportive):

1. Title + Scope Statement
   - Planning artifact; no code changes. Defines authority boundaries between `drts-fleet-platform` and `tenant-commute-hub`.
2. Source‑of‑Truth Surfaces
   - Domains, APIs, DTOs, events, read models, identity/scopes; cite L1/L2 docs per surface.
3. Producer/Consumer Matrix (table)
   - Columns: Surface | Producer Repo | Consumer Repo(s) | Rationale | Canonical Citation
4. Authority Boundaries & Non‑Goals
   - Where domain decisions and writes live; explicit “forbidden authority leaks” with examples.
5. Integration Guardrails
   - Error envelope, snake_case, versioning, backward‑compat rules that consumers must follow.
6. Change Control & Ownership
   - Who updates this map; when updates are required; review path.
7. Open Questions (if any)
   - Record unresolved items with the canonical file that must decide them.

Place the filled document under one of the recommended paths listed in AC‑1.

---

## 7) Reviewer Flow (Qwen)

1. Confirm the deliverable is a planning artifact only and that this packet does not request canonical edits.
2. Check that the map enumerates all relevant surfaces used by `tenant-commute-hub` and `drts-fleet-platform` with citations.
3. Verify boundary rules are explicit and testable (identity/scopes, write paths, non‑goals).
4. If acceptable, approve the sidecar and leave any content nits on the authority map document itself.
5. If gaps remain (missing surfaces or unclear ownership), request changes with a specific list.

Review disposition options:

- approve with note “authority map is complete and properly cited; planning artifact only”
- request changes listing missing surfaces, unclear boundary rules, or missing citations

---

## 8) Handoff Notes

- This packet is support‑only. No canonical edits were made.
- After review, the parent owner (`Qwen`) can finalize the authority map document using Section 6, keeping citations to L1/L2 truth.
- When the document is ready, update machine truth via:

  ```bash
  AI_NAME=Codex ./scripts/ai-status.sh handoff RGP-002-SIDECAR-ACCEPTANCE Qwen "Packet ready; acceptance checklist + dependency map prepared"
  # After review approval (Qwen is the reviewer):
  AI_NAME=Qwen REVIEW_NOTES_ZH="審查通過" ./scripts/ai-status.sh approve RGP-002-SIDECAR-ACCEPTANCE "Review approved; return to owner to close"
  # Owner closeout for sidecar tasks may use NO_COMMIT_REQUIRED=1
  AI_NAME=Codex NO_COMMIT_REQUIRED=1 ./scripts/ai-status.sh done RGP-002-SIDECAR-ACCEPTANCE "Owner finalized approved sidecar"
  ```

---

## 9) Owner Closeout Record

- 2026-04-13 — Support artifact updated to reflect approved review and closeout instructions. No canonical truth changed.
