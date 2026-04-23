# SD-DP-20260422-002 Identity Cutover Topology

## Decision Record

- `decision_id`: `SD-DP-20260422-002`
- `title`: `Staged Cloud IAP / OIDC cutover topology for GAP-P2S3-001`
- `owner`: `Human / system-design via accepted 2026-04-22 review`
- `date`: `2026-04-22`
- `status`: `accepted`
- `affected_docs`:
  - `docs/03-runbooks/gap-p2s3-001-cloud-iap-checklist.md`
  - `docs/03-runbooks/master-system-closeout-checklist.md`
  - `docs/03-runbooks/execution-next-wave-task-board.md`
  - `PHASE1_OPEN_QUESTIONS.md`
- `old_wording_or_conflicting_anchor`:
  - `PHASE1_OPEN_QUESTIONS.md` `Q-011`
  - earlier binary framing of `drts-api` first vs. all web surfaces in one wave
- `superseding_decision`:
  - `GAP-P2S3-001` follows a staged identity topology, not a one-wave universal IAP boundary.
  - Stage 0: API token-verification readiness only.
  - Stage 1: internal control-plane API protection first (`/api/admin/*`, `/api/ops/*`, `/api/roc/*` and tightly related control-plane callers).
  - Stage 2: internal control-plane web surfaces (`platform-admin-web`, `ops-console-web`).
  - Stage 3: tenant portal remains application-auth-first and is not a default IAP target.
  - Stage 4: driver app, partner adapters, and webhook callbacks must not depend on Cloud IAP.
- `scope`:
  - `GAP-P2S3-001` rollout planning
  - auth / deploy / smoke / CI documentation
  - caller-type boundary assumptions
- `out_of_scope`:
  - direct L1 product-truth edits in this change
  - forcing tenant / driver / adapter callers into the same IAP boundary
- `implementation_implications`:
  - auth code must stay realm-aware by caller type
  - deploy / smoke / CI should prove internal control-plane protection without breaking tenant / driver / webhook flows
  - GitHub Actions should use WIF for the protected internal verification path
- `migration_tasks`:
  - update the IAP unblock checklist to describe the staged rollout
  - keep tenant / driver / partner / webhook auth on their own non-IAP boundaries
  - add or preserve caller-type verification coverage
- `completion_bar`:
  - internal control-plane APIs can be protected without breaking tenant, driver, partner, or webhook flows
  - internal web surfaces can move behind IAP after the control-plane API path is proven
  - tenant portal and driver app remain app-auth-first
- `rollback_or_revisit_conditions`:
  - a later system-design revision chooses a different ingress topology
  - platform identity boundaries materially change for tenant or driver surfaces
- `approval`:
  - accepted for implementation-blueprint use after the 2026-04-22 human instruction to review the decision feedback and integrate it if there were no objections

## References

- Source synthesis:
  - `docs/02-architecture/phase1_system_design_decision_packet_for_dev_team_20260422.md`
- Active blocker:
  - `docs/03-runbooks/gap-p2s3-001-cloud-iap-checklist.md`
