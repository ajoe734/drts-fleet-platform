# P5-SUP-DRV-001 Sidecar Acceptance Packet

This document is the support-only acceptance packet for
`P5-SUP-DRV-001-SIDECAR-ACCEPTANCE`.
It does not change canonical truth, runtime code, or the parent backlog item.
It consolidates the current machine-truth posture, the true parent review
surface, and the dependency/reviewer map for `P5-SUP-DRV-001` as of
`2026-07-20T09:46:22Z` (UTC).

Anchors used here:

- `scripts/ai-status.sh show P5-SUP-DRV-001-SIDECAR-ACCEPTANCE`
- `scripts/ai-status.sh show P5-SUP-DRV-001`
- `scripts/ai-status.sh show P5S3-FOUND-001`
- `git log --oneline origin/dev..origin/gemini/p5-sup-drv-001`
- `git log --oneline origin/gemini/p5-sup-drv-001..origin/dev`
- `git diff --name-status origin/dev...origin/gemini/p5-sup-drv-001`

## 1. Scope and Boundary

- **Task ID:** `P5-SUP-DRV-001-SIDECAR-ACCEPTANCE`
- **Parent Task:** `P5-SUP-DRV-001`
- **Helper Kind:** `acceptance_packet`
- **Sidecar Owner:** `Codex`
- **Sidecar Reviewer:** `Gemini`
- **Mutates Canonical:** `false`
- **Artifact:** `support/sidecars/P5-SUP-DRV-001/P5-SUP-DRV-001-SIDECAR-ACCEPTANCE.md`

Guardrails for this packet:

- Only support artifacts are allowed.
- Do not edit L1/L2 product truth, contracts of record, or primary runtime
  implementations from this sidecar branch.
- Treat `current-work.md` as human summary only; machine truth comes from
  `ai-status`.
- Parent review should use this packet to narrow acceptance, not to broaden
  scope beyond the recorded `P5-SUP-DRV-001` acceptance list.

## 2. Machine-Truth Snapshot

This snapshot was refreshed after the parent task was reopened by review. The
support packet remains sidecar-only; the refresh does not change canonical
truth or the parent branch content.

### 2.1 Sidecar row: `P5-SUP-DRV-001-SIDECAR-ACCEPTANCE`

| Field | Value |
| --- | --- |
| Title | `Prepare P5-SUP-DRV-001 acceptance packet and dependency map` |
| Status | `in_progress` |
| Owner | `Codex` |
| Reviewer | `Gemini` |
| Depends on | `P5S3-FOUND-001` |
| Last update | `2026-07-20T09:46:22Z` |
| Next | `Refreshing the acceptance packet to match latest machine truth after parent task P5-SUP-DRV-001 reopened with reviewer blockers; will recommit, push, and re-handoff to Gemini.` |

### 2.2 Parent row: `P5-SUP-DRV-001`

| Field | Value |
| --- | --- |
| Title | `P-5 W1 disclosure data-authority service` |
| Status | `in_progress` |
| Owner | `Gemini` |
| Reviewer | `Codex` |
| Depends on | `P5S3-FOUND-001` |
| Last update | `2026-07-20T09:41:53Z` |
| Latest machine-truth note | `Reviewer reopened the parent with blocker findings against the current branch tip; see blocker summary below.` |

Recorded parent acceptance from machine truth:

- `door_count/color captured on supply submission`
- `approved submission upserts disclosure profile in one txn (brand→make) no fake defaults`
- `driver public credential projected with server masking never auto verified_active`
- `multi_taxi_direct reservation-only guard returns 409`
- `backfill idempotent unreviewed→unverified missing door/color→correction queue`
- `unit+contract+lint green + reviewer PASS`

Current blocker note from machine truth:

- Backfill currently flips approved vehicle submissions to `needs_revision`
  without `reasonCode` or reviewer comment and leaves `canonical_*` ids intact,
  so the correction queue posture is incomplete and re-approval can
  short-circuit without re-provisioning.
- Driver credential backfill still fabricates `registrationArea = "TPE"` even
  though `reg.driver_reg_profiles` does not provide an area source.
- Machine-truth evidence anchors for the reopen note:
  `supply-submission.service:1051-1067`,
  `regulatory-registry.repository.ts:1093-1119`,
  `regulatory-registry.service.ts:672-727,3314-3319`,
  `V0004__regulatory_registry.sql:95-100`, and `SA:456`.

