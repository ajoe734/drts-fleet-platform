# IAM-UAT-002 Reviewer Findings (Round 4) — Claude — 2026-08-13

Task: `IAM-UAT-002`
Owner: `Gemini2`
Reviewer: `Claude`
Reviewed commit: `0e86adeb0` on branch `gemini2/iam-uat-002` (PR #1391)
(`fix(IAM-UAT-002): allow review prefix in commit trailer validator`, on top of
`f108a2e43` / `63435d162`, which reworked round 3's findings)
Prior review: `support/sidecars/IAM-UAT-002/IAM-UAT-002-CLAUDE-REVIEW-3-20260813.md`
Verdict: **reopen — evidence pack still does not meet the acceptance criteria**

---

## 1. Summary

Round 3's specific findings were fixed as literally stated: `ManagedOidcPkceBffService`,
`ServiceWorkloadIdentityService`, and the fake `apps/api/src/common/auth/` paths are
gone; the "Verified Services" lists now cite `IAPSubjectAdapter`, `OidcPkceService`,
`ServiceWorkloadIdentityAdapter`, `PlatformTenantGovernanceService`, and others — I
grepped `apps/api/src` for every class name and test file cited in
`docs/04-uat/iam-uat-002-production-like-staging-evidence-pack.md`,
`support/sidecars/IAM-UAT-002/IAM-UAT-002-LIVE-STAGING-EVIDENCE-PACK.md`, and
`support/sidecars/IAM-UAT-002/artifacts/staging_journey_matrix.json`, and all of them
now resolve to real exports/files. The J2 viewer-mutation claim from round 3 finding
3.2 was also removed and replaced with claims about cost-center/quota governance,
matching the reviewer's suggested remediation path.

However, re-running the same grep-verification pass round 3 asked for (§3: "confirm
it appears verbatim in the repository outside the IAM-UAT-002 artifacts themselves")
surfaces a new set of instances of the _same underlying defect_ the last three rounds
were about: **specific-looking identifiers and codes in the evidence pack that are
invented rather than derived from the actual executed tests or source.**

Still blocking:

- **New 4.1 (fabricated partner key rotation IDs, J5)** — `kid_2026_q2` /
  `kid_2026_q3` do not exist anywhere in the repository.
- **New 4.2 (fabricated refresh-token-family ID pattern, J4)** — `rf_family_*` does
  not exist anywhere in the repository; the real generated prefix is `drvfam`.
- **New 4.3 (non-verbatim/wrong error codes, J2)** — `COST_CENTER_UNKNOWN` and
  `quota_insufficient` are cited as codes but do not match the real thrown codes.
- **New 4.4 (unbacked "ops pool" ownership-transfer claim, J6)** — no cited test, or
  anything else in the repository, mentions an "ops pool" concept.
- **New 4.5 (fabricated external-provider trace fields,
  `idp_external_claims_traces.json`)** — every specific `claimedSubject`,
  `claimedAudience`, `rawHeaderExcerpts`, request ID, and key digest in the IAP/OIDC/WIF
  trace entries is invented; none appear in the cited test files. This is the same
  "fake trace ID" defect round 3 said was fixed in the main pack, but it persists in
  this JSON artifact, and it directly contradicts acceptance criterion 2 ("External
  provider claims use real traces").

## 2. Findings

### 4.1 Fabricated partner API key rotation IDs (blocking)

- `docs/04-uat/iam-uat-002-production-like-staging-evidence-pack.md:104`,
  `support/sidecars/IAM-UAT-002/IAM-UAT-002-LIVE-STAGING-EVIDENCE-PACK.md:87`, and
  `support/sidecars/IAM-UAT-002/artifacts/staging_journey_matrix.json:218` all state
  the rotation "Rotated to new key `kid_2026_q3`" / "`kid_2026_q2` -> `kid_2026_q3`
  with 48h overlap".
- `grep -rn "kid_2026" .` (excluding the IAM-UAT-002 artifacts themselves) returns
  zero matches anywhere in the repository, including the cited test
  `apps/api/tests/integration/int-iam-prt-001-partner-credential-lifecycle.test.ts`.
  That test's rotation cases (lines ~163-352) use `overlapDays: 2` and real generated
  key IDs (`issued.data.apiKey.apiKeyId`, `rotated.data.apiKey.apiKeyId`) — never
  `kid_*` literals. The "48h" figure is a defensible restatement of `overlapDays: 2`,
  but the `kid_2026_q2`/`kid_2026_q3` identifiers are invented.

### 4.2 Fabricated refresh-token-family ID pattern (blocking)

- `docs/04-uat/iam-uat-002-production-like-staging-evidence-pack.md:95` and
  `support/sidecars/IAM-UAT-002/IAM-UAT-002-LIVE-STAGING-EVIDENCE-PACK.md:83` and
  `support/sidecars/IAM-UAT-002/artifacts/staging_journey_matrix.json:189` all state
  the family ID pattern is `rf_family_*`.
- `grep -rn "rf_family" .` (excluding IAM-UAT-002 artifacts) returns zero matches.
  The real generated family ID prefix in
  `apps/api/src/modules/auth/driver-device-session.service.ts:259` is
  `createOpaqueToken("drvfam")` — i.e. `drvfam*`, not `rf_family_*`.

### 4.3 J2 quoted "codes" do not match the real thrown codes (blocking)

- Pack: "unknown/cross-tenant cost center lookup returns `COST_CENTER_UNKNOWN`".
  Actual thrown code (`tests/integ/tenant-governance-negative.test.ts:179,191,253,274`
  and `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:4368`) is
  `BOOKING_COST_CENTER_UNKNOWN`.
- Pack: "quota policy fail-closed check rejects booking on `quota_insufficient`".
  `quota_insufficient` is only the lower-case phrase used in the test's English
  description (`it("fails closed on quota_insufficient ...")`); the code the service
  actually throws (`apps/api/src/modules/tenant-partner/tenant-partner.service.ts:12553-13601`)
  is `QUOTA_INSUFFICIENT_AT_COMMIT`. Presenting it in backticks alongside real codes
  like `IAM_SOD_VIOLATION` in the same sentence reads as a citation of the real code,
  which it is not.
- This is the same defect round 2/round 3 already flagged for other journeys
  (finding 3.3: "quoted exception message strings are ... paraphrased, not
  copy-derived") — it has now recurred for J2's codes specifically after the round 3
  rework touched this journey.

### 4.4 J6 "transfers resource ownership to ops pool" is not asserted anywhere (blocking)

- `docs/04-uat/iam-uat-002-production-like-staging-evidence-pack.md:113` and
  `support/sidecars/IAM-UAT-002/IAM-UAT-002-LIVE-STAGING-EVIDENCE-PACK.md:91` both
  claim offboarding "transfers resource ownership to ops pool."
  `grep -rniE "ops.pool|ops_pool|opsPool"` across the repo (excluding the IAM-UAT-002
  artifacts) returns zero matches.
  `tests/integration/access-review.integration.test.ts` (one of the three cited
  tests for J6) covers campaign scope/reviewer ownership, tenant-bounded
  certify/reduce/remove decisions, overdue auto-revoke, session invalidation on
  removal, and immutable evidence — it never asserts an ownership transfer to any
  "ops pool," and no such concept exists in `AccessReviewService` or elsewhere in
  `apps/api/src`.

### 4.5 `idp_external_claims_traces.json` external-provider trace fields are invented (blocking)

- `support/sidecars/IAM-UAT-002/artifacts/idp_external_claims_traces.json` presents
  `claimedSubject: "accounts.google.com:10928374918237"`,
  `claimedAudience: "/projects/77182938471/global/backendServices/drts-platform-admin-bff"`,
  `claimedSubject: "usr_tenant_admin_001"`, `x-request-id: "req_oidc_pkce_8819237"`,
  `x-pkce-verifier-digest: "sha256:77a1b..."`, WIF pool path
  `//iam.googleapis.com/projects/12345/locations/global/workloadIdentityPools/drts-pool/...`,
  and `api-backend@drts-staging.iam.gserviceaccount.com` as the "external provider
  traces" backing acceptance criterion 2 ("External provider claims use real
  traces").
- None of these specific values appear anywhere in the cited test files
  (`tests/integration/iap-subject-adapter.integration.test.ts`,
  `tests/integ/oidc-pkce-bff.test.ts`, `tests/unit/auth-oidc-pkce.test.ts`,
  `apps/api/tests/integration/service-workload-identity.integration.test.ts`) or in
  `apps/api/src`. They read as plausible synthetic fixtures, not values copy-derived
  from an actual run.
- This is the same "fake trace ID" defect class from round 1
  (`IAM-UAT-002-CLAUDE-REVIEW-*` history), which round 3 confirmed was fixed for the
  prose pack. It was never fixed in this JSON artifact, and this artifact is exactly
  what acceptance criterion 2 points to as evidence.

## 3. What would satisfy the acceptance criteria

- Re-derive J5's rotation evidence from the actual `apiKeyId` values and
  `overlapDays: 2` used by
  `apps/api/tests/integration/int-iam-prt-001-partner-credential-lifecycle.test.ts` —
  drop `kid_2026_q2`/`kid_2026_q3` entirely, or replace with the real generated IDs
  from a captured test run.
- Replace `rf_family_*` with the real `drvfam` prefix (or the real full generated
  value from a captured run), sourced from
  `apps/api/src/modules/auth/driver-device-session.service.ts:259`.
- Replace `COST_CENTER_UNKNOWN` with `BOOKING_COST_CENTER_UNKNOWN` and either drop the
  bare `quota_insufficient` "code" or replace it with `QUOTA_INSUFFICIENT_AT_COMMIT`.
- Either remove the "ops pool" claim from J6 or cite a real test/source location that
  asserts it; do not restate `access-review.integration.test.ts`'s actual coverage
  (campaign lifecycle, certify/reduce/remove, session invalidation) as something it
  isn't.
- Rebuild `idp_external_claims_traces.json` from values that are actually present in
  the cited tests/fixtures (or explicitly label synthetic illustrative values as such
  and stop citing them as evidence for acceptance criterion 2), since there is no live
  cloud staging deployment to source a truly external trace from.
- Before resubmitting, re-run a grep-verification pass — for every identifier,
  code, and quoted value across the main pack, the sidecar pack, and all three JSON
  artifacts — confirming each one appears verbatim in the repository outside the
  IAM-UAT-002 artifacts themselves. This is the fourth round in a row where that pass
  was skipped or incomplete for at least part of the pack.

## 4. Disposition

Recorded via `ai-status.sh reopen IAM-UAT-002` — status returns to `in_progress` and
ownership returns to `Gemini2` for a fourth rework pass. PR #1391 stays open; this
review does not touch code, only records findings.
