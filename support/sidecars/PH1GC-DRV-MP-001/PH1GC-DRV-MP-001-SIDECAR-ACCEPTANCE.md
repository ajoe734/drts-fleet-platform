# PH1GC-DRV-MP-001 — Sidecar Acceptance Packet

**Sidecar task**: `PH1GC-DRV-MP-001-SIDECAR-ACCEPTANCE`
**Parent task**: `PH1GC-DRV-MP-001` — Phase 1 gap closure — harden E2E-006 driver multi-platform seed/gate
**Helper kind**: `acceptance_packet`
**Parent owner / reviewer**: `Codex` / `Codex2`
**Sidecar owner / reviewer**: `Claude` / `Codex`
**Date prepared**: 2026-05-22
**Scope statement**: Support-only material. Does **not** mutate canonical truth (no edit to `tests/e2e/E2E-006-driver-multi-platform.sh`, the matrix, or any spec). Parent owner may absorb pieces of this packet into the implementation closeout.
**Authority cross-refs**:

- Directive `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md` §C `DRV-MP-001` (seed/gate hardening), §6 (QA), §7 (closeout format), §9 (anti-patterns), §10 (delivery checklist).
- Status truth `docs/00-context/phase1-origin-dev-gap-closure-status-truth-20260522.md` §2.3 (E2E row), §5 (definition of done).
- Parent brief `.orchestrator/task-briefs/PH1GC-DRV-MP-001.md` (machine-readable acceptance).

---

## 1. Acceptance checklist (machine-checkable)

The parent task is `done`-eligible only when **every** row below resolves to `PASS` against `origin/dev` after the parent owner pushes their commit. The sidecar reviewer can lift this checklist directly into the parent closeout report.

| #   | Acceptance requirement                                                                                                                    | Verification command / oracle                                                                                                                                                                                                                                                                                          | PASS criterion                                                                                                                                  | Source                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 1   | `tests/e2e/E2E-006-driver-multi-platform.sh` is present on `origin/dev` after the parent commit lands.                                    | `git fetch origin && git ls-tree -r origin/dev -- tests/e2e/E2E-006-driver-multi-platform.sh`                                                                                                                                                                                                                          | Single tree entry returned for the path.                                                                                                        | Parent brief §Acceptance row 1; status truth §5 |
| 2   | Default invocation (no `E2E_ALLOW_MISSING_FORWARDER_SEED`, no mixed seed) **hard fails** with non-zero exit.                              | `unset E2E_ALLOW_MISSING_FORWARDER_SEED; bash tests/e2e/E2E-006-driver-multi-platform.sh; echo "exit=$?"`                                                                                                                                                                                                              | Script exits non-zero (`exit≠0`) **and** the final log includes an explicit `log_fail` line naming the missing owned-vs-forwarded seed.         | Directive §C; parent brief row 2                |
| 3   | `E2E_ALLOW_MISSING_FORWARDER_SEED=true` is the **only** way to convert the missing-seed condition into a warning-only exit 0.             | `E2E_ALLOW_MISSING_FORWARDER_SEED=true bash tests/e2e/E2E-006-driver-multi-platform.sh; echo "exit=$?"` and `grep -n "exit 0" tests/e2e/E2E-006-driver-multi-platform.sh`                                                                                                                                              | Exit 0 with a `log_warn` on missing seed; no other code path in the script reaches `exit 0` when the seed gate fails.                           | Directive §C; parent brief row 3                |
| 4   | When the deterministic seed is supplied (one owned + one forwarded task in the same driver inbox), the chain completes without skipping. | Provision the mixed seed (see §3.2), then run `bash tests/e2e/E2E-006-driver-multi-platform.sh`.                                                                                                                                                                                                                       | Exit 0 with chain summary printed; evidence log shows `ownedTaskId`, `forwardedTaskId`, `forwardedSourcePlatform`, and `platformCodes` entries. | Directive §C; parent brief row 4                |
| 5   | The seeded run asserts **no owned `dispatch_assignment`** exists for the forwarded task.                                                  | Inspect the evidence log produced by the seeded run.                                                                                                                                                                                                                                                                   | Line `ops forwardedOwnedAssignmentDetected = false` present; script did not `exit 1` at the LEG-3 guard.                                        | Directive §C; parent brief row 4                |
| 6   | The seeded run asserts the by-platform earnings breakdown is present.                                                                     | Inspect the evidence log produced by the seeded run.                                                                                                                                                                                                                                                                   | `earnings platformItemCount` ≥ 1 and `earnings platformCodes` non-empty.                                                                        | Directive §C; parent brief row 4                |
| 7   | The closeout report uses directive §7 format verbatim.                                                                                    | Compare the parent closeout report against the template in §5 of this packet.                                                                                                                                                                                                                                          | All fourteen required keys present (`Task ID`, `Owner`, `Reviewer`, `Branch`, `PR`, `Commit`, `Files changed`, `Verification commands`, `Evidence artifact`, `Workflow family affected`, `Gate read before`, `Gate read after`, `Remaining non-claim`, `External dependencies, if any`). | Directive §7; parent brief row 5                |
| 8   | Workflow matrix `WF-DRV-MP-001` gate read is **not** uplifted by this parent task alone.                                                  | `grep -n "WF-DRV-MP-001" docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` after the matrix brief lands.                                                                                                                                                                                                   | Gate read stays `PASS (sandbox evidence)` or lower until `PH1GC-DRV-MP-002` device evidence packet also lands. Parent closeout records this as a non-claim. | Directive §C `DRV-MP-002`, §2 row `WF-DRV-MP-001` |