### 2.3 Hard dependency: `P5S3-FOUND-001`

| Field | Value |
| --- | --- |
| Status | `done` |
| Owner | `Gemini` |
| Reviewer | `Codex` |
| Commit | `e9b2676f176da71d38d7606809ea5d994a7508ad` |
| Subject | `P5-S3-FOUND: contract types + V0051/V0052 migration anchors (multi_taxi_direct) (#1108)` |
| Integration status | `merged_to_dev` |
| PR | `#1108` |
| Recorded at | `2026-07-20T08:07:17Z` |

Why `P5S3-FOUND-001` matters:

- It established the P-5 / S-3 contract and migration anchors that the parent
  slice extends instead of replacing.
- The parent branch relies on the multi-taxi contract types already introduced
  there, especially `packages/contracts/src/phase1-p5-s3-multi-taxi.ts`.
- The foundation task is already merged to `dev`, so this sidecar should treat
  it as a resolved prerequisite, not an open blocker.

## 3. Parent Branch Posture

The current parent branch under blocker rework is
`origin/gemini/p5-sup-drv-001`.

Branch facts on `2026-07-20`:

- Parent-only commits on top of the merge base:
  - `5d9cfbd75` `P5-SUP-DRV-001: door count/color capture, credentials masking, and idempotent backfill`
  - `62ea5a40d` `fix(P5-SUP-DRV-001): fix backfill defaults and implement server-masked projection for public registration credentials`
  - `13f41deb6` `wip(P5-SUP-DRV-001): anchor regulatory backfill and owned mobility bypass`
  - `23e963ee0` `P5-SUP-DRV-001: Refactor backfill registrationArea and fix header guard`
- `origin/dev` is ahead of the parent branch by one unrelated commit:
  - `5ad6fab47` `S3-UI-DRIVER-001: standalone driver SOS UI (#1114)`
- The reopen note was filed against these same four parent commits; no new
  parent-only commit appeared between the initial packet draft and this refresh.

Reviewer implication:

- Use `git diff origin/dev...origin/gemini/p5-sup-drv-001` to isolate the true
  parent slice.
- Do not use a raw double-dot diff as acceptance truth without filtering; that
  view shows reverse noise from `S3-UI-DRIVER-001` because the parent branch has
  not rebased onto the latest `origin/dev`.

## 4. True Review Surface for `P5-SUP-DRV-001`

The three-dot diff (`origin/dev...origin/gemini/p5-sup-drv-001`) shows three
primary acceptance surfaces plus a small amount of branch noise.

### 4.1 Supply submission capture and correction queue

Files:

- `packages/contracts/src/phase1-delta-supply-eligibility.ts`
- `apps/api/src/modules/fleet-partner/supply-submission.repository.ts`
- `apps/api/src/modules/fleet-partner/supply-submission.service.ts`
- `apps/api/src/modules/fleet-partner/supply-review.service.ts`
- `apps/api/tests/unit/fleet-partner.controller.test.ts`
- `tests/unit/supply-submission.test.ts`

What changed:

- `VehicleSupplyDraft` now carries `doorCount` and `color`.
- The repository persists and reloads `door_count` and `color`.
- Vehicle draft normalization now records those fields.
- Submission validation rejects vehicle onboarding submissions that are missing
  `doorCount` or `color`.
- `doorCount` is range-checked to `3..6`.
- Backfill logic marks persisted or in-memory vehicle onboarding submissions as
  `needs_revision` when historical drafts are missing `doorCount` or `color`.

Acceptance consequence:

- Parent review should confirm both create/update capture and submit-time
  completeness enforcement, not just schema plumbing.
- Backfill acceptance is specifically about moving incomplete historical
  submissions into a correction queue posture, not inventing defaults.

### 4.2 Disclosure profile and public credential projection

Files:

- `packages/contracts/src/phase1-p5-s3-multi-taxi.ts`
- `apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts`
- `apps/api/src/modules/regulatory-registry/regulatory-registry.repository.ts`
- `apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts`
- `infra/migrations/V0054__make_driver_credentials_columns_nullable.sql`
- `tests/unit/regulatory-registry.test.ts`

What changed:

- `DriverPublicRegistrationCredential` now allows `registrationNo`,
  `registrationArea`, and `effectiveUntil` to be `null`.
