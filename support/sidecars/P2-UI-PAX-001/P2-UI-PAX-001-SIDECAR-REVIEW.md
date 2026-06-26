# P2-UI-PAX-001 — Review Packet & Evidence Summary

> **Sidecar support artifact** for `P2-UI-PAX-001-SIDECAR-REVIEW` (helper_kind: `review_packet`,
> parent: `P2-UI-PAX-001`). Support-only — does **not** edit canonical truth.
> Owner: `Claude` · Reviewer (this packet): `Codex` · Generated: 2026-06-26.

## 1. Scope & purpose

Passenger AV→human fallback states for the sandbox-fulfillment program, rendered on the
**referral-embed passenger surface**. The packet collects the evidence a reviewer needs to
confirm the four canvas states, the message-code-only copy rule, and the passenger-safety
no-leak constraints — without re-deriving the impl from scratch.

This is a **review packet**, not a re-review. The parent task `P2-UI-PAX-001` was already
reviewed and **approved by Claude** (review approved 14:20Z, re-approved 14:24Z after an
accidental owner demotion). Owner `Codex` finalizes the parent to `done`.

## 2. Implementation under review

| Field | Value |
|---|---|
| Parent task | `P2-UI-PAX-001` (status `review_approved`, owner Codex, reviewer Claude) |
| Impl anchor | `origin/codex/p2-ui-pax-001` @ `f07099a02` |
| Closeout marker | `a82ca34a2` (empty marker carrying `Task-ID` / `Reviewer: Claude` / Verification trailers) |
| Diff size | 6 files, **+847 / −0** vs `origin/dev` |
| Surface | `apps/referral-embed-web/` (no `apps/passenger-web/` in repo — see §6 note) |
| Canvas | `docs/05-ui/drts-design-canvas/pe-fallback.jsx` |
| Deps | `P2-DP-C3-001` (visibility projection), `P2-DP-S1-001` (message catalog) |

### Files changed (`git diff --stat origin/dev...f07099a02`)

```
apps/referral-embed-web/components/passenger-embed.tsx       | 451 +++  (render: 4 states, progress rail, quick links)
apps/referral-embed-web/lib/passenger-fallback.ts            | 135 +++  (view resolver, code normalization, i18n key builders)
apps/referral-embed-web/lib/translations.ts                  |  98 +++  (en + zh-TW passengerMessageCode catalog keys)
apps/referral-embed-web/lib/embed-fixtures.ts                |  83 +++  (per-screen projection fixtures, extraChargeDisclosed=false)
apps/referral-embed-web/lib/embed-context.ts                 |   8 +++  (EmbedScreen union extended with fb_* screens)
apps/referral-embed-web/tests/unit/passenger-fallback.test.ts|  72 +++  (3 vitest specs)
```

## 3. Acceptance-criterion → evidence map

Parent AC: *"4 passenger fallback states match canvas; all copy rendered from
passengerMessageCode (no hardcoded text); no FSD internals shown; no surcharge /
second-booking; typecheck+build pass."*

| # | Criterion | Evidence | Verdict |
|---|---|---|---|
| AC-1 | **4 fallback states** match `pe-fallback` canvas | `PASSENGER_FALLBACK_SCREENS = [fb_vehicle_change, fb_human_assigned, fb_service_continuing, fb_eta_updated]` (`passenger-fallback.ts`); per-screen `tone`/`icon`/`progressStage` in `PASSENGER_FALLBACK_CONFIG`; render switch `passenger-embed.tsx:1290-1313` | ✅ |
| AC-2 | **All copy from `passengerMessageCode`** (no hardcoded text) | Copy keys built via `buildPassengerMessageTitleKey` / `buildPassengerMessageBodyKey` from `messageCode`; `resolvePassengerFallbackCopy` (`passenger-embed.tsx:857-866`); catalog keys `passengerMessageCode.sandbox_fulfillment.*` (`translations.ts:771-793` en, `1505-1527` zh-TW) | ✅ |
| AC-3 | **No FSD internals** (reason code / FSD transition / operational hold / incident / evidence freeze / legal hold / safety-officer / ROC names) | Full-diff leak scan returns **zero** matches for `reasonCode\|fsd\|safety.?officer\|incident\|evidence.?freeze\|legal.?hold\|roc\|operational.?hold`; render only emits tone/icon/eta/messageCode | ✅ |
| AC-4 | **No surcharge / second booking** | `extraChargeDisclosed: false` on every fixture (`embed-fixtures.ts:578/597/616/635`); explicit passenger reassurance copy "The same booking continues. No second booking or surcharge will be created." (`translations.ts`); no `fallbackSurchargeApplied=true` path | ✅ |
| AC-5 | **typecheck + build pass** | Verification trailer on closeout `a82ca34a2`: `vitest 3/3 pass`, `tsc --noEmit` clean, `next build --webpack` OK (re-run by reviewer to confirm) | ✅ (reviewer re-run advised) |

## 4. Design-contract conformance (UI Design Contract)

- **Realm tokens, not raw hex.** `embed-presentation.ts:2` imports `REALM_COLORS, STATUS_TONES,
  SURFACE_ACCENTS` from `@drts/ui-tokens`; theme built from `REALM_COLORS.tenant.light.*`
  (`buildEmbedTheme`, lines 11-13) and `SURFACE_ACCENTS.tenant.light.fg` (line 40). No
  hardcoded `#0F766E` / `#5EEAD4` palette introduced in `globals.css` or components. ✅
