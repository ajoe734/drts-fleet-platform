# E2E-FLEET-014 — Acceptance Packet & Dependency Map (Sidecar)

> **Sidecar support artifact.** This is parallel support material for parent task
> **E2E-FLEET-014** (`E2E-014 fleet-partner-revenue-share`). It does **not** modify
> canonical truth (`ai-status.json`, contracts, runtime, the E2E script, or the SD).
> It assembles the acceptance checklist, dependency map, and current-state evidence so
> the parent owner (`Codex2`) and reviewer (`Codex`) can finalize quickly once the
> environment blocker clears.
>
> - **Sidecar task:** `E2E-FLEET-014-SIDECAR-ACCEPTANCE` (owner `Claude`, reviewer `Codex2`)
> - **Parent:** `E2E-FLEET-014` (owner `Codex2`, reviewer `Codex`, status `blocked`, `waiting_for: Gemini`)
> - **Helper kind:** `acceptance_packet` · `mutates_canonical: false`
> - **Compiled:** 2026-06-05 · base branch `claude/e2e-fleet-014-sidecar-acceptance` ← `dev`

---

## 1. Scope under test

Parent E2E-FLEET-014 builds the workflow gate **`WF-FLEET-001` →
`tests/e2e/E2E-014-fleet-partner-revenue-share.sh`** per SD §9, exercising the fleet
partner revenue-share flow end to end:

> `create fleet partner → affiliate driver → create revenue share rule → driver
> completes trip → driver earnings calculated → fleet partner share calculated →
> fleet partner statement generated` — SD §9 *E2E-014 Fleet Partner Revenue Share*

**Authoritative sources (cite, do not average — AI_COLLABORATION_GUIDE §2):**

| Source | Section | What it pins |
|---|---|---|
| `docs/02-architecture/phase1_final_sd_for_dev_team_20260604.md` | §6.1 | Fleet partner / affiliation / revenue-share-rule models |
| same | §6.2 | Platform Admin + Fleet Portal APIs |
| same | §6.3 | Statement calculation chain |
| same | §9 | Required E2E-014 flow + `WF-FLEET-001` mapping |
| same | §11 | Phase 1 acceptance criteria #7, #8, #9, #12 |
| Task brief | Acceptance | `E2E-014 passes at least in staging` |

---

## 2. Acceptance checklist

### 2.1 Task-level acceptance (parent E2E-FLEET-014)

- [ ] **A1.** `tests/e2e/E2E-014-fleet-partner-revenue-share.sh` exists and is the WF-FLEET-001 gate.
      *Evidence:* present on branch `codex2/e2e-fleet-014` @ `685f49d6` (513 lines); **not yet merged to `dev`**.
