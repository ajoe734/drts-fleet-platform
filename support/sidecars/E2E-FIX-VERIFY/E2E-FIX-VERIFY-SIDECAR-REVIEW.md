# E2E-FIX-VERIFY-SIDECAR-REVIEW

**Support-only review packet for `E2E-FIX-VERIFY`**

- Sidecar task: `E2E-FIX-VERIFY-SIDECAR-REVIEW`
- Parent task: `E2E-FIX-VERIFY`
- Helper kind: `review_packet`
- Sidecar owner / reviewer: `Gemini` / `Codex`
- Sidecar status at packet creation: `review`
- Parent owner / reviewer: `Codex` / `Codex2`
- Parent status: `done`
- Scope guardrail: support artifact only; no canonical truth, runtime code, tests, or registry state changed by this sidecar

## 1. Why this packet exists

This sidecar was already in `review`, but the assigned artifact path
`support/sidecars/E2E-FIX-VERIFY/E2E-FIX-VERIFY-SIDECAR-REVIEW.md` did not exist
when the reviewer dispatch arrived. This packet reconstructs the missing
reviewer handoff from existing machine truth and the already-merged parent task.

Practical consequence:

- the parent implementation is already closed on `origin/dev`
- this packet does not reopen or reinterpret that implementation
- it only gives reviewer `Codex` a compact evidence summary and closeout trail

## 2. Machine-truth snapshot

Current task state from `AI_NAME=Codex scripts/ai-status.sh show ...`:

- `E2E-FIX-VERIFY-SIDECAR-REVIEW`
  - status: `review`
  - owner / reviewer: `Gemini` / `Codex`
  - acceptance: support artifacts only, no canonical truth edits, handoff to reviewer
- `E2E-FIX-VERIFY`
  - status: `done`
  - commit: `88c925fb71a8b59fa457393b7d5bcd9223625de0`
  - subject: `E2E-FIX-VERIFY: full hermetic business-flow E2E green (#1083)`
  - integration status: `merged_to_dev`
  - merge time recorded in machine truth: `2026-07-10T20:53:52Z`
  - CI run recorded in machine truth:
    - GitHub Actions run `29122680812` succeeded at `2026-07-10T20:58:05Z`
    - hermetic e2e job `86461187344` succeeded at `2026-07-10T20:57:59Z`
    - `ci-integ` aggregate `86462797421` succeeded at `2026-07-10T20:58:04Z`

Dependency tasks referenced by the parent are also already `done`:

| Task | Result anchored in machine truth |
| --- | --- |
| `E2E-FIX-BE-001` | merged to `dev` by commit `c1b63d6f0` via PR `#1078` |
| `E2E-FIX-C-001` | merged to `dev` by commit `ac28fe9f7` via PR `#1077` |
| `E2E-FIX-D-001` | finalized on branch commit `d276f24e7547`; machine truth reconciled from git |
| `E2E-FIX-A-001` | merged to `dev` by commit `af676a48a` via PR `#1082` |

## 3. Parent evidence surface

The parent closeout commit `88c925f...` packages three distinct repair layers.

### 3.1 Migration version repair

`infra/migrations/V0050__supply_external_ids_as_varchar.sql` replaces the
accidentally shadowed `V0036` copy. The migration comment itself records the
root cause: a previous copy reused `V0036`, collided with an existing
service-area migration, and hermetic databases never applied the fleet supply
varchar conversion.

The parent closeout verification command also anchored this directly:

```bash
test ! -e infra/migrations/V0036__supply_external_ids_as_varchar.sql \
  && test -e infra/migrations/V0050__supply_external_ids_as_varchar.sql
git grep -n 'hermetic databases never applied' -- infra/migrations/V0050__supply_external_ids_as_varchar.sql
```

### 3.2 `psql` fallback hardening

`scripts/db-common.sh` now supports three database execution paths:

1. local `psql` when installed
2. `docker compose ... exec postgres` when the compose service is running
3. `docker exec drts-postgres` when a standalone postgres container is running

This matters because the hermetic runner and migration helpers no longer depend
on a host-installed `psql` binary as the only viable path.

### 3.3 Hermetic runner determinism

`tests/e2e/run-e2e-hermetic.sh` was hardened to make the whole E2E gate
deterministic:

- sources `scripts/db-common.sh`
- resets the target database through local or containerized admin `psql`
- exports default auth/ingress secrets needed by the API and scenarios
- auto-builds `@drts/api` when `apps/api/dist/main.js` is missing
- restarts the API and reruns each suite against a fresh database

This is the key parent change behind the final “full hermetic business-flow E2E
green” closeout.

## 4. Scenario-level evidence summary

The remaining parent diff tightens the business-dispatch scenarios so they fail
for the real regression, not for stale seed state:

- `tests/e2e/E2E-007-partner-airport-transfer.sh`
  - primes enterprise dispatch supply locations before ops dispatch
  - stops falling back to seed vehicle/driver ids if dispatch candidates are missing
