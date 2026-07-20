# Review Packet: P5-SUP-DRV-001-SIDECAR-REVIEW

- **Sidecar Kind:** `review_packet`
- **Parent Task:** `P5-SUP-DRV-001` - P-5 W1 disclosure data-authority service
- **Parent Owner / Reviewer:** `Gemini` / `Codex`
- **Sidecar Owner / Reviewer:** `Codex` / `Gemini`
- **Machine-Truth Basis:** `scripts/ai-status.sh show` snapshots captured on `2026-07-20` UTC for `P5-SUP-DRV-001-SIDECAR-REVIEW`, `P5-SUP-DRV-001`, and `P5S3-FOUND-001`
- **Workflow Position:** support-only reviewer packet for a parent task still in `in_progress`; this file does not change canonical truth, runtime behavior, contracts, or the parent lifecycle state

This packet consolidates the current reviewer-facing evidence for `P5-SUP-DRV-001`.
It separates three things that were easy to conflate during triage:

1. machine-truth status for the sidecar, parent, and dependency
2. the committed branch state at `gemini/p5-sup-drv-001` (`597186d95`)
3. the live parent worktree drift, which currently includes uncommitted changes

## 1. Scope Boundary

Allowed:

- summarize reviewer-facing evidence for `P5-SUP-DRV-001`
- map parent acceptance items to committed code and test anchors
- record fresh verification on the committed parent branch snapshot
- record reviewer hotspots and live-worktree drift without editing the parent

Not allowed:

- editing L1/L2 product truth
- editing parent implementation through this sidecar
- changing the parent `in_progress` lifecycle directly
- changing machine truth except through `scripts/ai-status.sh`

## 2. Machine-Truth Snapshot

### 2.1 Sidecar task

- `id`: `P5-SUP-DRV-001-SIDECAR-REVIEW`
- `owner`: `Codex`
- `reviewer`: `Gemini`
- `status`: `in_progress` after `AI_NAME=Codex scripts/ai-status.sh start ...`
- `helper_parent`: `P5-SUP-DRV-001`
- `helper_kind`: `review_packet`
- `mutates_canonical`: `false`
- artifact path: `support/sidecars/P5-SUP-DRV-001/P5-SUP-DRV-001-SIDECAR-REVIEW.md`

### 2.2 Parent task

- `id`: `P5-SUP-DRV-001`
- `owner`: `Gemini`
- `reviewer`: `Codex`
- `status`: `in_progress`
- `depends_on`: `P5S3-FOUND-001`
- `last_update`: `2026-07-20T09:54:16Z`
- machine-truth review note currently attached to `next`:
  - `apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts` mutates `disclosureProfiles` / `driverCredentials` before transactional persistence, so a failed approval transaction can expose phantom in-memory public disclosure and credential projections

### 2.3 Upstream dependency already closed

- `P5S3-FOUND-001`: `done`
- `merge_commit`: `e9b2676f176da71d38d7606809ea5d994a7508ad`
- `integration_status`: `merged_to_dev`

Reviewer implication:

- this parent branch is extending already-merged foundation contracts and migrations; the review target is the service/runtime layer, not the dependency baseline

## 3. Parent Branch Snapshot

Committed review target:

- branch: `gemini/p5-sup-drv-001`
- HEAD commit: `597186d95c9d8cb5c28938f6046627f38c70eecf`
- HEAD subject: `fix(P5-SUP-DRV-001): fix backfill logic for vehicle submissions flipping to needs_revision`
- divergence versus `origin/dev` at packet time: `ahead 5`, `behind 1`

Committed delta categories versus `origin/dev`:

- vehicle draft capture / validation / persistence for `doorCount` and `color`
- disclosure-profile and driver-credential persistence plus controller read endpoints
- `multi_taxi_direct` reservation-only runtime guard
- database and in-memory idempotent backfill behavior
- root regression tests for supply submission, regulatory registry, and owned mobility
- `apps/api` controller / repository verification tests

Live parent worktree context:

