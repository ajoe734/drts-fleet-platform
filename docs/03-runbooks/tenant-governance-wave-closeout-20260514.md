# Tenant Governance Wave — Close-out 2026-05-14

**Audience:** supervisor, planning team, downstream consumers (`tenant-commute-hub`, Ops, finance, regulatory).
**Status:** wave **substantially complete** as of 2026-05-14. Backend contracts, integration, observability, and onboarding are all `done`. Only two tenant UI screens remain in `review` (sub-day turnaround expected) and a single closeout packet is waiting on them.
**Predecessors:**

- [Decision packet 2026-05-13](../05-ui/tenant-canonical-contract-gaps-decision-packet-20260513.md)
- [Followup packet 2026-05-13](../05-ui/tenant-canonical-contract-gaps-followup-20260513.md)
- [Design response 2026-05-13](../05-ui/tenant-canonical-contract-gaps-design-response-20260513.md)
- [Execution packet 2026-05-13](./tenant-governance-wave-execution-packet-20260513.md)
- [Followup wave planning 2026-05-13](./post-tenant-governance-followup-wave-planning-20260513.md)

---

## 0. TL;DR

The wave that was opened by the 2026-05-13 design-team gap analysis is essentially closed within **24 hours of the execution packet shipping**:

- **27 of 27 wave tasks are tracked** (5 backend contracts + 2 backend tests + 4 verification sidecars + 9 followup tasks + 7 UI tasks + closeout packet).
- **24 of 27 are `done`**.
- **2 are in `review`** (TEN-UI-RD-010 New Booking, TEN-UI-RD-014 Rules — both submitted 2026-05-14 morning, awaiting Codex2 review).
- **1 is `backlog`** (TEN-UI-RD-099 wave closeout packet — blocked on the two reviews above completing).

All four SA §15 P0 backend gaps that motivated the wave are closed. All four SA §15 P0 verification gaps have shipped sidecar reports. The downstream cross-repo handoff to `tenant-commute-hub` has been delivered via `.ai-loop`.

This document is the wave's structured close-out: what got built, evidence anchors, what is genuinely still pending, and what the next wave (Phase 2) inherits.

---

## 1. SA §15 P0 gap closure map

| SA §15 P0 gap                                          | Closure mechanism                                                                                                                                 | Evidence (commit)                                    | Status                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------ |
| 成本中心主檔 contract 缺失                             | `BE-CC-001` Tenant Cost-Center Directory contract + `BE-CC-001-FU-BILLING` enrichment + `BE-CC-001-FU-SEED` defaults                              | `a7c1b9f` + `0c49f60` + `7ea5ef2`                    | ✅ closed                            |
| 審批規則 contract 缺失                                 | `BE-RULE-001` Tenant Approval Rules + pure all-match-apply evaluator                                                                              | `c0f533c`                                            | ✅ closed                            |
| Quota / usage read-model 缺失                          | `BE-QUOTA-001` Tenant Quota policy + ledger + monthly snapshots + atomic reservation                                                              | `7c0b1ce` + `73b53ee` (migration + DB-path coverage) | ✅ closed                            |
| Approval workflow 缺失                                 | `BE-APR-001` Tenant Booking Approval Workflow (note: `ordered_chain` mode P1-downgraded to `all_of_parallel` per execution packet §4.4 allowance) | `7b361fa` (review-approved at `78730a7`)             | ✅ closed (with documented P1 limit) |
| Driver 多平台工作台未完全實證                          | `DRV-VERIF-001` verification report sidecar                                                                                                       | `support/sidecars/DRV-VERIF-001/`                    | ✅ closed                            |
| Forwarder 真實平台整合證據不足                         | `FWD-VERIF-001` verification report sidecar                                                                                                       | `support/sidecars/FWD-VERIF-001/`                    | ✅ closed                            |
| Partner eligibility → billing/reporting 完整鏈路待驗證 | `PRT-VERIF-001` verification report sidecar                                                                                                       | `support/sidecars/PRT-VERIF-001/`                    | ✅ closed                            |
| CTI / recording / filing 外部實證待完整                | `EVD-VERIF-001` verification report sidecar                                                                                                       | `646ff01`                                            | ✅ closed                            |
| Supabase legacy artifact 仍可能誤導前端                | (already closed pre-wave by `G-1` + `FBP-006`)                                                                                                    | —                                                    | ✅ closed earlier                    |
| 自駕櫥窗 / 自駕可用性條件 future capability            | **deliberately deferred** to Phase 2 per design response §1                                                                                       | n/a                                                  | 📋 deferred                          |