- `tests/e2e/E2E-013-service-product-eligibility.sh`
  - primes enterprise dispatch supply locations before candidate inspection
- `tests/e2e/E2E-015-partner-program-variants.sh`
  - primes supply locations before dispatch
  - adds explicit pickup/dropoff lat/lng so booking fixtures are serviceable
- `tests/e2e/E2E-020-service-product-runtime-eligibility.sh`
  - primes enterprise dispatch supply locations before candidate inspection
- `tests/e2e/E2E-022-operations-reporting.sh`
  - primes enterprise dispatch supply locations before app/phone/tenant order dispatch

Taken together, the parent branch evidence says the final green state was not a
single workaround. It was the composition of:

- dependency fixes already closed in `E2E-FIX-BE-001`, `E2E-FIX-C-001`,
  `E2E-FIX-D-001`, and `E2E-FIX-A-001`
- the fleet-supply migration version correction
- local/container `psql` fallback for reset/migration commands
- hermetic runner auto-build and DB reset hardening
- dispatch-supply priming plus stricter candidate validation in affected E2E flows

## 5. Reviewer hotspots

Reviewer `Codex` should confirm:

1. This file is support-only and does not mutate canonical truth.
2. The parent task is described as already `done`, not merely `review` or
   `review_approved`.
3. The packet accurately anchors the parent evidence to commit `88c925f...` and
   the machine-truth CI success recorded on `2026-07-10`.
4. The migration rename is represented as a version-collision fix
   (`V0036 -> V0050`), not as a semantic schema redesign.
5. The E2E script changes are described as determinism / fixture hardening, not
   as new product behavior.
6. No extra runtime or contract changes are requested by this sidecar.

Suggested approval wording:

> 審查通過：`E2E-FIX-VERIFY-SIDECAR-REVIEW` 已補齊缺失的 review packet，正確對齊 machine truth：parent `E2E-FIX-VERIFY` 已以 commit `88c925fb71a8b59fa457393b7d5bcd9223625de0` merged to `origin/dev`，且 `2026-07-10` 的 GitHub Actions run `29122680812` / hermetic e2e job `86461187344` / `ci-integ` aggregate `86462797421` 全部成功。packet 也正確摘要 `V0036 -> V0050` migration rename、`psql` container fallback、hermetic runner auto-build/reset 與 enterprise dispatch supply priming；support artifact only，未改 canonical truth。

Suggested reopen wording:

> packet needs refresh: wrong parent status, missing commit/CI anchors, or support-scope violation

## 6. Handoff and closeout commands

Reviewer approval:

```bash
AI_NAME=Codex \
REVIEW_FILE=support/sidecars/E2E-FIX-VERIFY/E2E-FIX-VERIFY-SIDECAR-REVIEW.md \
REVIEW_NOTES_ZH='審查通過：`E2E-FIX-VERIFY-SIDECAR-REVIEW` 已補齊缺失的 review packet，正確對齊 machine truth：parent `E2E-FIX-VERIFY` 已以 commit `88c925fb71a8b59fa457393b7d5bcd9223625de0` merged to `origin/dev`，且 `2026-07-10` 的 GitHub Actions run `29122680812` / hermetic e2e job `86461187344` / `ci-integ` aggregate `86462797421` 全部成功。packet 也正確摘要 `V0036 -> V0050` migration rename、`psql` container fallback、hermetic runner auto-build/reset 與 enterprise dispatch supply priming；support artifact only，未改 canonical truth。' \
python3 scripts/ai_status.py approve E2E-FIX-VERIFY-SIDECAR-REVIEW \
  "Review approved. The support packet now exists at the assigned path and correctly summarizes the merged parent evidence, dependency closure, and CI anchors without changing canonical truth."
```

Reviewer reopen:

```bash
AI_NAME=Codex python3 scripts/ai_status.py reopen E2E-FIX-VERIFY-SIDECAR-REVIEW \
  "packet needs refresh: wrong parent status, missing commit/CI anchors, or support-scope violation"
```

Owner closeout after approval:

```bash
AI_NAME=Gemini NO_COMMIT_REQUIRED=1 python3 scripts/ai_status.py done \
  E2E-FIX-VERIFY-SIDECAR-REVIEW \
  "Done: review packet recorded the merged parent evidence for E2E-FIX-VERIFY, including commit 88c925fb71a8b59fa457393b7d5bcd9223625de0, CI run 29122680812 success, the V0036->V0050 migration rename, psql/container fallback, hermetic runner hardening, and scenario supply-priming summary without changing canonical truth."
```

## 7. Change log

- `2026-07-10`: packet created because review-ready dispatch arrived with no
  artifact at the assigned path.
- `2026-07-10`: packet anchored the final parent state from machine truth where
  `E2E-FIX-VERIFY` is already `done` and merged to `origin/dev`.
- `2026-07-10`: packet summarized the three main evidence layers from commit
  `88c925f...`: migration version repair, `psql` fallback hardening, and
  hermetic E2E determinism fixes.
