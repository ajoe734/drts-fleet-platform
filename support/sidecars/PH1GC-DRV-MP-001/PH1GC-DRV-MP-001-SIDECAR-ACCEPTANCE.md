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
| 2   | Default invocation (no `E2E_ALLOW_MISSING_FORWARDER_SEED`, no mixed seed) **hard fails** with non-zero exit.                              | `unset E2E_ALLOW_MISSING_FORWARDER_SEED E2E_SEED_OWNED_TASK_ID E2E_SEED_FORWARDED_TASK_ID; bash tests/e2e/E2E-006-driver-multi-platform.sh; echo "exit=$?"`                                                                                                                                                            | Script exits non-zero (`exit≠0`) **and** the final log includes an explicit `log_fail` line emitted by `handle_missing_mixed_seed` (script lines 57-60) naming the missing owned-vs-forwarded seed. | Directive §C; parent brief row 2                |
| 3   | `E2E_ALLOW_MISSING_FORWARDER_SEED=true` is the **only** way to convert the missing-seed condition into a warning-only exit 0.             | `unset E2E_SEED_OWNED_TASK_ID E2E_SEED_FORWARDED_TASK_ID; E2E_ALLOW_MISSING_FORWARDER_SEED=true bash tests/e2e/E2E-006-driver-multi-platform.sh; echo "exit=$?"` and `grep -n "exit 0" tests/e2e/E2E-006-driver-multi-platform.sh`                                                                                     | Exit 0 with a `log_warn` (not `log_fail`) on missing seed; grep returns exactly ONE match, gated by `[[ "$ALLOW_MISSING_FORWARDER_SEED" == "true" ]]`. No other code path in the script reaches `exit 0`. | Directive §C; parent brief row 3                |
| 4   | When the deterministic seed is supplied (one owned + one forwarded task in the same driver inbox), the chain completes without skipping. | Provision the mixed seed and capture both taskIds (see §3.2), then run `E2E_SEED_OWNED_TASK_ID=<owned-id> E2E_SEED_FORWARDED_TASK_ID=<forwarded-id> bash tests/e2e/E2E-006-driver-multi-platform.sh`.                                                                                                                  | Exit 0 with chain summary printed; evidence log shows `ownedTaskId=<owned-id>`, `forwardedTaskId=<forwarded-id>`, `forwardedSourcePlatform`, and `platformCodes` entries — confirming the pinned selectors were honoured (not first-match fallback). | Directive §C; parent brief row 4                |
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

### 3.0 Env-var contract recognised by the shipped script

The hardened `tests/e2e/E2E-006-driver-multi-platform.sh` recognises exactly three task-level env vars (see script lines 40–42):

| Env var                              | Purpose                                                                                                                                  | Default when unset                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `E2E_ALLOW_MISSING_FORWARDER_SEED`   | When `true`, converts the missing-mixed-seed condition from `log_fail` + `exit 1` to `log_warn` + `exit 0`. Only sanctioned warning-skip switch. | `false` (hard fail).                                                     |
| `E2E_SEED_OWNED_TASK_ID`             | Pins the owned-task selector to a specific `taskId` returned by `GET /driver/tasks` (script lines 78–87). Required for deterministic selection.   | Script falls back to "first item with `sourcePlatform` null or `drts`."  |
| `E2E_SEED_FORWARDED_TASK_ID`         | Pins the forwarded-task selector to a specific `taskId` returned by `GET /driver/tasks` (script lines 89–98). Required for deterministic selection. | Script falls back to "first item with non-null, non-`drts` `sourcePlatform`." |

No other task-selector env var (e.g. `E2E_FORWARDED_TASK_ID`, `E2E_DRV_MP_SKIP`) is honoured. If a reviewer sees a recipe referencing names outside this table, reject the recipe.

Recipes below assume the API is reachable at `E2E_API_URL` (defaults to `http://localhost:3001`) and that `S0002__demo_operational_seed.sql` has been loaded so `E2E_SEED_TENANT_ID` (`TEN_ACME`) and `E2E_SEED_DRIVER_ID` (張司機) resolve.

### 3.1 Required environment for hard-fail default verification (row 2)

