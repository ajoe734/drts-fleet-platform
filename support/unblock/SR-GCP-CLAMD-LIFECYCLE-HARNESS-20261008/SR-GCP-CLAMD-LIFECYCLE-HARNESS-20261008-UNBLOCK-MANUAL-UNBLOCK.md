# SR-GCP-CLAMD-LIFECYCLE-HARNESS-20261008-UNBLOCK-MANUAL-UNBLOCK

## Diagnosis
The parent task `SR-GCP-CLAMD-LIFECYCLE-HARNESS-20261008` is blocked awaiting manual acceptance from the Operator. The final outstanding check `genuine_lifecycle_hosted_original_controls_zero_skips` must be run by the Operator in an isolated hosted environment, as running product development or docker infrastructure is restricted on the local VM. 

## 0.7 Acceptance / Evidence Mapping

| Finding / 驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| :--- | :--- | :--- | :--- | :--- |
| Diagnose why the dependency-ready parent remains blocked | `.github/workflows/provision-dev-artifact-backends.yml` (lines 4-9, 30-47, 204-209) requires immutable source_ref and provides CLAMD_IMAGE/GATEWAY_IMAGE to `tests/unit/gcp-artifact-activation-20261004/test_genuine_clamd_lifecycle.py` | Diagnosed that hosted controls are unrun and require an immutable reviewed/merged source SHA (cannot be replaced by registry provenance or ordinary CI success). | Verified parent state: candidate `65d4285d4930f3625d4b8c3f4af4f5b1dd94f392`, merge `504550cb27a5c0c14e0304b88c95b1ad9cc6efac` and CI job [113286568591](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37769703257/job/113286568591). Helper candidates: old `3d95b51a8c35df6cb1e050d132eda5b2c7be3f1e`, current `51581a61c1d32b0b8bc4eb5fb7da563ff76b4645`. | Hosted acceptance is unrun. The operator must run the existing hosted route retaining all original controls with zero skips. |
| Make only the task-scoped change needed to unblock or document the remaining blocker | `support/unblock/SR-GCP-CLAMD-LIFECYCLE-HARNESS-20261008/SR-GCP-CLAMD-LIFECYCLE-HARNESS-20261008-UNBLOCK-MANUAL-UNBLOCK.md` | Documented existing hosted entrypoint and evidence requirement. | N/A (Documentation only change) | None |
| Produce task-scoped commit/push/PR evidence for any canonical change | PR #2443 targeting `dev` branch | Corrected PR scope from `main` to `dev` | PR #2443 | None |
| Update the parent task with the concrete unblocked next step | Supervisor AI status metadata (`resolved_parent_status`) | `resolved_parent_status=blocked` and waiting for Operator | Updated via canonical metadata coordination using Supervisor | None |

## Next Steps
The Operator must:
1. Provide the immutable reviewed/merged source SHA to the existing hosted route: `.github/workflows/provision-dev-artifact-backends.yml`.
2. Ensure the workflow runs `tests/unit/gcp-artifact-activation-20261004/test_genuine_clamd_lifecycle.py` with `CLAMD_IMAGE` and `GATEWAY_IMAGE` environments so that all three genuine controls (lines 513, 866, 1282) and three framing controls (1587, 1606, 1619) execute with zero skips.
3. Verify UAT F2 requirements: main/daily/bytecode availability, signatures/readability, old<new and compatibility evidence.
4. Return the hosted evidence (source SHA, run URL, job ID, log snippet, and seed validation procedure) to the authorized owner/Supervisor.
5. The owner/Supervisor will then validate this state handoff and perform the evidence-preserving reconciliation into acceptance, before officially calling `record-acceptance`. (Note: The Operator must not directly patch status or impersonate another actor to call `record-acceptance`.)
