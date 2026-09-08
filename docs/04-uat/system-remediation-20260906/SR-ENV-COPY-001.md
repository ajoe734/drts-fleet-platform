# SR-ENV-COPY-001 — partial implementation and scope blocker

## Revision and traceability

- Owner: Codex2; reviewer: Codex; branch: `codex2/sr-env-copy-001`.
- Fetched and rebased onto current `origin/dev`: `6f6f418fdd6c7fa0811765710f66a5608e0b8ad0` (2026-09-08 UTC).
- Copy implementation anchors: `8bd00bfde` and `2d90d645ec5af09c4aeecacfc44fd2360f9001b1`, both normally pushed to origin. Subsequent formatting/evidence commit is identified by the machine-truth progress/blocker entry.
- Candidate SHA: **not locked**; implementation is incomplete and no review handoff has occurred.
- Sources: execution task SR-ENV-COPY-001; `source/findings.json` R27; `source/capabilities.json` C110. Historical 9/6 findings were reproduced against the base above, not assumed current.
- Design references: `packages/ui-tokens/src/realms.ts`, design canvas `platform-screens.jsx`, `ops-screens-1.jsx`, `tenant-screens-1.jsx`, `fleet-screens.jsx`. No layout, palette, typography, or visual component changes.

## Delivered within write scopes

- Ops assistant guidance uses user actions instead of ActionIntent; empty attachment copy no longer discusses future backend implementation, in both languages.
- Fleet driver/vehicle selectors describe application IDs rather than submissionId.
- Admin invalid application ID errors provide a recovery action; approval copy preserves interpolation of the actual application ID.
- Tenant identity summaries no longer append an unverified production claim.
- No new environment component was added: the directory does not exist and existing shells cannot consume it within the current scope. An unused component would not fix rendered output.

## Reproduced remaining failures / supervisor scope request

All paths below are outside current write scopes and were read only:

| Render / logic location                                                                               | Current failure                                                                                   |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `apps/platform-admin-web/components/admin-shell.tsx:638`                                              | Renders static `adminShell.environment` translation.                                              |
| `apps/ops-console-web/app/layout.tsx:61`                                                              | Always requests the production translation.                                                       |
| `apps/tenant-console-web/components/tenant-shell.tsx:909`                                             | Reads static `shell.env`; health normalization at line 749 maps absent/unknown values to healthy. |
| `apps/fleet-partner-portal-web/components/fleet-portal-shell.tsx:36`                                  | Literal production environment.                                                                   |
| `apps/fleet-partner-portal-web/components/fleet-portal-health-footer.tsx:36`                          | Absent/unknown health values become healthy.                                                      |
| `apps/enterprise-dispatch-web/components/enterprise-shell.tsx:55`                                     | Absent/unknown health values become healthy.                                                      |
| `apps/bank-console-web/lib/navigation.ts:8`, `components/bank-shell.tsx:137`                          | Static preview value, not a runtime environment value.                                            |
| `packages/ui-web/src/canvas-primitives/index.tsx:296`, `packages/ui-web/src/management-topbar.tsx:44` | Shared defaults claim production.                                                                 |

Supervisor must extend scopes and establish dependencies with the shell/data owners before changes to these files, necessary server layouts/runtime props, or shared exports/package exports. Existing `apps/ops-console-web/lib/ops-assistant-context.server.ts:16` reads DRTS_ENV then NEXT_PUBLIC_DRTS_ENV but falls back to NODE_ENV; a production build is not sufficient evidence of a production deployment. Runtime authority and data-source propagation must be wired through the consuming shells. Merely changing translations cannot meet environment/health acceptance.

The visible-copy cleanup is partial: other engineering wording exists outside the changed keys and in render sites. No claim of exhaustive bilingual normal/error/empty-state acceptance is made.

## Executed verification

Commands run in the assigned worktree on 2026-09-08 UTC:

| Command                                                                           | Result                                                                                 |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `git fetch origin`                                                                | exit 0                                                                                 |
| `git rebase origin/dev`                                                           | exit 0                                                                                 |
| `pnpm exec vitest run tests/unit/system-remediation/sr-env-copy-001/copy.test.ts` | exit 0; 1 file, 4 tests passed; verifies both locales and application-ID interpolation |
| `pnpm --filter @drts/bank-console-web typecheck`                                  | exit 0                                                                                 |
| `pnpm --filter @drts/enterprise-dispatch-web typecheck`                           | exit 0                                                                                 |
| `pnpm --filter @drts/fleet-partner-portal-web typecheck`                          | exit 0                                                                                 |
| `pnpm --filter @drts/ops-console-web typecheck`                                   | exit 0                                                                                 |
| `pnpm --filter @drts/platform-admin-web typecheck`                                | exit 0                                                                                 |
| `pnpm --filter @drts/tenant-console-web typecheck`                                | exit 0                                                                                 |
| `git diff --check`                                                                | exit 0                                                                                 |
| `git push -u origin codex2/sr-env-copy-001`                                       | exit 0; first anchor                                                                   |
| `git push origin codex2/sr-env-copy-001`                                          | exit 0; second anchor                                                                  |

Initial Prettier check reported formatting in three changed files; `pnpm exec prettier --write tests/unit/system-remediation/sr-env-copy-001/copy.test.ts apps/ops-console-web/lib/translations.ts apps/platform-admin-web/lib/translations.ts` corrected it. Typechecks preceded whitespace-only formatting. Local typecheck logs: `/tmp/sr-env-copy-001-<app>-typecheck.log` (ephemeral supporting logs, not delivery evidence).

Resource IDs: R27 / C110; unit-only application ID `application-123` is an interpolation probe, not a created application. No live tenant, order, deployment, or request ID was generated. Browser/live Cloud Run, real devices, deployed runtime environment, health endpoint behavior, CI, independent review, merge, and deployment acceptance were **not executed**. Task remains blocked pending scope/dependency expansion; do not infer completion from passing local tests.
