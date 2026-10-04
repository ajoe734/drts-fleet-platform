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

Implementation in progress. No checks claimed yet. VM is repository-check only;
no product server, browser/E2E server, database, container, SMTP send or cloud
mutation is authorized by these unit tests. PG integration and genuine mailbox
receipt remain hosted/live acceptance, separate from code completion.
