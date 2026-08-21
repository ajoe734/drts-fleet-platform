# S1F-REL-FIN-GCP-001 Sidecar — GCP billing / Artifact Registry gate verification

Task ID: `S1F-REL-FIN-GCP-001`
Owner: `Claude2`
Reviewer: `Gemini2`
Branch: `claude2/s1f-rel-fin-gcp-001`
Mutates canonical: `false`
Helper kind: `verification_evidence_packet`
Primary evidence: `docs/04-uat/s1f-rel-fin-gcp-001-billing-artifact-registry-gate-evidence-20260821.md`
Source of task truth: `ai-status.json` task `S1F-REL-FIN-GCP-001`; GitHub Actions run `32444483620` and its four predecessors on `deploy-dev.yml`; repo variables read via `gh variable list`

This packet is a support artifact only. It performs read-only verification of
an external GCP gate; it does not change product code, GCP project
configuration, or dispatch any deploy.

---

## 1. Task posture

| Field | Value |
| --- | --- |
| GAP ref | `docs/02-architecture/s1f-release-finalization-gap-20260821.md` §`F3 Infrastructure readiness` |
| System design ref | `docs/02-architecture/s1f-release-finalization-system-design-20260821.md` §`Infrastructure lane` (`GCP-GATE`) |
| Execution ref | `docs/03-runbooks/s1f-release-finalization-execution-tasks-20260821.md` §`S1F-REL-FIN-GCP-001` |
| Required acceptance field | `gcp_billing_ready_evidence` |
| Depends on | none (independent root per system design dependency graph) |
| Blocks | `S1F-REL-FIN-DEP-001` (must not dispatch while this gate is non-complete) |

## 2. What was verified (read-only, no new deploy dispatched)

1. **Configured Dev project / region / registry** — read via `gh variable list`
   against `ajoe734/drts-fleet-platform`, cross-checked against the resolved
   step outputs of the `Prepare dev deploy` job in the latest `Deploy — Dev`
   run. Recorded in full in the primary evidence doc §1.
2. **No legacy project fallback** — `grep -n "LEGACY" .github/workflows/deploy-dev.yml`
   confirms the `LEGACY_GCP_*` variables are declared but never consumed by
   the project/region/registry resolution logic. Recorded in the primary
   evidence doc §2.
3. **Billing / Artifact Registry readiness** — read via `gh run list
   --workflow=deploy-dev.yml` and `gh run view --job <id> --log` against the
   `Build & push images` job of the five most recent runs (2026-08-17 through
   2026-08-21). Every run fails identically at Artifact Registry push with a
   GCP-issued "billing must be enabled on project #952590575714" error.
   Recorded in the primary evidence doc §3.

Local `gcloud` credentials in this worker sandbox are stale
(`gcloud auth list` shows accounts but `gcloud projects describe` fails with
`Reauthentication failed. cannot prompt during non-interactive execution.`),
so no direct Cloud Billing API read was possible from this session. The GCP
error surfaced inside the real Workload-Identity-authenticated `Deploy — Dev`
job is used instead, and is authoritative for the actual deploy-time identity
and project binding.

## 3. Verdict

`GCP-GATE` = **CLOSED / non-complete**. Cloud Billing is not enabled on Dev
project `drts-dev-ray-tw-20260730` (project number `952590575714`), so
Artifact Registry push (and therefore the rest of `Deploy — Dev`) cannot
proceed. This has held identically across five consecutive nightly deploy
attempts (2026-08-17 to 2026-08-21).

Exact remediation (external, not actionable from this repo or worker
session): a GCP project owner with Billing Account Administrator access must
enable Cloud Billing for project `952590575714` at
`https://console.developers.google.com/billing/enable?project=952590575714`.

## 4. Acceptance mapping

- "Configured Dev project, region, and registry are recorded" — primary
  evidence doc §1.
- "Billing and Artifact Registry readiness are verified" — primary evidence
  doc §3 (verified as **not ready**, with the exact provider error).
- "A closed gate remains non-complete with exact remediation evidence" — §3
  above and primary evidence doc §4; this task is not marked `done`.
- "No legacy project fallback is introduced" — primary evidence doc §2; none
  exists in `deploy-dev.yml` and none was added.

## 5. Explicit non-claims

- This packet does not claim billing is enabled. It is not.
- This packet does not claim `Deploy — Dev` succeeded. It has not, in any of
  the last five nightly attempts.
- This packet does not dispatch a new `Deploy — Dev` run to re-check the
  gate; per the system design's failure behaviour, deploy-denied billing
  gates must not be repeatedly retried from automation.
- `S1F-REL-FIN-DEP-001` remains correctly blocked until a project owner
  enables billing and this gate is re-verified (read-only) as open.
