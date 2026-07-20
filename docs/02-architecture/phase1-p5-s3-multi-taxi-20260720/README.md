# Phase 1 · P-5 / S-3 · 智行叫車 (multi_taxi_direct) Spec Pack

**Archived:** 2026-07-20
**Runtime profile introduced:** `multi_taxi_direct` · **產品名（canonical）：智行叫車**（多元計程車類，預約制）
> Product identity is `智行叫車` per the source spec §2 (`displayName: 智行叫車`).
> `多元計程車` is the service *category*, not the product name.
**Repo / Branch:** `drts-fleet-platform` / `dev`

This pack captures the Phase-1 requirement set for two net-new domains and the
plan to close them against the current `dev` codebase:

- **P-5** — Passenger statutory disclosure for the owned multi-taxi line
  (canonical vehicle + driver credential, rating authority, eligibility hard
  gate, immutable dispatch disclosure snapshot, route/fare disclosure, passenger
  ride authority + SSE + notification outbox, masked calling, seatbelt, payment,
  ride certificate, 2-year operational record, public fare version).
- **S-3** — Dedicated **Driver SOS** domain, split out of the generic Incident
  module (SOS aggregate/API/DB, 110/119 native dial, offline durable outbox,
  attachments, false-alarm lifecycle, ops urgent-alert outbox + SLO).

## ⚠️ Product-line pivot note

This spec **explicitly forbids** the vocabulary of the previous
`phase2-tesla-fsd-sandbox` wave: `FSD / 自駕 / 無人駕駛 / 安全員 / sandbox / Tesla /
AV / forwarded / mirror / 外部平台 badge / native status`. P-5/S-3 are a **human
multi-taxi** line served entirely by **owned** orders (`orderDomain = owned`).
The `forwarder` and `sandbox-governance` modules MUST stay out of the P-5
passenger read model and the S-3 SOS projection. See §1.3 of the UI brief and
§2 of the system spec.

## Contents

| File | Role |
|---|---|
| **`source_specs/`** | **Canonical source of truth** — full byte-for-byte UTF-8 originals of the three handoff docs + `source_manifest.json` (SHA-256). Defer to these for anything. |
| `00_source_specs_index.md` | **DERIVED** navigation index (summaries + verbatim ASCII code blocks). Not authoritative. |
| `03_gap_closure_implementation_plan.md` | Current-state audit vs spec, schema reconciliation, and the sequenced, WP-mapped implementation plan. |
| `manifest.json` | Machine-readable pack index. |

## Source documents (inbound handoffs) — canonical

The full clean UTF-8 originals are archived under [`source_specs/`](source_specs/):

1. `source_specs/01_system_development_team_spec_20260720.md` (v2.0) — system dev requirements.
2. `source_specs/02_ui_visual_design_team_brief_20260720.md` (v2.0) — UI/UX visual brief.
3. `source_specs/03_cross_team_handoff_matrix_20260720.md` — ownership + field/state/error mapping + gates.

> **Provenance note.** The initial ingest (PR #1107) received these as
> UTF-8-over-Latin-1 (mojibake) attachments and — incorrectly — archived only a
> derived summary, deferring the originals. The byte-for-byte clean originals
> (verified against the visual team's export; SHA-256 in
> `source_specs/source_manifest.json`) were recovered and are now the canonical
> archive. The `Spec source archive` CI gate (`scripts/check_spec_source_archive.py`)
> enforces their presence, strict-UTF-8 decoding, and hash integrity so a derived
> summary can never again stand in for the source.

## UI ownership

Per standing team rules, **the LLM does not design UI**. UI work is defined by
the visual-design team from doc 02 + the handoff matrix (doc 03). Backend/contract
work here produces the flows, field mapping, and screen-requirement inputs only.
Check `docs/05-ui/drts-design-canvas/` before any UI implementation.
