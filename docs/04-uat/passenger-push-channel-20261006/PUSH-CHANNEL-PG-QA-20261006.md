# PUSH-CHANNEL-PG-QA-20261006

Owner: Codex2. Reviewer: Codex. Baseline: `7785a1abd1cf1fffe06cfdef50df2956fc2eaf9f`.
All five dependencies are `done` as of 2026-10-08. Work is in progress; no PG pass or acceptance is claimed yet.

## Scope and execution boundary

Follow `AI_COLLABORATION_GUIDE.md` §0.7 and the channel design D2–D7.
The new harness creates an isolated random database on the explicitly configured
hosted PostgreSQL service and applies all files in `infra/migrations` unchanged.
It calls production services/repositories. No substitute table definitions or
SQL simulators stand in for those boundaries. No server is started on the VM.

## Findings and acceptance ledger

| Finding / acceptance | Source and change | Baseline → current result | Command / evidence | Remaining limitation |
| --- | --- | --- | --- | --- |
| PG-QA-F1: partner writer accepts an order already routed first-party | `tenant-partner/order-partner-notification-route.ts` `persistOrderPartnerNotificationRoute`; first-party writer has a one-sided check and advisory lock | Static evidence: partner INSERT neither checks V0107 nor takes the same lock; PG reproduction pending | Reported via owner `progress` to Supervisor on 2026-10-08 | Product source is outside QA write scopes; Supervisor must coordinate owner repair |
| `push-channel-pg-qa_hosted_postgres_suites_zero_skips` | New production-migration suites and CI gate | Pending | Hosted run not started | Must read exact candidate results, including original 7/7/7 PG gates |
| `push-channel-pg-qa_regression_and_dormant_proof` | Partner, C111–C115, cancellation and disabled-first-party checks | Pending | Checks not started | C111–C115 receiver tests must run hosted; no local receiver |

SQL/migration comparison, per-case counts, commands and hosted run evidence will
be added here as each verification unit completes. The F1 finding stays open
until a corrected production writer passes the same reproducer.