```bash
# Default mode — must hard fail when the driver inbox does not contain both an
# owned task and a forwarded task.
unset E2E_ALLOW_MISSING_FORWARDER_SEED
unset E2E_SEED_OWNED_TASK_ID
unset E2E_SEED_FORWARDED_TASK_ID
export E2E_API_URL="${E2E_API_URL:-http://localhost:3001}"
export E2E_API_PATH_PREFIX="${E2E_API_PATH_PREFIX:-/api}"

# Owned-only seed (no forwarded task in inbox):
#   - S0002 demo seed loaded
#   - forwarder_sandbox adapter NOT primed with an inbound mirror,
#     so first-match selection at script lines 84-86 finds an owned task
#     while the forwarded-selector at lines 95-97 returns empty.
bash tests/e2e/E2E-006-driver-multi-platform.sh; echo "exit=$?"
# Expected: exit ≠ 0; final log includes a log_fail line emitted by
#           handle_missing_mixed_seed (script lines 57-60) naming the
#           missing owned-vs-forwarded seed.
```

### 3.2 Required environment for seeded-pass verification (rows 4–6)

The shipped script does **not** self-provision seed tasks. The recipe below uses the same forwarder_sandbox pattern as `tests/e2e/E2E-002-forwarded-order.sh` to land a mixed owned+forwarded driver inbox, then **explicitly pins** the task selectors via `E2E_SEED_OWNED_TASK_ID` / `E2E_SEED_FORWARDED_TASK_ID` so the run is deterministic (no first-match fallback).

```bash
export E2E_API_URL="${E2E_API_URL:-http://localhost:3001}"
export E2E_API_PATH_PREFIX="${E2E_API_PATH_PREFIX:-/api}"
unset E2E_ALLOW_MISSING_FORWARDER_SEED

# 1. Owned task: rely on S0002 demo seed (張司機 + TEN_ACME) which already
#    produces an owned driver task. Capture the exact taskId so we can pin
#    selection deterministically.
OWNED_TASK_ID=$(curl -fsS \
  -H "X-Actor-Type: driver_user" \
  -H "X-Actor-Id: e2e-driver-${E2E_SEED_DRIVER_ID:-DRV-001}" \
  -H "X-Tenant-Id: ${E2E_SEED_TENANT_ID:-TEN_ACME}" \
  "${E2E_API_URL}${E2E_API_PATH_PREFIX:-/api}/driver/tasks" \
  | jq -r '.data.items[] | select(((.sourcePlatform // .source_platform) == null) or ((.sourcePlatform // .source_platform) == "drts")) | (.taskId // .task_id)' \
  | head -1)

# 2. Forwarded task: post a sandbox inbound order and broadcast it so it lands
#    in the same driver inbox (mirrors E2E-002's inbound + broadcast flow).
PRIMARY_INBOUND_FIXTURE=$(mktemp /tmp/ph1gc-drv-mp-001-inbound-XXXXXX.json)
jq -n --arg eid "PH1GC-DRV-MP-001-SEED-$(date -u +%s)" '{
  externalOrderId: $eid,
  sourcePlatform: "forwarder_sandbox",
  pickup: {address: "Sandbox Pickup"},
  dropoff: {address: "Sandbox Dropoff"}
}' > "$PRIMARY_INBOUND_FIXTURE"
# POST /forwarder/orders/inbound + /forwarder/orders/:id/broadcast as in E2E-002,
# then re-query /driver/tasks and capture the forwarded taskId:
FORWARDED_TASK_ID=$(curl -fsS \
  -H "X-Actor-Type: driver_user" \
  -H "X-Actor-Id: e2e-driver-${E2E_SEED_DRIVER_ID:-DRV-001}" \
  -H "X-Tenant-Id: ${E2E_SEED_TENANT_ID:-TEN_ACME}" \
  "${E2E_API_URL}${E2E_API_PATH_PREFIX:-/api}/driver/tasks" \
  | jq -r '.data.items[] | select(((.sourcePlatform // .source_platform) != null) and ((.sourcePlatform // .source_platform) != "drts")) | (.taskId // .task_id)' \
  | head -1)

# 3. Pin the selectors so the script does NOT fall back to first-match.
export E2E_SEED_OWNED_TASK_ID="$OWNED_TASK_ID"
export E2E_SEED_FORWARDED_TASK_ID="$FORWARDED_TASK_ID"

# 4. Run E2E-006 with the deterministic seed.
bash tests/e2e/E2E-006-driver-multi-platform.sh; echo "exit=$?"
# Expected: exit 0; evidence log carries ownedTaskId=$E2E_SEED_OWNED_TASK_ID,
#           forwardedTaskId=$E2E_SEED_FORWARDED_TASK_ID,
#           forwardedSourcePlatform=forwarder_sandbox (or peer),
#           ops forwardedOwnedAssignmentDetected=false,
#           earnings platformItemCount ≥ 1, earnings platformCodes non-empty.
```

### 3.3 Required environment for opt-in warning-skip verification (row 3)

