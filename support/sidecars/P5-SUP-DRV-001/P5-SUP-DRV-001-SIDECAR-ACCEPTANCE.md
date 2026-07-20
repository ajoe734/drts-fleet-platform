# P5-SUP-DRV-001 Sidecar Acceptance Packet

This document is the support-only acceptance packet for
`P5-SUP-DRV-001-SIDECAR-ACCEPTANCE`.
It does not change canonical truth, runtime code, or the parent backlog item.
It consolidates the current machine-truth posture, the true parent review
surface, and the dependency/reviewer map for `P5-SUP-DRV-001` as of
`2026-07-20T09:56:04Z` (UTC). Section 9 records the later reviewer approval and
owner closeout context captured between `2026-07-20T09:58:37Z` and
`2026-07-20T09:59:43Z`.

Anchors used here:

- `git fetch origin`
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

This refresh supersedes the earlier `review_approved` packet. The prior approval
became stale when the parent task was reopened at `2026-07-20T09:54:16Z`; the
machine-truth snapshot below now reflects the parent back in `in_progress`
while the acceptance packet is refreshed for a later reviewer pass.

The tables in this section intentionally preserve the pre-handoff snapshot that
was sent for review. The post-review `review_approved` state is captured later
in Section 9 so the original review surface stays explicit.

### 2.1 Sidecar row: `P5-SUP-DRV-001-SIDECAR-ACCEPTANCE`

| Field | Value |
| --- | --- |
| Title | `Prepare P5-SUP-DRV-001 acceptance packet and dependency map` |
| Status | `in_progress` |
| Owner | `Codex` |
| Reviewer | `Gemini` |
| Depends on | `P5S3-FOUND-001` |
| Last update | `2026-07-20T09:56:04Z` |
| Next | `Refreshing acceptance packet after parent task P5-SUP-DRV-001 reopened at 2026-07-20T09:54:16Z; prior review_approved snapshot is stale and needs updated machine-truth/review-surface notes before re-handoff.` |

Why the sidecar is still `in_progress` in this snapshot:

- `Gemini` approved the earlier refresh at `2026-07-20T09:53:36Z`.
- `Codex` then reopened the parent at `2026-07-20T09:54:16Z`, which invalidated
  that approval snapshot one minute later.
- The remaining sidecar work is to refresh the support packet to the reopened
  parent posture, then re-handoff it for reviewer confirmation.

### 2.2 Parent row: `P5-SUP-DRV-001`

| Field | Value |
| --- | --- |
| Title | `P-5 W1 disclosure data-authority service` |
| Status | `in_progress` |
| Owner | `Gemini` |
| Reviewer | `Codex` |
| Depends on | `P5S3-FOUND-001` |
| Last update | `2026-07-20T09:54:26Z` |
| Current machine-truth note | `Investigating files and starting implementation` |

Recorded parent acceptance from machine truth:

- `door_count/color captured on supply submission`
- `approved submission upserts disclosure profile in one txn (brand→make) no fake defaults`
- `driver public credential projected with server masking never auto verified_active`
- `multi_taxi_direct reservation-only guard returns 409`
- `backfill idempotent unreviewed→unverified missing door/color→correction queue`
- `unit+contract+lint green + reviewer PASS`

Implication for this sidecar packet:

- The earlier blocker-fix posture is no longer the live parent posture.
- The latest reviewer finding from `2026-07-20T09:54:16Z` is now the operative
  acceptance risk: `apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts`
  mutates `disclosureProfiles` / `driverCredentials` before
  `persistChangesWithExecutor`, so a failed approval transaction can expose
  phantom public disclosure or credential projections from in-memory state.
- Parent review should not close until that transactional-boundary issue is
  resolved and the branch re-enters `review`.

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

Why `P5S3-FOUND-001` still matters:

- It established the P-5 / S-3 contract and migration anchors that the parent
  slice extends instead of replacing.
- The parent branch still relies on the multi-taxi contract types already
  introduced there, especially
  `packages/contracts/src/phase1-p5-s3-multi-taxi.ts`.
- The foundation task is already merged to `dev`, so this sidecar should treat
  it as a resolved prerequisite, not an open blocker.

## 3. Parent Branch Posture

The current parent branch for this packet is `origin/gemini/p5-sup-drv-001`.

Branch facts on `2026-07-20`:

- Parent-only commits on top of the merge base:
  - `5d9cfbd75` `P5-SUP-DRV-001: door count/color capture, credentials masking, and idempotent backfill`
  - `62ea5a40d` `fix(P5-SUP-DRV-001): fix backfill defaults and implement server-masked projection for public registration credentials`
  - `13f41deb6` `wip(P5-SUP-DRV-001): anchor regulatory backfill and owned mobility bypass`
  - `23e963ee0` `P5-SUP-DRV-001: Refactor backfill registrationArea and fix header guard`
  - `597186d95` `fix(P5-SUP-DRV-001): fix backfill logic for vehicle submissions flipping to needs_revision`
- `origin/dev` is ahead of the parent branch by one unrelated commit:
  - `5ad6fab47` `S3-UI-DRIVER-001: standalone driver SOS UI (#1114)`