- **Canvas match.** Four states map to the `pe-fallback.jsx` canvas
  (`PE_FbVehicleChange` / `PE_FbHumanAssigned` / `PE_FbServiceContinuing` / `PE_FbEtaUpdated`):
  tone/icon/stage/eta alignment confirmed in reviewer notes. No redesign / 套皮. ✅
- **Realm.** Passenger embed runs on the **tenant** realm (teal `#0F766E` / `#5EEAD4`) via tokens. ✅

## 5. Message-code semantics (passenger-safety core)

- **Three passenger-safe codes only**: `PASSENGER_STATUS_UPDATE_CODE`
  (`sandbox_fulfillment.status_update_available`), `PASSENGER_HUMAN_CONTINUING_CODE`
  (`...service_continues_with_human_driver`), `PASSENGER_HUMAN_FALLBACK_ACTIVE_CODE`
  (`...human_fallback_active`).
- **Partner→passenger normalization**: `normalizePassengerMessageCode` rewrites the
  partner-facing `...human_fallback_active` code to the passenger-safe
  `...service_continues_with_human_driver` **copy key** before i18n lookup
  (`passenger-fallback.ts`). The raw `messageCode` is preserved for the provenance chip
  (`embed.fallback.messageCode`), but the rendered title/body always resolve from the
  normalized `copyCode` — so even a partner-tier code yields passenger-safe copy.
- **Raw-code fallback is passenger-safe**: when a catalog key is missing, the surface shows
  the raw `messageCode` string, which is itself a passenger-safe identifier (no internals).
- **Provenance**: `messages[0].messageCode` from the C3 visibility projection drives copy;
  config `defaultMessageCode` is the fallback when the projection carries no messages.

## 6. Reviewer focus / risk notes (R1–R7)

- **R1 — Phase-1 local-i18n fallback (this surface).** Copy lives in
  `apps/referral-embed-web/lib/translations.ts` (en + zh-TW), not yet sourced from the
  S1 backend catalog. Confirm this is an accepted Phase-1 local-render fallback, not a
  drift from the message-code-only rule. The *key scheme* is message-code-derived, so the
  contract holds even though the strings are local.
- **R2 — Passenger data-leak (highest risk).** Re-run the leak scan on the full diff before
  approving; confirm no FSD reason code / safety-officer / ROC / incident / evidence-freeze
  / legal-hold ever reaches the rendered DOM through any branch (incl. the raw-code chip).
- **R3 — Surcharge / second booking.** Verify `extraChargeDisclosed=false` everywhere and
  that no code path can flip it true on this passenger surface.
- **R4 — `passenger-web` absence (AC-7 from parent decision packet).** `apps/passenger-web/`
  is **not** in the repo on HEAD. The surface lands on `apps/referral-embed-web` instead;
  the canvas self-describes the same pattern and the owner annotated this. Confirm acceptance
  that the referral-embed passenger surface satisfies the passenger requirement for Phase 2.
- **R5 — Contract shape.** Consumes `@drts/contracts` `SandboxFulfillmentProjectionView`
  (`Pick<..., "messages" | "etaMinutes">`). Confirm the C3 projection actually emits these.
- **R6 — ETA rail behavior.** `fb_eta_updated` is intentionally **outside** the progress rail
  (`progressStage: null`); `fb_vehicle_change` shows no ETA (`fallbackEtaMinutes: null`).
  Confirm against canvas (test `keeps ETA-only fallback states outside the progress rail`).
- **R7 — Verification re-run.** Closeout `a82ca34a2` is an empty marker; reviewer should
  re-run `vitest` (3 specs) + `tsc --noEmit` + `next build` to independently confirm green.

## 7. Test evidence

`apps/referral-embed-web/tests/unit/passenger-fallback.test.ts` — 3 specs (vitest 3/3):

1. `maps vehicle-change fallback screens to the passenger status-update code` — asserts
   `messageCode === copyCode === PASSENGER_STATUS_UPDATE_CODE`, `progressStage ===
   vehicle_change_in_progress`, `etaMinutes === null`.
2. `normalizes partner-facing human fallback codes to passenger-safe copy keys` — feeds
   `PASSENGER_HUMAN_FALLBACK_ACTIVE_CODE`, asserts `copyCode` normalizes to
   `PASSENGER_HUMAN_CONTINUING_CODE` and the title key contains the passenger-safe code.
3. `keeps ETA-only fallback states outside the progress rail` — asserts `progressStage ===
   null`, `etaMinutes === 19`, body key resolves to the `fb_eta_updated.body` catalog entry.

## 8. Reviewer command block (for Codex)

```bash
git fetch origin codex/p2-ui-pax-001
git diff --stat origin/dev...f07099a02 -- apps/referral-embed-web/
# Passenger-leak scan (expect zero FSD-internal matches):
git diff origin/dev...f07099a02 -- apps/referral-embed-web/ \
  | grep -inE 'reasonCode|fsd|safety.?officer|incident|evidence.?freeze|legal.?hold|\broc\b|operational.?hold' || echo "CLEAN"
# Independent verification:
cd apps/referral-embed-web && pnpm vitest run tests/unit/passenger-fallback.test.ts && pnpm exec tsc --noEmit && pnpm build
```

## 9. Handoff

- **Parent verdict already recorded**: `P2-UI-PAX-001` is `review_approved` (Claude). Owner
  Codex finalizes parent to `done` with `INTEGRATION_STATUS=branch_pushed`
  (`origin/codex/p2-ui-pax-001@a82ca34a2`). No further code change required.
- **This sidecar**: support artifact only; hand off to reviewer `Codex` for parent absorption.
- **No canonical truth modified** by this packet.
