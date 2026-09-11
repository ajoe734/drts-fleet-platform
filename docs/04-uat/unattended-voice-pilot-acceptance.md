# Unattended Voice Pilot Acceptance Gate (可執行小量營運開通驗收閘門)

- Task ID: `UV-EXEC-029-PILOT-RUNNER`
- Parent Task: `UV-EXEC-029` (`UAT、小量營運開通與回退驗證`)
- Workstream: `pilot-operational-acceptance`
- Owner: `Claude2`
- Reviewer: `Claude`
- Planning Ref: `docs/02-architecture/phase1-unattended-voice-booking-sa-20260906.md`
- Execution Runbook: `docs/03-runbooks/unattended-voice-booking-execution-tasks-20260906.md`
- Operations Runbook: `docs/03-runbooks/unattended-voice-operations.md`
- Gate Script: `operations/verification/check-unattended-voice-pilot.mjs`
- Behavioral Tests: `tests/unit/unattended-voice-pilot/`
- Read Dependencies: `operations/verification/check-unattended-voice-coverage.py`, `operations/verification/unattended-voice-eval.mjs`, `docs/04-uat/unattended-voice-acceptance-manifest.json`, `docs/04-uat/unattended-voice-live-telephony-evidence.md`, `docs/04-uat/unattended-voice-external-readiness.md`
- Last Update: `2026-09-11`

---

## 1. Purpose & Safety Guardrails

`UV-EXEC-029-PILOT-RUNNER` builds the **executable acceptance gate** that `UV-EXEC-029` needs to aggregate and validate real pilot evidence. It is a preparation/runner producer, not the pilot itself:

1. **Read-only, fail-closed aggregation only.** The gate script (`check-unattended-voice-pilot.mjs`) only reads the existing 32-FR/48-AC manifest (`UV-EXEC-025`) and an already-submitted pilot evidence bundle. It never enables pilot traffic, never flips rollout/feature flags, never contacts telephony providers, and never fabricates approvals.
2. **A nonempty string is not an approval.** Every approval/drill field in the evidence schema (§3) must be a structured record with an identifiable approver/executor, a timestamp, and an outcome/artifact reference. A bare authorization string is rejected (`AUTHORIZATION_IS_BARE_STRING_NOT_STRUCTURED_APPROVAL`).
3. **This producer being `done` does not mean the parent is done.** `UV-EXEC-029`'s real PSTN pilot, operations authorization, dev deploy, operational acceptance run, and every field in its `required_acceptance` list remain pending until operations actually performs them and submits a compliant evidence bundle. Independent review, candidate CI, and merge of this runner only establish that the *gate itself* works correctly against known-good and known-bad inputs.

## 2. Mapping to `UV-EXEC-029.required_acceptance`

The gate's aggregate report (`report.required_acceptance`) mirrors the parent task's `required_acceptance` keys exactly, so the parent can be closed only when every key is independently `true` against real evidence:

| `required_acceptance` key | Gate validation |
| --- | --- |
| `pilot_operational_authorization` | `pilot_operational_authorization` is a structured object: `authorized === true`, non-empty `approver`, parsable `approved_at`, and `reference` matching `AUTH-UV-PILOT-<DESCRIPTOR>`. |
| `dev_deploy_run_url` | `dev_deploy.run_url` is a non-empty `http(s)` URL. |
| `dev_deploy_sha` | `dev_deploy.sha` is a 40-hex-char SHA equal to the expected candidate SHA. |
| `operational_acceptance_run_url` | `operational_acceptance.run_url` is a non-empty `http(s)` URL. |
| `operational_acceptance_sha` | `operational_acceptance.sha` is a 40-hex-char SHA equal to the expected candidate SHA. |
| `all_applicable_ac_evidence` | Every AC whose `status_category` in the manifest is **not** `pending` (i.e. `pass`, `live`, `conditional`) has an `ac_evidence` entry with `result: "pass"`, a `run_sha` equal to the expected candidate SHA, a valid `mode`, and a non-empty `evidence_ref`. `live`-category ACs must be `mode: "live"` — `fixture` mode is rejected as fixture-only-claiming-live-pass. |
| `human_exception_rate_full_cohort` | `cohort.total_incoming_calls` equals the sum of `cohort.per_language[*].total` (full-cohort denominator, not a filtered subset), and `cohort.human_exception_rate` equals `human_exception_count / total_incoming_calls` within a small rounding tolerance. |
| `language_route_model_profile_signoff` | Every language/model-profile declared in `enabled_scope` has at least one complete `language_route_model_profile_signoff` entry (language, route, model_profile, approver, approved_at). |
| `staffing_callback_drill_evidence` | `staffing_callback_drill_evidence` is present with a parsable `drill_date`, `executor`, `scenario`, `outcome: "pass"`, and `artifact_ref`. |
| `kill_switch_rollback_drill_evidence` | Same structural requirements as above, for the kill-switch/rollback drill. |

