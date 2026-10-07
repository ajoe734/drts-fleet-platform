# DOC-LIVE-RUNNER-UPGRADE-20261005: remaining acceptance blocker

Task: `DOC-LIVE-RUNNER-UPGRADE-20261005-UNBLOCK-MANUAL-UNBLOCK`

Owner: Codex; reviewer: Codex2; diagnosis: 2026-10-07 UTC.

## Disposition

**Keep the parent blocked.** Dependencies are empty because the remaining gate
is external acceptance, not unfinished prerequisite implementation. The runner
upgrade is merged; its green validation run explicitly skipped all five live
cases. This report documents the remaining blocker, not successful live acceptance.

This is a scoped supplement to the original
[runner UAT and finding history](../../../docs/04-uat/system-remediation-20260906/live-document-acceptance-runner.md).
No runner, authentication policy, CI gate, or historical finding is changed.
The previous scope finding on `edd95d3e9cca078f64cae4a88a9fcb899aa14d9b`
was approved as resolved on `992975969b8e32c402d9a776ee7b090c20724a82`;
this helper does not reopen that implementation or claim new regression results.

## Verified evidence

- Parent candidate: `992975969b8e32c402d9a776ee7b090c20724a82`, branch
  `gemini2/doc-live-runner-upgrade-20261005-r3`.
