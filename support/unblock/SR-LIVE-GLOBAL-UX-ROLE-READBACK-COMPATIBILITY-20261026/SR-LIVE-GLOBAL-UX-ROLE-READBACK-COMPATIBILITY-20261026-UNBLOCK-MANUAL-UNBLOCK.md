# Unblock diagnosis — SR-LIVE-GLOBAL-UX-ROLE-READBACK-COMPATIBILITY-20261026

Task: `SR-LIVE-GLOBAL-UX-ROLE-READBACK-COMPATIBILITY-20261026-UNBLOCK-MANUAL-UNBLOCK`
Parent: `SR-LIVE-GLOBAL-UX-ROLE-READBACK-COMPATIBILITY-20261026` (owner Pi, reviewer Claude, status `blocked`)

## Diagnosis

The parent task has two `required_acceptance` keys:

1. `reviewed_existing_app_identity_readback_compatibility` — **satisfied**. Candidate
   `72887ae43b1bf13620cde116b2984c97b858d00f` (gen `5d85d79b786343ecb342ea29e85b0d4f`) was
   reviewed, CI green (run 40264424996 / 40264425198), and merged to `dev` as
   `d6181c81ef782c0191c5804e233d4befcfd47b2d` via PR #3035
   (https://github.com/ajoe734/drts-fleet-platform/pull/3035). `acceptance_evidence` on
   the parent task already records this with tree-equality verification against the
   merge commit.

2. `same_release_affected_role_readback_verified` — **not satisfied, and not satisfiable
   by any worker on this VM**. Per
   `docs/04-uat/system-remediation-20260906/SR-LIVE-GLOBAL-UX-20261007.md` (rows
   "same_release_affected_role_readback_verified" and the Operator execution contract,
   §"Supervisor／Operator 執行契約"), this key requires:
   - A real `GLOBAL_UX_SESSIONS_JSON` built from 5 actual affected app-role sessions
     (issuer, origin-bound session, tenant, subject, role, expiry) obtained from the
     **same release** running on the authorized shared dev environment (GCP Cloud Run,
     `drts-dev-devcc-20260825`).
   - The Operator to package that non-secret input (`plan.json`, `manual.json`,
     `artifacts/`) and dispatch `.github/workflows/live-global-ux-acceptance.yml` via
     `workflow_dispatch` against an immutable branch/tag whose resolved SHA equals the
     reviewed `harness_sha`.
   - The doc explicitly states: "沒有真實 secrets／sessions／hosted artifact；
     Source-only 不得採認" and "本 VM 禁止 browser／PG／service／deploy."

This matches the VM restriction in `AGENTS.md` (no dev servers, no browser/E2E runners,
no Docker Compose here) and the `project-live-acceptance-infrastructure` pattern already
seen on other SR-LIVE-* tasks: live acceptance keys need a deployed candidate SHA plus a
hosted GitHub Actions run with real credentials, which only the Operator (human user) can
authorize and supply.

## Conclusion

No task-scoped code change exists that can close this gap — the owner (Pi) and reviewer
(Claude) have already produced and merged everything that is reviewable from source. The
remaining blocker is a human-only action: the Operator must supply real same-release
5-role session evidence and dispatch the live acceptance workflow. This diagnosis note is
the only canonical change this unblock task makes.

## Next step for the parent task

Hand this to the Operator (user) with the concrete ask:
1. Confirm/export real sessions for the 5 affected app-roles from the live shared-dev
   release at `d6181c81ef782c0191c5804e233d4befcfd47b2d` (or whatever SHA is currently
   deployed) into `GLOBAL_UX_SESSIONS_JSON` per the format in
   `docs/04-uat/system-remediation-20260906/SR-LIVE-GLOBAL-UX-20261007.md`.
2. Dispatch `.github/workflows/live-global-ux-acceptance.yml` (`mode=package-input`) per
   the Operator contract in the same doc, pointing `harness_sha` at the reviewed/merged
   SHA.
3. Once the hosted run completes, record `same_release_affected_role_readback_verified`
   acceptance evidence with the run ID/provenance; the parent task can then move toward
   `done`.

No further worker dispatch against this parent will change the outcome until that human
action happens.