Applicable-AC scoping intentionally excludes `pending` ACs: those are still inside the `UV-EXEC-001..024` implementation DAG and are not something a pilot evidence bundle can satisfy by itself (per `docs/04-uat/unattended-voice-acceptance-manifest.json` `status_category_definitions`).

## 3. Pilot Evidence Bundle Schema (External Input Handoff)

Operations submits one JSON file (default path docs/04-uat/unattended-voice-pilot-evidence.json, or any path passed via `--evidence`) with this shape. This is a runtime operations artifact and is intentionally not checked into this repository:

```json
{
  "candidate_sha": "<40-hex candidate commit SHA>",
  "submitted_at": "<ISO-8601 timestamp, must be within --max-age-hours of now>",
  "dev_deploy": {
    "sha": "<40-hex, must equal candidate_sha>",
    "run_url": "https://.../deploy-dev/run/123"
  },
  "operational_acceptance": {
    "sha": "<40-hex, must equal candidate_sha>",
    "run_url": "https://.../operational-acceptance/run/123"
  },
  "pilot_operational_authorization": {
    "authorized": true,
    "approver": "<named approving role/person>",
    "approved_at": "<ISO-8601 timestamp>",
    "reference": "AUTH-UV-PILOT-<DESCRIPTOR>"
  },
  "enabled_scope": {
    "languages": ["zh-TW"],
    "routes": ["<enabled route/line ids>"],
    "model_profiles": ["twm_llm_twm"]
  },
  "ac_evidence": [
    {
      "ac_id": "UV-AC-032",
      "result": "pass",
      "mode": "fixture",
      "run_sha": "<40-hex, must equal candidate_sha>",
      "evidence_ref": "<pointer to the underlying eval/UAT artifact>"
    }
  ],
  "cohort": {
    "window_start": "<ISO-8601>",
    "window_end": "<ISO-8601>",
    "total_incoming_calls": 100,
    "per_language": {
      "zh-TW": { "total": 100, "human_exceptions": 4 }
    },
    "human_exception_count": 4,
    "human_exception_rate": 0.04
  },
  "language_route_model_profile_signoff": [
    {
      "language": "zh-TW",
      "route": "<route id>",
      "model_profile": "twm_llm_twm",
      "approver": "<named approver>",
      "approved_at": "<ISO-8601>"
    }
  ],
  "staffing_callback_drill_evidence": {
    "drill_date": "<ISO-8601>",
    "executor": "<named executor>",
    "scenario": "callback queue overflow",
    "outcome": "pass",
    "artifact_ref": "<pointer to drill record>"
  },
  "kill_switch_rollback_drill_evidence": {
    "drill_date": "<ISO-8601>",
    "executor": "<named executor>",
    "scenario": "kill-switch rollback",
    "outcome": "pass",
    "artifact_ref": "<pointer to drill record>"
  }
}
```

Known language enum (matches `operations/verification/unattended-voice-eval.mjs`): `zh-TW`, `nan-TW`, `hak-TW`, `en-mixed`.

