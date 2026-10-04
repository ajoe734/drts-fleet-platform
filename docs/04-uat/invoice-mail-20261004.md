# SR-INVOICE-MAIL-20261004 — C079 tenant invoice mail

## Authority and scope

User 2026-10-04: finish currently actionable incomplete work. Source gap:
`docs/04-uat/full-system-inventory-20261004/REPORT.md` §6 C079 and
`SR-LIVE-MAIL-001.integration_notes`: invitation/approval mail does not implement
invoice mail. Base: `0e4b93191e039acabf71549495bd07c0cfa618ee`.

Implement explicit send/resend from the tenant invoice detail, using the persisted
invoice and billing profile, the existing durable notification outbox and existing
retry scheduler. This does not introduce automatic monthly issuance or a new
scheduler. Only authorized tenant billing writers (or authorized platform/system
callers) can send; readers can view safe delivery history. No caller-supplied
recipient, URL, body or sender. No synthesized default billing address.

Each intentional send has an idempotency key; retries of the same operation reuse
one durable delivery. A deliberate resend uses a new key. A permanent failure is
visible, not silently promoted to sent. `sent` means provider acceptance, NOT inbox
delivery. Mail links to the authenticated invoice screen, never to an expiring
bearer download. Recipient/profile changes conflicting with the original operation
must not silently send another copy. The existing scheduler handles retryable
failures and leases across restarts.

## Acceptance

- `tenant_authorized_invoice_mail_path`: API + client + tenant UI, persisted
  recipient resolution, read/write scopes, tenant isolation, safe link.
- `durable_idempotent_delivery_and_readback`: actual notification service/outbox,
  same-key deduplication, failure/retry/readback, no content/provider-response leak.
- `regression_and_same_sha_review_ci`: targeted checks, independent review and CI
  on the locked candidate. No self-approval.

## Evidence / limits

Implemented `TenantInvoiceMailService` + dedicated controller, authoritative
repository read, billing-module DI, API client, selected-invoice UI and English /
Traditional Chinese catalog entries. `deploy-dev.yml` passes the already resolved
tenant origin as `TENANT_INVOICE_PORTAL_ORIGIN`; absent/invalid config stays 503.
The new portal origin does not change exposure or existing SMTP secret selection.

| Requirement                          | Production path and evidence                                                                                                                                                                                       | Result / boundary                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Authorized recipient and stable link | Fresh `findTenantInvoiceMailContext` tenant+invoice query; service authorization before IO; canonical route scopes; controller/client wiring; rejection of default/missing profile; no caller-controlled mail body | Offline tests passed; no real mailbox send                                              |
| Durable duplicate/retry/readback     | Real `NotificationDeliveryService` + `FileMailOutbox`, concurrent duplicate and restart; retryable and permanent failures; safe receipt projection; per-invoice key namespace                                      | Passed with transport/DB boundaries mocked; no fake provider acceptance counted as live |
| Tenant UI                            | Real `InvoiceMailPanel` DOM tests: send arguments, ambiguity reuses key, double click fenced, resend confirmation, failure history, definitive permission rejection, no raw errors                                 | jsdom only; NOT hosted browser acceptance                                               |
| Postgres authority                   | `apps/api/tests/integration/invoice-mail.integration.test.ts`: official migration tables, production repository + `PostgresMailOutbox`, independent DB clients, scoped cleanup, concurrency and profile refresh    | Added to existing API integration discovery; NOT run on this VM                         |

Completed checks, 2026-10-04 (source checkpoint plus final candidate tracked by
handoff; machine logs under root `.local/invoice-mail-*.log`):

- `NODE_ENV=test pnpm exec vitest run tests/unit/invoice-mail-20261004` plus affected
  billing, invoice PDF/download, notification bootstrap/SMTP configuration,
  invitation/approval mail and retry-scheduler suites: **16 files / 141 passed**.
  New feature contributes **31** tests across three files. No listeners started.
- `pnpm exec tsc --noEmit --incremental false`: exit 0.
- `pnpm --filter @drts/control-plane-auth build` then `pnpm --filter @drts/api typecheck`: exit 0.
- `pnpm --filter @drts/tenant-console-web typecheck`: exit 0 (route type generation only).
- Targeted ESLint on changed API service/controller/module/repository, outbox,
  component, new unit and hosted integration test: exit 0.
- `pnpm classification:check`, `pnpm i18n:guard`, `git diff --check`: exit 0.

Initial non-passing checks retained honestly: inherited `NODE_ENV=production`
prevented React act in the DOM harness (rerun with `NODE_ENV=test` passes);
API typecheck initially lacked the built workspace auth declarations (build then
rerun passes); SMTP block-extraction regression was fixed by placing the new origin
configuration outside the existing SMTP selection markers; inline bilingual labels
were moved into the canonical catalog after i18n-guard rejected them. One unused
mock parameter was corrected after ESLint flagged it. None was called a passing test.

Independent review, exact-candidate hosted CI/PG, shared-dev deployment and real
allowlisted inbox receipt remain pending. This is explicit send/resend, not a new
automatic monthly issuance/sending schedule. Existing mail scheduler retries only
already queued deliveries. VM remains repository-check only: no product server,
browser/E2E server, database, container, actual SMTP or cloud-resource mutation.
The old implementation only recorded an `ops_notice` after invoice generation;
no assertion here treats that historical notice as an email.
