# Phase 1 · P-5 / S-3 · 多元計程車 (multi_taxi_direct) Spec Pack

**Archived:** 2026-07-20
**Runtime profile introduced:** `multi_taxi_direct`（產品名：**智行叫車** / 多元計程車，預約制）
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
| `00_source_specs_index.md` | Catalogue of the three inbound handoff docs + the normative enums/DDL/WP codes they define (verbatim ASCII). |
| `03_gap_closure_implementation_plan.md` | **Primary deliverable** — current-state audit vs spec, reconciliation with the live schema, and a sequenced, work-package-mapped implementation plan for P-5 and S-3. |
| `manifest.json` | Machine-readable index. |

## Source documents (inbound handoffs)

1. `01_system_development_team_spec_20260720.md` (v2.0) — system dev requirements.
2. `02_ui_visual_design_team_brief_20260720.md` (v2.0) — UI/UX visual brief.
3. `03_cross_team_handoff_matrix_20260720.md` — ownership + field/state/error mapping + gates.

> The raw source docs were received as UTF-8-over-Latin-1 (mojibake) attachments;
> their **normative ASCII content** (TypeScript types, SQL DDL, enum values, API
> routes, work-package codes) is reproduced faithfully in `00_source_specs_index.md`
> and in the plan. The Chinese prose originals should be dropped into this folder
> in clean UTF-8 by the spec owner to complete the archive.

## UI ownership

Per standing team rules, **the LLM does not design UI**. UI work is defined by
the visual-design team from doc 02 + the handoff matrix (doc 03). Backend/contract
work here produces the flows, field mapping, and screen-requirement inputs only.
Check `docs/05-ui/drts-design-canvas/` before any UI implementation.