`ac_id` values that must be covered are exactly the manifest's non-`pending` ACs — as of this writing: `UV-AC-015`, `UV-AC-016`, `UV-AC-017`, `UV-AC-018`, `UV-AC-028`, `UV-AC-031`, `UV-AC-032`, `UV-AC-033`, `UV-AC-034`, `UV-AC-038`, `UV-AC-039`, `UV-AC-044`. This set is read from the manifest at run time, not hardcoded, so it stays correct as ACs move between categories.

## 4. Execution Examples

Run the gate against a submitted evidence bundle (expected SHA defaults to `git rev-parse HEAD`):

```bash
node operations/verification/check-unattended-voice-pilot.mjs \
  --evidence docs/04-uat/unattended-voice-pilot-evidence.json \
  --output /tmp/unattended-voice-pilot-report.json
```

Pin an explicit candidate SHA (e.g. in CI where `HEAD` may be a merge commit different from the deployed candidate):

```bash
node operations/verification/check-unattended-voice-pilot.mjs \
  --evidence docs/04-uat/unattended-voice-pilot-evidence.json \
  --expected-sha "$CANDIDATE_SHA"
```

Before any real evidence has been submitted, the gate fails closed:

```text
$ node operations/verification/check-unattended-voice-pilot.mjs --evidence docs/04-uat/unattended-voice-pilot-evidence.json
...
Failures:
  [FAIL] EVIDENCE_NOT_FOUND:.../docs/04-uat/unattended-voice-pilot-evidence.json
[FAIL] Pilot acceptance gate rejected this evidence bundle.
```

Exit code is `0` only when every `required_acceptance` key is `true` and there are zero failures; otherwise it is `1`.

## 5. Behavioral Test Coverage

`tests/unit/unattended-voice-pilot/check-unattended-voice-pilot.test.ts` exercises the gate against a small fixture manifest (independent of the 48-AC production manifest, so tests stay stable as real ACs change category) and covers, among others:

- Full compliant bundle passes with all `required_acceptance` keys `true`.
- **Partial AC**: missing an applicable AC's evidence entry (`AC_MISSING`).
- **Wrong SHA**: mismatched `candidate_sha`, and a mismatched per-AC `run_sha` (`SHA_MISMATCH`, `AC_WRONG_SHA`).
- **Fixture-only claiming live pass**: a `live`-category AC submitted with `mode: "fixture"` (`AC_FIXTURE_ONLY_FOR_LIVE_CATEGORY`).
- **Full-cohort denominator**: per-language totals that don't sum to the reported cohort total, and an exception rate computed off a subset instead of the full cohort (`COHORT_DENOMINATOR_MISMATCH`, `COHORT_HUMAN_EXCEPTION_RATE_NOT_FULL_COHORT`).
- **Missing approval**: absent authorization object, and a bare authorization string (`AUTHORIZATION_MISSING`, `AUTHORIZATION_IS_BARE_STRING_NOT_STRUCTURED_APPROVAL`).
- **Missing drill evidence**: absent staffing/callback and kill-switch/rollback drill records, and a drill whose `outcome` did not pass.
- **Missing signoff**: an enabled language/model-profile with no matching sign-off entry.
- **Stale evidence**: `submitted_at` older than `--max-age-hours`.
- Fail-closed behavior when the evidence file is missing entirely.

Run with:

```bash
pnpm exec vitest run tests/unit/unattended-voice-pilot/
python3 operations/verification/check-unattended-voice-coverage.py
```

## 6. What Remains Pending

This producer only makes `UV-EXEC-029` *checkable*. It does not and cannot establish:

- A real PSTN pilot session or provider-side evidence.
- Operations' actual `pilot_operational_authorization`.
- A real `dev_deploy` or `operational_acceptance` CI run against a deployed candidate.
- Real cohort/exception-rate telemetry, language/route/model-profile sign-off, or staffing/kill-switch drills.

`UV-EXEC-029` stays `blocked` on those external artifacts regardless of this runner's status, per its `gate_reason` and `external_gate: true`.