- Approval provisioning now writes:
  - `reg.vehicle_passenger_disclosure_profiles`
  - `reg.driver_public_registration_credentials`
- The disclosure profile is derived from the approved vehicle draft:
  `brand -> make`, `model`, `modelYear`, `doorCount`, `color`.
- The driver public credential is stored with the raw registration value plus a
  server-derived `maskedDisplay`.
- A public controller route returns the masked value in the public payload by
  projecting `registrationNo` to `maskedDisplay`.
- Backfill normalizes legacy unsubmitted credentials so
  `registration_area = NULL` instead of fabricating `"TPE"`.
- Backfill also creates `missing` or `unverified` credential rows without
  pretending those records are already verified.

Acceptance consequence:

- Parent review should reject any interpretation that auto-promotes legacy rows
  to `verified_active`.
- Parent review should confirm the public projection is server-masked and that
  nullability is supported all the way through the migration, repository, and
  contract surface.
- The disclosure profile acceptance is about truthful projection from approved
  submission data, not about enriching missing fields with fake defaults.

### 4.3 `multi_taxi_direct` reservation-only guard

Files:

- `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts`
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`
- `apps/api/tests/unit/owned-mobility.controller.test.ts`
- `tests/unit/owned-mobility.test.ts`
- `apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts`

What changed:

- Runtime-profile header support is threaded through passenger order, call
  center order, and tenant booking entrypoints.
- `assertRuntimeProfileAllowances` now enforces:
  - header/body mismatch => `409 RUNTIME_PROFILE_CONFLICT`
  - immediate order under `multi_taxi_direct` => `409 RESERVATION_ONLY_PROFILE`
  - tenant booking with wrong product => `409 SERVICE_PRODUCT_NOT_ALLOWED`
- A runtime-profile controller route exposes
  `multi_taxi_direct` with:
  - `reservationOnly = true`
  - `allowedServiceProducts = ["taxi_reservation"]`
  - `orderDomains = ["owned"]`

Acceptance consequence:

- Parent review should verify both header-driven and body-only code paths.
- The latest machine-truth note specifically calls out the header/body conflict
  fix, so reviewer attention should stay on that edge case.

## 5. Non-Core Diff Hygiene Notes

The parent three-dot diff also contains files that are not part of the task's
recorded artifacts or acceptance list:

- `apps/platform-admin-web/next-env.d.ts`
- several existing JSON proof artifacts under:
  - `support/sidecars/MAP-OBS-001/artifacts/...`
  - `support/sidecars/MAP-QA-002/artifacts/...`
  - `support/sidecars/MAP-REL-001/artifacts/...`

Observed posture:

- `next-env.d.ts` is an environment-generated route-type import switch.
- Several JSON artifact diffs are timestamp/UUID churn from unrelated proof
  regeneration rather than P5 disclosure logic.

Reviewer implication:

- These files are not parent acceptance evidence by themselves.
- Before merge or closeout, the parent owner/reviewer should explicitly decide
  whether these carryover changes belong in the branch.
- Sidecar approval does not imply those unrelated diffs are semantically part of
  `P5-SUP-DRV-001`.

## 6. Dependency Map

This map lists reviewer-relevant dependencies and adjacent surfaces. It does not
create new machine-truth `depends_on` edges.

| Item | Status | Why it matters |
| --- | --- | --- |
| `P5S3-FOUND-001` | `done`, `merged_to_dev` | Supplies the contract/migration anchors the parent extends. |
| `origin/dev` | ahead by `S3-UI-DRIVER-001` | Reviewer must use three-dot diff to avoid reverse-noise from unrelated dev advancement. |
| `packages/contracts/src/phase1-delta-supply-eligibility.ts` | changed in parent branch | Confirms capture fields (`doorCount`, `color`) exist at contract level. |
| `infra/migrations/V0054__make_driver_credentials_columns_nullable.sql` | new in parent branch | Makes legacy/missing credential data honest instead of forcing fake non-null values. |
| `apps/api/src/modules/regulatory-registry/*` | changed in parent branch | Houses disclosure profile upsert, credential projection, and backfill logic. |
| `apps/api/src/modules/owned-mobility/*` | changed in parent branch | Enforces `multi_taxi_direct` reservation-only behavior and header/body conflict checks. |
| MAP proof JSON artifacts | unrelated churn | Should not be mistaken for primary acceptance evidence of the parent slice. |

## 7. Reviewer Checklist for the Parent Task

Use this checklist when reviewing `P5-SUP-DRV-001`.

### 7.1 Machine truth and branch posture

- [ ] Parent task currently shows `status=in_progress`, `owner=Gemini`,
      `reviewer=Codex`, with the reopen note recorded at
      `2026-07-20T09:41:53Z`.
- [ ] Dependency `P5S3-FOUND-001` is still `done` and `merged_to_dev`.
- [ ] Reviewer uses the three-dot diff against `origin/dev`.
- [ ] Reviewer explicitly notes that the parent branch is behind `origin/dev` by
      `S3-UI-DRIVER-001` and filters double-dot reverse noise accordingly.
- [ ] Before the parent returns to `review`, recheck whether the branch tip is
      still the same four parent commits captured in this packet.

### 7.2 Supply submission and correction queue

- [ ] Vehicle draft contract and repository both carry `doorCount` and `color`.
- [ ] Vehicle onboarding submission fails when those fields are missing.
- [ ] `doorCount` validation is constrained to a realistic range and does not
      silently coerce bad values.
- [ ] Historical submissions missing `doorCount` or `color` move to
      `needs_revision` via idempotent backfill instead of receiving invented
      defaults.
- [ ] Correction-queue backfill on already approved submissions includes an
      explicit reviewer reason/comment and clears stale `canonical_*` approval
      bindings so re-approval does not short-circuit.

### 7.3 Disclosure profile and credential truthfulness

- [ ] Approval provisions disclosure profile data in the same approval path used
      for canonical provisioning.
- [ ] Disclosure profile uses truthful approved submission fields, including
      `brand -> make`, and does not fabricate unknown values.
- [ ] Public credential response is server-masked.
- [ ] Legacy or missing credential data remains `null` / `missing` /
      `unverified` as appropriate; it is never auto-promoted to
      `verified_active`.
- [ ] Legacy credential backfill does not fabricate `registrationArea`; missing
      source data remains `NULL`.
- [ ] Migration `V0054` and contract nullability line up with the backfill
      behavior.

### 7.4 Runtime profile guardrails

- [ ] `multi_taxi_direct` immediate orders return `409 RESERVATION_ONLY_PROFILE`.
- [ ] `multi_taxi_direct` tenant bookings with the wrong service product return
      `409 SERVICE_PRODUCT_NOT_ALLOWED`.
- [ ] Header/body runtime-profile conflicts return
      `409 RUNTIME_PROFILE_CONFLICT`.
- [ ] Body-only `multi_taxi_direct` still triggers the correct reservation-only
      rejection path.

### 7.5 Verification evidence

- [ ] Recorded `unit+contract+lint` success is rechecked against the branch tip
      being reviewed.
- [ ] Reviewer does not treat unrelated JSON artifact refreshes as substitutes
      for the task's real acceptance checks.

## 8. Packet Completeness Check

- [x] Sidecar packet is confined to `support/sidecars/P5-SUP-DRV-001/`.
- [x] Packet is anchored to current machine truth for the sidecar, parent, and
      foundation dependency.
- [x] Packet distinguishes parent-only changes from `origin/dev` drift.
- [x] Packet captures the three actual acceptance surfaces in the parent diff:
      supply capture/backfill, registry projection, and runtime-profile guard.
- [x] Packet records the current parent blocker posture without broadening the
      scope beyond support-only acceptance guidance.
- [x] Packet flags non-core diff noise that should not be conflated with parent
      acceptance.

## 9. Handoff Notes for `Gemini`

Use this sidecar review to verify the packet refresh, not to re-review all
parent code from scratch.

Approval focus:

1. Confirm the machine-truth snapshot now reflects the parent reopen posture and
   blocker summary captured at `2026-07-20T09:46:22Z`.
2. Confirm the dependency section still correctly treats `P5S3-FOUND-001` as
   resolved and merged to `dev`.
3. Confirm the branch-posture note is still accurate: parent branch carries the
   same four parent commits and is behind `origin/dev` by one unrelated
   `S3-UI-DRIVER-001` commit.
4. Confirm the packet stays within sidecar scope and does not modify canonical
   truth or runtime implementations.

If the parent branch tip or task status changes again after this refresh, update
the affected snapshot/checklist sections before reusing this packet.
