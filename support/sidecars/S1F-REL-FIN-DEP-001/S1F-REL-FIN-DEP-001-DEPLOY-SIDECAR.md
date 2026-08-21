# S1F-REL-FIN-DEP-001 Sidecar — Stage 1 Dev Deployment & Gate Blocker Tracking

Task ID: `S1F-REL-FIN-DEP-001`
Owner: `Gemini2`
Reviewer: `Claude`
Branch: `gemini2/s1f-rel-fin-dep-001`
Mutates canonical: `true`
Helper kind: `verification_evidence_packet`
Primary evidence: `docs/04-uat/s1f-rel-fin-dep-001-dev-deploy-execution-analysis-20260821.md`
Candidate lock: `docs/04-uat/s1f-rel-fin-pre-001-candidate-lock-20260821.json`
GCP gate evidence: `docs/04-uat/s1f-rel-fin-gcp-001-billing-artifact-registry-gate-evidence-20260821.md`

---

## 1. Task Context & Posture

| Field | Value |
| :--- | :--- |
| **GAP Reference** | `docs/02-architecture/s1f-release-finalization-gap-20260821.md` §`F4 Dev deployment` |
| **System Design Reference** | `docs/02-architecture/s1f-release-finalization-system-design-20260821.md` §`Deployment lane` |
| **Execution Runbook** | `docs/03-runbooks/s1f-release-finalization-execution-tasks-20260821.md` §`S1F-REL-FIN-DEP-001` |
| **Locked Candidate SHA** | `4012b10c0cd4990bd238eaed6ddc23252bc0c8d4` (PR #1451 merge commit) |
| **Upstream Dependencies** | `S1F-REL-FIN-PRE-001` (done), `S1F-REL-FIN-GCP-001` (done / closed gate) |
| **Downstream Tasks** | `S1F-REL-FIN-UAT-001` (Wave C) |
| **Current Task State** | `blocked` (External Cloud Billing gate closed on GCP Project #952590575714) |

---

## 2. Gate Status Summary

1. **Candidate Verification (`S1F-REL-FIN-PRE-001`):** Complete.
   - Candidate `4012b10c0cd4990bd238eaed6ddc23252bc0c8d4` is verified green in CI (PR CI run `31997270480`, trunk CI run `31997773400`).
   - Workflow `.github/workflows/deploy-dev.yml` syntax and operational manifests validate.
2. **Infrastructure Gate (`S1F-REL-FIN-GCP-001`):** CLOSED / non-complete.
   - Project `drts-dev-ray-tw-20260730` (number `952590575714`) has `billingEnabled: false`.
   - Artifact Registry push fails across all recent deploy attempts (`31992102746` through `32444483620`).
3. **Deployment Lane (`S1F-REL-FIN-DEP-001`):** BLOCKED by external gate.
   - Per system design rules, automatic retries are disallowed while the gate is closed.
   - Deploy dispatch is held pending external billing activation.

---

## 3. Post-Remediation Execution Command

When Cloud Billing is enabled at `https://console.developers.google.com/billing/enable?project=952590575714`, the deployment is dispatched via:

```bash
gh workflow run deploy-dev.yml \
  --ref=dev \
  -f source_ref=4012b10c0cd4990bd238eaed6ddc23252bc0c8d4 \
  -f target_profile=current \
  -f skip_migration=false
```
