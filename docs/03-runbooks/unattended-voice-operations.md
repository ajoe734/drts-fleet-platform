# Unattended Voice Pilot Operations Runbook (小量營運開通操作手冊)

- Task: `UV-EXEC-029-PILOT-RUNNER` (gate) / `UV-EXEC-029` (pilot operational acceptance)
- Planning Reference: `docs/02-architecture/phase1-unattended-voice-booking-sa-20260906.md`
- Execution Runbook: `docs/03-runbooks/unattended-voice-booking-execution-tasks-20260906.md`
- Alert/Incident Runbook: `docs/03-runbooks/voice-alert-response.md`
- Acceptance Gate Doc: `docs/04-uat/unattended-voice-pilot-acceptance.md`
- Gate Script: `operations/verification/check-unattended-voice-pilot.mjs`
- Evaluation Harness: `operations/verification/unattended-voice-eval.mjs`
- Coverage Check: `operations/verification/check-unattended-voice-coverage.py`

---

## 1. Overview & Operating Principles

This runbook tells operations how to submit pilot evidence and run the executable acceptance gate before `UV-EXEC-029` (small-scale pilot operational activation) can be closed. It does not itself grant activation.

1. **Fail-closed by default.** The gate (`check-unattended-voice-pilot.mjs`) rejects any evidence bundle that is missing, incomplete, stale, fixture-only where live is required, or internally inconsistent (wrong SHA, denominator mismatch). Treat any `[FAIL]` line as a hard stop, not an advisory.
2. **Same-SHA discipline.** `candidate_sha`, `dev_deploy.sha`, `operational_acceptance.sha`, and every `ac_evidence[*].run_sha` must all reference the exact commit that is both deployed to dev and evaluated. Never patch the evidence bundle to reference a newer/older SHA than what was actually run — resubmit against the actual deployed SHA instead.
3. **No live traffic from this gate.** The gate and its script never call telephony providers, never enable pilot routing, and never flip feature flags. Enabling live PSTN pilot traffic is a separate, explicitly authorized operational action outside this runner's scope (see `docs/04-uat/unattended-voice-live-telephony-evidence.md` and `docs/04-uat/unattended-voice-external-readiness.md` for the underlying provider/authorization state).
4. **Structured approvals only.** Do not record authorization or drills as free-text strings. Every approval/drill field requires a named approver/executor, a timestamp, an outcome, and an artifact reference (see schema in `docs/04-uat/unattended-voice-pilot-acceptance.md` §3).

## 2. Submission Procedure

1. Confirm the candidate SHA that is both deployed to dev and used for the operational acceptance run:
   ```bash
   CANDIDATE_SHA=$(git rev-parse HEAD)
   ```
2. Assemble the pilot evidence bundle per the schema in `docs/04-uat/unattended-voice-pilot-acceptance.md` §3, using real values only:
   - `ac_evidence` for every non-`pending` AC in `docs/04-uat/unattended-voice-acceptance-manifest.json` (query current applicable IDs with the snippet in §4 below).
   - `cohort` figures computed against the **full** incoming-call cohort for the pilot window, not a filtered or successful-only subset.
   - `language_route_model_profile_signoff` for every language/model-profile actually enabled during the pilot.
   - `staffing_callback_drill_evidence` and `kill_switch_rollback_drill_evidence` from drills that were actually executed (see §3).
3. Save the bundle (default expected path docs/04-uat/unattended-voice-pilot-evidence.json, or any path passed via `--evidence`). This is a runtime operations artifact, not a repo-tracked file — do not check in a fixture/placeholder version, which is why that path is intentionally absent from this repository.
4. Run the gate:
   ```bash
   node operations/verification/check-unattended-voice-pilot.mjs \
     --evidence docs/04-uat/unattended-voice-pilot-evidence.json \
     --expected-sha "$CANDIDATE_SHA" \
     --output /tmp/unattended-voice-pilot-report.json
   ```
5. If the gate exits non-zero, fix the specific `[FAIL]` items listed (do not resubmit unchanged evidence). If it exits `0`, attach `/tmp/unattended-voice-pilot-report.json` and the evidence bundle to the `UV-EXEC-029` handoff so the reviewer can independently re-run the same command against the same SHA.

## 3. Drill Cadence & Evidence

- **Staffing / callback drill**: exercises the human-exception and callback queue path (queue owner reachable, SLA met, no dropped callers) under simulated overflow. Record `drill_date`, `executor`, `scenario`, `outcome`, and `artifact_ref` (link to the drill log/recording).
- **Kill-switch / rollback drill**: exercises disabling autonomous booking for a scope (language/profile/brand) per `docs/03-runbooks/voice-alert-response.md` and confirms in-flight sessions fall back safely with no duplicate bookings. Record the same fields.
- Drills older than `--max-drill-age-hours` (default 720h / 30 days) are treated as stale by the gate and must be re-run before submission.
- Do not reuse a drill record across pilot windows without re-running it — each `UV-EXEC-029` submission needs drill evidence current enough to reflect the on-call rotation and kill-switch configuration in force during that pilot window.

## 4. Determining the Current Applicable AC Set

The set of ACs the gate requires evidence for is derived live from the manifest, not hardcoded. To list it before assembling evidence:

```bash
python3 - <<'PY'
import json
m = json.load(open('docs/04-uat/unattended-voice-acceptance-manifest.json'))
applicable = [ac['ac_id'] for ac in m['acceptance_criteria'] if ac['status_category'] != 'pending']
print(sorted(applicable))
PY
```

Cross-check with `python3 operations/verification/check-unattended-voice-coverage.py`, which validates the manifest's own structural integrity (48 ACs, 32 FRs, status-category segregation) independently of pilot evidence.

## 5. Review Handoff

Reviewers re-run the identical gate command against the same `--evidence` file and `--expected-sha` recorded in the `UV-EXEC-029` handoff. Do not approve based on the submitted report JSON alone — re-execute the gate locally, since the report is only as trustworthy as the bundle it was generated from. A passing gate establishes that the submitted evidence is internally complete, consistent, and SHA-matched; it does not, by itself, verify that the underlying provider/PSTN session actually occurred as described. Cross-reference `docs/04-uat/unattended-voice-live-telephony-evidence.md` for the live-mode fail-closed behavior the evaluation harness enforces during actual pilot runs.

## 6. Escalation

If the gate repeatedly fails on `all_applicable_ac_evidence` because an AC's implementation is not actually ready, do not weaken the evidence to force a pass — file the gap against the AC's `primary_task_id` in the manifest and keep `UV-EXEC-029` blocked. If a drill fails (`outcome != "pass"`), treat it as a real operational readiness gap and route to Ops On-Call per `docs/03-runbooks/voice-alert-response.md`, not as a documentation fix.