**Net outcome:** every P0 entry SA §15 listed is either closed by this wave or was already closed beforehand. No P0 SA gap remains open at the end of this wave.

---

## 2. What landed (per task)

### 2.1 Core contracts — `done`

| Task                              | Commit                                | Surface                                                                                                                                                                                                 |
| --------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BE-CC-001` Cost-Center Directory | `a7c1b9f`                             | record + 4 commands + 4 REST routes + audit + booking validation grandfather logic                                                                                                                      |
| `BE-CC-001-FU-BILLING` Enrichment | `0c49f60`                             | coverage report endpoint + billing/reporting cost-center enrichment + `booking.cost_center.assigned` audit + validation metadata persistence + 3 error codes documented in canonical API error contract |
| `BE-CC-001-FU-SEED` Default seed  | `7ea5ef2`                             | `seedTenantGovernance()` + CLI `pnpm seed:tenant-governance --profile=smb\|midmarket\|enterprise`                                                                                                       |
| `BE-RULE-001` Approval Rules      | `c0f533c`                             | rule record + 5 commands + 7 REST routes + pure evaluator + 21-case test matrix + audit                                                                                                                 |
| `BE-QUOTA-001` Quota / Usage      | `7c0b1ce` (+ `73b53ee` migration fix) | policy + ledger + monthly snapshots + atomic `reserveTenantQuota` + 5 REST routes + 9-case test matrix + audit                                                                                          |
| `BE-APR-001` Approval Workflow    | `7b361fa`                             | request + decision records + 5 REST routes + state machine + approver resolution + manual escalate + audit (`ordered_chain` runs as `all_of_parallel` in P1)                                            |

### 2.2 Cross-task verification — `done`

| Task                                       | Commit    | Coverage                                                                                                                           |
| ------------------------------------------ | --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `BE-INTEG-001` E2E integration             | `a04fbd3` | end-to-end booking → governance → dispatch → completion → billing → audit fired correctly across all 21 events                     |
| `BE-LOAD-001` Quota concurrent reservation | `7732331` | 10-concurrent reserve against last-unit quota; one wins, nine `QUOTA_INSUFFICIENT_AT_COMMIT`; ledger clean; cross-tenant isolation |

### 2.3 SA §15 verification sidecars — `done`

All four sidecars produced support-only evidence reports under `support/sidecars/<TASK>/`:

- `DRV-VERIF-001` — driver multi-platform mirror + accept + status sync + earnings mirror traced end-to-end against existing fixtures + integration tests.
- `FWD-VERIF-001` — forwarder real-platform integration evidence (sandbox).
- `PRT-VERIF-001` — partner eligibility → booking → trip → billing → reporting full-chain trace with benefit_reference / issuer_authorization_ref / partner_program_code propagation verified.
- `EVD-VERIF-001` — CTI call → recording attach → complaint case → filing packet flow with retention metadata + legal hold + filing format verified.

### 2.4 Followup wave (E.13–E.19) — all `done`

| Task                                                  | Commit                      | What shipped                                                                                                                      |
| ----------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `OPS-UI-APR-001` Ops approval queue                   | `77fdf1f`                   | cross-tenant pending-request queue + acknowledge SLA breach + nudge action                                                        |
| `ADM-UI-GOV-001` Platform Admin governance            | `76829a4`                   | per-tenant governance rollup dashboard                                                                                            |
| `DOC-TEN-GOV-001` Tenant onboarding                   | `bd2a5d4`                   | tenant_admin bootstrap walk-through + decision tree for approval modes                                                            |
| `DOC-API-GOV-001` API documentation                   | `373225b`                   | OpenAPI spec + audit event taxonomy                                                                                               |
| `OBS-GOV-001` Production observability                | `a050209`                   | metric emission + Grafana board + 5 alert rules                                                                                   |
| `BE-APR-NOTIFY-001` Approval notification fanout (P1) | `9f32060`                   | email channel + new_request / approaching_timeout / escalated / decided templates + per-user opt-out                              |
| `TCH-SDK-BUMP-001` Cross-repo handoff                 | (cross-repo via `.ai-loop`) | `tenant-commute-hub/.ai-loop` carries Iteration 1 frontend spec + backend delivery note + contract lock pinned at contract commit |
| `POST-TG-PLANNING-REVIEW` Planning sidecar review     | (no-commit)                 | confirmed planning doc scope and dependencies are correct                                                                         |

### 2.5 UI integration — partial

| Task                          | Status                    | Note                                                                                                                  |
| ----------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `TEN-UI-RD-013` TN_CostCenter | `done` (`921c456`)        | first UI to unblock; CRUD surface ships with full directory management                                                |
| `TEN-UI-RD-010` TN_NewBooking | `review` (Codex → Codex2) | submitted 2026-05-14 03:34Z; quotedFare regression fixed, validation + parity story in place                          |
| `TEN-UI-RD-014` TN_Rules      | `review` (Codex → Codex2) | submitted 2026-05-14 03:21Z; full /rules surface incl. dry-run evaluate, quota policy editing, pending approval queue |

### 2.6 Concurrent unrelated UI redesign tasks — `done`

These three landed during the same window even though they were not part of the tenant-governance scope, so the supervisor closed them while the agents were warm:

- `ADM-UI-RD-005` Partners list + detail (`a7b47f5`)
- `ADM-UI-RD-006` Users + Fleet + Switchboard (`f481c29`)
- `ADM-UI-RD-010` Wave 3 platform-admin closeout (`25daea0`)

---

## 3. What is genuinely still pending

Only one item is **genuinely** outstanding — everything else is in human-review pipeline:

### 3.1 `TEN-UI-RD-099` — Wave 3 tenant closeout packet (`backlog`)

- **Owner:** Claude
- **Reviewer:** Copilot
- **Blocked by:** `TEN-UI-RD-010` + `TEN-UI-RD-014` reaching `done` (currently in review).
- **What it needs to be:** parity-decision update + canvas-vs-shipped diff record for TN_NewBooking + TN_Rules + TN_CostCenter (mirrors how `ADM-UI-RD-010` closed Platform Admin's Wave 3).
- **Expected unblock:** within hours (both UI reviews are in flight today).

### 3.2 Two UI reviews in flight

- `TEN-UI-RD-010` — review with Codex2.
- `TEN-UI-RD-014` — review with Codex2.

These are not "missing work" — they are queued reviews on shipped implementations. No action required from the supervisor; they will move to `done` on review approval.

---

## 4. Documented P1 limits to revisit in Phase 2

These were intentionally accepted as P1 limits during the wave (per execution packet §4.4 / §9 parking lot):

1. **`ordered_chain` approval mode** — contract accepts the value but backend executes as `all_of_parallel`. Genuine sequential ordering deferred until UAT confirms it is needed.
2. **Automated approval timeout** — manual escalate ships now; the cron entry exists as a 501-stub. Auto-escalation cron is deferred.
3. **`parentCostCenterCode` hierarchy** — flat-only ships. Hierarchy / inheritance deferred.
4. **Quarterly / yearly quota periods** — monthly only ships.
5. **Time-of-day / weekend / holiday rule conditions** — not in P1 condition whitelist.
6. **Auto-resolving `cost_center_owner` chain** — single-hop fallback only; longer chains deferred.
7. **CSV bulk upload** for cost centers / quota policies — not in P1.

If Phase 2 wants any of these, open a fresh decision packet against this list.

---

## 5. Cross-repo state

`tenant-commute-hub` is the consumer of the `@drts/api-client` methods this wave shipped. As of `TCH-SDK-BUMP-001` close-out:

- Frontend spec, backend delivery note, and contract lock have been delivered to `tenant-commute-hub/.ai-loop`.
- That repo's planning team is responsible for actually wiring the new methods to its UI code, version-bumping `@drts/api-client`, and handling the 5 new error codes per design response §I (semantic preservation required).
- This repo's supervisor should treat any further `tenant-commute-hub`-side work as out-of-scope for the close-out — it is tracked in that repo's own `ai-status.json`.

---

## 6. Audit / observability state

The 21 new audit events (execution packet §5) are emitting from `tenant-partner.service.ts` and `owned-mobility.service.ts`. The `OBS-GOV-001` Grafana dashboard renders metrics derived from the audit emission pipeline (no double-instrument). Active alert rules:

- Tenant quota usage > 95% → warn
- Pending approval > 24h → warn
- Pending approval > 48h → critical
- Evaluator p95 > 200ms → warn
- Quota race failures > 10/min → warn

On-call runbook entry exists per `OBS-GOV-001` acceptance.

---

## 7. Velocity observations (informational)

The wave moved unusually fast — execution packet shipped 2026-05-13 ~07:30Z; by 2026-05-14 ~04:00Z (less than 24 hours later) all 4 backend contracts + verification sidecars + followup wave + integration test + load test had landed. Some observations:

- Codex sub-lanes (Codex / Codex2) carried the bulk of the wave despite the supervisor's auto-claim repeatedly re-shuffling explicit owner assignments. The intended 35:35:10:10:5:5:5 ratio drifted heavily toward Codex2 owning 4+ tasks at peak. Captured in [`feedback_supervisor_ignores_explicit_owner.md`](../../.claude/projects/-home-edna-workspace-drts-fleet-platform/memory/feedback_supervisor_ignores_explicit_owner.md). No outage; just a load-distribution observation worth folding into the next supervisor sweep.
- Two orchestrator improvements landed inline: claude-worker `CLAUDE_CONFIG_DIR` isolation (`8c91435`) closed the IDE-sidebar pollution issue from `feedback_claude_worker_isolation.md`, and the complaint-SLA reopen test flake (`d66dce5`) was fixed.
- The `ordered_chain` P1 downgrade was the only spec deviation; it was explicitly allowed by execution packet §4.4 and is documented in §4 above for Phase 2 revisit.

---

## 8. What this wave does not cover (handoff to Phase 2)

The following remain genuine forward work — not gaps in this wave, but the next wave's scope:

1. **Phase 2 capabilities surfaced in P1 limits** (§4 above): `ordered_chain` real ordering, auto-timeout cron, hierarchy, longer time-period quota, time-of-day rules, multi-hop owner fallback, CSV bulk upload.
2. **Tenant-commute-hub UI integration completion** (cross-repo): see §5.
3. **Production rollout sequencing**: pilot tenant selection, migration script for existing free-text `costCenter` values per tenant, ramp plan.
4. **Passenger app / consumer-facing surfaces**: deliberately out of Phase 1 per SA §3.1.
5. **Self-driving showcase / availability conditions**: deliberately deferred per design response §1.
6. **Tenant-commute-hub retirement**: SA §3.3 says do not retire the consumer repo in Phase 1; Phase 2 should plan the deprecation if applicable.

A Phase 2 SD/SA cycle should drive the above. This close-out does not pre-decide the order.

---

## 9. Acceptance bar for declaring the wave officially `done`

The wave is officially `done` when all three are true:

1. `TEN-UI-RD-010` reaches `done` (currently `review`).
2. `TEN-UI-RD-014` reaches `done` (currently `review`).
3. `TEN-UI-RD-099` is implemented and reaches `done` (currently `backlog`, depends on the two above).

No additional backend work or design pass is required to reach this bar.

Estimated time to wave-officially-done: **same calendar day** if both UI reviews pass on the first round.

---

## 10. Suggested supervisor next actions

1. **Watch the 2 UI reviews** — escalate to a different reviewer if either stalls past 24h.
2. **When both UI reviews pass**, dispatch `TEN-UI-RD-099` to Claude (its current owner) with planning_ref pointing at this close-out doc + the parity decisions doc.
3. **Once `TEN-UI-RD-099` lands**, archive the wave and start the Phase 2 SD/SA cycle.
4. **Do not** pre-open Phase 2 task entries — Phase 2 needs design-team scoping first, not just supervisor speculation.
