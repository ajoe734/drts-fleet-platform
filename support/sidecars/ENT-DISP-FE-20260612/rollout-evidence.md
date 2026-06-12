# ENT-DISP-FE-20260612 Rollout Evidence

## Dev URL

- Local dev shell: `http://localhost:3007`
- Expected API authority during local verification: `NEXT_PUBLIC_API_URL=http://localhost:3001`

## Verification scope

- `pnpm --filter @drts/enterprise-dispatch-web test`
- Coverage added for booking fixture -> tenant API command, booking gate read-back, and embed fallback posture.

## Rollback note

- This task adds app-local API wrappers, tests, and sidecar evidence only. It does not claim a shared dev deployment or route cutover.
- If rollback is required, revert the task commit on branch `codex/ent-disp-fe-20260612-f` and remove the added test/library files; no data migration or backend contract rollback is involved.