```bash
# Warning-skip path: deliberately leave the inbox without a mixed owned+forwarded
# pair AND opt in to the warning-skip via E2E_ALLOW_MISSING_FORWARDER_SEED=true.
# Both seed pins must be unset; otherwise the script would pick those taskIds
# instead of running through handle_missing_mixed_seed.
export E2E_ALLOW_MISSING_FORWARDER_SEED=true
unset E2E_SEED_OWNED_TASK_ID
unset E2E_SEED_FORWARDED_TASK_ID
export E2E_API_URL="${E2E_API_URL:-http://localhost:3001}"
export E2E_API_PATH_PREFIX="${E2E_API_PATH_PREFIX:-/api}"

bash tests/e2e/E2E-006-driver-multi-platform.sh; echo "exit=$?"
# Expected: exit 0; final log emits log_warn (not log_fail) from
#           handle_missing_mixed_seed (script lines 51-54). No other code
#           path in the script reaches `exit 0` when the seed gate fails.
```

### 3.4 Source-of-truth grep for static review (row 3 second oracle)

```bash
grep -n "exit 0" tests/e2e/E2E-006-driver-multi-platform.sh
# Expected: exactly ONE `exit 0` line, sitting inside handle_missing_mixed_seed
#           and guarded by `[[ "$ALLOW_MISSING_FORWARDER_SEED" == "true" ]]`
#           (lowercased copy of E2E_ALLOW_MISSING_FORWARDER_SEED captured at
#           script line 40). Any additional `exit 0` constitutes a regression
#           — reviewer should reject.
```

### 3.5 Evidence-log location

The hardened script reuses the helper convention; evidence file is `/tmp/drts-e2e-evidence-${E2E_RUN_ID:-$$}.log` unless `E2E_EVIDENCE_FILE` overrides it. Parent closeout should attach a copy of this file (or the relevant `save_evidence` lines) as the chain proof.

---

## 4. Risk and anti-pattern callouts

1. **Do not ship the script edit without a task-scoped commit on `origin/dev`.** Status truth §1 documents that the same family of work has been silently lost in the worktree once already (the orchestrator marked `done` while files were missing from `origin/dev`). Parent owner must `git ls-tree -r origin/dev -- tests/e2e/E2E-006-driver-multi-platform.sh` after push, and include the SHA in the closeout (`COMMIT_HASH`).
2. **Do not preserve the current `exit 0` after `log_warn` as the default path.** Directive §C and §9 explicitly forbid using warning-skip as Phase 1 release proof.
3. **Do not rename or add new `WF-*` rows in this task.** Matrix mutation belongs to `PH1GC-MATRIX-001`.
4. **Do not claim `WF-DRV-MP-001 = PASS (sandbox + device evidence)` from this task alone.** Device evidence is the separate `PH1GC-DRV-MP-002` brief; closeout must record the non-claim.
5. **Watch for env-var name collisions.** The shipped script honours exactly three env vars (see §3.0): `E2E_ALLOW_MISSING_FORWARDER_SEED` (warning-skip), `E2E_SEED_OWNED_TASK_ID`, and `E2E_SEED_FORWARDED_TASK_ID`. If the implementation or a recipe introduces alternates (e.g. `E2E_FORWARDED_TASK_ID`, `E2E_DRV_MP_SKIP`, `SMOKE_FORWARDED_OPTIONAL`), the reviewer should reject — they will not be read by the script and risk masking a non-deterministic first-match selection.
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
  - unset E2E_ALLOW_MISSING_FORWARDER_SEED E2E_SEED_OWNED_TASK_ID E2E_SEED_FORWARDED_TASK_ID; bash tests/e2e/E2E-006-driver-multi-platform.sh   # expect non-zero exit (hard-fail default, row 2)
  - E2E_ALLOW_MISSING_FORWARDER_SEED=true bash tests/e2e/E2E-006-driver-multi-platform.sh                                                     # expect exit 0 with log_warn (warning-skip, row 3)
  - E2E_SEED_OWNED_TASK_ID=<owned-id> E2E_SEED_FORWARDED_TASK_ID=<forwarded-id> bash tests/e2e/E2E-006-driver-multi-platform.sh               # expect exit 0 with chain summary (deterministic seeded run, rows 4-6); see §3.2 for seed provisioning
  - grep -n "exit 0" tests/e2e/E2E-006-driver-multi-platform.sh                                                                               # expect exactly one match, gated by ALLOW_MISSING_FORWARDER_SEED (row 3 static oracle)
  - git ls-tree -r origin/dev -- tests/e2e/E2E-006-driver-multi-platform.sh                                                                   # expect single tree entry (row 1)
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
