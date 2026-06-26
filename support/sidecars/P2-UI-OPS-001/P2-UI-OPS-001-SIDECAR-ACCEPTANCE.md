# P2-UI-OPS-001 — Acceptance Packet & Dependency Map (Sidecar)

| Field | Value |
| --- | --- |
| Sidecar Task | `P2-UI-OPS-001-SIDECAR-ACCEPTANCE` |
| Parent Task | `P2-UI-OPS-001` (in_progress — owner `Codex`, reviewer `Codex2`) |
| Helper Kind | `acceptance_packet` |
| Sidecar Owner | `Claude` |
| Sidecar Reviewer | `Codex` |
| Sidecar Self-Status | `in_progress` → handoff to reviewer on completion |
| Mutates Canonical | `false` (support artifact only) |
| Packet Built Against | `origin/dev` @ `b7e5c888a` (this worktree HEAD == origin/dev) |
| Date | 2026-06-26 |

> **What this packet is.** A reviewer-ready acceptance checklist + dependency map for the
> ops-console AV-fallback UI (`P2-UI-OPS-001`), derived from the **canonical design truth**
> (the `ops-av-fallback` canvas) and the **§C3 external-disclosure contract**. It is the
> rubric the reviewer applies against the parent owner's implementation branch at review
> time. It does **not** edit canonical truth and does **not** stand in for the parent owner's
> own self-report.
>
> **Baseline caveat (read before judging "gaps").** This worktree is branched from `dev` and
> `HEAD == origin/dev`. The parent owner (`Codex`) is actively implementing on a separate
> task branch that is **not yet merged to dev**, so the three canvas surfaces are not visible
> from this baseline. "Not present on dev" here means *not yet integrated*, **not** a defect of
> the parent. Acceptance must be evaluated against the parent branch's diff, using the criteria
> below — not against this dev snapshot.

---

## 1. Scope & Non-Goals

**In scope for parent `P2-UI-OPS-001`** (per parent brief + canvas L1-3):
Build `apps/ops-console-web` AV-fallback surfaces matching `docs/05-ui/drts-design-canvas/ops-av-fallback.jsx`:
`OC_AvFallback` (轉人駕監控), `OC_PassengerRecovery` (乘客安撫), `OC_SandboxExceptions` (沙盒例外).
Consume the `P2-FBK-001` feedback projection and the `P2-DP-C3-001` §C3 sandbox-fulfillment / `messageCode` projection. Same-booking context preserved; passenger copy from backend `messageCode` (no internal FSD reason leak); fallback shows **no surcharge**; typecheck + build pass.

**Non-goals** (must NOT appear in the UI — §C3 boundary):
- No Tesla provider reason code, FSD transition event type, raw takeover event, operational-hold reason detail, incident classification, evidence/legal-hold, or ROC/safety-officer personnel identity in any **passenger-facing** surface.
- No second booking created for a fallback (single canonical booking; single customer invoice).
- No frontend-invented passenger copy derived from internal reason (frontend i18n only).

---

## 2. Dependency Map

