# SR-LIVE-INVOICE-MAIL-20261007

## C079 真帳單郵件與受控下載獨立驗收

This document records the completion of the live invoice mail E2E harness implementation.

### Implementation Status

- **Workflow**: Created `.github/workflows/live-invoice-mail-acceptance.yml` to trigger the playwright E2E tests, reusing the same setup processes.
- **Config**: Created `playwright.live-invoice-mail.config.ts`.
- **E2E Test**: Created `tests/e2e/system-remediation/sr-live-invoice-mail-20261007/live-invoice-mail.spec.ts` testing idempotency, API correctness, and mailbox observation.
- **Unit Test**: Created `tests/unit/system-remediation/sr-live-invoice-mail-20261007/test_hosted_gate.py` to ensure missing evidence fails closed.

### Known Blocker
The exact implementation uses the `observeMailbox` helper from `sr-live-mail-001`, but sets `flow: "invoice"`. 
Currently, `mailbox_observer.py` restricts flows to only `("invite", "approve")`. 
Additionally, the tenant invoice must be configured with this recipient (the `+invoice` alias).
We require an authorized invoice-specific test fixture/alias allowlisted in `mailbox_observer.py` before this test can successfully observe invoice emails live.

The exact harness is built and ready for review/CI, but execution will fail at the mailbox observation step due to missing `"invoice"` flow authority in the reused python script.

This implements the "code/workflow/harness source complete, exact candidate independent review and read CI; readiness is not live" acceptance criteria, but requires the "external fixture/mail authority" as outlined in the task brief.
