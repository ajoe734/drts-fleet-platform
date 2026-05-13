# Post-Tenant-Governance Follow-up Wave — Planning 2026-05-13

**Audience:** supervisor + planning team. Not yet a dispatch packet.
**Status:** planning input — items here are **not yet** in `ai-status.json` and need user / planning-team approval before becoming tasks.
**Origin:** identified during the 2026-05-13 inventory after the Tenant Governance Contract Wave (BE-CC-001 / RULE / QUOTA / APR / FU-BILLING + BE-INTEG-001 / LOAD + 4 verification sidecars) was fully scoped.
**Sources:**

- [Execution packet](./tenant-governance-wave-execution-packet-20260513.md) — current wave, in flight.
- [Design response](../05-ui/tenant-canonical-contract-gaps-design-response-20260513.md) — what shaped that wave.
- `phase1_service_framework_sa_v1_20260513.md` (SA §10–§14) — service frameworks beyond Tenant Governance.

---

## 0. Why this doc exists

The Tenant Governance Wave covers the four backend contracts (CC / RULE / QUOTA / APR) and their immediate verification (E2E test, load test, four production-evidence sidecars). Once that wave lands, several **cross-service** pieces still owe work to make the new contracts usable from Ops Console, Platform Admin, the tenant-side UI repo, and production observability.

These items are not blockers for the current wave, but they are the obvious next-wave scope. Capturing them here so they don't fall on the floor when the current wave closes.

Items are numbered E.13–E.19, continuing from the inventory enumeration that introduced them.

---

## E.13 — Ops Console approval queue UI

**Why:** BE-APR-001 ships approval workflow with manual `escalate` route designed for `tenant_admin`, but Ops also needs to see pending requests across all tenants and intervene when a tenant_admin is unreachable (timeout fallback escalates to tenant_admin first, but Ops is the second-line backstop).

**Scope sketch:**

- New route in Ops Console: `/ops/approval-requests` listing pending across all tenants, filterable by `tenantId` / `status` / `expiresAt < now + 4h`.
- Detail view shows full `TenantApprovalEvaluationResult` snapshot + matched rules + quota impacts for context.
- Action buttons: `view tenant audit`, `nudge approver` (no-op for P1; emits an audit event), `acknowledge SLA breach` (records that Ops saw it).
- Read-only — no Ops-side override of approve/reject in P1; only the resolved approvers + tenant_admin can decide.

**Suggested task ID:** `OPS-UI-APR-001`.
**Depends on:** `BE-APR-001` (done).
**Recommended owner:** Codex2 (Ops UI familiarity from earlier dispatch console work).

---

## E.14 — Platform Admin tenant governance monitoring

**Why:** Platform Admin needs cross-tenant visibility into governance health: how many tenants have set up cost centers, how many have approval rules, how many bookings are blocked at quota, p95 approval-decision latency.

**Scope sketch:**

- New tab in Platform Admin: `Tenant Governance` showing per-tenant rollup (count of cost centers, count of active rules, current-month quota usage %, pending approval count, oldest pending approval age).
- Detail view per tenant links to existing tenant-admin surfaces.
- Alert thresholds (planning-only — actual alerting hooks land in E.17): tenant with no approvers configured, tenant with quota over 95%, approval pending > 48h.

**Suggested task ID:** `ADM-UI-GOV-001`.
**Depends on:** `BE-CC-001` + `BE-RULE-001` + `BE-QUOTA-001` + `BE-APR-001` all done.
**Recommended owner:** Codex (Platform Admin familiarity).

---

## E.15 — Tenant Admin onboarding flow + documentation

**Why:** Once the four contracts land, a tenant_admin needs a clear path to bootstrap: create cost centers → set quota policies → write approval rules → invite approvers. Today this is implicit; the UI tasks (`TEN-UI-RD-013/014`) build the surfaces but no one writes the _flow_ doc.

**Scope sketch:**

- New `docs/02-tenant-onboarding/tenant-governance-onboarding-20260513.md` walking through the bootstrap steps with screenshots.
- Recommended seed payloads (3 cost centers, 1 monthly quota policy, 1 amount-based approval rule) for new tenants — `apps/api/seed/tenant-governance-default.ts` callable from dev fixtures and from a CLI for production tenants.
- Tenant-admin-facing in-app help links from each governance surface to the relevant section.

**Suggested task IDs:** `DOC-TEN-GOV-001` (the doc) + `BE-CC-001-FU-SEED` (the seed CLI).
**Depends on:** `BE-CC-001` done; UI tasks landing in parallel.
**Recommended owners:** docs → Claude; seed CLI → Gemini2 (small backend task).

---

## E.16 — API documentation update

**Why:** The wave introduces 17+ new REST endpoints across 4 surfaces (`/api/tenant/cost-centers`, `/approval-rules`, `/quotas`, `/approval-requests`) plus 21 new audit event names. Without API doc updates, downstream consumers (other teams, partner integrators, Lovable) have to read source.

**Scope sketch:**

- Update OpenAPI / Swagger spec under `docs/04-api/` (or wherever current spec lives) with all new endpoints + request/response schemas + error envelopes.
- Update Postman / Insomnia collection if maintained.
- Auto-generate snippet of the audit event taxonomy from `tenant-partner.service.ts` so it stays in sync.

