# Review Packet — P2-DP-C4-001-BILLING-RECONCILE

> Sidecar support artifact (`P2-DP-C4-001-BILLING-RECONCILE-SIDECAR-REVIEW`).
> Helper kind: `review_packet`. Owner: Claude. Reviewer: Codex2.
> Prepared 2026-06-27. **No canonical truth modified** — this is a read-only
> evidence summary to accelerate the parent's review by Codex.

## 1. Parent task under review

| Field | Value |
| --- | --- |
| Task ID | `P2-DP-C4-001-BILLING-RECONCILE` |
| Title | Reland sandbox billing treatment on top of restored gate (DP-C4 billing tail) |
| Owner | Codex2 |
| Reviewer | Codex |
| Status at packet time | `review` |
| Branch | `codex2/p2-dp-c4-001-billing-reconcile` |
| Head commit | `5fd7e5424` — "P2-DP-C4-001: reland sandbox billing treatment" |
| Base | `24435d436` (= `#977` "reconcile restored full dispatch gate", already merged to `dev`) |
| Integration status | `branch_pushed` — **no PR open yet** (`gh pr list --head codex2/p2-dp-c4-001-billing-reconcile` → `[]`) |

### Why this task exists

`#977` restored the full sandbox dispatch gate into `dev` but deliberately
dropped the DP-C4 **billing** tail to avoid re-colliding with the gate. This
task relands *only* the billing delta cleanly on top of the restored gate. The
original entangled implementation lived on `codex2/p2-dp-c4-001-history-repair`
(PR #951, vs-dev diff ~1325 lines mixing gate + billing). This branch is the
clean billing-only extraction.

## 2. Change shape (clean delta verification)

`git diff 24435d436 5fd7e5424 --stat`:

```
 .../billing-settlement.repository.ts        | 310 +++++++++++++++++++++
 .../billing-settlement.service.ts           | 152 +++++++++-
 .../owned-mobility/owned-mobility-events.ts  |  10 +-
 .../owned-mobility/owned-mobility.service.ts | 153 ++++++++++
 .../tests/unit/billing-settlement.service.test.ts | 112 ++++++++
 5 files changed, 734 insertions(+), 3 deletions(-)
```

**Single commit, 5 files, +734/-3.** Confirms the DoD constraint
"no gate file changes (gate already restored via #977)":

- ✅ No file under `sandbox-dispatch-gate/`, no `*restriction*`/`*gate*` file touched.
- ✅ Base is exactly the merged `#977` commit (`git merge-base origin/dev <branch>` = `24435d436`), so there is **zero gate drift** — the branch is 1 commit ahead of `dev`, 0 behind.

## 3. What the change does (per acceptance line)

Acceptance: *"sandboxBillingTreatment present on dev owned-mobility; billing-settlement sandbox treatment + tests green; no gate file changes; all required checks green; merged to dev."*

### 3a. `owned-mobility` emits sandbox segments + billing treatment ✅
- `owned-mobility-events.ts`: `OwnedMobilityTripCompletedEvent` gains
  `bookingId`, optional `sandboxFulfillmentSegments[]`, optional
  `sandboxBillingTreatment`.
- `owned-mobility.service.ts`: on trip-completed, builds segments
  (`buildSandboxFulfillmentSegments`) and a billing treatment
  (`buildSandboxBillingTreatment`), attaching them to the event only when
  non-empty. AV detection via `isSandboxAvVehicle` (`veh-av` prefix).
- Treatment classification:
  - `normal_av` when the completing vehicle is AV and no human fallback occurred.
  - `fallback_human` when `complianceFlags` includes `sandbox_human_fallback`
    **or** the completing task is human but a prior AV segment exists.
  - `fallbackCostAbsorber` defaults to `"platform"` on fallback — matches the
    S3 fallback-cost policy default (`P2-DP-S3-001`, merged `#959`). Per-partner/
    tenant policy resolution is left as `fallbackPolicyId: null` (default path).

### 3b. `billing-settlement` persists + surfaces sandbox ledger ✅
- `billing-settlement.service.ts`: `handleOwnedMobilityTripCompleted` merges
  incoming segments/treatments (idempotent merge keyed by ID) and calls
  `persistChanges(..., "owned_mobility_trip_completed_sandbox_ledger")`.
  Adds `listFulfillmentSegments(orderId?)` and
  `listSandboxBillingTreatments(orderId?)` read accessors. On `onModuleInit`,
  hydrates both new collections from persisted state.
- **Driver-statement suppression**: live settlement now sets
  `eligibleForDriverStatement = false` when the latest treatment for the order
  is `normal_av`. `eligibleForTenantInvoice` stays `true`. This realises the
  product rule: *normal AV trips stay invoiceable to the tenant but are excluded
  from driver statements* (no human driver to pay).
- `billing-settlement.repository.ts`: adds row types, `loadState` SELECTs from
  `av_sandbox.fulfillment_segments` + `av_sandbox.sandbox_billing_treatments`,
  `persistChanges` UPSERTs into them, plus row→record mappers.

### 3c. Tests ✅
- New unit test: *"keeps sandbox AV revenue on one invoice while suppressing AV
  driver settlement"* — emits a `normal_av` trip, asserts the order appears on
  the tenant invoice, asserts `listSandboxBillingTreatments` returns the
  `normal_av` treatment, then asserts `generateDriverStatements` rejects with
  `VALIDATION_ERROR` (no driver-eligible lines). Directly covers the 3b rule.

## 4. Fresh verification evidence (re-run by this packet, not just owner-claimed)

Run on the parent worktree at `5fd7e5424`:

| Check | Command | Result |
| --- | --- | --- |
| Contracts build | `pnpm --filter @drts/contracts build` | ✅ PASS |
| API typecheck | `pnpm --filter @drts/api typecheck` | ✅ PASS (exit 0) |
| API unit suite | `pnpm --filter api test -- billing-settlement.service.test.ts` (filter ran full suite) | ✅ **740 passed / 740**, 107 files, 12.66s |

Contract types `FulfillmentSegmentRecord` (`phase2-tesla-fsd-sandbox.ts:522`)
and `SandboxBillingTreatmentRecord` (`:561`) are already defined on `dev`, so
the branch does **not** need a contracts change — consistent with the empty
contracts diff.

## 5. ⚠️ Reviewer attention — missing migration (primary finding)

The repository's **DB-enabled** path reads from and writes to two tables:

- `av_sandbox.fulfillment_segments`
- `av_sandbox.sandbox_billing_treatments`

**Neither table is created by any migration on `dev` or on this branch.**
Scanned all `infra/migrations/V00*.sql`; the `av_sandbox` schema migrations
(V0037/V0038/V0044) create `provider_capability_requirements`,
`command_receipts`, `sandbox_dispatch_decisions`, `approved_operating_areas`,
`vehicle_enrollments`, `*_versions`, etc. — but **not** these two ledger tables.
The branch diff adds no `infra/migrations/*` file.

**Impact assessment:**
- Unit tests pass because `BillingSettlementRepository` guards every DB call
  with `isEnabled()` (`databaseService?.isEnabled() ?? false`). In the in-memory
  test/runtime profile `loadState` returns empty collections and
  `persistChanges` is a no-op, so the missing relations are never hit.
- Against a **real Postgres** (`isEnabled() === true`), both
  `loadState` (`SELECT * FROM av_sandbox.fulfillment_segments …`) and
  `persistChanges` (`INSERT INTO av_sandbox.sandbox_billing_treatments …`) would
  fail with `relation "av_sandbox.fulfillment_segments" does not exist`.

**This is "tests green but DDL absent."** Before this can satisfy "merged to dev"
*and* be safe in any DB-backed environment, a migration creating both tables
(matching the row shapes in `billing-settlement.repository.ts`: see
`FulfillmentSegmentRow` / `SandboxBillingTreatmentRow`) is required — either in
this branch or as a tracked follow-up that lands before DB-enabled deploy.

Recommended reviewer action: confirm with the owner whether (a) the migration
is intentionally a separate task, or (b) it should be added to this branch. If
(a), it must be recorded as official backlog in `ai-status.json` (per
`AI_COLLABORATION_GUIDE.md` §0.5) so it is not lost.

## 6. Secondary observations (non-blocking)

- `buildSandboxBillingTreatment` uses `new Date().toISOString()` as a fallback
  `createdAt` only when `completedTask.completedAt` is null. Deterministic in
  practice (completed tasks carry `completedAt`); noted for test stability.
- `mergeFulfillmentSegments` / `mergeSandboxBillingTreatments` are last-writer-
  wins keyed by record ID — idempotent re-emit is safe.
- `eligibleForDriverStatement` keys off the *latest* treatment per order
  (`findSandboxBillingTreatmentForOrder` sorts desc by `createdAt`). For a
  fallback-then-AV ordering this resolves to the newest record; verify this
  matches intended semantics if a single order can carry multiple treatments.
  (Current emit path produces one treatment per order, so low risk.)
- `treatment_snapshot` is persisted with `fallbackSurchargeApplied` folded into
  the JSON blob and re-extracted on read — round-trips consistently in the
  repository mappers.

## 7. Reviewer handoff checklist

- [ ] §2 clean-delta / no-gate-file claim — verified here, re-confirm if desired.
- [ ] §3b driver-statement suppression rule matches product intent (normal_av =
      invoiceable, not driver-payable).
- [ ] §4 fresh green checks — reproduce if policy requires reviewer-run evidence.
- [ ] **§5 missing migration** — decide block vs. follow-up; if follow-up, ensure
      it is recorded in `ai-status.json`.
- [ ] §3a `fallbackCostAbsorber = "platform"` default aligns with S3 (`#959`)
      decision; per-partner/tenant override is left as `null` policy id.
- [ ] Integration: branch has **no PR yet** — owner must open PR + drive CI to
      green before "merged to dev" acceptance line is satisfiable.

---
*Evidence basis: `git diff 24435d436 5fd7e5424`, migration scan over
`infra/migrations/`, contract-type grep on `origin/dev`, and fresh
build/typecheck/test runs on the `5fd7e5424` worktree. Generated as sidecar
support; the parent owner decides absorption.*
