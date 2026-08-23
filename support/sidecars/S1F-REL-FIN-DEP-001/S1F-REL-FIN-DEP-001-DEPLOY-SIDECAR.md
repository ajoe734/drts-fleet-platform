# S1F-REL-FIN-DEP-001 Sidecar — Stage 1 Dev Deployment Evidence & Verification Pack

Task ID: `S1F-REL-FIN-DEP-001`
Owner: `Gemini2`
Reviewer: `Claude`
Branch: `gemini2/s1f-rel-fin-dep-001`
Mutates canonical: `true`
Helper kind: `verification_evidence_packet`
Primary evidence: `docs/04-uat/s1f-rel-fin-dep-001-dev-deploy-execution-analysis-20260821.md`
Candidate lock: `S1F-REL-FIN-PRE-001` (`4012b10c0cd4990bd238eaed6ddc23252bc0c8d4`)
GCP gate evidence: `support/unblock/S1F-REL-FIN-DEP-001/S1F-REL-FIN-DEP-001-UNBLOCK-MANUAL-UNBLOCK.md`
Unblock decision: `support/unblock/S1F-REL-FIN-DEP-001/S1F-REL-FIN-DEP-001-UNBLOCK-PLANNING-DECISION.md`

---

## 1. Task Context & Verification Summary

| Field | Value |
| :--- | :--- |
| **GAP Reference** | `docs/02-architecture/s1f-release-finalization-gap-20260821.md` §`F4 Dev deployment` |
| **System Design Reference** | `docs/02-architecture/s1f-release-finalization-system-design-20260821.md` §`Deployment lane` |
| **Execution Runbook** | `docs/03-runbooks/s1f-release-finalization-execution-tasks-20260821.md` §`S1F-REL-FIN-DEP-001` |
| **Locked Candidate SHA** | `4012b10c0cd4990bd238eaed6ddc23252bc0c8d4` (PR #1451 merge commit) |
| **Deployed Workflow Ref** | `eef4d5ff8a7fadd8143740055a185d80b042b582` (Lineage ancestor verified) |
| **Workflow Run URL** | [https://github.com/ajoe734/drts-fleet-platform/actions/runs/32615726461](https://github.com/ajoe734/drts-fleet-platform/actions/runs/32615726461) |
| **Workflow Status** | `completed` / `success` |
| **Upstream Dependencies** | `S1F-REL-FIN-PRE-001` (done), `S1F-REL-FIN-GCP-001` (done / gate open via unblock decision) |
| **Downstream Tasks** | `S1F-REL-FIN-UAT-001` (Wave C), `S1F-REL-FIN-CLOSE-001` (Wave D) |
| **Current Task State** | `dev_deployed` / `ready_for_review` |

---

## 2. Dev Deployment Evidence Parameters

- **`dev_deploy_run_url`**: `https://github.com/ajoe734/drts-fleet-platform/actions/runs/32615726461`
- **`dev_deploy_sha`**: `eef4d5ff8a7fadd8143740055a185d80b042b582`
- **`dev_service_urls`**: `https://drts-dev-api-4t7rg6fmeq-uc.a.run.app,https://drts-dev-platform-admin-web-4t7rg6fmeq-uc.a.run.app,https://drts-dev-ops-console-web-4t7rg6fmeq-uc.a.run.app,https://drts-dev-fleet-partner-portal-web-4t7rg6fmeq-uc.a.run.app,https://drts-dev-tenant-console-web-4t7rg6fmeq-uc.a.run.app,https://drts-dev-bank-console-web-4t7rg6fmeq-uc.a.run.app,https://drts-dev-referral-embed-web-4t7rg6fmeq-uc.a.run.app/embed/yuhe-residence,https://drts-dev-enterprise-dispatch-web-4t7rg6fmeq-uc.a.run.app,https://drts-channel-partner-portal-web-4t7rg6fmeq-uc.a.run.app`

