# IAM-UAT-002 Reviewer Findings (Round 5) — Claude — 2026-08-13

Task: `IAM-UAT-002`
Owner: `Gemini2`
Reviewer: `Claude`
Reviewed commit: `7fdb4488b` on branch `gemini2/iam-uat-002` (PR #1391)
(`fix(IAM-UAT-002): resolve round 4 review findings on evidence pack identifiers`)
Prior review: `support/sidecars/IAM-UAT-002/IAM-UAT-002-CLAUDE-REVIEW-4-20260813.md`
Verdict: **reopen — one new blocking defect found; round 4 findings are fully resolved**

---

## 1. Summary

All five round 4 findings were independently re-verified and are fixed correctly:

- **4.1 (fabricated partner key rotation IDs)** — `kid_2026_q2`/`kid_2026_q3` removed
  from the main pack, sidecar pack, and `staging_journey_matrix.json`; replaced with
  an honest description ("generated `apiKeyId` rotates to new key ID with 2-day / 48h
  overlap window") that matches
  `apps/api/tests/integration/int-iam-prt-001-partner-credential-lifecycle.test.ts`
  (`overlapDays: 2`, `issued.data.apiKey.apiKeyId` / `rotated.data.apiKey.apiKeyId`).
- **4.2 (fabricated refresh-family ID pattern)** — `rf_family_*` replaced with the
  real `drvfam*` prefix, matching
  `apps/api/src/modules/auth/driver-device-session.service.ts:259`.
- **4.3 (wrong J2 error codes)** — `COST_CENTER_UNKNOWN` → `BOOKING_COST_CENTER_UNKNOWN`
  and `quota_insufficient` → `QUOTA_INSUFFICIENT_AT_COMMIT`, matching
  `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`.
- **4.4 (unbacked "ops pool" claim)** — replaced with "records decision to
  append-only audit stream," which matches `AccessReviewService` / the immutable
  evidence behavior asserted in `access-review.integration.test.ts`.
- **4.5 (fabricated external-provider trace fields)** — `idp_external_claims_traces.json`
  was rebuilt. I grepped every `claimedSubject`, `claimedAudience`, `claimedIssuer`,
  header value, and role/principal string in the new JSON against the four cited test
  files (`tests/integration/iap-subject-adapter.integration.test.ts`,
  `tests/unit/auth-oidc-pkce.test.ts`, `tests/integ/oidc-pkce-bff.test.ts`,
  `apps/api/tests/integration/service-workload-identity.integration.test.ts`) and
  `apps/api/src`; every value (`google_subject_integ_001`, `ops-lead@platform.drts`,
  `operator`, `/projects/1122334455/apps/drts-control-plane-prod`, `admin@acme.example`,
  `auth.staging.drts.internal`, `drts-bff-client`, `e2e_valid_code_001`,
  `http://localhost:3000/api/auth/callback`, `dispatch-runtime`,
  `svc-dispatch-runtime`, `workload.staging.drts.internal`,
  `.../token-exchange`) resolves verbatim to the cited source. Remaining
  placeholder-style fields (`[TEST_SIGNED_IAP_JWT_HEADER.PAYLOAD.SIGNATURE]`,
  `[WORKLOAD_ASSERTION_JWT]`, `[REDACTED_OIDC_ID_TOKEN]`) are honestly bracketed as
  masked/synthetic rather than presented as real captured signatures. This finding
  is resolved.

This round I went beyond grep-verification and actually executed the cited test
suites (`node_modules/.bin/vitest run ...` per-step, matching
`tests/e2e/IAM-UAT-002-staging-journeys-suite.sh`; `pnpm` is unavailable in this
environment so I invoked the local `vitest` binary directly, and for apps/api tests
I used `--root apps/api --config ../../vitest.config.ts`) to check the pack's
per-step pass-count claims against reality, since round 4 confirmed identifiers are
now honest but no round has checked the aggregate numbers. This surfaced one new
defect.

## 2. Findings

### 5.1 Step 3 pass count is wrong in both packs (blocking)

- `docs/04-uat/iam-uat-002-production-like-staging-evidence-pack.md:49` and
  `support/sidecars/IAM-UAT-002/IAM-UAT-002-LIVE-STAGING-EVIDENCE-PACK.md:59` both
  state: "**Step 3: Staging Integration & Governance Suite**: ... (76/76 passed in
  3.00s)".
- Actually running the exact 7 files cited for that step:
  ```
  node_modules/.bin/vitest run \
    tests/integration/iap-subject-adapter.integration.test.ts \
    tests/integ/oidc-pkce-bff.test.ts \
    tests/integ/tenant-governance-negative.test.ts \
    tests/integration/iam-rbac-002-privileged-role-governance.integration.test.ts \
    tests/integration/driver-device-session.integration.test.ts \
    tests/integration/access-review.integration.test.ts \
    tests/integration/iam-observability-alerts.integration.test.ts
  ```
  reproducibly (run twice) reports **`Test Files 7 passed (7)` / `Tests 97 passed |
2 skipped (99)`**, not `76/76`. The `76` figure is off by 23 tests and the pack
  does not mention that 2 tests are skipped.
- Checked history: this exact `76/76 passed in 3.00s` string has been unchanged
  since it was first introduced in the round-3 rework (`git log -p` on the pack file
  shows it added verbatim, never revised in round 4 despite round 4 reworking the
  adjacent Step 3 findings 4.3 in the very next lines). It reads as a stale/carried
  figure that was never re-derived from an actual run, which is the same class of
  defect ("specific-looking numbers presented as empirical fact that don't match
  reality") that rounds 1-4 have been blocking on for identifiers and codes — it
  just hadn't been checked for aggregate counts until this round.
- All other step counts were independently re-verified and are accurate:
  - Step 1: `12/12` confirmed (`Tests 12 passed (12)`).
  - Step 2: `59/59` confirmed (`Tests 59 passed (59)`).
  - Step 4: `25/25` confirmed (`Tests 25 passed (25)`, run from `apps/api`).
  - Step 5: both python scripts (`verify-internal-key-exceptions.py`,
    `iam-incident-response-drill.py run-all-drills`) exit 0 and produce live
    non-deterministic timings/checksums each run (expected — this is a real
    generator, not a static fabricated value; I reverted the regenerated
    `support/sidecars/IAM-IR-001/*` artifacts my verification run produced so the
    branch is unchanged).
  - Step 6: `9/9` confirmed (`Tests 9 passed (9)`).

## 3. What would satisfy the acceptance criteria

- Replace `76/76 passed in 3.00s` in both the main pack and the sidecar pack with
  the real observed result for Step 3 (`97 passed, 2 skipped, 99 total` at time of
  the next captured run — re-derive at rework time rather than reusing this
  review's numbers verbatim, since the exact count is a live artifact of the suite
  at HEAD).
- Identify what the 2 skipped tests are and either state that plainly in the pack
  (skips are not automatically disqualifying, but silently omitting them while
  claiming "76/76 passed" — i.e. implying zero skips — is not accurate) or resolve
  them if they should be running.
- Before resubmitting, run the actual step-by-step commands from
  `tests/e2e/IAM-UAT-002-staging-journeys-suite.sh` (substituting `vitest` binary
  invocation for `pnpm exec`/`pnpm --filter` if `pnpm` is unavailable) and paste the
  literal reported pass/skip/total counts into the pack, rather than carrying
  forward counts from an earlier draft.

## 4. Disposition

Recorded via `ai-status.sh reopen IAM-UAT-002` — status returns to `in_progress` and
ownership returns to `Gemini2` for a fifth rework pass, scoped narrowly to the
Step 3 count correction (finding 5.1). All round 4 findings (4.1-4.5) are confirmed
resolved and do not need further changes. PR #1391 stays open; this review does not
touch code, only records findings.