| Dep (parent brief) | Machine-truth tracking | Status | What it provides to `P2-UI-OPS-001` |
| --- | --- | --- | --- |
| `P2-FBK-001` | base id not a standalone board task; delivered via parent feedback slice (PR#901, `c4126ee`, merged_to_dev) + closed sidecar `P2-FBK-001-SIDECAR-ACCEPTANCE` (`done` 2026-06-26 05:49Z) | **satisfied / merged_to_dev** | Feedback projection the ops console consumes (passenger-notify / recovery feedback surface). |
| `P2-DP-C3-001` | base id not a standalone board task; delivered via `P2-DP-C3-001-UNBLOCK-HISTORY-REPAIR` (`done` 2026-06-26 07:25Z) — the §C3 sandbox-fulfillment visibility contract closeout | **satisfied / done** | §C3 external-disclosure contract: passenger `messageCode` + user-safe category, sandbox fulfillment visibility, fallback category, "no internal reason leak" boundary. |

**Dependency verdict:** both declared dependencies are delivered. `P2-UI-OPS-001` is **not** dependency-blocked. The named base ids (`P2-FBK-001`, `P2-DP-C3-001`) are not present as standalone rows on the task board — `scripts/ai-status.sh show <id>` returns "not found"; their work is tracked under the sidecar/unblock variants above. Treat the named ids as design references, not board ids.

> Verify with: `scripts/ai-status.sh list | grep -iE 'FBK-001|DP-C3-001'`

---

## 3. Canonical Design Truth (the only visual + semantic sources)

**Visual truth — canvas** `docs/05-ui/drts-design-canvas/ops-av-fallback.jsx` (red / ops realm; SD §2.2/§10, flows §5):
- `OC_AvFallback` — L18-73. Fallback monitor: per-booking card with 4-stage progress bar `triggered → reassigning → human_enroute → completed` (L11-16, L41-54); `DL` fields 觸發原因/觸發時間/乘客/人駕 ETA (L56-59); actions `expedite_reassign` (medium, enabled only when `reassigning`), `notify_passenger` (low, enabled until `completed`), `open_incident` (medium) (L63-65). Trigger reasons: `safety_takeover_persisted`, `provider_degraded`, `provider_unreachable` (L7-9).
- `OC_PassengerRecovery` — L76-113. Same-booking context (ord_88240 / fb_0091 / AV-7732 / 新 ETA) (L82-86). Pushed messages are **service-status only** (L88-97). Visibility guard (L100-108): passenger sees `重新安排中 · ETA`; does NOT see `AV / 接管 / 供應商狀態` (L105); 折抵 = `自動 · 本趟全額` (L106).
- `OC_SandboxExceptions` — L116-148. Exception table; types `boundary_exit / provider_unreachable / takeover_timeout / reg_event_stale / schedule_window` (L118-122); states `open / fallback_triggered / monitoring / ack` (L124); severity `danger/warn/info` (L137); `fallback_triggered` rows expose a Fallback action (L140-142). Subtitle: 與既有派遣畫面整合 (L128).

**Semantic truth — §C3 contract** `docs/02-architecture/phase2_tesla_fsd_sandbox_system_design_decision_packet_c1c6_b1b5_20260625.md`:
- **C3 boundary** (L20): external users see service continuity + approved sandbox disclosure only; passenger sees ETA; tenant sees planned/actual fulfillment + fallback category + billing treatment; **no leak of FSD internal events / reason code / raw takeover**.
- **Passenger hidden set** (L231): Tesla provider reason code, FSD transition event type, operational-hold reason detail, incident classification, evidence freeze/legal hold, safety-officer/ROC personnel identity.
- **§5.6 copy & reason-mapping boundary** (L251-253): backend returns `messageCode` + user-safe category; **frontend does i18n only and must not derive copy from internal reason**.
- **No-surcharge / single-invoice** (L675): AV fallback adds no customer charge; human fallback driver gets normal Phase 1 settlement; mixed fulfillment = single customer invoice; passenger projection does not leak internal reason.
- **Single booking** (L169): no second booking is created because of a fallback.

**Token truth** `packages/ui-tokens` — `ops` realm (`realms.ts` L17 / `colors.ts` L67): light `fg #DC2626 / bg #FEF2F2 / border #FECACA`; dark `fg #FCA5A5 / bg #3F1212 / border #5C1A1A`. Ops surfaces must source accent/realm color from these tokens (e.g. via `buildCanvasTheme({ surface: "ops" })`), not a hardcoded hex palette.

---

## 4. Acceptance Checklist (apply to parent branch diff)

Parent AC (board): *"AV fallback + passenger recovery + sandbox exceptions match canvas; same-booking context preserved; messages from backend messageCode (no internal reason leak); no surcharge shown; typecheck+build pass."* Decomposed:

| # | Acceptance Criterion | How to verify | Pass evidence | Canonical source |
| --- | --- | --- | --- | --- |
| **AC-1** | `OC_AvFallback` surface exists in `apps/ops-console-web` and matches canvas: 4-stage progress, trigger reason/time, pax + human ETA, the 3 actions with canvas enable/risk rules. | Locate the route/component; diff structure & stage enum vs canvas; confirm action `enabled`/`riskLevel` gating. | Route + component present; stages `triggered/reassigning/human_enroute/completed`; actions `expedite_reassign`/`notify_passenger`/`open_incident` wired with canvas gating. | canvas L18-73 |
| **AC-2** | `OC_PassengerRecovery` surface exists; pushed content is **service-status only**; same-booking context shown. | Inspect passenger-message rendering + booking context binding. | Messages limited to status/ETA/credit; booking id + revised ETA bound to the same booking, no new booking id. | canvas L76-113; §C3 L169 |
| **AC-3** | `OC_SandboxExceptions` surface exists; type/state/severity enums match canvas; integrates with dispatch surface; `fallback_triggered` exposes fallback action. | Diff enum sets + action wiring. | Types & states match canvas; `fallback_triggered` row → Fallback action. | canvas L116-148 |
| **AC-4** | **Passenger copy comes from backend `messageCode`** + user-safe category; frontend i18n only; no copy derived from internal reason. | Trace passenger-message text source to a `messageCode`/category field from the projection; confirm no client-side reason→text mapping. | Copy keyed by backend `messageCode`; no internal-reason switch in the UI. | §C3 L251-253 |
| **AC-5** | **No internal FSD reason leak** in passenger surfaces (no provider reason code, transition event, raw takeover, hold reason, incident class, evidence/legal-hold, ROC/officer identity). | Audit `OC_PassengerRecovery` + any passenger projection for the L231 hidden set. | None of the hidden fields rendered passenger-side. (Operator-side `OC_AvFallback` may show `觸發原因` — operator, not passenger.) | §C3 L20, L231 |
| **AC-6** | **No surcharge shown** for fallback; credit messaging is "自動 · 本趟全額"; single customer invoice. | Confirm no surcharge field/notice in fallback UI; credit copy present. | No surcharge UI; credit shown; no second-booking/second-invoice affordance. | §C3 L675; canvas L106 |
| **AC-7** | **Realm-token compliance** — ops surfaces use `@drts/ui-tokens` ops realm (or `buildCanvasTheme({surface:"ops"})`); no hardcoded hex palette substituted for realm tokens (no 套皮). | Diff color sources for the 3 new surfaces against ops realm tokens. | Accent/realm colors resolve from ops tokens; new surfaces add no raw-hex palette. | ui-tokens `colors.ts` L67 / `realms.ts` L17; parent brief UI Design Contract |
| **AC-8** | **Build & typecheck pass.** | Run `pnpm --filter ops-console-web typecheck` and `build` (scripts: `next typegen && tsc --noEmit`; `next build --webpack`). | Both green; lint `--max-warnings=0` clean. | `apps/ops-console-web/package.json` |

---

## 5. Reviewer Focus (R-areas)

- **R1 — messageCode provenance (AC-4).** The single highest-risk item. Confirm passenger text is keyed off the backend `messageCode`/category and the UI does **not** translate an internal reason into copy. A client-side `reason → string` map is a §5.6 violation even if the strings look safe.
- **R2 — passenger leak audit (AC-5).** Walk the passenger projection/types for any L231 hidden field reaching the passenger surface. Distinguish operator-visible (`觸發原因` on `OC_AvFallback`, allowed) from passenger-visible (must be hidden).
- **R3 — no-surcharge / single-invoice (AC-6).** Verify absence of a surcharge affordance and presence of full-fare credit copy; confirm no second booking/invoice path.
- **R4 — canvas fidelity, not reskin (AC-1/2/3 + AC-7).** Check enum sets, stage machine, and action gating match the canvas exactly, and that realm tokens (not Canvas/shadcn defaults) drive color. Watch for the `globals.css` sidebar hex (`#1d4ed8`) bleeding into ops surfaces instead of the ops realm accent.
- **R5 — same-booking context (AC-2).** Ensure reassignment/ETA correction renders on the original booking, no duplicate booking id.
- **R6 — dependency wiring (§2).** Confirm the FBK-001 feedback projection and the DP-C3-001 §C3 projection are actually consumed (typed client/hooks), not just available as contract exports.
- **R7 — build/typecheck evidence (AC-8).** Require the green typecheck/build output in the parent owner's handoff, since node_modules are workspace-symlinked and this packet cannot run it.

---

## 6. Sidecar Closeout Notes

- This is a **support-only** sidecar (`mutates_canonical: false`). Expected integration status at done: `not_applicable` (the only artifact is this packet; no canonical code change).
- The parent `P2-UI-OPS-001` stays `in_progress` on `Codex` / `Codex2`; this packet does not change parent state and the parent owner decides whether to absorb it.
- Handoff target: reviewer `Codex`.
