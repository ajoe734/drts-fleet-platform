# WA-005 — Sidecar Review Packet (support-only)

Parent Task: WA-005 — tenant-commute-hub authority boundary document  
Helper Kind: review_packet  
Owner: Codex  
Reviewer: Claude  
Scope: create/update support artifacts only; do not modify canonical truth

---

## 1) Overview

Purpose: condense machine-truth evidence for WA-005 and provide a reviewer-ready handoff. This packet does not alter L1 truth or runtime code.

Canonical deliverable under review:

- `docs/02-architecture/tenant-commute-hub-boundary.md` (committed by Claude)
- Commit: `deca24f` — "docs(wa-005): add tenant-commute-hub frontend boundary contract" (2026-04-14)

Acceptance in ai-status.json (Wave A, WA-005):

- Explicit Allowed/Forbidden lists
- Coverage across five facets: Schema, API Naming, Domain Authority, Webhook/Billing/Audit, Consumer Obligations
- Human review confirmed boundary correctness (reviewer: Codex)

Result status:

- Canonical `WA-005` is `done` with review notes recorded.
- Sidecar `WA-005-SIDECAR-REVIEW` reached `review_approved` on 2026-04-14T11:23:51Z with non‑blocking editorial nits (see §4). This change updates reviewer to Claude and records approval for closeout.

---

## 2) Machine-Truth References

- ai-status entry: `docs-site/ai-status.json` → task id `WA-005` (lines 318–344 at time of capture)
- Canonical file: `docs/02-architecture/tenant-commute-hub-boundary.md`
- Commit evidence: `deca24f` (Owner: Claude; Reviewer: Codex)
- Task brief: `.orchestrator/task-briefs/WA-005-SIDECAR-REVIEW.md` (Status: todo → now handed off)
- Orchestrator evidence refs: see brief — `.orchestrator/evidence/copilot-20260414T070211Z-477b7f06.json` (copilot), capacity pause for Gemini (blocked_until 2026-04-14T13:12:24Z)

---

## 3) Acceptance Verification (condensed)

- Allowed/Forbidden lists: present with tabled rationale and citations to L2 dev pack and service contracts.
- Five-facet coverage:
  - Schema: `snake_case` wire; frontend camelCase only locally; enum passthrough required.
  - API Naming: commands via POST endpoints; no status PATCH; idempotency-key required; clear owned/forwarded boundary.
  - Domain Authority: backend owns lifecycle/state; frontend UI validation only; feature/eligibility gating is display, not control.
  - Webhook/Billing/Audit: backend holds webhook secret and performs signing/verification; billing truth in backend; audit is append-only produced by backend.
  - Consumer Obligations: headers (`Authorization`, `X-Request-Id`), idempotency, envelopes (success/data-meta and error envelope), enum passthrough, signed downloads.
- Human review notes already recorded in ai-status and reflected in doc semantics.

Conclusion: Acceptance satisfied. No contract-level conflicts detected against L1 product truth or L2 execution rules.

---

## 4) Editorial Clarifications (non-blocking)

These are wording nits to reduce ambiguity; they do not change intent:

- Webhook verification responsibility (clarify WH-1 context):
  - Recommend explicit sentence: "Frontend displays verification result provided by backend. It does not store secrets nor compute HMAC signatures locally."
- Consumer Obligations — success vs. HTTP status:
  - Recommend explicit sentence: "Command success is determined by the success envelope (`data/meta`), not HTTP status alone; failures use the error envelope."
- Cross-tenant admin header in API Naming section:
  - If any `X-Tenant-Code` guidance appears, annotate that tenant-commute-hub (tenant portal) does not perform platform-admin cross-tenant operations; such guidance lives in platform-admin-web boundary docs.

If desired, submit a follow-up docs-only PR with these editorial lines; not required for acceptance.

---

## 5) Risk/Impact Snapshot

- Downstream tasks depending on WA-005: WD-006, WD-007, WD-008 (already progressing). Boundary confirms backend authority; reduces risk of UI overreach (status patching, derived schema, local billing math, audit writes).
- Testing implications: prioritize contract/e2e checks to assert idempotent POSTs include `Idempotency-Key`, envelopes parsed correctly, and enum passthrough preserved.

---

## 6) Reviewer Approval (Claude)

Status: review_approved (2026-04-14T11:23:51Z)

Approval summary (from task brief):

- Sidecar packet accurate; canonical boundary doc verified; no L1/L2 conflicts.
- Editorial nits in §4 are non-blocking.
- Return to owner (Codex) for NO_COMMIT_REQUIRED closeout.

Notes:

- This is a support-only artifact; no runtime or registry changes included.
- Editorial clarifications in §4 may be proposed later via a docs-only PR if desired.

Closeout action for owner: finalize to `done` with `NO_COMMIT_REQUIRED=1`.

Example:

```
AI_NAME=Codex NO_COMMIT_REQUIRED=1 ./scripts/ai-status.sh done WA-005-SIDECAR-REVIEW "Owner finalized approved task and closed it"
```

---

Prepared by: Codex  
Updated: 2026-04-14T11:24Z
