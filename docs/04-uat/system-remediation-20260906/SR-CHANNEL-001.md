# SR-CHANNEL-001 — 通路總覽匯出與對帳查詢

- Owner: `Codex`
- Reviewer: `Codex2`
- Base SHA: `70355aba97c23dd1cd592b71f1d3dfe6315d91ff` (`origin/dev` at reproduction)
- Candidate: the exact final branch head is recorded by the required Supervisor `handoff` command.
- Resource: partner-scoped `GET /api/partner/referral/dashboard?periodMonth={period}` and `GET /api/partner/referral/statements/{period}/artifact`

## Reproduction and implementation

At the base SHA, `app/dashboard/page.tsx` rendered a `CanvasBtn` for export with
no URL, download attribute, or event handler. The pre-existing partner statement
artifact endpoint was already the authority for CSV bytes; this change reuses it
instead of generating a client fixture or a new calculated report.

The dashboard now accepts `?period=YYYY-MM`, sends it to the authoritative
dashboard query as `periodMonth`, and renders a token-themed period selector from
the existing Fleet Partner canvas pattern. Its visible `匯出 (CSV)` action links
to the artifact endpoint for the resulting `summary.period`, so the selected
period, count, GMV, and share have one backend source. Empty or offline fallback
periods explicitly show zero counts and amounts rather than borrowing another
period's totals.

The existing statement-detail download now declares its CSV filename. User-facing
statement list/detail views no longer show raw artifact ID or SHA-256 values by
default; those technical identifiers are only available in a collapsed technical
and audit disclosure. The UI does not claim a signature or verification status
that this portal has not independently verified.

## Regression evidence

`tests/unit/system-remediation/sr-channel-001/channel-overview-export.test.ts`
exercises the real `BillingSettlementService` and `TenantPartnerService` for the
authoritative `referral-demo-community` / `2026-06` case:

- 2 trips
- TWD 1,500 GMV (`150000` minor units)
- TWD 225 referral share (`22500` minor units)

It also verifies the selected period reaches the dashboard API, the empty-period
fallback remains zeroed, and the overview action targets the matching CSV
endpoint. No fixed percentage, fixture CSV, fake signature, or fake delivery is
used to establish those settlement totals.

Commands executed against this branch:

```text
pnpm --filter @drts/channel-partner-portal-web typecheck
# exit 0

pnpm exec vitest run tests/unit/system-remediation/sr-channel-001/
# exit 0 — 1 file, 3 tests

pnpm --filter @drts/channel-partner-portal-web test
# exit 0 — 1 file, 1 test

git diff --check
# exit 0
```

## Verification boundary

The partner API services and proxy routing were checked in hermetic tests. No
live Cloud Run deployment, browser download probe, or physical-device test was
performed in this task, so none is claimed as successful here. Candidate SHA,
independent review, CI, merge, and any live acceptance evidence remain governed
by the Supervisor candidate lifecycle.
