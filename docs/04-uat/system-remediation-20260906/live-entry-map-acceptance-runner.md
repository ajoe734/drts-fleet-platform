# SR-LIVE-ENTRY-MAP-RUNNER-001: live entry & map acceptance runner

- Task: `SR-LIVE-ENTRY-MAP-RUNNER-001`
- Owner: `Claude2`
- Reviewer: `Claude`
- Parents (consumers): `SR-LIVE-ENTRY-001`, `SR-LIVE-MAP-001` (both blocked
  pending `SR-RELEASE-001`; this producer has no dependency on either parent
  or on `SR-RELEASE-001`, so it introduces no dependency cycle)
- Status of this document: written by the runner's owner at implementation
  time. Section 5 ("Real run evidence") is filled in after the workflow
  actually executes on GitHub-hosted runners against a deployed target — it
  is not authoritative until then. This VM does not permit starting product
  dev/preview/HTTP/browser servers or making live network calls, so no real
  run has happened yet as of this document's initial commit.

## 1. What this task is, and what it is not

This task implements the **runner** — the workflow, input-validation logic,
and evidence recording — that lets `SR-LIVE-ENTRY-001` and `SR-LIVE-MAP-001`
later execute real live acceptance. It does **not** itself constitute parent
live acceptance:

- Completing this producer proves the runner exists, is fail-closed, and its
  input-validation behavior is covered by real (non-network) unit tests.
- It does **not** prove any specific deployed environment currently passes
  entry or map acceptance — that requires an actual GitHub Actions run
  against a real deployed candidate, with real credentials and a real
  authorized role session, which only happens after this producer merges and
  the workflow is dispatched with real secrets/vars configured.
- No parent live acceptance (`SR-LIVE-ENTRY-001`, `SR-LIVE-MAP-001`) may be
  inferred from this producer being `done`.

This task also does not modify either existing verifier it reuses
(`operations/verification/verify-iam-staging-live.mjs`,
`operations/verification/verify-google-map-provider-live.mjs`) or the shared
UAT harness (`tests/e2e/system-remediation/shared/`) — both are invoked
exactly as they already exist, as read dependencies.

## 2. What was built, and where

Two independent runner scripts, each pure/injectable for unit testing and
only touching the network/subprocess when executed directly by the workflow:

| File | Profile | What it does |
| --- | --- | --- |
| `tests/e2e/system-remediation/sr-live-entry-001/entry-acceptance-runner.ts` | entry | Fail-closed input validation, then invokes the existing `verify-iam-staging-live.mjs` unmodified, then runs an additional positive/negative realm-role HTTP boundary check using a deployment-issued role session (never a fixture/demo persona), then verifies the deployed target's `x-drts-candidate-sha` response header matches the requested candidate SHA. |
| `tests/e2e/system-remediation/sr-live-map-001/map-acceptance-runner.ts` | map | Fail-closed input validation (including an explicit `DRTS_LIVE_MAP_TEST_AUTHORIZED=true` gate so zero billed provider calls happen without explicit authorization), then invokes the existing `verify-google-map-provider-live.mjs` unmodified (live Geocoding, Routes, and Maps JS checks), then records exit status and total call latency. |

Both scripts:

- Export `validate*RunnerInputs` and `run*Acceptance` as pure functions that
  accept an environment object / injected dependencies and never touch
  `fetch`/`child_process` themselves — real subprocess/network access lives
  only in each file's `real*` helper functions, wired up only inside `main()`,
  which only executes when the file is the process entry point
  (`pnpm exec tsx <file>`). This is what makes the unit tests below able to
  run with zero network access.
- Use `UatEvidenceRecorder` (`tests/e2e/system-remediation/shared/
  evidence-recorder.ts`) to build a redacted evidence bundle (PII/secret
  redaction via the shared `redactPii`/`redactObject`, applied automatically
  by the recorder's own `recordHttpCall`/`recordConsole`/`recordError`
  methods) and write it to a JSON file that the workflow uploads as an
  artifact on every run, pass or fail.
- Fail closed on missing/invalid input rather than falling back to any
  historical staging default — every target origin must be explicitly listed
  in an env-supplied allowlist (`DRTS_LIVE_ENTRY_ALLOWED_TARGETS` /
  `DRTS_LIVE_MAP_ALLOWED_TARGETS`).

The workflow, `.github/workflows/live-entry-map-acceptance.yml`, has two
independent `workflow_dispatch` jobs (`entry-acceptance`, `map-acceptance`),
each individually toggleable via boolean inputs. Both jobs:

1. Validate `candidate_sha` is a full 40-character SHA.
2. Check out exactly that SHA and verify `git rev-parse HEAD` resolves to it
   (checked-out-SHA verification — matches the pattern used by
   `host-acceptance.yml`).
3. Run the corresponding runner script via `pnpm exec tsx`, which separately
   verifies the **deployed** target reports the same candidate SHA (entry
   profile, via the `x-drts-candidate-sha` response header convention already
   established in `tests/e2e/operational-browser-acceptance.spec.ts`) or
   simply proves live reachability/correctness of the configured provider
   endpoints (map profile, which has no per-request SHA header to check).
4. Record a machine-readable `run-status.json` and gate on it.
5. Upload the execution log, redacted evidence JSON, and run status as
   artifacts with `if: always()`, so a failing run still produces evidence.

Neither job starts a local server, builds a product app, or deploys
anything — both assume a separate deploy workflow already published the
candidate to the target origins supplied via repository variables/secrets.