**Suggested task ID:** `DOC-API-GOV-001`.
**Depends on:** all four backend contracts done (so endpoint signatures don't change after doc).
**Recommended owner:** Claude2 (docs work).

---

## E.17 — Production observability for tenant governance

**Why:** Once the wave is live, ops on-call needs Grafana boards + alerts for: quota near-exhaustion per tenant, approval pending count + p95 age, evaluator latency, ledger write throughput, race-failure rate (`QUOTA_INSUFFICIENT_AT_COMMIT` count), cost-center validation reject rate by error code.

**Scope sketch:**

- Define metrics naming: `tenant_governance.approval.pending_count`, `tenant_governance.quota.race_failure_total`, etc.
- Add metric emission in `tenant-partner.service.ts` (preferred: hook into existing audit emission pipeline so we don't double-instrument).
- New Grafana board JSON committed to `infra/grafana/dashboards/tenant-governance.json`.
- Alerts: quota over 95% (warn), pending approval > 24h (warn), pending > 48h (critical), evaluator p95 > 200ms (warn).

**Suggested task ID:** `OBS-GOV-001`.
**Depends on:** `BE-APR-001` done (otherwise alerts are on incomplete contract).
**Recommended owner:** Codex2 (infra/observability lane).

---

## E.18 — `tenant-commute-hub` SDK bump + UI integration (cross-repo)

**Why:** The wave's `@drts/api-client` ships in this repo (`drts-fleet-platform`). The Tenant Portal UI repo (`tenant-commute-hub`) needs to bump its SDK version + actually use the new methods to back the redesigned `TN_CostCenter` / `TN_Rules` / `TN_NewBooking` screens.

**Scope sketch:**

- `tenant-commute-hub`: bump `@drts/api-client` to the version that includes tenant cost-center / approval-rule / quota / approval-request methods.
- Wire each method to its corresponding screen.
- Add error-state handling for the three `BOOKING_COST_CENTER_*` codes + `QUOTA_INSUFFICIENT_AT_COMMIT` + `APPROVAL_NOT_AUTHORIZED` + `APPROVAL_NO_RESOLVABLE_APPROVERS`.
- This is a `tenant-commute-hub` repo task — needs to be scheduled there separately, but tracked here so we don't lose the cross-repo edge.

**Suggested task ID:** `TCH-SDK-BUMP-001` (tracked in `tenant-commute-hub` repo's own ai-status, not this one).
**Depends on:** all four backend contracts done + `@drts/api-client` released.
**Cross-repo:** yes — out of `drts-fleet-platform` scope; supervisor should hand off to `tenant-commute-hub` planning team via decision packet or `.ai-loop` API_GAP_REQUESTS.

---

## E.19 — Approval notification fan-out (P2 / parking)

**Why:** BE-APR-001 only emits audit events when an approval request is created. Approvers actually need to be **notified** (email / SMS / in-app push) so they know to act. Without this, the 24h timeout will fire on requests no one knew existed.

**Scope sketch:**

- Reuse existing `audit-notification` module's webhook dispatch + add an email channel (or hook into an existing notification service).
- On `booking.approval_request.created` audit event, fan out to each `resolvedApproverUserIds` member.
- Templates for: new request, approaching timeout (12h before), escalated, decided.
- User opt-out / digest mode.

**Suggested task ID:** `BE-APR-NOTIFY-001`.
**Depends on:** `BE-APR-001` done.
**Priority:** P2 — the wave can ship without this if a manual workaround (email Slack channel) is good enough for pilot tenants. **Decision needed:** is this P1 (must ship in same wave) or P2 (acceptable to defer past wave close)?
**Recommended owner if P1:** Codex.

---

## Suggested ordering (if all approved)

```
[current wave landing — BE-RULE / BE-QUOTA / BE-APR / FU-BILLING / INTEG / LOAD]
        │
        ├─→ E.13 OPS-UI-APR-001        (Ops Console approval queue)
        ├─→ E.14 ADM-UI-GOV-001        (Platform Admin governance dashboard)
        ├─→ E.15 DOC-TEN-GOV-001 + BE-CC-001-FU-SEED  (onboarding flow + seed)
        ├─→ E.16 DOC-API-GOV-001       (API doc update)
        ├─→ E.17 OBS-GOV-001           (production observability)
        ├─→ E.18 TCH-SDK-BUMP-001      (cross-repo, tenant-commute-hub side)
        └─→ E.19 BE-APR-NOTIFY-001     (P1 vs P2 — decision needed)
```

E.13–E.17 are all unblockable in parallel after the current wave closes. E.18 is a cross-repo handoff. E.19 is a P1/P2 priority call.

## Decisions the planning team needs to make

1. **Adopt this list?** Or trim items based on actual UAT priorities?
2. **E.18 cross-repo handoff mechanism**: open a decision packet in `tenant-commute-hub` repo? Send via `.ai-loop`? Direct task hand off?
3. **E.19 P1 vs P2**: ships with the wave (delays close-out by ~1 task) or accepted as gap until next wave?
4. **Owner pre-assignment**: should I pre-assign owners now per the [10:10:5:5:35:35:5 ratio](../../.claude/projects/-home-edna-workspace-drts-fleet-platform/memory/feedback_agent_workload_ratio.md), or wait until the current wave closes and supervisor balances at that point?

Once the planning team approves this packet (or a trimmed version), I will create the matching `ai-status.json` rows so workers can pick them up.