- [PR #2382](https://github.com/ajoe734/drts-fleet-platform/pull/2382)
  is MERGED as `8c93658f4b38d1754c3f04b0872728a153f13f3d`.
  The parent task records Codex approval and matching successful CI. The older
  `branch` field still mentions `-r2`; candidate/PR evidence identifies `-r3`.
- Same-candidate [CI](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37558971494)
  and [integration CI](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37558971498)
  checks completed successfully (the unrelated orchestrator-tests job skipped).
- [Runner run 37558966738](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37558966738)
  was a **push** run at that candidate. Its completed log says
  `52 passed | 5 skipped (57)` and
  `Run status recorded: passed (mode=runner_validation)`.
  Neither merge SHA nor this result proves deployment or live access.
- `gh secret list --json name,updatedAt` succeeded. Repository secret names
  include `DEV_WIF_PROVIDER` and `DEV_WIF_SERVICE_ACCOUNT`, but none of the
  live session/public-key names below. No secret values were read.
- `gh variable list` confirms `DEV_GCP_PROJECT_ID=drts-dev-devcc-20260825`
  and `DEV_GCP_REGION=us-central1`. These are configuration evidence only;
  current deployed origins/revisions and IAM permissions remain unverified.
- The repository owner type is `User`. The organization-secret endpoint returned
  HTTP 422; this is not a successful organization-secret inventory. The runner
  job has no `environment:` binding, so merely populating environment-only
  secrets would not satisfy its current secret references.

Machine-specific read-only snapshots are under `.local/doc-live-runner-unblock/`
in the assigned worker worktree; durable findings and GitHub references are here.

## Exact remaining inputs and authority boundary

The workflow `.github/workflows/live-document-acceptance.yml` and the actual
live callbacks in
`tests/e2e/system-remediation/sr-live-doc-001/live-document-acceptance.test.ts`
are the authority for the following list.

| Input / boundary | Observed state and required next step |
| --- | --- |
| `SR_LIVE_DOC_LIVE_SESSION_COOKIE` | Absent from repository secret names; provision a genuine authorized bank export session. |
| `SR_LIVE_DOC_LIVE_SESSION_COOKIE_BANK_OPS_VIEWER` | Absent; provision a genuine authenticated viewer session so denial proves role restriction, not anonymous rejection. |
| `SR_LIVE_DOC_LIVE_SESSION_COOKIE_TENANT` | Absent; provision a genuine tenant billing session for invoice expiry/reissue/download. |
| `SR_LIVE_DOC_LIVE_SESSION_COOKIE_CROSS_TENANT` | Absent; provision a different authorized tenant identity for negative access evidence. |
| `SR_LIVE_DOC_LIVE_PUBLIC_KEY_PEM` | Absent; provide the authorized public key matching the real statement signer. `UNSIGNED` is not passing evidence. |
| Four deployed origins and immutable SHA | Operator must supply bank, API, tenant-console and platform-admin origins and verify the responding deployment SHA. Do not substitute the merge SHA without deployment evidence. |
| Authorized fixtures | Supply bank code/statement path, an actually expired invoice link and expired placard link with manifest metadata, and completed report artifact path matching authoritative job metadata. The current callbacks derive invoice reissue/cross-tenant operations from the expired invoice; extra workflow input names alone are not evidence of fixture readiness. |
| Platform IAP authority | Unverified, and not solved by populating cookies alone; see below. |

The live preflight (lines 666–717) checks four session cookies and required
origins/paths. The public-key workflow step fails before tests if live execution
is requested without the key. Missing `live_target_origin` instead selects
runner-validation mode, which intentionally allows the five skipped live cases.

The placard/report callback (lines 979–1012) constructs `platformHeaders` with
only `Authorization: Bearer <platform ID token>`. Its first request is
`/control-plane-proxy/platform-admin/placards`; 401/403 throws
`IAP authority missing for runner on platform admin ingress`.
`getGoogleIdToken` in `live-document-runner.ts` selects a token minted for the
configured service origin. The real proxy's `applyUpstreamAuth` in
`apps/platform-admin-web/app/control-plane-proxy/[...path]/route.ts` calls
`issueControlPlaneRequestAuth` with strict IAP configuration. Cloud Run
admission alone does not establish that application's IAP authority.

The workflow also exposes `SR_LIVE_DOC_LIVE_SESSION_COOKIE_PLATFORM_ADMIN`,
absent from repository secret names, but the placard/report callback does not
consume it. Do not advertise adding that secret as an IAP repair. An operator
must demonstrate a supported ingress that supplies valid IAP authority with
the actual runner request. If the configured token/audience/request cannot
support it, Supervisor must reconcile a focused owner repair and fresh review;
do not inject identities, disable strict IAP, or fabricate assertion headers.
This is static evidence plus an unverified external boundary, not a live 403
reproduction. No additional product edits are authorized by this helper scope.

## Parent update and merge safety

The release CLI rejected an attempted parent `note` with exit 1:
`Dispatched worker cannot mutate a different task`.
The owner dispatch is scoped to this helper. Its guard also excludes `assign`,
the CLI command that accepts `TASK_METADATA_JSON`; `handoff` does not persist
that metadata. Do not clear dispatch environment variables or impersonate
Supervisor to bypass this boundary.

**Before approving/merging this helper**, Supervisor must use the active release
CLI from its authorized operator context to persist these helper fields (via
`assign` retaining Codex/Codex2), and write the corresponding parent `note`:

```json
{
  "resolved_parent_status": "blocked",
  "resolved_parent_waiting_for": "Codex",
  "resolved_parent_next": "Runner implementation is merged (PR #2382, candidate 992975969b8e32c402d9a776ee7b090c20724a82); run 37558966738 is runner_validation with 52 passed and 5 live skipped. Obtain genuine bank export/viewer and tenant/cross-tenant sessions, authorized signing public key, deployed origins/SHA and expired invoice/placard plus report/statement fixtures; verify supported platform IAP ingress. Operator must resolve provisioning and authorize hosted live execution before acceptance can advance. See support/unblock/DOC-LIVE-RUNNER-UPGRADE-20261005/DOC-LIVE-RUNNER-UPGRADE-20261005-UNBLOCK-MANUAL-UNBLOCK.md. Keep parent blocked; do not resume implementation solely because this helper merges."
}
```

`Codex` retains the existing coordination lane, not a claim that it can mint
human sessions or authorize an external run. Preserve the parent's existing
candidate/review/CI/merge evidence. Do not set `resolved_parent_at` manually:
the merge transaction owns that timestamp. Without the explicit blocked
disposition, `apply_unblock_parent_resolution` defaults to `todo`, falsely
resuming a parent whose live gate remains unsatisfied. A prose handoff alone
does not prevent that default. Reviewer must confirm metadata before approval.

After provisioning and any scoped IAP repair, an authorized operator can supply
the immutable deployed source and run the existing hosted acceptance workflow
under separate authorization. This task explicitly prohibits dispatching
workflows or creating resources. Read the completed evidence in
`live_acceptance` mode, with no skipped live cases, and map each required key
through the existing acceptance lifecycle. Do not use local services, browsers,
Docker or a `done` command as a substitute.

## Acceptance and verification mapping

| Finding / acceptance | Source and result | Command / evidence | Remaining limit |
| --- | --- | --- | --- |
| Diagnose dependency-ready blocker | Merged implementation; missing external live evidence identified above | Release CLI `show` filtered to parent fields; `gh pr view 2382` and `gh run view 37558966738 --log`, exit 0 | No live environment probe |
| Task-scoped resolution or remaining-blocker report | This artifact only; original UAT/history retained | Content/reference review; no behavior changed, so old/new runtime reproduction is not applicable | Parent remains blocked |
| Commit/push/PR evidence | Task branch and exact report candidate supplied in handoff | Local/remote/PR head must match before handoff | Review/CI/merge belong to candidate lifecycle |
| Update parent next step | Exact next step and blocked disposition prepared above | Parent `note` denied, exit 1, by dispatch guard | Supervisor must persist parent note and helper metadata before approval/merge |
| WIF token and deployed SHA | Workflow token minting and response SHA guards present | Source inspection; same-candidate hosted runner result read | Real WIF admission/deployment match unverified |
| Invoice, placard, report, bank signature and role negatives | Live callbacks exist; five live tests skipped | Hosted 52 pass / 5 skip result, exit 0 | Genuine sessions, fixtures, IAP ingress and signed artifact still needed |
| Missing evidence fails closed | Live preflight and public-key check inspected | Static source review; previous hosted unit evidence retained | No new live missing-input execution claimed |
| Same-candidate CI and independent review | Parent candidate has Codex approval and successful CI/merged PR | Parent machine truth plus GitHub checks read, exit 0 | Helper requires its own Codex2 review |

No tests that start listeners were run on this VM. No workflow was manually
dispatched, no secrets/resources were created, and no acceptance key was marked
passed by this helper.

Local documentation checks: `git diff --check` passed. Prettier was attempted
but could not execute (`MODULE_NOT_FOUND` for `prettier/bin/prettier.cjs`,
Node v22.23.2, exit 1); this is a tooling limitation, not a formatting pass.
The final trailer check and exact local/remote/PR SHA comparison are recorded
in the candidate handoff. No product unit tests are needed for this report-only
change; historical runner results above retain their original candidate SHA.
