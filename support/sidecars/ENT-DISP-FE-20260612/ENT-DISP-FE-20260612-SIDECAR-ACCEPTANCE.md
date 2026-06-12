# ENT-DISP-FE-20260612 Umbrella Sidecar Acceptance Packet

**Parent task:** `ENT-DISP-FE-20260612` (Enterprise Dispatch frontend rebuild umbrella)
**Sidecar task:** `ENT-DISP-FE-20260612-SIDECAR-ACCEPTANCE`
**Prepared by:** Claude2
**Reviewer:** Claude
**Date:** 2026-06-12
**Helper kind:** `acceptance_packet`
**Scope:** support artifact only; no canonical truth changes; no L1/contract/registry/governance edits.

> This packet is the umbrella-level acceptance checklist + dependency map for the
> whole A–F program. The per-slice scaffold packet
> (`ENT-DISP-FE-20260612-A-SIDECAR-ACCEPTANCE`) is a separate, already-`done`
> sidecar and is referenced, not re-decided, here.

## 1. Parent Summary

`ENT-DISP-FE-20260612` rebuilds the Enterprise Dispatch employee booking
frontend as a dedicated repo-local app, distinct from credit-card airport
transfer and from `apps/partner-booking-web`:

- canonical app target: `apps/enterprise-dispatch-web` (`@drts/enterprise-dispatch-web`, dev port `3010`)
- two product surfaces: **S1** enterprise internal website + **S2** enterprise app-embedded booking
- backend authority unchanged: canonical `/api/tenant/*` rails (`business_dispatch`)
- topology/freeze decision: `SD-DP-20260612-007` (Lovable / `tenant-commute-hub` frozen to reference-only)

The umbrella is delivered as six slices A–F plus support sidecars.

## 2. Umbrella Acceptance Checklist

Parent acceptance (from board): *"完成 A-F 開發切片並通過各 slice 驗收; 保持
enterprise_dispatch 與 credit_card_airport_transfer 產品邊界; supervisor board
有完整 task trail"*.

| # | Umbrella acceptance item | Evidence | Status |
|---|---|---|---|
| 1 | All A–F slices completed and each slice accepted | Board: A=`review`, B/C/D/E=`backlog`, F=`blocked`; only A has produced code | **PENDING** (program in progress) |
| 2 | `enterprise_dispatch` vs `credit_card_airport_transfer` product boundary held | `SD-DP-20260612-007`, requirements doc §1, scaffold `README.md`, freeze banner on external `tenant-commute-hub/README.md` | **ON TRACK** |
| 3 | Supervisor board has full task trail | A–F + `-A-SIDECAR-ACCEPTANCE` (done) + `-A-SIDECAR-R` + this packet all recorded in `ai-status.json` | **PASS** |
| 4 | Canonical app target is `apps/enterprise-dispatch-web` (not Lovable / partner-booking) | `SD-DP-20260612-007` Canonical Targets table; root `package.json` `dev:enterprise-dispatch` | **PASS (decision recorded)** |
| 5 | Visual source is the Enterprise Dispatch design canvas, not the mixed tenant-commute-hub shell | `docs/05-ui/drts-design-canvas/Enterprise Dispatch.html` + `ent-*.jsx`; requirements doc §1.1 | **PASS (source available)** |

Umbrella acceptance item #1 cannot be marked PASS until B–F land and pass their
own slice reviews. This packet does **not** assert the program is complete.

## 3. Slice / Dependency Map

```
A (scaffold) ── B (shell+primitives) ──┬── C (website booking flow)
   │                                    ├── D (status/outcome pages)
   │                                    └── E (gates + embed states)
   └────────────────────────────────────── F (API tests + rollout)*
```
\* F also functionally waits on B–E routes + shared data adapter even though its
recorded `depends_on` is A.

| Slice | Title | Owner | Reviewer | `depends_on` | Board status | Primary artifacts |
|---|---|---|---|---|---|---|
| A | App scaffold | Claude2 | Claude | (none) | `review` | `apps/enterprise-dispatch-web` (scaffold) |
| B | Shell and primitives | Codex | Claude2 | A | `backlog` | `apps/enterprise-dispatch-web`, `ent-kit.jsx`, `ent-shell.jsx` |
| C | Website booking flow | Claude2 | Codex | B | `backlog` | `apps/enterprise-dispatch-web/app`, `ent-screens-1.jsx` |
| D | Status / outcome pages | Codex | Claude2 | B | `backlog` | `apps/enterprise-dispatch-web/app`, `ent-screens-2.jsx` |
| E | Gates and embed states | Claude2 | Codex | B | `backlog` | `apps/enterprise-dispatch-web/app`, `ent-states.jsx` |
| F | API tests and rollout | Gemini | Codex | A | `blocked` | `apps/enterprise-dispatch-web/tests`, `support/sidecars/ENT-DISP-FE-20260612` |

**Critical path:** A → B → {C, D, E} → F. B is the single fan-out gate: C/D/E
must not start production primitives until B is review-approved, or they will
each re-invent shell/primitives and collide on `apps/enterprise-dispatch-web`.

**Sidecars:**

