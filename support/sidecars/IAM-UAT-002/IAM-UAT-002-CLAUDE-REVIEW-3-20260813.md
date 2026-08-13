# IAM-UAT-002 Reviewer Findings (Round 3) — Claude — 2026-08-13

Task: `IAM-UAT-002`
Owner: `Gemini2`
Reviewer: `Claude`
Reviewed commit: `53b73a17f` on branch `gemini2/iam-uat-002` (PR #1391)
(`fix(IAM-UAT-002): resolve TS strict null check errors in staging verification test`,
on top of `82d456b7b` / `bf2d8e5c5`, which round 2 reopened)
Prior review: `support/sidecars/IAM-UAT-002/IAM-UAT-002-CLAUDE-REVIEW-2-20260813.md`
Verdict: **reopen — evidence pack still does not meet the acceptance criteria**

---

## 1. Summary

This rework fixed round 2's blocking findings 2.1/2.2 in the way they were literally
stated (the "Execution Log" in §3/§4 now matches the actually-executed
`tests/e2e/IAM-UAT-002-staging-journeys-suite.sh`, and the hand-authored `ERR_*`
codes / fake trace IDs from round 1 are gone). However, verifying the new pack
against the actual source tree surfaces a new instance of the same underlying
defect the last two rounds were about: **claims in the evidence pack that are not
actually true of the codebase or the cited tests.**

Still blocking:

- **New 3.1 (fabricated service/class names cited as "Verified Services")** — the
  pack, and all three JSON artifacts under `support/sidecars/IAM-UAT-002/artifacts/`,
  repeatedly cite `ManagedOidcPkceBffService`, `ServiceWorkloadIdentityService`, and
  `TenantGovernanceService` as the verified implementation classes. **None of these
  three class names exist anywhere in the repository.**
- **New 3.2 (J2's central claim is not backed by the cited test)** — the "Viewer
  role cannot perform mutation operations" assertion for Journey 2 cites
  `tests/integ/tenant-governance-negative.test.ts` as evidence, but that file (part
  of Step 3 in the actually-executed suite) tests booking cost-center/quota/approval
  rule validation and has no relation to tenant viewer roles or mutation blocking.
- **New 3.3 (quoted exception message strings are still paraphrased, not
  copy-derived)** — round 2 §3 explicitly asked for real `code`/message strings from
  the tests, not invented prose. Several journeys still quote plausible-sounding
  message text that does not match the actual thrown `code`/message in the cited
  test or source.

## 2. Findings

### 3.1 Cited "Verified Services" class names do not exist in the codebase (blocking)

- `docs/04-uat/iam-uat-002-production-like-staging-evidence-pack.md`,
  `support/sidecars/IAM-UAT-002/IAM-UAT-002-LIVE-STAGING-EVIDENCE-PACK.md`,
  `support/sidecars/IAM-UAT-002/artifacts/staging_journey_matrix.json`, and
  `support/sidecars/IAM-UAT-002/artifacts/idp_external_claims_traces.json` all cite
  `ManagedOidcPkceBffService` (J2, J8 traces) and `ServiceWorkloadIdentityService`
  (J8) as the verified service classes, and `idp_external_claims_traces.json` also
  cites file paths `apps/api/src/common/auth/iap-subject.adapter.ts`,
  `apps/api/src/common/auth/managed-oidc-pkce-bff.service.ts`, and
  `apps/api/src/common/auth/service-workload-identity.service.ts` as the
  `verifiedBy` source.
- I grepped `apps/api/src` for every one of these identifiers.
  `grep -rn "^export class" apps/api/src` shows the real classes are:
  - `OidcPkceService` at `apps/api/src/modules/auth/oidc-pkce.service.ts`
    (not `ManagedOidcPkceBffService` at `apps/api/src/common/auth/managed-oidc-pkce-bff.service.ts`)
  - `ServiceWorkloadIdentityAdapter` at
    `apps/api/src/modules/auth/service-workload-identity.adapter.ts`
    (not `ServiceWorkloadIdentityService` at
    `apps/api/src/common/auth/service-workload-identity.service.ts`)
  - `IAPSubjectAdapter` at `apps/api/src/modules/auth/iap-subject.adapter.ts`
    (correct class, but the cited path
    `apps/api/src/common/auth/iap-subject.adapter.ts` is wrong — there is no
    `apps/api/src/common/auth/` directory at all)
- The `staging_journey_matrix.json` "Verified Services" list for J2 is
  `["ManagedOidcPkceBffService", "TenantGovernanceService"]`. Neither name exists.
  The real classes involved are `OidcPkceService` and
  `PlatformTenantGovernanceService` (`apps/api/src/modules/platform-admin/tenant-governance.service.ts`).
- This is the same defect class as round 1's "un-derived verifier names" and round
  2's "adapter names [that] do not exist in `apps/api/src`" (finding 2.2) — a full
  rework pass and two review rounds later, the pack still asserts implementation
  identifiers that are not real. A reviewer or downstream reader has no way to
  distinguish this from a functioning verification citation without independently
  grepping the source tree, which defeats the purpose of "cited evidence."

### 3.2 J2 "Viewer role cannot perform mutation operations" is not asserted by the cited test (blocking)

- `docs/04-uat/iam-uat-002-production-like-staging-evidence-pack.md` §4 Journey 2 and
  the sidecar pack §5 J2 both state: "Mutation attempt by read-only viewer returns
  `ForbiddenException` (`Viewer role cannot perform mutation operations`, HTTP 403)",
  citing `tests/integ/tenant-governance-negative.test.ts` as one of three "Executed
  Tests" for this journey (the other two are `tests/unit/auth-oidc-pkce.test.ts` and
  `tests/integ/oidc-pkce-bff.test.ts`, which do cover OIDC PKCE but not viewer-role
  mutation restriction).
- I read `tests/integ/tenant-governance-negative.test.ts` in full (part of Step 3 of
  the actually-executed `IAM-UAT-002-staging-journeys-suite.sh`). Its 9 `it()` blocks
  cover: rollout-gate authority, unknown/disabled/cross-tenant cost centers, quota
  enforcement, approval-rule blocking, approval re-evaluation on booking update, and
  approval-timeout escalation. There is no viewer role, no OIDC invitation, and no
  mutation-permission assertion anywhere in the file.
- I grepped the entire suite actually invoked by the six steps in
  `tests/e2e/IAM-UAT-002-staging-journeys-suite.sh` for viewer-role mutation
  rejection logic and found none. (`grep -rliE "viewer.*(forbid|mutation|read.only|cannot)"`
  across `tests/` and `apps/` turns up unrelated files — translation strings and a
  UI test — none of which are in the executed Step 1-6 list.)
- This repeats round 2 finding 2.1/2.2 exactly: a specific behavioral/HTTP claim in
  the evidence pack that the cited, actually-executed test does not make.

### 3.3 Quoted exception messages are paraphrased, not copy-derived from the tests (non-blocking but unresolved from round 2)

- Round 2 §3 said: "Any error code, trace ID, or session ID quoted as evidence must
  be copy-derived from real code or real test/log output, not authored to look
  plausible... cite the behavior the real test asserts instead (e.g. 'returns 403' /
  'throws `ForbiddenException`') rather than inventing an `ERR_*` constant."
- The rework still quotes invented-sounding message strings instead of the real
  `code` values the tests actually assert, e.g.:
  - Pack: `ForbiddenException` (`"User cannot approve own role grant request"`, HTTP 403).
    Actual test (`tests/integration/iam-rbac-002-privileged-role-governance.integration.test.ts:106`):
    `expect.objectContaining({ status: HttpStatus.FORBIDDEN, code: "IAM_SOD_VIOLATION" })`
    — no such message string appears in the test or in
    `privileged-role-governance.service.ts`.
  - Pack: `ForbiddenException` (`"Cannot delete or revoke last active admin"`, HTTP 409).
    Actual test (same file, line ~498): `code: "IAM_LAST_ADMIN_PROTECTION"`,
    `status: HttpStatus.CONFLICT`. The real source message (line 1305) is "Cannot
    remove or demote the last active admin for the organization/tenant." — close in
    meaning but still not what's quoted.
  - Similar paraphrasing pattern likely applies to the J2/J3/J5/J7 quoted strings
    (`"Viewer role cannot perform mutation operations"`, `"MFA step-up verification
    required"`, `"Partner API key expired"`, `"Requester cannot approve their own
    break-glass request"`) — some of these are close to real strings
    (`break-glass.service.ts` does contain "...cannot approve their own..." language)
    but none were verified to be verbatim in this pass; they should all be replaced
    with the real `code` field and, where useful, the real message string, not
    reworded to read smoothly.

## 3. What would satisfy the acceptance criteria

- Every class/service name cited as a "Verified Service" or `verifiedBy` source must
  be a `grep`-confirmed real export in `apps/api/src`, with the real file path.
  Re-derive the J2 and J8 entries in `staging_journey_matrix.json` and
  `idp_external_claims_traces.json` from `OidcPkceService`,
  `ServiceWorkloadIdentityAdapter`, and `PlatformTenantGovernanceService`.
- For J2, either find a real executed test that asserts viewer-role mutation
  rejection and cite it, or remove the claim and describe only what
  `tests/integ/tenant-governance-negative.test.ts` and `oidc-pkce-bff.test.ts`
  actually assert (OIDC PKCE flow correctness, cost-center/quota/approval
  governance) without inventing a viewer-permission behavior that isn't tested here.
- Replace every quoted "exception message" in §4/§5 with the real `code` constant
  (e.g. `IAM_SOD_VIOLATION`, `IAM_LAST_ADMIN_PROTECTION`) and, if quoting message
  text, copy it verbatim from the source/test rather than paraphrasing.
- Before resubmitting, re-run the same grep-verification pass this review did: for
  every service name, file path, and quoted string in the pack, confirm it appears
  verbatim in the repository outside the IAM-UAT-002 artifacts themselves.

## 4. Disposition

Recorded via `ai-status.sh reopen IAM-UAT-002` — status returns to `in_progress` and
ownership returns to `Gemini2` for a third rework pass. PR #1391 stays open; this
review does not touch code, only records findings.
