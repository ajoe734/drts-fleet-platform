# WF-COM-001-LIVE-PROVIDER Manual Unblock

- Task: `WF-COM-001-LIVE-PROVIDER-UNBLOCK-MANUAL-UNBLOCK`
- Parent: `WF-COM-001-LIVE-PROVIDER`
- Owner: `Claude2`
- Reviewer: `Codex`
- Date: `2026-05-19`
- Status: `documented remaining external blocker`

## Diagnosis

`WF-COM-001-LIVE-PROVIDER` (CTI live provider activation, HELD) is not blocked
by repo code or by its declared dependency.

- `COM-BLUEPRINT-001` is `done` in `ai-status.json` (CTI / recording / filing
  blueprint authored on `codex2/com-blueprint-001`, anchor commits `6f7699b`,
  `4ba1519`, `090a317`). The declared dependency gate is satisfied at the
  task-board level. (A separate dev-sync concern remains for landing the
  blueprint document on `dev`; that is tracked by the normal v3 wave merge
  flow, not by this manual-unblock helper.)
- `COM-LIVE-001` is `done` and its evidence pack
  (`support/sidecars/COM-LIVE-001/COM-LIVE-001-EVIDENCE-PACK.md`) explicitly
  records that the `2026-05-19` live probe failed to reach any CTI callback or
  filing endpoint (gcloud reauth required; older Cloud Run host returned `404`;
  newer `api-staging.drts.internal` host returned `NXDOMAIN`).
- `EXT-004` is the binding external blocker packet
  (`support/sidecars/EXT-004/EXT-004-CTI-RECORDING-FILING-GATE.md`) and is
  itself marked `done` only in the sense that the gate packet was authored;
  the eight underlying `EXT-004-BLK-001..008` external inputs are still open.
- The `WF-COM-001` row in
  `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` already reads
  `PASS (sandbox evidence)` with an explicit non-claim that "live CTI/provider
  media, staging scheduler activation, and external retention execution
  remain explicit `EXT-004-BLK-*` gates."
- The chair review at
  `.orchestrator/chair-reviews/20260519T162529Z-claude.md` classified this
  parent as `manual_unblock` (not `planning_decision`), citing "External CTI
  provider environment + webhook activation gap" and noting the parent owner
  `Gemini` is on the quota-paused lane.

This means the parent should stay blocked until the live CTI provider
environment plus webhook activation evidence exists; the unblock action for
this child is to record the missing inputs, the chair-flagged owner reassign
follow-up, and the exact next step once those external resources arrive.

## Remaining Blocker

The smallest unblockable unit is a live or staging CTI callback + recording
export + filing-package run with retention/access sign-off. The blocker
decomposes into the eight pre-existing rows in `EXT-004`:

1. `EXT-004-BLK-001` — CTI provider or approved stub environment (URL, tenant,
   call-id format, agent-id mapping, screen-pop behavior, callback SLA).
2. `EXT-004-BLK-002` — Recording callback contract (approved payload schema,
   required fields, idempotency key, retry behavior, timestamp, error cases).
3. `EXT-004-BLK-003` — CTI webhook security controls (signature header,
   canonical payload, replay window, IP allowlist if any, secret storage path).
4. `EXT-004-BLK-004` — Staging callback run evidence (before/after call session
   showing pending-to-bound transition, audit event, redacted callback log).
5. `EXT-004-BLK-005` — Filing scheduler activation (schedule owner, job
   profile, period, run log, package id, manifest hash, retry/failure policy).
6. `EXT-004-BLK-006` — Recording index export activation (export artifact with
   phone-origin rows, `call_id`, masked `recording_id`, missing-recording
   flags).
7. `EXT-004-BLK-007` — Sensitive evidence retention and access sign-off (call
   recording / filing-package retention, legal hold, signed download,
   audit-download approval).
8. `EXT-004-BLK-008` — End-to-end live or staging run (`E2E-003` packet tying
   phone order, callback, driver proof, export, filing package, audit refs).

A reachable staging environment is also required: the `COM-LIVE-001` probe
recorded that the documented staging host
`api-staging.drts.internal` did not resolve, and the older Cloud Run host
returned 404. Live-evidence collection cannot start until at least one of
those (or a successor staging host) is reachable from an authenticated lane.

## External Activation Scheduling Status

(Consistent with chair classification at
`.orchestrator/chair-reviews/20260519T162529Z-claude.md` and the recommended
focus list `Schedule a chair owner reassignment of WF-COM-001-LIVE-PROVIDER
off the quota-paused Gemini lane after the helper completes`.)