> Rows 1–7 are owned by the parent task. Row 8 is a guard-rail the sidecar reviewer should enforce on the parent closeout to avoid the prior "sidecar produced ≠ business-flow complete" anti-pattern (directive §9).

---

## 2. Dependency map

### 2.1 Upstream — what the parent needs in place before it can finalize

| Dependency                                          | Kind                         | Why it matters for PH1GC-DRV-MP-001                                                                                                                                                                                  | On `origin/dev` today                                                                                                                                                          |
| --------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tests/e2e/lib/helpers.sh`                          | Test runtime helper          | Provides `chain_init`, `switch_actor`, `http_call`, `assert_status`, `json_get*`, `save_evidence`, evidence file path. The hardened script must continue to source it.                                               | Present.                                                                                                                                                                       |
| `tests/e2e/fixtures/e2e-driver-accept.json`         | Fixture                      | Used by LEG 2.3 to relay forwarded-task accept. Must still parse after seed-gate refactor.                                                                                                                           | Present.                                                                                                                                                                       |
| `infra/seeds/S0002__demo_operational_seed.sql`      | Demo seed (owned side)       | Provides `E2E_SEED_TENANT_ID` (`TEN_ACME`) and `E2E_SEED_DRIVER_ID` (張司機). The hardened script keeps these defaults; the deterministic seed mode layers a forwarded task **on top** of this seed, not as a replacement. | Present.                                                                                                                                                                       |
| `tests/e2e/E2E-002-forwarded-order.sh` seed pattern | Sandbox forwarder reference  | Documents how a forwarder-sandbox order materializes into a driver-visible task via `forwarder_sandbox` adapter. PH1GC-DRV-MP-001 should reuse this approach rather than invent a new forwarder shape.               | Present.                                                                                                                                                                       |
| `apps/api/src/modules/forwarder/sandbox.adapter.ts` | Forwarder sandbox adapter    | Materializes inbound forwarded orders into driver tasks with `sourcePlatform=forwarder_sandbox` + `routeLocked=true`. The deterministic seed mode depends on this adapter being callable at test time.               | Present (per `grep`).                                                                                                                                                          |
| `apps/api` driver/dispatch/earnings routes          | API surface under test       | `/driver/tasks`, `/driver/tasks/:id`, `/driver/tasks/:id/accept`, `/dispatch/tasks`, `/platform-earnings/summary`, `/platform-earnings/by-platform`.                                                                | Assumed present (these are the same routes the original E2E-006 hits). Parent owner should not modify routes — only the harness.                                               |
| Branch strategy & anchor-commit protocol            | Process                      | Working tree is not staging; design-intent change to E2E-006 must land via task-scoped anchor commit + non-force push.                                                                                               | `docs/ops/branch-strategy.md` §11 + `.orchestrator/skills/worker-anchor-commit.md`.                                                                                            |

### 2.2 Downstream — what becomes unblocked or constrained once the parent lands

| Consumer                                                                                          | Effect of parent landing                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PH1GC-MATRIX-001` (release-gate matrix reconciliation)                                           | Can describe `WF-DRV-MP-001` row with a real hard-fail oracle citation. Still cannot mark `PASS (sandbox + device evidence)` until device packet (below).                                                              |
| `PH1GC-MATRIX-002` (E2E matrix reconciliation, `docs/04-uat/fbp-014a-e2e-matrix.md`)              | E2E-006 risk note can switch from "warning-skip permitted" to "hard fail default; warning skip only via `E2E_ALLOW_MISSING_FORWARDER_SEED=true`".                                                                       |
| `PH1GC-DRV-MP-002` (device evidence packet under `support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE/`) | Independent. Required **in addition** to PH1GC-DRV-MP-001 before `WF-DRV-MP-001` gate read may reach `PASS (sandbox + device evidence)`. Parent owner must call this non-claim in the closeout.                       |
| `PH1GC-FWD-001` (forwarder sandbox proof under `support/sidecars/FWD-LIVE-001/`)                  | Not blocking, but the seed approach (sandbox adapter materialization) is shared. Convergence on a single sandbox forwarder fixture pattern is desirable; reviewer should flag drift.                                  |
| Future regression suite                                                                           | Hard-fail-by-default removes the historical false-green from missing seed (`exit 0` with warning). CI must surface the new exit code path; check `.github/workflows/**` E2E invocations don't suppress non-zero exits.|