- [ ] **A2.** E2E-014 **passes at least in staging** (task's sole declared acceptance bar).
      *Status:* **blocked by environment** — see §4. Cannot be satisfied from the worker today.

### 2.2 SD §11 Phase-1 criteria covered by this E2E

- [ ] **C7.** Fleet partner can be linked to drivers (SD §11.7) → LEG 1.2 affiliation.
- [ ] **C8.** Fleet partner revenue share is calculated (SD §11.8) → LEG 5 non-empty share.
- [ ] **C9.** Fleet partner statement is generated (SD §11.9) → LEG 4/5 statement lines.
- [ ] **C12.** E2E-012 / E2E-013 / **E2E-014 pass at least in staging** (SD §11.12) → blocked, §4.

### 2.3 Flow legs (mapped to the actual script @ `685f49d6`)

| Leg | Script step | SD §9 flow step | Asserts |
|---|---|---|---|
| LEG 0 | Probe platform fleet APIs | (pre-flight) | endpoints reachable / graceful skip |
| LEG 1.1 | `POST /admin/fleet-partners` | create fleet partner | 200\|201, `fleetPartnerId` captured |
| LEG 1.2 | `POST /admin/drivers/:driverId/fleet-affiliations` | affiliate driver | 200\|201, `affiliationId` captured |
| LEG 1.3 | `POST /admin/fleet-partners/:id/revenue-share-rules` | create revenue share rule | 200\|201, `revenueRuleId` captured |
| LEG 2.1–2.5 | tenant booking → dispatch → assign | (set up the trip) | booking, candidates, assignment |
| LEG 3 | driver task lifecycle actions | driver completes trip | task reaches completed |
| LEG 4.1–4.3 | fee-plan publish → driver-statements generate/read | driver earnings calculated | driver statement line includes `orderId` |
| LEG 5.1 | `GET /admin/fleet-partners/:id/statements` | fleet share + statement generated | fleet statement surfaces affiliated `orderId` + **non-empty share minor** |

### 2.4 Sidecar (this task) acceptance

- [x] Create support artifacts only (this file under `support/sidecars/E2E-FLEET-014/`).
- [x] Do not edit canonical truth (no change to `ai-status.json`, SD, contracts, or the E2E script).
- [ ] Hand off the packet to the assigned reviewer (`Codex2`) — performed at closeout.

---

## 3. Dependency map

```
P1NEW-WP0 (workspace baseline)
   └─ BE-FLEET-001  FleetPartner model ............................. integrated on dev
        └─ BE-FLEET-002  DriverFleetAffiliation + revenue-share .... DONE (branch_pushed)
             ├─ BE-FLEET-003  FleetPartnerRevenueShareRule ......... integrated on dev
             ├─ BE-FLEET-004  FleetPartnerStatement ................ integrated on dev
             └─ billing-settlement seam (driver earning reuse) ..... present on dev
                  └─ E2E-FLEET-014  (this gate) .................... BLOCKED (staging auth; waiting_for Gemini)
```

| Dependency | Declared in | Status | Integration evidence |
|---|---|---|---|
| `BE-FLEET-002` | task `depends_on` | **done** | closeout `2cefd9ab` on `origin/codex/be-fleet-002`; `integration_status: branch_pushed`. Functionality **also present on `dev`** via integration wave `P1NEW-INTEGRATION-20260605` @ `63d2ba58` (fleet-partner module + billing-settlement deltas). |
| Fleet-partner backend (svc/ctrl/repo) | SD §6.1–6.3 | on `dev` | `apps/api/src/modules/fleet-partner/` resolvable on `origin/dev` (revenue-share rules, affiliations, statements). |
| billing-settlement seam | SD §6.3 | on `dev` | `apps/api/src/modules/billing-settlement/` incl. `settlement-matrix.ts`; driver earning reused, not recomputed. |
| E2E-014 script | task artifact | **on branch, not on dev** | `tests/e2e/E2E-014-fleet-partner-revenue-share.sh` @ `685f49d6` on `origin/codex2/e2e-fleet-014`; **absent from `origin/dev`**. |

**Dependency readiness verdict:** all *code* dependencies for E2E-014 are satisfied —
the fleet-partner backend and billing-settlement seam are on `dev`, and BE-FLEET-002 is
`done`. The only unmet items are (a) merging the E2E script branch to `dev` and (b) a
working staging deploy/auth path so the gate can actually execute (§4).

---

## 4. Blocker — staging auth (acceptance bar A2 / C12)

The sole acceptance bar `E2E-014 passes at least in staging` is **environment-blocked**,
not implementation-blocked:

- Staging **Deploy** GitHub-Actions WIF provider returns `invalid_target` → no GCP /
  IAP auth → the E2E run cannot reach a deployed staging API. "Passes in staging" is
  therefore **unsatisfiable from the worker lane** until staging auth is repaired.
- Unblock helper **`E2E-FLEET-014-UNBLOCK-HISTORY-REPAIR`** is **done** (`e03885cf`,
  `origin/codex2/e2e-fleet-014-unblock-history-repair`) and recorded the
  **non-destructive resume path**: return the parent to `todo` for rerun *once staging
  auth is repaired*. The parent is **not** at that resume point yet — machine truth
  (`scripts/ai-status.sh show E2E-FLEET-014`, last_update `2026-06-05T09:23:31Z`)
  currently reports parent `status: blocked`, `waiting_for: Gemini` on the staging
  Deploy WIF gap, so the `todo` rerun state is reached only after §4 step 1 lands.

**Resume path (for parent owner `Codex2`):**
1. Repair staging Deploy WIF provider (`invalid_target`) so GCP/IAP auth succeeds — infra/CI lane (`Gemini`/`Gemini2`).
2. Merge `codex2/e2e-fleet-014` (@`685f49d6`) into `dev` so the gate ships with the wave.
3. Re-run `WF-FLEET-001` against staging; capture pass evidence.
4. Record finalize with `INTEGRATION_STATUS` ≥ `merged_to_dev`; only claim `dev_deployed` with a real staging-pass artifact.

---

## 5. Honest status & handoff

- **Code-readiness:** GREEN — dependencies done/integrated; script written and hardened.
- **Acceptance-readiness:** BLOCKED — staging auth gap (§4); not a worker-resolvable defect.
- **This sidecar:** support packet complete; no canonical truth touched; handed to reviewer `Codex2`.

> Integration note (branch-strategy §11): this sidecar's deliverable is a support
> document only. `done` on the sidecar ≠ E2E-014 acceptance. The parent gate is
> currently `blocked` (`waiting_for: Gemini`) on the staging Deploy WIF gap and reaches
> green only via the §4 resume path under the parent owner (repair staging auth → the
> recorded `todo` rerun state → staging pass).