| Field                                          | Current value           |
| ---------------------------------------------- | ----------------------- |
| CTI provider sandbox environment secured       | not scheduled           |
| Approved CTI stub environment (alternative)    | not scheduled           |
| Recording-callback contract signed off         | not scheduled           |
| Webhook security controls signed off           | not scheduled           |
| Staging callback run evidence captured         | not scheduled           |
| Filing scheduler activation owner assigned     | not scheduled           |
| Recording index export activation owner        | not scheduled           |
| Retention / access / legal-hold sign-off owner | not scheduled           |
| Reachable staging host for live probes         | not currently reachable |
| Healthy parent owner lane (off Gemini quota)   | reassignment pending    |

Until the CTI provider/stub environment and the staging-host reachability are
both resolved, the parent must remain `blocked`. Once the helper closes,
chair owner reassignment off the quota-paused Gemini lane is a separate
follow-up.

## Concrete Parent Next Step

Once the eight `EXT-004-BLK-001..008` inputs are landed and a reachable
staging host is available, resume `WF-COM-001-LIVE-PROVIDER` with this
sequence:

1. Reassign parent owner off the quota-paused `Gemini` lane (chair pass) so
   the live-evidence work has a healthy owner; reviewer `Claude` may stay.
2. Resolve `EXT-004-BLK-001` and `EXT-004-BLK-003` and attach the CTI provider
   (or approved stub) environment + webhook security control evidence under
   `support/sidecars/EXT-004/`.
3. Resolve `EXT-004-BLK-002` and capture the recording-callback contract that
   matches the eight required fields listed in
   `support/sidecars/EXT-004/EXT-004-CTI-RECORDING-FILING-GATE.md` §"Required
   CTI Callback Evidence".
4. Capture `EXT-004-BLK-004` staging-callback run evidence by exercising
   `POST /api/callcenter/sessions/:callId/recording-callback` against a
   seeded phone booking and proving `recording_pending` -> `recording_bound`
   plus the `attach_recording_callback` audit action.
5. Resolve `EXT-004-BLK-005` and `EXT-004-BLK-006` by running the filing
   scheduler and recording index export against the staging environment and
   attaching the resulting manifests / package ids / audit events.
6. Resolve `EXT-004-BLK-007` with named retention / signed-download /
   legal-hold sign-off and attach the policy version under
   `docs/03-runbooks/evidence-retention-and-evidentiary-access-policy.md`.
7. Execute `EXT-004-BLK-008` end-to-end via
   `tests/e2e/E2E-003-phone-recording-filing.sh` (or its v3 successor) and
   produce the unified `E2E-003` evidence packet tying phone order, callback,
   driver proof, export, filing package, and audit refs together.
8. Upgrade the `WF-COM-001` row in
   `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` from
   `PASS (sandbox evidence)` to `PASS (live staging evidence)` and remove the
   live-CTI / scheduler / retention non-claims from the evidence cell.

Recommended machine-truth wording for the parent:

> Await CTI provider (or approved stub) environment, webhook security
> controls, staging callback evidence, filing scheduler + recording index
> export activation, retention / signed-download / legal-hold sign-off, and
> the E2E-003 live or staging packet (`EXT-004-BLK-001..008`). Once available,
> reassign owner off the quota-paused Gemini lane, attach the staging
> callback + filing + export + retention evidence, and uplift the matrix row
> from `PASS (sandbox evidence)` to `PASS (live staging evidence)`.

## Why No Canonical Code Change Was Needed

The blocker is external resource sourcing plus one owner reassignment, not
missing repo implementation:

- The chair review at
  `.orchestrator/chair-reviews/20260519T162529Z-claude.md` classified this as
  `manual_unblock`, not `planning_decision`, because the product / contract /
  canonical decision rail is already complete.
- The matrix row, the CTI-recording-filing blueprint (
  `docs/02-architecture/cti-recording-filing-blueprint-20260519.md`, anchored
  on `codex2/com-blueprint-001`), the `EXT-004` gate packet, the `COM-LIVE-001`
  partial evidence pack, and the existing `apps/api/src/modules/callcenter`
  and `apps/api/src/modules/reporting-filing` surfaces already encode the
  evidence shape; only the live execution remains.
- The repo correctly carries `PASS (sandbox evidence)` with explicit
  `EXT-004-BLK-*` non-claims instead of overclaiming live CTI activation, so
  no semantic correction is needed.

## Source Pointers

- `ai-status.json` entry for `WF-COM-001-LIVE-PROVIDER`
- `ai-status.json` entry for `COM-BLUEPRINT-001` (dependency, `done`)
- `ai-status.json` entry for `COM-LIVE-001` (partial evidence pack, `done`)
- `ai-status.json` entry for `EXT-004` (gate packet)
- `.orchestrator/chair-reviews/20260519T162529Z-claude.md` (manual_unblock
  classification + owner reassignment follow-up)
- `support/sidecars/EXT-004/EXT-004-CTI-RECORDING-FILING-GATE.md`
- `support/sidecars/COM-LIVE-001/COM-LIVE-001-EVIDENCE-PACK.md`
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
- `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`
- `docs/03-runbooks/evidence-retention-and-evidentiary-access-policy.md`
