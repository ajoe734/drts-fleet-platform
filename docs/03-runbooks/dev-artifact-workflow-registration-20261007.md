# Shared-dev artifact workflow registration bootstrap

Task: `SR-GCP-WORKFLOW-REGISTRATION-20261007`. This is a workflow-registration
repair, not a promotion of the product release or evidence of live storage/scanning.

## Observed deadlock

- Activation PR #2384 was independently reviewed at
  `60376bf155eb60c8e60d3bfa318629356d1d5533` and merged to dev as
  `0be15c0adfb6b228d92c18a3263b45b8086dcbb6`.
- Immutable `publish/v2026.10.07.0` points to
  `3ecd55d6cf18ec4bdc2d3c28c527d2b3d7555f1f`; dev integration run
  [37594150240](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37594150240)
  succeeded on that exact source.
- Deploy run
  [37602185882](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37602185882)
  failed operational acceptance. The successful-dev-deployment promotion gate
  remains mandatory; do not promote the whole failed snapshot to register a workflow.
- At `2026-10-07T10:31:30Z`, dispatch of
  `provision-dev-artifact-backends.yml` at the immutable publish ref returned
  `HTTP 404: workflow ... not found on the default branch`.

## Narrow repair and review

The bootstrap branch starts at main and copies only the **byte-identical**
already-reviewed provisioning workflow from the pinned source above, plus this
runbook and the bounded security prerequisite below. Opening its protected PR
does not execute provisioning. No product feature source, deployment gate, IAM
policy, default-branch setting or dashboard mirror is changed. Require exact-SHA
independent review and all normal main checks; never use an admin bypass or
force-push.

### Baseline dependency-security prerequisite

The first main-stage CI run #37608909117 failed the unchanged Dependency security
gate on advisory IDs 1241202 (`sprintf-js`), 1241209 (`source-map-js`), 1241210
(`proxy-addr`) and 1241339 (`@modelcontextprotocol/sdk`). The first three already
have reviewed repairs on dev via PR #2357. A fresh audit also confirms SDK 1.30.0
in **both** branches is affected by GHSA-6qxp-vccf-f47h (fixed in 1.31.0).

The explicitly scoped prerequisite adds only the three established override
repairs and an SDK 1.31.0 override, plus the affected lock graph. It does not
change direct workspace dependency declarations, security scripts, exceptions
or gate behavior. The fresh dev backport must retain the new SDK repair.
Offline regressions resolve the actual API → OpenClaw → GenAI SDK dependency:
bound credentials must not be sent to a foreign issuer in auth or direct token
exchange; an authorized exchange still succeeds and stamps the issuer. All
HTTP is in-memory mocked with synthetic credentials; these are library/code
regressions, not real MCP, Google login or application live acceptance.

A fresh review and CI are required for the updated source; the earlier
workflow-only source review does not approve this dependency change.

After main merge, verify the actual default-branch workflow blob and GitHub
workflow metadata. Then cherry-pick the bootstrap merge back to a fresh dev
branch as part of this same operation. The workflow already exists identically
on dev; the runbook is new backport content. Keep both published histories,
resolve only scoped identical-file additions, and submit the backport to dev
with a fresh immutable candidate, independent review and normal CI.

## Hosted execution after registration

1. Re-read live `DEV_GCP_*` variables. The verified target at preparation was
   `drts-dev-devcc-20260825 / us-central1`, not the suspended historical project.
2. Check deployment/live-run overlap before any resource or runtime change.
3. Dispatch the authorized provisioning workflow with an explicit full source
   SHA, for example the reviewed pinned snapshot:

   ```bash
   gh workflow run provision-dev-artifact-backends.yml \
     --ref publish/v2026.10.07.0 \
     -f source_ref=3ecd55d6cf18ec4bdc2d3c28c527d2b3d7555f1f
   ```

4. Read actual private bucket/IAM, scanner image provenance, genuine positive/
   negative scan/storage and cleanup evidence. Registration or workflow success
   alone is not proof that the application is using these backends.
5. Set only the verified provider repository variables required by the existing
   reviewed deploy workflow, then deploy an immutable reviewed source to shared
   Cloud Run and collect genuine runtime/readback and operational acceptance.
6. Only a successful exact-source dev deployment can unblock whole-snapshot
   promotion. No production deployment is authorized by this bootstrap.

The original activation, C125 upload, document and full-system acceptance gates
remain open until their own actual evidence is present. No VM product, browser
server, database, proxy or Compose infrastructure is permitted. Operator local
credential expiry does not imply GitHub WIF failure and is not permission for a
VM deployment workaround. Keep machine-specific receipts under `.local/` and
never put secret values, authentication tokens or mailbox contents in this file.