Reviewer implication:

- Use `git diff origin/dev...origin/gemini/p5-sup-drv-001` to isolate the true
  parent slice.
- Do not use a raw double-dot diff as acceptance truth without filtering; that
  view shows reverse noise from `S3-UI-DRIVER-001` because the parent branch
  has not rebased onto the latest `origin/dev`.
- The branch tip is unchanged from the just-approved packet revision: the parent
  still carries the same five parent-only commits.
- The new parent fact relative to that approved packet is not a sixth commit but
  the `2026-07-20T09:54:16Z` reopen finding against transactional mutation
  ordering in `regulatory-registry.service.ts`.

## 4. True Review Surface for `P5-SUP-DRV-001`

The three-dot diff (`origin/dev...origin/gemini/p5-sup-drv-001`) still shows
three primary acceptance surfaces plus a small amount of branch noise. The
focus below is updated to reflect both the blocker-fix commit at the parent tip
and the newer reopen finding that keeps the task out of `review`.

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
- Vehicle draft normalization records those fields.
- Submission validation rejects vehicle onboarding submissions that are missing
  `doorCount` or `color`.
- `doorCount` is range-checked to `3..6`.
- Backfill logic marks historical submissions as `needs_revision` when missing
  `doorCount` or `color`.
- The latest fix also sets `reviewReasonCode` / `reviewComment` and clears
  stale `canonical_*` ids when an already approved submission is pushed back to
  correction-queue posture.

Acceptance consequence:

- Parent review should confirm both create/update capture and submit-time
  completeness enforcement, not just schema plumbing.
- Backfill acceptance is specifically about moving incomplete historical
  submissions into a truthful correction queue posture, not inventing defaults
  and not leaving approval bindings intact.

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
- Backfill now normalizes legacy or missing credential rows so
  `registration_area = NULL` instead of fabricating `"TPE"`.
- Backfill creates `missing` or `unverified` credential rows without
  pretending those records are already verified.
- The latest reopen finding says approval-path mutation order is still unsafe:
  disclosure-profile and driver-credential in-memory state is mutated before the
  persistence executor commits successfully.

Acceptance consequence:

- Parent review should reject any interpretation that auto-promotes legacy rows
  to `verified_active`.
- Parent review should confirm the public projection is server-masked and that
  nullability is supported through the migration, repository, and contract
  surface.
- The disclosure profile acceptance is about truthful projection from approved
  submission data, not about enriching missing fields with fake defaults.
- The next parent review pass must also confirm failed approval transactions
  cannot leak phantom disclosure/credential projections from pre-persist
  in-memory mutation.

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
- A runtime-profile controller route exposes `multi_taxi_direct` with:
  - `reservationOnly = true`
  - `allowedServiceProducts = ["taxi_reservation"]`
  - `orderDomains = ["owned"]`

Acceptance consequence:

- Parent review should verify both header-driven and body-only code paths.
- Reviewer attention should stay on the conflict guard and reservation-only
  behavior, because those are part of the recorded acceptance surface rather
  than incidental controller churn.

### 4.4 Non-core diff hygiene notes

The parent three-dot diff also contains files that are not part of the task's
recorded artifacts or acceptance list:

- `apps/platform-admin-web/next-env.d.ts`
- several existing JSON proof artifacts under:
  - `support/sidecars/MAP-OBS-001/artifacts/...`
  - `support/sidecars/MAP-QA-002/artifacts/...`
  - `support/sidecars/MAP-REL-001/artifacts/...`

Observed posture:

- `next-env.d.ts` is an environment-generated route-type import switch.
- Several JSON artifact diffs are timestamp or UUID churn from unrelated proof
  regeneration rather than P5 disclosure logic.

Reviewer implication:

- These files are not parent acceptance evidence by themselves.
- Before merge or closeout, the parent owner/reviewer should explicitly decide
  whether these carryover changes belong in the branch.
- Sidecar approval does not imply those unrelated diffs are semantically part of
  `P5-SUP-DRV-001`.

## 5. Dependency Map

This map lists reviewer-relevant dependencies and adjacent surfaces. It does
not create new machine-truth `depends_on` edges.

| Item | Status | Why it matters |
| --- | --- | --- |
| `P5S3-FOUND-001` | `done`, `merged_to_dev` | Supplies the contract/migration anchors the parent extends. |
| `origin/dev` | ahead by `S3-UI-DRIVER-001` | Reviewer must use three-dot diff to avoid reverse-noise from unrelated dev advancement. |
| `packages/contracts/src/phase1-delta-supply-eligibility.ts` | changed in parent branch | Confirms capture fields (`doorCount`, `color`) exist at contract level. |
| `infra/migrations/V0054__make_driver_credentials_columns_nullable.sql` | new in parent branch | Makes legacy or missing credential data honest instead of forcing fake non-null values. |
| `apps/api/src/modules/regulatory-registry/*` | changed in parent branch | Houses disclosure profile upsert, credential projection, and truthful credential backfill. |
| `apps/api/src/modules/fleet-partner/*` | changed in parent branch | Houses supply capture, correction-queue backfill, and canonical-id clearing on rework. |
| `apps/api/src/modules/owned-mobility/*` | changed in parent branch | Enforces `multi_taxi_direct` reservation-only behavior and header/body conflict checks. |
| MAP proof JSON artifacts | unrelated churn | Should not be mistaken for primary acceptance evidence of the parent slice. |