| Sidecar | Owner | Reviewer | Status | Note |
|---|---|---|---|---|
| `ENT-DISP-FE-20260612-A-SIDECAR-ACCEPTANCE` | Codex | Claude2 | `done` | scaffold acceptance; committed `fd83b4c3` on `codex/ent-disp-fe-20260612-a-sidecar-acceptance` (pushed) |
| `ENT-DISP-FE-20260612-A-SIDECAR-R` | Codex | Claude2 | `in_progress` | A-slice review sidecar |
| `ENT-DISP-FE-20260612-SIDECAR-ACCEPTANCE` (this) | Claude2 | Claude | `in_progress` | umbrella acceptance packet |

## 4. Evidence-Location Reality (read before reviewing later slices)

This is the most important integration note for downstream reviewers. As of
`2026-06-12`, verified against the canonical root
(`/home/edna/workspace/drts-fleet-platform`) and `origin/dev`:

- **Nothing for this umbrella is on `origin/dev` yet.** `git cat-file -e origin/dev:<path>` fails for the scaffold, the design canvas, the requirements doc, and `SD-DP-20260612-007`.
- The scaffold app, design-canvas files (`Enterprise Dispatch.html`, `ent-*.jsx`), requirements doc, and `SD-DP-20260612-007` currently exist **only as untracked working-tree files in the canonical root** — not committed to any feature branch.
- The only **committed** ENT-DISP artifact is the A-slice acceptance packet (`fd83b4c3`, reachable from `codex/ent-disp-fe-20260612-a-sidecar-acceptance` / `origin/...`).

Consequences:

- A reviewer who only greps `origin/dev` (or a stale base) will conclude the
  scaffold and canvas are "missing". They are not missing — they are uncommitted
  in the canonical root. Verify against the canonical-root working tree, not just `dev`.
- Each slice owner must produce a real task-scoped commit + push; the program
  cannot close on working-tree-only material.
- The umbrella's own listed artifacts
  (`development-work-package.md`, requirements doc, design canvas) are likewise
  uncommitted; treat their landing as a precondition for umbrella closeout.

## 5. Product Boundary Checks

The `enterprise_dispatch` / `credit_card_airport_transfer` separation is the
non-negotiable for this umbrella. Recorded protections:

- `SD-DP-20260612-007` — accepted decision: dedicated `apps/enterprise-dispatch-web`; Lovable / `tenant-commute-hub` frozen to reference-only; explicit Allowed/Forbidden lists; future-LLM reroute guardrail.
- Requirements doc §1 — states the two products share `business_dispatch` rails but differ in IA, identity source, field priority, cost ownership, approval, and quota semantics; must not be a recolored cardholder frontend.
- Scaffold `README.md` — declares the app is *not* credit-card airport transfer, *not* `partner-booking-web`, *not* `tenant-console-web` admin, *not* sunset `tenant-portal-web`.
- External `tenant-commute-hub/README.md` — freeze banner added 2026-06-12.

Boundary invariants downstream slices must preserve (carried from the A scaffold `page.tsx`):

- enterprise_dispatch only: passenger, bookedBy, cost center, quota, approval, billing ownership stay first-class.
- Airport fields are conditional enterprise-dispatch context, not the product IA.
- Command submit must allow `accepted` + `pending` and must not claim synchronous dispatch completion.

## 6. Per-Slice Acceptance Anchors (for slice reviewers)

- **A** — scaffold only. Accepted via `-A-SIDECAR-ACCEPTANCE`. Do not demand routes/API in A.
- **B** — must build shell + primitives from `Enterprise Dispatch.html` / `ent-kit.jsx` / `ent-shell.jsx`; must NOT inherit tenant-console teal admin shell or partner-booking chrome. Gate for C/D/E.
- **C** — website home, create-booking, ownership confirmation, accepted/pending-approval flow; source `ent-screens-1.jsx`.
- **D** — my-bookings, detail, current-trip, receipt, help; source `ent-screens-2.jsx`. Shares `app/` with C/E → coordinate routes to avoid collisions.
- **E** — support-safe gate states + S2 embed identity hand-off states; source `ent-states.jsx`.
- **F** — `/api/tenant/*` contract wiring, fixture→API adapter, tests, rollout evidence. Correctly `blocked` until B–E routes + shared adapter exist; do not unblock prematurely.

## 7. Residual Risks / Open Items

- Umbrella acceptance item #1 is open: 5 of 6 slices have produced no code; A is in review.
- All umbrella material is uncommitted in canonical root (see §4) — single biggest closeout risk.
- C, D, E all target `apps/enterprise-dispatch-web/app` and fan out from B; route ownership must be partitioned to avoid integration collisions.
- F is blocked by design; ensure it is resumed (not silently dropped) once B–E land.
- No `dev` integration, CI, or deploy evidence exists for any slice yet; do not describe the umbrella as "on dev".

## 8. Handoff

Support artifact only. No canonical truth modified. Handed to reviewer **Claude**
for acceptance of this packet. The parent owner (Claude) decides whether to
absorb this map into the umbrella's main trail. Sidecar closeout is
`INTEGRATION_STATUS=not_applicable`.
