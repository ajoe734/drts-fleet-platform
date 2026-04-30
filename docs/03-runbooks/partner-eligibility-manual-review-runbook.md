# Partner Eligibility Manual Review Runbook

Status: active draft  
Scope: `ORX-IN-002`

## Purpose

This runbook defines how ops handles partner eligibility outcomes that are not
cleanly eligible at booking time.

The canonical operator lane is the ops console `Contracts` page, which now
surfaces the partner eligibility exception queue from
`GET /api/ops/partner/eligibility/reviews`.

## Outcome Matrix

| Verification status | Reason family                            | Operator meaning                               | Required action                                                                           |
| ------------------- | ---------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `manual_review`     | `ISSUER_RETRY_EXHAUSTED_REVIEW_REQUIRED` | Issuer adapter timed out or exhausted retries. | Hold dispatch/settlement release until a reviewer confirms fallback evidence.             |
| `ineligible`        | `CARD_PROGRAM_NOT_ELIGIBLE`              | The presented card/program does not qualify.   | Do not release as benefit-sponsored service. Rebook through a non-benefit lane or reject. |
| `ineligible`        | other issuer denial codes                | Issuer returned an explicit denial.            | Treat as failed eligibility unless a separate approved override process exists.           |

## Queue Interpretation

- `manual_review` must appear ahead of denials in the queue.
- `attemptCount` and `latestAttemptStatus` show whether the case was a single
  denial or a retry-exhausted adapter failure.
- `manualFallbackRequestedBy = system:auto_fallback` means the backend opened
  the manual-review lane automatically after retry policy exhaustion.
- Request context is limited to non-secret hints such as `cardLast4` and
  `flightNo`; raw reference tokens never appear in the queue.

## Operator Rules

- Do not create or release a benefit booking just because a partner request
  reached the API.
- If the queue entry is `manual_review`, collect offline issuer evidence or
  sponsor confirmation before allowing the trip to proceed.
- If the queue entry is `ineligible`, keep error copy aligned with the backend
  reason code and avoid presenting the case as a transient retry.
- Use the persisted `eligibilityVerificationId` as the audit handle for any
  downstream complaint, settlement, or exception-hold workflow.

## Audit Expectations

- Every verification attempt records `verify_partner_eligibility`.
- Every queue read from ops/platform records
  `list_partner_eligibility_review_queue`.
- Evidence drill-down remains governed by
  `view_partner_eligibility_evidence`.

## Verification

- `pnpm --filter @drts/api exec vitest run tests/unit/tenant-partner.service.test.ts`
- `pnpm --filter @drts/contracts build`
- `pnpm --filter @drts/api-client typecheck`
- `pnpm --filter @drts/ops-console-web exec tsc --noEmit`
