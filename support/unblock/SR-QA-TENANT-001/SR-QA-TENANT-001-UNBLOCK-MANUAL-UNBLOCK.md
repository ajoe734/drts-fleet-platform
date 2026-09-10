# SR-QA-TENANT-001-UNBLOCK-MANUAL-UNBLOCK

2026-09-08 · Owner Codex2 · Reviewer Codex

## Diagnosis

The parent is dependency-ready but still blocked on provisioned tenant UAT access. This is a remaining environment prerequisite, not evidence of a product regression or a stale dependency status. This helper documents the blocker; it does not claim live acceptance or provide credentials.

Inspected base after `git fetch origin` and `git rebase origin/dev` (both exit 0): `5cff9b36082998a0295f2550039306dc1f84c3d2`.

Canonical `ai-status.sh show` reports all four dependencies done. Each recorded merge is reachable from that base (`git merge-base --is-ancestor <merge> origin/dev`, each exit 0):

| Dependency | Recorded merge |
| --- | --- |
| SR-UAT-HARNESS-001 | `1106728a6b5313a552757f745ec96c2be77a29e2` |
| SR-TENANT-LOGIN-001 | `3b60a3757238663572f16f010c94f446f2c71eaa` |
| SR-MAIL-001 | `6f4ac8c74ae3618b6109efd010014365a85d36d8` |
| SR-MAIL-002 | `564e27f63045789537b54f5c0b5909f6468032ca` |

HARNESS and MAIL-002 retain recorded historical review/CI evidence gaps; reachability does not reconstruct those missing records.

The parent branch `origin/codex/sr-qa-tenant-001` is at `bee34ad806ca3f4376314ebc7ef257c93ae45954`. Its evidence document reports a run at `c67d8b1d12068171afe899c9816933111382bf26`: four task tests fail for missing API URL, four shared tests pass, zero HTTP calls/resources. These are previously recorded results, not a new execution by this helper. The task specs are not yet in this helper's dev base; no parent files were copied or rewritten.

## Why harness completion does not clear the blocker

- `tests/e2e/system-remediation/shared/namespace-manager.ts` creates UUID-based tenant representations and tracks resources in a Map; cleanup clears that Map. It neither provisions DB tenants nor issues bearer credentials.
- `role-personas.ts` supplies synthetic headers for local/sandbox and rejects that path for live use. These headers cannot replace the parent's required legitimate bearer identities.
- `docs/04-uat/system-remediation-20260906/SR-UAT-HARNESS-001.md` section 5 explicitly excludes real DB namespace operations.
- `docs/04-uat/system-remediation-20260906/SR-READINESS-001.md` explicitly lists DB tenant provisioning and real HTTP/IAP/mail among work not executed.
- Parent `directory.spec.ts` validates all six settings inside its evidence boundary before creating an API client; it requires distinct A/B tenants.

A value-free environment check in this assigned worker found all six names missing (command exit 0). No secret values were printed or searched from credential stores. This establishes absence from this worker environment, not absence from every deployment:

```text
DRTS_TENANT_UAT_API_URL: missing
DRTS_TENANT_UAT_TENANT_A: missing
DRTS_TENANT_UAT_TENANT_B: missing
DRTS_TENANT_UAT_TOKEN_A: missing
DRTS_TENANT_UAT_TOKEN_B: missing
DRTS_TENANT_UAT_TOKEN_READONLY: missing
```

## Concrete next step and release condition

Keep parent `blocked`, waiting for Gemini as already recorded. Supervisor/Gemini must coordinate a provisioner to supply an isolated local/sandbox API root including `/api`, two distinct disposable provisioned tenants, valid writable bearer identities for A/B, and a valid read-only A identity. Inject the six settings into the parent worker through the environment; record only nonsecret provenance, environment identity and credential expiry/refresh instructions. The provisioner must own teardown of the disposable tenants: harness Map cleanup does not delete DB resources.

Once provided, parent owner Codex resumes in its own task worktree, records the current base/test SHA and runs:

```bash
pnpm exec playwright test -c playwright.system-remediation.config.ts sr-qa-tenant-001
```

Read each tenant evidence attachment and retain actual exit code, HTTP statuses, same-ID write/readback and resource IDs. Shared harness passes do not count toward tenant acceptance. If access fails, retain the concrete environment blocker; if an authenticated request exposes a product defect, register a scoped repair task using canonical commands. Continue the outstanding users/invites/approvals/feature flags/lifecycle and other matrix cases, plus DB/mail/browser evidence, before parent handoff. Merely supplying settings does not complete that matrix.

## Lifecycle and verification boundary

Only this support artifact changes. No product, auth, shared harness, test configuration, or dependency status changes are needed for this diagnosis. Validation consists of dependency slices, merge reachability, source inspection, value-free environment presence inspection and `git diff --check`; live tests were not rerun without access. Candidate SHA and PR URL are recorded by this helper's canonical handoff after commit and normal push.

Reviewer/supervisor must preserve the remaining parent blocker at helper closeout. Current release `bin/ai_status.py` calls `apply_unblock_parent_resolution` on merge completion and defaults `PARENT_STATUS` to `todo`; handoff does not persist a parent resolution override. The actor performing the merge-evidence transition must use `PARENT_STATUS=blocked`, `PARENT_WAITING_FOR=Gemini` and `PARENT_NEXT` containing the provisioning/resume condition above until access is supplied. Do not interpret this diagnostic artifact's merge as successful provisioning. This helper does not modify the shared lifecycle implementation.