### 2.3 Non-dependencies (explicit non-scope)

- This parent does **not** add any new product code under `apps/api/**`. Adapter/route changes are out of scope; if the test reveals an API gap, raise a separate brief, do not fold it in.
- This parent does **not** uplift the `WF-DRV-MP-001` matrix row by itself.
- This parent does **not** ship Android/iOS device proof (that is `PH1GC-DRV-MP-002`).
- This parent does **not** produce `support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE/` content.

---

## 3. Support packet — verification mechanics

### 3.1 Required environment for hard-fail default verification (row 2)

```bash
# Default mode — must hard fail.
unset E2E_ALLOW_MISSING_FORWARDER_SEED
unset E2E_FORWARDED_TASK_ID    # if the hardened script accepts override env
export E2E_API_URL="${E2E_API_URL:-http://localhost:3001}"
export E2E_API_PATH_PREFIX="${E2E_API_PATH_PREFIX:-/api}"

# Owned-only seed (no forwarded task in inbox):
#   - S0002 demo seed loaded
#   - forwarder_sandbox adapter NOT primed with an inbound mirror
bash tests/e2e/E2E-006-driver-multi-platform.sh
# Expected: exit ≠ 0, final log includes a log_fail line on the seed gate.
```

### 3.2 Required environment for seeded-pass verification (rows 4–6)

```bash
# Mixed owned + forwarded seed. Reuse the E2E-002 inbound + broadcast pattern so
# the seeded driver inbox holds one drts-owned task and one forwarder_sandbox task.
export E2E_API_URL="${E2E_API_URL:-http://localhost:3001}"
export E2E_API_PATH_PREFIX="${E2E_API_PATH_PREFIX:-/api}"

# 1. Owned task: rely on S0002 demo seed (張司機 + TEN_ACME) which already
#    produces an owned driver task for E2E-001..005.
# 2. Forwarded task: post a sandbox inbound order and broadcast it so it lands
#    in the same driver inbox.
PRIMARY_INBOUND_FIXTURE=$(mktemp /tmp/ph1gc-drv-mp-001-inbound-XXXXXX.json)
jq -n --arg eid "PH1GC-DRV-MP-001-SEED-$(date -u +%s)" '{
  externalOrderId: $eid,
  sourcePlatform: "forwarder_sandbox",
  pickup: {address: "Sandbox Pickup"},
  dropoff: {address: "Sandbox Dropoff"}
}' > "$PRIMARY_INBOUND_FIXTURE"
# POST /forwarder/orders/inbound + /forwarder/orders/:id/broadcast as in E2E-002.

# 3. Run E2E-006 with the seeded inbox.
bash tests/e2e/E2E-006-driver-multi-platform.sh
# Expected: exit 0, evidence log carries ownedTaskId, forwardedTaskId,
#           forwardedSourcePlatform=forwarder_sandbox (or peer),
#           ops forwardedOwnedAssignmentDetected=false,
#           earnings platformItemCount ≥ 1, earnings platformCodes non-empty.
```

### 3.3 Required environment for opt-in warning-skip verification (row 3)

```bash
export E2E_ALLOW_MISSING_FORWARDER_SEED=true
unset E2E_FORWARDED_TASK_ID
bash tests/e2e/E2E-006-driver-multi-platform.sh; echo "exit=$?"
# Expected: exit 0, with log_warn (not log_fail) on the seed gate.
```

### 3.4 Source-of-truth grep for static review (row 3 second oracle)

```bash
grep -n "exit 0" tests/e2e/E2E-006-driver-multi-platform.sh
# Expected: at most ONE `exit 0` reachable from the missing-seed branch,
#           guarded by `[[ "${E2E_ALLOW_MISSING_FORWARDER_SEED:-}" == "true" ]]`.
```

### 3.5 Evidence-log location

The hardened script reuses the helper convention; evidence file is `/tmp/drts-e2e-evidence-${E2E_RUN_ID:-$$}.log` unless `E2E_EVIDENCE_FILE` overrides it. Parent closeout should attach a copy of this file (or the relevant `save_evidence` lines) as the chain proof.

