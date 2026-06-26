# P2-UI-PAX-001 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `P2-UI-PAX-001` — Passenger AV→human fallback states (per `pe-fallback` canvas)
**Parent Owner:** `Codex2`
**Parent Reviewer:** `Claude`
**Sidecar Owner:** `Claude`
**Sidecar Reviewer:** `Codex2`
**Generated:** `2026-06-26` (UTC)
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` — support-only; does not modify canonical truth,
runtime behavior, the parent's machine-truth fields, or any L1/L2 product surface. For the
live machine-truth status of this sidecar, read
`ai-status.json -> P2-UI-PAX-001-SIDECAR-ACCEPTANCE.status` directly (or
`scripts/ai-status.sh show P2-UI-PAX-001-SIDECAR-ACCEPTANCE`); this packet does not snapshot
it.

This packet is the forward-looking acceptance map for parent `P2-UI-PAX-001`. The parent is
`in_progress` in machine truth at packet write (owner `Codex2` iterating on the
`codex2/p2-ui-pax-001` branch). The packet exists so that when the parent owner hands off,
the acceptance framing, the AV→passenger visibility-suppression contract, the dependency
map, and the reviewer evidence anchors are already pinned to current truth and ready to be
audited against the eventual diff. The sidecar reviewer (`Codex2`) and the parent owner
(`Codex2`) are the same lane family; this packet does **not** pre-approve the parent diff and
does not stand in for the parent reviewer (`Claude`).

---

## 1. Scope Boundary

In scope:

- Translate the parent task's `acceptance` field and the `pe-fallback` canvas hard rules
  into a concrete, citation-anchored acceptance checklist.
- Pin the dependency map (`P2-DP-C3-001` visibility projection, `P2-DP-S1-001` message
  catalog) and record each upstream's machine-truth status, including the case where a
  declared dependency id is **not** a board row.
- Pin the passenger-visibility suppression contract (C3 §5.3) so the reviewer can weigh
  data-leak risk — the single highest-severity failure mode for this surface.
- Preserve a reviewer-handoff command block the assigned reviewer can run after the parent
  owner finalizes the slice.

Out of scope:

- editing L1 / L2 product truth (`phase1_*`, the C1–C6/B1–B5 decision packet), the canvas,
  or the parent task's machine-truth fields (`ai-status.json -> P2-UI-PAX-001`)
- editing `apps/referral-embed-web/**`, `apps/passenger-web/**`, `packages/ui-tokens/**`, or
  any other parent-write-scope file
- pre-running the parent's typecheck/build, opening a parent-scoped commit, or altering
  parent ownership / reviewership
- predicting the exact shape of the parent diff before the parent owner finalizes it (the
  4-state implementation currently lives on `codex2/p2-ui-pax-001`, not on `dev`)

---

## 2. Machine Truth Anchors

### Sidecar (this task) — `ai-status.json -> P2-UI-PAX-001-SIDECAR-ACCEPTANCE`

Persistent fields:

- owner=`Claude`, reviewer=`Codex2`
- task_class=`sidecar`, helper_parent=`P2-UI-PAX-001`, helper_kind=`acceptance_packet`
- mutates_canonical=`false`, auto_generated=`true`,
  auto_created_by=`supervisor-underutilization`
- depends_on: `P2-DP-C3-001`, `P2-DP-S1-001` (mirrors the parent's dependency set)
- artifacts: `support/sidecars/P2-UI-PAX-001/P2-UI-PAX-001-SIDECAR-ACCEPTANCE.md` (this file)
- acceptance: `Create support artifacts only`; `Do not edit canonical truth`;
  `Hand off the packet to the assigned reviewer`

Live status: read directly from machine truth, not from this packet. Any status snapshot
written here becomes false the moment the sidecar transitions (handoff → review → approve →
done). For lifecycle history, filter `ai-activity-log.jsonl` on
`P2-UI-PAX-001-SIDECAR-ACCEPTANCE`.

### Parent — `ai-status.json -> P2-UI-PAX-001`

At packet write (read via `scripts/ai-status.sh show P2-UI-PAX-001`):

- owner=`Codex2`, reviewer=`Claude`, status=`in_progress`
- depends_on: `P2-DP-C3-001`, `P2-DP-S1-001`
- artifacts: `apps/referral-embed-web/`, `apps/passenger-web/`,
  `docs/05-ui/drts-design-canvas/pe-fallback.jsx`
- parent `next` (truth): *"Implemented 4 AV→human fallback states in
  `apps/referral-embed-web` with backend-style messageCode/message rendering and verified
  referral-embed-web typecheck + webpack build. Remaining acceptance is blocked by missing
  repo artifact `apps/passenger-web` in this worktree/repo."*

Branch reality at packet write:

- The parent's 4-state implementation is on the remote branch `codex2/p2-ui-pax-001`
  (`git ls-remote origin` → `refs/heads/codex2/p2-ui-pax-001`); it is **not** merged to
  `dev`. On the `dev`-based sidecar worktree, `apps/referral-embed-web` still carries only
  the Phase-1 generic `fallback` state, whose copy is rendered from the embed's **local**
  i18n bundle (`apps/referral-embed-web/components/passenger-embed.tsx:583` →
  `t("embed.message.fallback")`), **not** from a backend `passengerMessageCode`. The parent
  diff is exactly the transition away from that local-copy pattern (see AC-3 / Risk R1).
- `apps/passenger-web` does not exist in the repo at packet write. The parent's own `next`
  flags this. See AC-7 and the "missing-artifact" handling below.

### Canonical visual + contract sources (read-only context for the sidecar)

- Design canvas (visual truth): `docs/05-ui/drts-design-canvas/pe-fallback.jsx`
- Realm tokens (color truth): `@drts/ui-tokens` `REALM_COLORS.tenant` — the embed surface
  resolves its theme through the **tenant** realm
  (`apps/referral-embed-web/lib/embed-presentation.ts:11-13,40` →
  `REALM_COLORS.tenant.light.*`, `SURFACE_ACCENTS.tenant.light.*`). Per the UI Design
  Contract the tenant realm is teal (`#0F766E` / `#5EEAD4`). A raw hex palette hardcoded in
  `globals.css` or components is a DEFECT, not a style choice.
- C3 visibility projection + passenger display rules + copy-derivation boundary:
  `docs/02-architecture/phase2_tesla_fsd_sandbox_system_design_decision_packet_c1c6_b1b5_20260625.md`
  §5.2 (`SandboxFulfillmentVisibilityRecord`), §5.3 (passenger display rules + suppression
  list), §5.6 (backend owns `messageCode`; frontend only i18n).
- C4 billing guardrail: same packet §6.3 (`SandboxBillingTreatmentRecord.fallbackSurchargeApplied: false`).
- S1 message catalog DDL + seed:
  `infra/migrations/V0042__passenger_disclosure_policy_catalog_acknowledgements.sql`.

---

## 3. Dependency Map

The parent's `depends_on` set is `P2-DP-C3-001`, `P2-DP-S1-001`. Their truth at packet
write:

| Dep ID         | Title / role                                           | Machine-truth status                                                                                    | What it provides to P2-UI-PAX-001                                                                                                                                                                                                                                                                                                                                            |
| -------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `P2-DP-C3-001` | Sandbox fulfillment **visibility projection** contract | **Not a board row** (`scripts/ai-status.sh show P2-DP-C3-001` → *Task not found*). Contract truth is `done` and canonical. | The `SandboxFulfillmentVisibilityRecord` shape the passenger UI reads: `passengerMessageCode`, `publicState`, `disclosureLevel`, `fallbackStage` (`pre_assignment` / `pre_pickup` / `in_trip`), `externalReasonCategory` (user-safe), `etaBefore` / `etaAfter`. §5.3 fixes the passenger **suppression list**. §5.6 fixes the copy-derivation boundary (frontend i18n only). |
| `P2-DP-S1-001` | Passenger disclosure **message catalog** + ack         | **`done`** (owner `Codex2`, reviewer `Codex`; integrated to `dev` via PR #926, merge commit `b2c2e355d`). | The canonical message-catalog tables that hold the real i18n strings keyed by `(message_code, locale)`: `av_sandbox.passenger_disclosure_message_catalog` with `UNIQUE(message_code, locale)` and a `legal_approved` gate (`V0042` lines 20-32). This is where the backend resolves a `passengerMessageCode` into displayable copy.                                            |

### Dependency assertion & drift notes

- **`P2-DP-C3-001` is a declared dependency id that does not exist as a machine-truth task
  row.** Only its history-repair child `P2-DP-C3-001-UNBLOCK-HISTORY-REPAIR` exists and is
  `done` (owner `Codex`, reviewer `Codex2`, `2026-06-26T07:25:13Z`). The C3 **contract** is
  nonetheless canonical and complete in the C1–C6/B1–B5 decision packet §5. Treat C3 as
  satisfied-by-contract, not satisfied-by-board-row. The parent reviewer should not block on
  a missing `P2-DP-C3-001.status` — it is structural, not a regression. (This mirrors the
  known pattern where parent `depends_on` ids are spec anchors, not always board rows.)
- **`P2-DP-S1-001` is fully `done` and merged to `dev`.** The catalog tables and `(code,
  locale)` uniqueness are live. **However**, the V0042 seed currently contains exactly one
  message family — `sandbox_passenger_disclosure.av_program_notice` (en-US
  `legal_approved=true`, zh-TW `legal_approved=false`) (V0042 lines 73-110). The four
  fallback-state codes shown in the canvas (`pax.fallback.vehicle_change.*`,
  `pax.fallback.human_assigned.*`, `pax.fallback.service_continuing.*`,
  `pax.fallback.eta_updated.*`) are **illustrative slot labels in the canvas, not seeded
  catalog rows.** The passenger UI must render whatever `passengerMessageCode` the backend
  visibility projection returns; it must not hardcode the canvas sample strings, and it must
  not assume any specific fallback code is already in the catalog. If a code resolves to a
  row with `legal_approved=false` (as the zh-TW disclosure baseline currently is), the
  display policy for unapproved copy is a backend/catalog concern, **not** something the
  passenger UI should paper over with a hardcoded fallback string.
- If C3 §5.2 reopens (visibility-record field shape changes — e.g. `fallbackStage` enum or
  `externalReasonCategory` set), the passenger state→record mapping and the suppression
  guarantee must be re-validated before parent finalize.
- If S1 reopens (catalog schema or `legal_approved` gate semantics change), the
  copy-resolution path the parent depends on shifts; re-confirm the parent never falls back
  to local copy.

### Downstream

No machine-truth task currently declares `P2-UI-PAX-001` as an upstream `depends_on` at
packet write. The visible downstream consumer is product-level: the passenger-facing AV→human
fallback experience itself (passenger-embed today; `passenger-web` once that app exists). No
blast-radius dependents to pin.

---

## 4. Acceptance Checklist

Each item restates a parent acceptance gate or canvas hard rule as a concrete,
citation-anchored check. The parent is `in_progress` at packet write, so every item is
**forward-looking**: it states the property the parent diff must satisfy, not a property
already observed on `dev`.

Legend: `[REQUIRED]` = explicit gate from `ai-status.json -> P2-UI-PAX-001.acceptance` or a
canvas HARD RULE. `[DERIVED]` = implied by the C3/C4 contract or L0/L2 collaboration rules;
informational for the reviewer.

| #    | Gate    | Acceptance property                                                                                                                                                                                                                                                                                                                | Primary citation                                                                                                                          |
| ---- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1 | `[REQUIRED]` | **Four fallback states match the canvas.** The diff renders `PE_FbVehicleChange` (`vehicle_change_in_progress`), `PE_FbHumanAssigned` (`human_fallback_assigned`), `PE_FbServiceContinuing` (`service_continuing`), and `PE_FbEtaUpdated` (`eta_updated`) — icons/tone/stage rail per canvas, no states added or dropped.            | `pe-fallback.jsx:103-153` (4 state components), `:26-52` (`PaxFallbackRail` 3-step service-continuity rail)                              |
| AC-2 | `[REQUIRED]` | **No hardcoded passenger copy.** Every title/body string is rendered from a backend `passengerMessageCode` (MsgSlot pattern). The canvas `titleSample` / `bodySample` strings are explicitly "示意 / sample" placeholders (`MsgSlot` renders "文案由後端 messageCode 渲染 · 此為示意") and MUST NOT be shipped as literal UI copy.       | `pe-fallback.jsx:5-7` (HARD RULE), `:11-24` (`MsgSlot`, label "messageCode · {code}"), `:60-61` (`title ← {titleCode}` slot marker)      |
| AC-3 | `[REQUIRED]` | **Copy comes from the backend, not derived in the frontend.** The UI takes `passengerMessageCode` from the visibility projection and only does i18n lookup; it must NOT map an internal reason/state to copy itself, and must NOT extend the Phase-1 local pattern (`t("embed.message.fallback")`) for the new states.               | C3 packet §5.6 ("Backend 回 `messageCode`…frontend 只做 i18n，不得自行由 internal reason 推文案"); current local pattern at `passenger-embed.tsx:583` |
| AC-4 | `[REQUIRED]` | **Passenger suppression holds — highest severity.** None of the four states (nor any shared scaffold/footer/debug field) renders: Tesla provider reason code, FSD transition event type, operational-hold detail, incident classification, evidence freeze / legal hold, or safety-operator / ROC personnel names.                   | C3 packet §5.3 ("Passenger 不顯示：Tesla provider reason code、FSD transition event type、operational hold…、安全員或 ROC 人員姓名"); `pe-fallback.jsx:6-8` |
| AC-5 | `[REQUIRED]` | **No surcharge, no second booking.** Trip identity stays the single original booking; the UI shows "維持原價 · 無額外收費" and the C4 guardrail strip ("不會重新下單，也不會加收費用"); no second-booking CTA, no surcharge prompt. Driven by `fallbackSurchargeApplied=false`.                                                         | `pe-fallback.jsx:84-95` (stable booking + C4 strip), C4 packet §6.3 (`fallbackSurchargeApplied: false`)                                   |
| AC-6 | `[REQUIRED]` | **Typecheck + build pass.** `pnpm --filter @drts/referral-embed-web typecheck` and the webpack/Next build succeed on the parent diff (parent `next` already claims this for referral-embed-web).                                                                                                                                    | `ai-status.json -> P2-UI-PAX-001.acceptance` ("typecheck+build pass"); parent `next`                                                     |
| AC-7 | `[DERIVED]` | **`passenger-web` scope is honestly reported.** `apps/passenger-web` does not exist in the repo. Either the parent delivers the same pattern in `passenger-web` (if the app is created) **or** the parent records the missing-artifact blocker in machine truth and scopes acceptance to `referral-embed-web`. Do not silently drop it. | parent `next` ("blocked by missing repo artifact `apps/passenger-web`"); parent `artifacts` lists `apps/passenger-web/`                   |
| AC-8 | `[DERIVED]` | **Realm tokens, not raw hex.** Colors/typography resolve through `@drts/ui-tokens` `REALM_COLORS.tenant` (teal `#0F766E`/`#5EEAD4`), reusing the embed's existing theme plumbing. No new raw hex palette in `globals.css` or components; no Canvas/shadcn-default reskin (套皮).                                                       | UI Design Contract (task brief); `embed-presentation.ts:11-13,40`; `pe-fallback.jsx` uses theme `t.*` tokens throughout                  |
| AC-9 | `[DERIVED]` | **State→record mapping is faithful.** Each UI state corresponds to a real `SandboxFulfillmentVisibilityRecord` projection (`publicState` / `fallbackStage` / `etaBefore`→`etaAfter`); ETA is shown as estimate-not-guarantee ("估計值，非保證") and `eta_updated` reflects an ETA change, not a fabricated value.                  | C3 packet §5.2 (record fields), `pe-fallback.jsx:66-80` (ETA card, "估計值，非保證")                                                     |

---

## 5. Reviewer Focus — Risk-Ranked

Ordered by severity for the parent reviewer (`Claude`) at parent finalize. R1–R2 are the two
that, if wrong, are not cosmetic.

- **R1 — Backend-authored copy (AC-2/AC-3).** The single most likely regression: the parent
  extends the existing local i18n pattern (`embed.message.fallback`) to the four new states
  instead of consuming `passengerMessageCode`. Grep the diff for any new literal Chinese/
  English fallback strings or new `embed.message.*` / `embed.state.fallback.*` keys carrying
  fallback body copy. The canvas samples are placeholders; shipping them verbatim fails AC-2.
- **R2 — Passenger data-leak (AC-4) — highest blast radius.** Any field, tooltip, debug
  block, `data-*` attribute, analytics payload, or conditional banner that surfaces a Tesla
  reason code, FSD transition type, operational-hold detail, incident class, evidence/legal
  hold, or safety-operator/ROC name is a contract violation, not a UI nit. Check the shared
  `PeFallbackBase` scaffold and every footer/CTA, and confirm nothing leaks via props passed
  down from the visibility record beyond the user-safe set (§5.2).
- **R3 — Surcharge / second booking (AC-5).** Confirm trip identity stays one booking, the
  "維持原價 · 無額外收費" row and C4 guardrail strip are present, and no second-booking or
  surcharge CTA exists anywhere in the four states.
- **R4 — `passenger-web` honesty (AC-7).** Confirm the parent either covers `passenger-web`
  or records the missing-artifact blocker; the slice must not be reported as fully complete
  while `apps/passenger-web` does not exist.
- **R5 — Realm-token discipline (AC-8).** Diff the changed styles against
  `REALM_COLORS.tenant`; reject any raw hex palette or shadcn/Canvas-default reskin.
- **R6 — Catalog reality (Dependency §3).** Confirm the parent does not assume the four
  `pax.fallback.*` codes are seeded (they are not in V0042 v1) and handles a
  not-yet-approved / missing catalog row without falling back to hardcoded copy.
- **R7 — Build/typecheck evidence (AC-6).** Re-run typecheck + build on the parent diff
  rather than trusting the `next` claim; the parent's claim predates the eventual final diff.

---

## 6. Reviewer Handoff Command Block

Run from the parent worktree **after** the parent owner (`Codex2`) finalizes and the diff is
available (parent branch `codex2/p2-ui-pax-001`, or once merged to `dev`).

```bash
# 1. Locate the parent diff (branch not yet on dev at packet write)
git fetch origin
git log --oneline origin/codex2/p2-ui-pax-001 -10
git diff --stat origin/dev...origin/codex2/p2-ui-pax-001 -- apps/referral-embed-web apps/passenger-web

# 2. AC-2/AC-3 — no hardcoded fallback copy / no local-derived copy (expect: only messageCode wiring)
git diff origin/dev...origin/codex2/p2-ui-pax-001 -- apps/referral-embed-web \
  | grep -nE '正在.*安排車輛|已.*指派|行程繼續|預計.*更新|embed\.message\.|embed\.state\.fallback' || echo "no hardcoded fallback copy (good)"
grep -rnE 'passengerMessageCode|messageCode' apps/referral-embed-web/components apps/referral-embed-web/lib 2>/dev/null

# 3. AC-4 — passenger suppression (MUST return nothing)
grep -rinE 'fsd|reason.?code|operational.?hold|incident|evidence.?freeze|legal.?hold|roc|safety.?operator|tesla' \
  apps/referral-embed-web/components apps/referral-embed-web/lib 2>/dev/null | grep -v node_modules || echo "no suppressed terms leaked (good)"

# 4. AC-5 — no surcharge / second booking
grep -rinE 'surcharge|加收|第二.?筆|re-?book|重新下單|second.?booking' \
  apps/referral-embed-web/components 2>/dev/null || echo "no surcharge/second-booking (good)"

# 5. AC-8 — realm tokens, no raw hex palette
grep -rnE '#[0-9a-fA-F]{6}' apps/referral-embed-web/app/globals.css apps/referral-embed-web/components 2>/dev/null \
  | grep -vE 'REALM_COLORS|ui-tokens' || echo "no raw hex palette (good)"

# 6. AC-6 — typecheck + build
pnpm --filter @drts/referral-embed-web typecheck
pnpm --filter @drts/referral-embed-web build
```

Expected outcomes: steps 2/4/5 print the "(good)" sentinel; step 3 prints "(good)" with no
leaked terms; step 6 exits 0. Any deviation maps back to the AC / risk it tests.

---

## 7. Closeout Note

This sidecar is support-only (`mutates_canonical=false`). It introduces no canonical change
and no runtime behavior; the only artifact is this file. Finalize path: hand off to reviewer
`Codex2`; on approval, owner closes with `INTEGRATION_STATUS=not_applicable` and either a
task-scoped commit of this file or `NO_COMMIT_REQUIRED=1` per the support-only closeout rule
(`AI_COLLABORATION_GUIDE.md` §5). The parent `P2-UI-PAX-001` remains independently owned by
`Codex2` / reviewed by `Claude`; this packet does not advance, pre-approve, or absorb the
parent slice.