## 6. Reviewer Checklist for the Parent Task

Use this checklist for the next review pass of `P5-SUP-DRV-001`.

### 6.1 Machine truth and branch posture

- [ ] Parent task currently shows `status=in_progress`, `owner=Gemini`,
      `reviewer=Codex`, with latest machine-truth update at
      `2026-07-20T09:54:26Z`.
- [ ] Dependency `P5S3-FOUND-001` is still `done` and `merged_to_dev`.
- [ ] Reviewer uses the three-dot diff against `origin/dev`.
- [ ] Reviewer explicitly notes that the parent branch is behind `origin/dev` by
      `S3-UI-DRIVER-001` and filters double-dot reverse noise accordingly.
- [ ] Reviewer confirms the branch tip now contains the five parent-only commits
      captured in this packet, including `597186d95`.
- [ ] Reviewer or owner carries forward the `2026-07-20T09:54:16Z` reopen
      finding on approval-path mutation ordering before attempting closeout.

### 6.2 Supply submission and correction queue

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

### 6.3 Disclosure profile and credential truthfulness

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
- [ ] Approval-path state mutation happens inside the persisted transaction
      boundary, or is rolled back on failure, so public projections cannot
      observe phantom disclosure/credential data.

### 6.4 Runtime profile guardrails

- [ ] `multi_taxi_direct` immediate orders return `409 RESERVATION_ONLY_PROFILE`.
- [ ] `multi_taxi_direct` tenant bookings with the wrong service product return
      `409 SERVICE_PRODUCT_NOT_ALLOWED`.
- [ ] Header/body runtime-profile conflicts return
      `409 RUNTIME_PROFILE_CONFLICT`.
- [ ] Body-only `multi_taxi_direct` still triggers the correct reservation-only
      rejection path.

### 6.5 Verification evidence

- [ ] Recorded `unit+contract+lint` success is rechecked against the branch tip
      being reviewed.
- [ ] Re-verification covers the reopen finding, not only the earlier
      correction-queue and credential-nullability fixes.
- [ ] Reviewer does not treat unrelated JSON artifact refreshes as substitutes
      for the task's real acceptance checks.

## 7. Packet Completeness Check

- [x] Sidecar packet is confined to `support/sidecars/P5-SUP-DRV-001/`.
- [x] Packet is anchored to current machine truth for the sidecar, parent, and
      foundation dependency.
- [x] Packet distinguishes parent-only changes from `origin/dev` drift.
- [x] Packet captures the three actual acceptance surfaces in the parent diff:
      supply capture/backfill, registry projection, and runtime-profile guard.
- [x] Packet reflects the reopened parent posture now recorded in machine
      truth, including the active transactional-boundary finding.
- [x] Packet flags non-core diff noise that should not be conflated with parent
      acceptance.

## 8. Handoff Notes for `Gemini`

Use this sidecar review to verify the refresh, not to re-review all parent code
from scratch.

Approval focus:

1. Confirm the machine-truth snapshot now reflects the parent `in_progress`
   reopen posture that followed `2026-07-20T09:54:16Z`, not the earlier
   `review_approved` snapshot.
2. Confirm the dependency section still correctly treats `P5S3-FOUND-001` as
   resolved and merged to `dev`.
3. Confirm the packet captures the active parent acceptance risk in
   `regulatory-registry.service.ts`: pre-persist mutation can leak phantom
   disclosure/credential projections on failed approval.
4. Confirm the branch-posture note is still accurate: parent branch carries five
   parent-only commits and is behind `origin/dev` by one unrelated
   `S3-UI-DRIVER-001` commit.
5. Confirm the packet stays within sidecar scope and does not modify canonical
   truth or runtime implementations.

If the parent branch tip or task status changes again after this refresh, update
the affected snapshot/checklist sections before reusing this packet.

## 9. Reviewer Approval and Owner Closeout

Reviewer approval for this refreshed packet was recorded in machine truth at
`2026-07-20T09:58:37Z`.

| Field | Value |
| --- | --- |
| Sidecar status after review | `review_approved` |
| Reviewer | `Gemini` |
| Review note 1 | `審查通過` |
| Review note 2 | `Sidecar 驗證包內容完整且與 machine truth 完全一致` |
| Parent task status at closeout | `P5-SUP-DRV-001 = review` |
| Parent last update sampled at closeout | `2026-07-20T09:59:43Z` |

Owner closeout implications:

- This approval closes the support-packet refresh only; it does not close or
  certify the parent runtime implementation.
- The snapshot tables above intentionally remain anchored to the
  `2026-07-20T09:56:04Z` pre-handoff posture that `Gemini` reviewed.
- Final task closeout should use branch-level evidence only; no claim is made
  here that the parent branch is merged to `dev` or deployed.