- the active `gemini` worktree is not clean
- uncommitted task-related edits currently exist in:
  - `apps/api/src/modules/fleet-partner/supply-review.service.ts`
  - `apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts`
- uncommitted unrelated drift also exists in `support/sidecars/FBP-013D/artifacts/fleets-closeout-004-ops-visibility-proof.json`

Reviewer implication:

- treat `597186d95` as the stable committed review target
- treat the live dirty worktree as context only unless the owner later commits or handoffs those additional edits

## 4. Acceptance-To-Evidence Map

| Parent acceptance item | Evidence |
| --- | --- |
| `door_count/color captured on supply submission` | `apps/api/src/modules/fleet-partner/supply-submission.service.ts:679-692` validates `doorCount`; `apps/api/src/modules/fleet-partner/supply-submission.service.ts:716-733` normalizes `doorCount` / `color`; `apps/api/src/modules/fleet-partner/supply-submission.service.ts:830-849` blocks submit when either field is missing; `apps/api/src/modules/fleet-partner/supply-submission.repository.ts:885-937` persists both columns; `apps/api/tests/unit/fleet-partner.controller.test.ts:503-549` exercises create/update payloads with both fields. |
| `approved submission upserts disclosure profile in one txn (brand->make) no fake defaults` | `apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts:739-808` builds `disclosureProfiles` and `driverCredentials` from the approved drafts, mapping `brand` to `make`; `apps/api/src/modules/regulatory-registry/regulatory-registry.repository.ts:540-629` upserts both tables through the executor path; `tests/unit/regulatory-registry.test.ts:635-712` asserts the persisted objects carry `make`, `model`, `doorCount`, `color`, and `status: "unverified"` for credentials. Caveat: see §6.1 for the still-open phantom-state risk around pre-persist mutation. |
| `driver public credential projected with server masking never auto verified_active` | `apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts:787-799` writes credentials as `status: "unverified"`, with `verifiedByActorId: null` and `verifiedAt: null`; `apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts:384-401` rewrites the response `registrationNo` to `maskedDisplay`; `tests/unit/regulatory-registry.test.ts:729-802` verifies the controller returns `RE***23`, not the underlying raw value. |
| `multi_taxi_direct reservation-only guard returns 409` | `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:4269-4289` rejects non-booking orders and wrong service products with `409`; `tests/unit/owned-mobility.test.ts:1555-1690` covers `RESERVATION_ONLY_PROFILE`, `SERVICE_PRODUCT_NOT_ALLOWED`, and `RUNTIME_PROFILE_CONFLICT`. |
| `backfill idempotent unreviewed->unverified missing door/color->correction queue` | `apps/api/src/modules/fleet-partner/supply-submission.service.ts:68-74` triggers in-memory backfill when persistence is disabled; `apps/api/src/modules/fleet-partner/supply-submission.service.ts:1047-1084` moves incomplete vehicle submissions to `needs_revision`; `apps/api/src/modules/regulatory-registry/regulatory-registry.repository.ts:1074-1132` seeds driver credentials and demotes incomplete vehicle submissions in DB-backed mode; `tests/unit/supply-submission.test.ts:225-260` verifies the correction-queue transition; `tests/unit/regulatory-registry.test.ts:804-836` verifies in-memory credential backfill with `unverified` / `missing` status outcomes. |

## 5. Fresh Verification

### 5.1 Clean committed snapshot (`/tmp/p5-sup-drv-001-clean` detached at `597186d95`)

| Command | Result |
| --- | --- |
| `pnpm exec vitest run tests/unit/supply-submission.test.ts tests/unit/regulatory-registry.test.ts tests/unit/owned-mobility.test.ts` | PASS - `3` files / `41` tests |
| `pnpm --filter @drts/api exec vitest run tests/unit/fleet-partner.controller.test.ts tests/unit/owned-mobility.controller.test.ts tests/unit/regulatory-registry.service.test.ts tests/unit/supply-submission.repository.test.ts` | PASS - `4` files / `50` tests |
| `pnpm --filter @drts/api lint` | PASS |

Notes:

- the clean detached worktree needed local `node_modules` symlinks to mirror the existing repo install layout; this was temporary verification scaffolding under `/tmp`, not a repo change
- the committed branch snapshot itself is parse-clean and testable

### 5.2 Live parent worktree (`.artifacts/worktrees/auto/gemini-p5-sup-drv-001`)

| Command | Result |
| --- | --- |
| `pnpm --filter @drts/api exec vitest run tests/unit/fleet-partner.controller.test.ts tests/unit/owned-mobility.controller.test.ts tests/unit/regulatory-registry.service.test.ts tests/unit/supply-submission.repository.test.ts` | PASS - `4` files / `50` tests |
| `pnpm exec vitest run tests/unit/supply-submission.test.ts tests/unit/regulatory-registry.test.ts tests/unit/owned-mobility.test.ts` | FAIL - parse error in `apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts:3395` from an uncommitted `snapshotState()` addition in the live worktree |

Reviewer implication:

- the committed review target is in better shape than the live dirty worktree
- if reviewing against the active `gemini` worktree instead of the committed branch, factor in that the owner currently has an uncommitted rollback attempt that is not handoff-ready

## 6. Reviewer Hotspots

### 6.1 The recorded parent review failure still exists on committed HEAD

The machine-truth complaint is still reproducible by inspection on committed `597186d95`:

- `apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts:771-808` mutates `this.disclosureProfiles` and `this.driverCredentials` before the executor-backed transaction has finished
- the actual transactional write happens later through `persistChangesWithExecutor(...)`

Implication:

- if the executor path throws after those in-memory arrays are replaced, controller getters can read projections that were never durably persisted
- current committed tests assert the happy path (`tests/unit/regulatory-registry.test.ts:689-711`) but do not assert rollback behavior on persistence failure

### 6.2 Backfill semantics are slightly weaker than submit-time completeness semantics

The submitted-vehicle completeness check treats blank color as missing:

- `apps/api/src/modules/fleet-partner/supply-submission.service.ts:835-849` uses `!draft.color?.trim()`

The backfill paths only demote when color is `null` / `undefined`:

- in-memory path: `apps/api/src/modules/fleet-partner/supply-submission.service.ts:1059-1065`
- DB path: `apps/api/src/modules/regulatory-registry/regulatory-registry.repository.ts:1128-1131`

Implication:

- historical rows with `color = ''` would bypass the correction queue even though new submissions with blank color are rejected as incomplete
- this is narrower than the phantom-state issue, but it is still a reviewer-worthy semantic mismatch against the acceptance wording `missing door/color -> correction queue`

### 6.3 Trunk drift exists before parent closeout

- the branch is `behind 1` relative to `origin/dev`

Implication:

- reviewer should ask the owner to re-check drift before any later `review_approved` or closeout step, especially because the live worktree already carries uncommitted rollback edits

## 7. Suggested Reviewer Focus

When `Gemini` reviews this sidecar packet and the parent branch, prioritize:

1. Decide whether the parent must block on the phantom in-memory projection risk in §6.1, or whether the owner is expected to land the rollback attempt currently sitting uncommitted in the live worktree.
2. Confirm whether the correction-queue acceptance requires blank-string color to be treated the same as `null`.
3. Review the parent against committed `597186d95`, not against the dirty live worktree, unless the owner explicitly stages and handoffs the additional rollback edits.
4. Require a fresh drift check before any future parent closeout because the branch is not fully caught up with `origin/dev`.

## 8. Sidecar Conclusion

This sidecar now satisfies its support-only brief:

- the declared review packet artifact exists
- no canonical truth or parent implementation files were edited by this sidecar
- machine-truth status was recorded through `scripts/ai-status.sh`
- the reviewer gets a committed-branch evidence map, a fresh verification snapshot, and an explicit separation between committed branch state and dirty live-worktree context

Recommended next lifecycle step:

- owner `Codex` should hand off `P5-SUP-DRV-001-SIDECAR-REVIEW` to reviewer `Gemini` with a summary that cites committed HEAD `597186d95`, clean verification PASS, and the two review hotspots in §6
