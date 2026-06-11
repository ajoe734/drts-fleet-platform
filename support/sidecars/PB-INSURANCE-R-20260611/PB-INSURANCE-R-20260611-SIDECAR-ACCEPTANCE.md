# PB-INSURANCE-R-20260611 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `PB-INSURANCE-R-20260611`  
**Parent Owner:** `Codex`  
**Parent Reviewer:** `Claude2`  
**Sidecar Owner:** `Codex`  
**Sidecar Reviewer:** `Codex2`  
**Generated:** `2026-06-11` (UTC)  
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` - support-only; does not modify canonical truth, runtime behavior, or parent task state by itself.

This packet is the reviewer-facing acceptance companion for the insurance partner-booking slice. It translates the parent task brief into a concrete checklist, maps the code and canvas dependencies that must align, and records the current evidence and known risks without changing canonical truth.

## 1. Scope Boundary

In scope:

- prepare reviewer support material only
- restate the parent acceptance bar as a concrete checklist
- map the insurance flow's dependencies across theme, screens, forms, translations, tests, and canvas references
- capture current evidence and open validation risks for reviewer handoff

Out of scope:

- editing L1/L2 product truth
- changing runtime behavior in `apps/partner-booking-web`, `packages/contracts`, or canvas files
- asserting parent acceptance as passed when the evidence still shows unresolved gaps
- modifying machine truth beyond normal sidecar status transitions

## 2. Machine Truth Anchors

### Sidecar - `PB-INSURANCE-R-20260611-SIDECAR-ACCEPTANCE`

- owner=`Codex`
- reviewer=`Codex2`
- status is authoritative in `ai-status.json` via `scripts/ai-status.sh` / `python3 scripts/ai_status.py`
- helper_parent=`PB-INSURANCE-R-20260611`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- artifact=`support/sidecars/PB-INSURANCE-R-20260611/PB-INSURANCE-R-20260611-SIDECAR-ACCEPTANCE.md`

### Parent - `PB-INSURANCE-R-20260611`

- owner=`Codex`
- reviewer=`Claude2`
- status at packet creation=`in_progress`
- parent acceptance from machine truth:
  - reuse the existing card funnel + `lib/program-theme.ts`
  - match the `pb-states` / `pb-embed` canvas functions
  - issuer brand via `@drts/ui-tokens` `brands.ts` not raw hex so `check_ui_realm_tokens` passes
  - zh-TW via `t()`
  - `pnpm --filter @drts/partner-booking-web typecheck` and `build` pass

Interpretation:

- this packet is not a second source of truth for live lifecycle fields
- parent acceptance remains authoritative in machine truth; this file only maps each criterion to repo evidence and reviewer checks

## 3. Dependency Map

### A. Insurance theme and entry resolution

| Surface | Current evidence | Why it matters |
| --- | --- | --- |
| Program theme owner | `apps/partner-booking-web/lib/program-theme.ts` | Parent brief explicitly requires reuse of the existing card funnel through shared theming infrastructure. |
| Program kind resolution | `resolveProgramKind()` and `getProgramThemeForSlug()` in `lib/program-theme.ts`; tests in `tests/integration/program-theme.test.ts` | Insurance host / slug / keyword routing must resolve to the insurance funnel rather than fall back to card. |
| Brand token source | `packages/ui-tokens/src/brands.ts` | Parent acceptance requires issuer brand sourcing from `@drts/ui-tokens` rather than hand-picked raw hex. |

### B. Canvas-to-runtime screen alignment

| Surface | Current evidence | Why it matters |
| --- | --- | --- |
| Canvas positive insurance eligibility | `docs/05-ui/drts-design-canvas/pb-states.jsx` -> `PB_InsEligibility()` | Parent brief requires the runtime implementation to match the insurance canvas functions. |
| Canvas blocked insurance states | `docs/05-ui/drts-design-canvas/pb-states.jsx` -> `PB_InsBlocked()` | The blocked-state set is the core insurance-specific acceptance surface. |
| Runtime screen registry | `apps/partner-booking-web/lib/program-screens.tsx` | This is where the insurance-only screen ids, labels, summaries, and screen gating are materialized. |
| Embed / screen demo references | `docs/05-ui/drts-design-canvas/pb-embed.jsx`, `docs/05-ui/drts-design-canvas/pb-screens.jsx` | Reviewer should compare copy and framing against the canvas source, not chat descriptions. |

### C. Form intake and validation

| Surface | Current evidence | Why it matters |
| --- | --- | --- |
| Draft model and gate logic | `apps/partner-booking-web/lib/partner-booking-form.ts` | Defines insurance-specific draft fields, gate behavior, and required-field validation. |
| Form rendering | `apps/partner-booking-web/components/partner-booking-form.tsx` | Confirms the required insurance inputs are actually rendered in the UI surface. |
| Localized copy | `apps/partner-booking-web/lib/translations.ts` | Parent acceptance requires zh-TW strings via `t()`, not hard-coded English-only labels. |
| Validation tests | `apps/partner-booking-web/tests/integration/program-form-utils.test.ts` | Ensures claim / policy / claimant / replacement-vehicle requirements remain enforced. |

### D. Contract and subtype seam

| Surface | Current evidence | Why it matters |
| --- | --- | --- |
| Dispatch subtype constant | `packages/contracts/src/index.ts` contains `insurance_replacement_vehicle` | The insurance funnel must stay anchored to the shared contract subtype. |
| Insurance blocked enums | `packages/contracts/src/index.ts` contains `insurance_missing`, `insurance_pending`, `insurance_expired`, `insurance_cancelled`, `insurance_policy`, `insurance_roster` | Reviewer can verify the runtime screen inventory is consistent with contract-facing identifiers. |

## 4. Parent Acceptance Checklist

Legend:

- `[x]` evidence currently present in repo
- `[!]` reviewer attention required; current evidence suggests a gap or an unproven condition

### AC-P1 - Reuse the existing card funnel + `lib/program-theme.ts`

- [x] Shared funnel infrastructure exists in `apps/partner-booking-web/lib/program-theme.ts` and `apps/partner-booking-web/lib/program-screens.tsx`.
- [x] Insurance is modeled as a program kind beside `card` and `travel`, rather than as a separate app surface.
- [x] Insurance resolution is covered by integration tests in `apps/partner-booking-web/tests/integration/program-theme.test.ts`.
- [!] Reviewer should confirm the parent implementation reuses the card funnel shell rather than forking a parallel route stack or bespoke runtime scaffold.

### AC-P2 - Match `pb-states` / `pb-embed` canvas functions

- [x] Canvas anchors exist for `PB_InsEligibility()` and `PB_InsBlocked()` in `docs/05-ui/drts-design-canvas/pb-states.jsx`.
- [x] Runtime screen registry includes seven insurance-specific states:
  - `insurance_policy`
  - `insurance_replacement_vehicle`
  - `insurance_roster`
  - `insurance_pending`
  - `insurance_missing`
  - `insurance_expired`
  - `insurance_cancelled`
- [x] Runtime copy in `lib/program-screens.tsx` references the same blocked-state framing as the canvas.
- [!] Reviewer should visually compare runtime output against `pb-states.jsx` and `pb-embed.jsx`; this packet does not include a browser-level screenshot diff.

### AC-P3 - Issuer brand via `@drts/ui-tokens` `brands.ts`, not raw hex; `check_ui_realm_tokens` passes

- [x] `apps/partner-booking-web/lib/program-theme.ts` imports `BRAND_TEMPLATES` from `@drts/ui-tokens`.
- [x] Card and travel already reuse canonical brand templates.
- [!] Current repo evidence shows the insurance theme still uses inline raw hex values in `program-theme.ts` instead of a canonical brand record from `packages/ui-tokens/src/brands.ts`.
- [!] No repo evidence was collected in this sidecar that `python3 scripts/check_ui_realm_tokens.py` passes for the insurance changes.
- [!] Reviewer should treat this acceptance item as open until the parent owner either wires insurance through canonical brand tokens or proves the current approach satisfies the checker.

### AC-P4 - zh-TW via `t()`

- [x] Insurance gate copy, program labels, coverage copy, and field labels exist in `apps/partner-booking-web/lib/translations.ts`.
- [x] Form rendering in `components/partner-booking-form.tsx` uses `t("field.*")` labels for insurance fields.
- [x] Validation helpers in `lib/partner-booking-form.ts` source user-facing errors through `t()`.
- [!] Reviewer should still scan any newly added insurance screen prose in `lib/program-screens.tsx` for hard-coded copy that should instead be localized if the parent task extends beyond the current packet baseline.

### AC-P5 - `typecheck` and `build` pass

- [!] This sidecar did not run `pnpm --filter @drts/partner-booking-web typecheck`.
- [!] This sidecar did not run `pnpm --filter @drts/partner-booking-web build`.
- [!] Parent acceptance remains blocked on executable proof until the owner or reviewer records those command results.

## 5. Current Evidence Inventory

| ID | Evidence | Location | Notes |
| --- | --- | --- | --- |
| E-1 | Parent task acceptance bar | `scripts/ai-status.sh show PB-INSURANCE-R-20260611` | Machine-truth source for the five parent acceptance criteria. |
| E-2 | Insurance theme registration | `apps/partner-booking-web/lib/program-theme.ts` | Confirms insurance is a first-class program kind; also exposes the raw-hex risk. |
| E-3 | Insurance screen registry | `apps/partner-booking-web/lib/program-screens.tsx` | Confirms seven insurance-specific state screens are represented. |
| E-4 | Insurance form logic | `apps/partner-booking-web/lib/partner-booking-form.ts` | Captures gate logic and required insurance fields. |
| E-5 | Insurance form UI fields | `apps/partner-booking-web/components/partner-booking-form.tsx` | Confirms claim / policy / reference / claimant / class / handler inputs are rendered. |
| E-6 | Localization evidence | `apps/partner-booking-web/lib/translations.ts` | Confirms zh-TW keys exist for insurance labels and messaging. |
| E-7 | Theme resolution tests | `apps/partner-booking-web/tests/integration/program-theme.test.ts` | Confirms insurance slug / host / token routing is covered. |
| E-8 | Form validation tests | `apps/partner-booking-web/tests/integration/program-form-utils.test.ts` | Confirms insurance required-field expectations. |
| E-9 | Canvas reference - states | `docs/05-ui/drts-design-canvas/pb-states.jsx` | Canonical UI reference for `PB_InsEligibility` and `PB_InsBlocked`. |
| E-10 | Canvas reference - flow visuals | `docs/05-ui/drts-design-canvas/pb-screens.jsx`, `docs/05-ui/drts-design-canvas/pb-embed.jsx` | Reviewer comparison targets for framing and copy. |
| E-11 | Brand token source | `packages/ui-tokens/src/brands.ts` | Confirms current canonical brand templates do not yet obviously include a Fubon insurance brand record. |

## 6. Reviewer Focus

For `Codex2` reviewing this sidecar:

1. Confirm the packet stays support-only and does not claim canonical changes.
2. Confirm the dependency map correctly links the parent acceptance items to theme, screen, form, translation, contract, and canvas surfaces.
3. Confirm the raw-hex brand risk is called out explicitly rather than silently treated as passing.
4. Confirm the packet does not overstate executable verification; `typecheck`, `build`, and `check_ui_realm_tokens` are intentionally left as open proof points unless separately recorded by the parent owner.
5. If the parent implementation lands additional evidence before review, update only the checklist state and evidence lines necessary to reflect that proof.

## 7. Recommended Verification Commands

These are the concrete checks the parent owner or reviewer should run before treating the parent task as accepted:

```bash
pnpm --filter @drts/partner-booking-web typecheck
pnpm --filter @drts/partner-booking-web build
python3 scripts/check_ui_realm_tokens.py
```

Suggested manual comparison targets:

- insurance theme and routing: `apps/partner-booking-web/lib/program-theme.ts`
- insurance state screens: `apps/partner-booking-web/lib/program-screens.tsx`
- insurance canvas references: `docs/05-ui/drts-design-canvas/pb-states.jsx`, `docs/05-ui/drts-design-canvas/pb-embed.jsx`, `docs/05-ui/drts-design-canvas/pb-screens.jsx`

## 8. Handoff Commands

Owner (`Codex`) -> Reviewer (`Codex2`)

```bash
AI_NAME=Codex scripts/ai-status.sh handoff PB-INSURANCE-R-20260611-SIDECAR-ACCEPTANCE Codex2 "Acceptance packet prepared: checklist, dependency map, evidence inventory, and open verification risks recorded in support/sidecars/PB-INSURANCE-R-20260611/PB-INSURANCE-R-20260611-SIDECAR-ACCEPTANCE.md"
```

Reviewer (`Codex2`) -> `review_approved`

```bash
AI_NAME=Codex2 scripts/ai-status.sh approve PB-INSURANCE-R-20260611-SIDECAR-ACCEPTANCE "Support packet complete; acceptance checklist and dependency map accurately reflect current PB-INSURANCE evidence and open proof points"
```

Reviewer (`Codex2`) -> `reopen`

```bash
AI_NAME=Codex2 scripts/ai-status.sh reopen PB-INSURANCE-R-20260611-SIDECAR-ACCEPTANCE "Packet needs refresh: <missing evidence or incorrect dependency mapping>"
```

## 9. Change Log

- `2026-06-11` - Initial packet created for `PB-INSURANCE-R-20260611-SIDECAR-ACCEPTANCE`; mapped parent acceptance items to repo evidence, identified the insurance brand-token gap, and prepared reviewer handoff commands.