---

## 4. Risk and anti-pattern callouts

1. **Do not ship the script edit without a task-scoped commit on `origin/dev`.** Status truth §1 documents that the same family of work has been silently lost in the worktree once already (the orchestrator marked `done` while files were missing from `origin/dev`). Parent owner must `git ls-tree -r origin/dev -- tests/e2e/E2E-006-driver-multi-platform.sh` after push, and include the SHA in the closeout (`COMMIT_HASH`).
2. **Do not preserve the current `exit 0` after `log_warn` as the default path.** Directive §C and §9 explicitly forbid using warning-skip as Phase 1 release proof.
3. **Do not rename or add new `WF-*` rows in this task.** Matrix mutation belongs to `PH1GC-MATRIX-001`.
4. **Do not claim `WF-DRV-MP-001 = PASS (sandbox + device evidence)` from this task alone.** Device evidence is the separate `PH1GC-DRV-MP-002` brief; closeout must record the non-claim.
5. **Watch for env-var name collisions.** `E2E_ALLOW_MISSING_FORWARDER_SEED` is the only sanctioned warning-skip switch. If the implementation introduces alternates (e.g. `E2E_DRV_MP_SKIP`, `SMOKE_FORWARDED_OPTIONAL`), the reviewer should reject.
6. **CI surface.** If `.github/workflows/**` previously invoked `E2E-006` with a shell that swallows non-zero exits (`|| true`, `set +e`, etc.), the hard-fail default will not actually fail the build. Parent owner should grep for invocations and confirm propagation; if changes are needed there, raise as a follow-up brief rather than folding silently.

---

## 5. Closeout report template (directive §7, ready to fill)

Parent owner copies this block into the closeout note when calling `scripts/ai-status.sh handoff` and again when finalising:

```
Task ID: PH1GC-DRV-MP-001
Owner: Codex
Reviewer: Codex2
Branch: codex/ph1gc-drv-mp-001
PR: <url>
Commit: <sha>
Files changed:
  - tests/e2e/E2E-006-driver-multi-platform.sh
Verification commands:
  - unset E2E_ALLOW_MISSING_FORWARDER_SEED; bash tests/e2e/E2E-006-driver-multi-platform.sh   # expect non-zero exit
  - E2E_ALLOW_MISSING_FORWARDER_SEED=true bash tests/e2e/E2E-006-driver-multi-platform.sh     # expect exit 0 with warning
  - <seeded run command from §3.2>                                                            # expect exit 0 with chain summary
  - git ls-tree -r origin/dev -- tests/e2e/E2E-006-driver-multi-platform.sh                   # expect single tree entry
Evidence artifact:
  - /tmp/drts-e2e-evidence-<run-id>.log (attached or pasted into closeout)
Workflow family affected:
  - WF-DRV-MP-001 (oracle hardened; gate read remains <= PASS (sandbox evidence) pending PH1GC-DRV-MP-002)
Gate read before:
  - WF-DRV-MP-001: PASS (repo-local evidence, warning-skip permitted) — not in matrix row yet
Gate read after:
  - WF-DRV-MP-001: PASS (sandbox evidence) once matrix row is added by PH1GC-MATRIX-001
Remaining non-claim:
  - Android + iOS device evidence not provided here; tracked by PH1GC-DRV-MP-002.
  - Live (non-sandbox) forwarder evidence not provided here; tracked by PH1GC-FWD-001.
External dependencies, if any:
  - None for this task. Device proof depends on Apple/Google access (separate brief).
```

---

## 6. Handoff notes for the sidecar reviewer (Codex)

- This file is the **only** artifact this sidecar adds. No matrix/spec/test edits are present; if any are, reject the sidecar.
- The sidecar's job is to make the parent acceptance machine-checkable; treat the checklist in §1 as the authoritative oracle when reviewing `PH1GC-DRV-MP-001` itself.
- If the parent commit later proves any row in §1 ambiguous (e.g. `E2E_ALLOW_MISSING_FORWARDER_SEED` is renamed), reopen the sidecar and patch §1 first, rather than letting the parent absorb a divergent oracle.
- The dependency map in §2 should be kept current if `PH1GC-MATRIX-001/002` lands before parent closeout; if matrix rows change, refresh §2.2 first row.

---

## 7. Provenance

- Author lane: `Claude` (governance review / consensus synthesis).
- Generated under task `PH1GC-DRV-MP-001-SIDECAR-ACCEPTANCE` on 2026-05-22 as part of supervisor underutilization auto-claim.
- No canonical truth was mutated by this sidecar. Workflow matrix, E2E script, specs, and runbooks remain unchanged.
