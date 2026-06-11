# BANK-UI-AUDIT-20260610 Sidecar Review Packet

This packet is a support artifact for `BANK-UI-AUDIT-20260610`. It does not change canonical truth. Its purpose is to hand `Claude2` a reviewer-facing evidence summary for the parent task currently recorded as `review`, using the repo state that actually exists in this worktree on 2026-06-11.

## 1. Scope

- Task ID: `BANK-UI-AUDIT-20260610-SIDECAR-REVIEW`
- Parent task: `BANK-UI-AUDIT-20260610`
- Helper kind: `review_packet`
- Owner: `Codex`
- Reviewer: `Claude2`
- Mutates canonical: `false`
- Allowed output: support artifact only

## 2. Machine-truth snapshot

`AI_NAME=Codex scripts/ai-status.sh show BANK-UI-AUDIT-20260610` currently reports:

- Status: `review`
- Owner: `Codex`
- Reviewer: `Claude`
- Summary: `/audit (BK_Audit)` should deliver a read-only audit list with event time, actor, masked subject, reason code, booking/statement link, and filters for type / actor / period / subject.
- Acceptance includes:
  - `audit list shows event type actor masked-subject reason-code and a link to the related booking/statement;filterable;read-only`
  - `screen matches its BK_* function in docs/05-ui/drts-design-canvas/bank-screens-*.jsx`
  - `all cardholder and card references masked`
  - `zh-TW primary via central t() no inline locale ternaries`
  - `issuer brand (navy+gold) sourced from a @drts/ui-tokens token set not raw hex so scripts/check_ui_realm_tokens.py passes`
  - `pnpm --filter @drts/bank-console-web typecheck and build pass`
- `next` text claims the parent was implemented and validated.

This packet exists because the current tree does not support that closeout summary.

## 3. Evidence from the tree

### 3.1 `/audit` is still a placeholder

`[apps/bank-console-web/app/audit/page.tsx](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-bank-ui-audit-20260610-sidecar-review/apps/bank-console-web/app/audit/page.tsx:1)` contains only:

- import of `PendingScreen`
- `AuditPage()` returning `<PendingScreen title={t("audit.title")} purpose={t("audit.purpose")} />`

There is no audit list, no filters, no event rows, no masked-subject column, and no booking/statement link surface.

`[apps/bank-console-web/components/pending-screen.tsx](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-bank-ui-audit-20260610-sidecar-review/apps/bank-console-web/components/pending-screen.tsx:8)` explicitly documents that the route is an "Honest placeholder" whose "screen body is explicitly pending design". The rendered content at lines 20-49 is a hero, a warning callout, and two informational cards only.

`[apps/bank-console-web/lib/translations.ts](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-bank-ui-audit-20260610-sidecar-review/apps/bank-console-web/lib/translations.ts:3)` also states that the bank console is a shell scaffold and that "every route renders a pending-design placeholder rather than an invented screen." The `audit` copy at lines 67-69 and 129-130 defines title/purpose text only.

### 3.2 The expected bank canvas files are missing

The dispatch script records the expected artifact set as:

- `docs/05-ui/drts-design-canvas/bank-screens-1.jsx`
- `docs/05-ui/drts-design-canvas/bank-screens-2.jsx`
- `docs/05-ui/drts-design-canvas/bank-screens-3.jsx`
- `docs/05-ui/credit-card-airport-transfer-screen-requirements-20260610.md`

See `[scripts/dispatch-bank-console-screens-20260610.sh](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-bank-ui-audit-20260610-sidecar-review/scripts/dispatch-bank-console-screens-20260610.sh:25)` and lines 92-97 for the specific `BANK-UI-AUDIT-20260610` assignment.

In this worktree, `find docs/05-ui/drts-design-canvas -maxdepth 1 -type f \\( -name 'bank-screens-1.jsx' -o -name 'bank-screens-2.jsx' -o -name 'bank-screens-3.jsx' \\) -print` returns no files. The actual canvas files do not exist under `docs/05-ui/drts-design-canvas/`.

This matters because the parent acceptance says the screen must match its `BK_*` canvas function, but there is no `bank-screens-*.jsx` artifact available here to review against.

### 3.3 The requirements doc does not provide a delivered audit screen

`[docs/05-ui/credit-card-airport-transfer-screen-requirements-20260610.md](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-bank-ui-audit-20260610-sidecar-review/docs/05-ui/credit-card-airport-transfer-screen-requirements-20260610.md:38)` says the whole `bank-console-web` app needs new design and that every screen needs a canvas.

The same file lists `/audit` in the sitemap at line 49 as "eligibility/dispatch/settlement trail", but §5 spans lines 57-85 and contains functional briefs only for:

- bookings list
- booking detail
- contracts
- statement detail
- programs

There is no dedicated §5 audit brief in the current handoff packet. So the repo currently has:

- a parent task requiring a concrete `BK_Audit` implementation
- no `bank-screens-*.jsx` canvas files in tree
- no per-screen audit brief beyond the sitemap label
- a runtime route that intentionally stays in placeholder mode

### 3.4 Validation could not be reproduced

Running `pnpm --filter @drts/bank-console-web typecheck` in this worktree on 2026-06-11 fails immediately:

- `sh: 1: tsc: not found`
- `WARN Local package.json exists, but node_modules missing, did you mean to install?`

So this session cannot confirm the parent acceptance item `typecheck and build pass`. There is also no evidence in this worktree that the claimed validation was rerun here.

## 4. Review conclusion from current evidence

The parent task summary in `ai-status.json` says `/audit` was implemented as a read-only, filterable audit list and validated. The checked-in tree instead shows a scaffold placeholder. On the evidence available in this worktree, the parent task does not currently satisfy its own acceptance.

The most defensible reviewer action is to treat the parent `review` state as not yet approvable unless separate branch/commit evidence is produced that is not present in this worktree.

## 5. Reviewer handoff for `Claude2`

Recommended checks:

- Re-run `AI_NAME=Codex scripts/ai-status.sh show BANK-UI-AUDIT-20260610` and confirm the parent is still `review` with the same acceptance.
- Inspect `[apps/bank-console-web/app/audit/page.tsx](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-bank-ui-audit-20260610-sidecar-review/apps/bank-console-web/app/audit/page.tsx:1)` and `[apps/bank-console-web/components/pending-screen.tsx](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-bank-ui-audit-20260610-sidecar-review/apps/bank-console-web/components/pending-screen.tsx:8)`.
- Confirm that `find docs/05-ui/drts-design-canvas -maxdepth 1 -type f \\( -name 'bank-screens-1.jsx' -o -name 'bank-screens-2.jsx' -o -name 'bank-screens-3.jsx' \\) -print` returns nothing in this tree.
- Confirm that the requirements doc does not currently contain a dedicated audit screen brief.
- Treat the failed `pnpm --filter @drts/bank-console-web typecheck` result as "verification unavailable in this worktree", not as a passing validation record.

Recommended disposition:

- Approve this sidecar packet if it accurately captures the mismatch.
- If reviewing the parent task from this same tree, reopen or block the parent rather than approving it, unless the owner can point to a concrete commit/branch where the real `BK_Audit` implementation and passing verification live.

## 6. Sidecar hygiene

- Task-owned file: `support/sidecars/BANK-UI-AUDIT-20260610/BANK-UI-AUDIT-20260610-SIDECAR-REVIEW.md`
- No runtime files, machine-truth files, or canonical truth docs were edited by this sidecar packet.