## 3. Fail-closed behavior (what a wrong/incomplete input does)

Both profiles are designed so misuse fails loudly rather than silently
passing or falling back to a weaker check:

- **Wrong/malformed candidate SHA** — rejected before any subprocess or
  network call (`DRTS_CANDIDATE_SHA` must match `^[0-9a-f]{40}$`).
- **Wrong target** — any origin not present in the explicit
  `DRTS_LIVE_*_ALLOWED_TARGETS` allowlist is rejected, including origins that
  look like the verifiers' own historical staging defaults.
- **Absent authorization** — entry profile: missing
  `DRTS_LIVE_ENTRY_ROLE_SESSION_TOKEN` is rejected. Map profile: missing any
  of the three Google Maps provider keys, or `DRTS_LIVE_MAP_TEST_AUTHORIZED`
  not being exactly `"true"`, is rejected before any billed call is made.
- **Wrong role** — entry profile: the supplied `DRTS_LIVE_ENTRY_AUTHORIZED_ROLE`
  must both appear in an explicit `DRTS_LIVE_ENTRY_AUTHORIZED_ROLES`
  allowlist for the run *and* not match any known UAT fixture/demo persona
  name or contain a fixture-like marker (`demo`, `fixture`, `mock`, `sample`,
  `sandbox`) — a fixture persona used in live mode is rejected even if
  someone adds it to the allowlist by mistake.
- **Partial / skipped results** — both runners require every expected
  section marker from the underlying verifier's own stdout to be present
  (seven `verify-iam-staging-live.mjs` check sections; all three
  `verify-google-map-provider-live.mjs` `*_SMOKE=PASS` markers). A verifier
  subprocess that crashes partway through, or that the workflow accidentally
  invokes with the wrong flags and produces fewer checks than expected, is
  treated as a failure — not a partial pass and not a skip.
- **Checked-out vs. requested SHA drift** — if the workflow's own checkout
  step somehow resolved a different SHA than requested, `runEntryAcceptance`/
  `runMapAcceptance` independently re-check `WORKFLOW_SHA === candidateSha`
  and fail if they differ (defense in depth beyond the workflow-level
  `git rev-parse HEAD` check).
- **Deployed vs. requested SHA drift (entry profile only)** — if the live
  target's `x-drts-candidate-sha` response header does not match the
  requested candidate, the run fails even if every other check passed,
  preventing a stale/rolled-back deployment from producing a false pass.

## 4. Unit test coverage (VM-safe, no network)

`pnpm exec vitest run tests/unit/system-remediation/sr-live-entry-001/
tests/unit/system-remediation/sr-live-map-001/` — 34 tests, all passing as of
this document's initial commit, all using injected fake
`invokeVerifier`/`checkRoleBoundary` dependencies. Each test file also spies
on `globalThis.fetch` and throws if the orchestration function under test
calls it directly, as a guardrail that the pure functions never reach the
network themselves — only the `real*` helpers wired up in `main()` do, and
`main()` is never invoked by the unit tests.

Covered per profile: valid-input acceptance, missing/malformed candidate SHA,
target outside the allowlist, absent authorization, role outside the
allowlist, fixture/demo persona rejection, verifier non-zero exit, partial
verifier output (missing check sections/markers), verifier-reported internal
failures, role-boundary status mismatches (entry only), deployed-SHA mismatch
(entry only), and evidence redaction (secrets/tokens/keys never appear in the
serialized evidence bundle).

## 5. Real run evidence

`<filled in after the workflow is actually dispatched on GitHub-hosted
runners against a deployed target with real repository vars/secrets
configured — not before>`

Required repository configuration before a real run can produce evidence
(none of these are set by this task; they are deployment/ops configuration):

- Vars: `DRTS_LIVE_ENTRY_ALLOWED_TARGETS`, `DRTS_LIVE_ENTRY_API_ORIGIN`,
  `DRTS_LIVE_ENTRY_TENANT_ORIGIN`, `DRTS_LIVE_ENTRY_PLATFORM_ORIGIN`,
  `DRTS_LIVE_ENTRY_OPS_ORIGIN`, `DRTS_LIVE_ENTRY_AUTHORIZED_ROLES`,
  `DRTS_LIVE_ENTRY_AUTHORIZED_ROLE`, `DRTS_LIVE_ENTRY_POSITIVE_ROUTE`,
  `DRTS_LIVE_ENTRY_POSITIVE_EXPECTED_STATUS`,
  `DRTS_LIVE_ENTRY_NEGATIVE_ROUTE`, `DRTS_LIVE_ENTRY_NEGATIVE_EXPECTED_STATUS`,
  `DRTS_LIVE_MAP_TEST_AUTHORIZED`, `DRTS_LIVE_MAP_ALLOWED_TARGETS`,
  `DRTS_LIVE_MAP_TEST_ORIGIN`, `DRTS_LIVE_MAP_AUTHORIZED_ROUTE_LABELS`,
  `DRTS_LIVE_MAP_AUTHORIZED_ROUTE_LABEL`.
- Secrets: `DRTS_LIVE_ENTRY_ROLE_SESSION_TOKEN` (a real deployment-issued
  session, not a UAT fixture), `GOOGLE_MAPS_GEOCODING_API_KEY`,
  `GOOGLE_MAPS_ROUTES_API_KEY`, `GOOGLE_MAPS_BROWSER_KEY`.

## 6. CI / merge status

`<filled in by the owner once pushed>`

## 7. Independent review

`<filled in by the reviewer — do not self-approve>`
