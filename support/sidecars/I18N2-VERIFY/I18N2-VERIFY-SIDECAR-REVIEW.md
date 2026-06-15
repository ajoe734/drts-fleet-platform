# I18N2-VERIFY Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`
**Parent Task:** `I18N2-VERIFY` — Final i18n full-sweep verification across the
three web apps (passenger-web, concierge-portal-web, tenant-console-web)
**Parent Owner:** `Codex`
**Parent Reviewer:** `Claude2`
**Sidecar Owner:** `Claude`
**Sidecar Reviewer:** `Codex`
**Generated:** `2026-06-15` (UTC)
**Status:** `REVIEW SUPPORT ARTIFACT` — support-only; does not modify canonical
truth, runtime behavior, or the parent task's implementation files.

This packet is a reviewer-facing companion to the parent task `I18N2-VERIFY`,
which is the closeout/verification slice of the `i18n-fullsweep-20260614`
phase. The parent adds a repository-wide i18n guard
(`scripts/i18n-guard.mjs`) and clears the last residual hardcoded
user-facing literals in tenant-console-web so that all three apps pass a
single mechanical bilingual-coverage gate. The parent task is the canonical
verification slice; this packet pins the machine-truth handoff record, the
dependency closeout map, the file-level change shape, and an **independent
re-run** of the parent's primary guard so the parent reviewer (`Claude2`) can
audit the chain without re-deriving it from scratch.

At packet generation time the parent task is **in `review`** — `Codex`
handed it to `Claude2` at `2026-06-14T23:58:56Z`. Commit
`63e04de5a64e17d73fecb36d3cb23f0d0fc35120` is pushed to
`origin/codex/i18n2-verify`. The slice is **not yet merged to `dev`**
(`branch_pushed` integration level only). This packet does not approve, merge,
or close out the parent — those remain the parent reviewer's / parent owner's
steps.

Transient parent lifecycle truth (`status`, `next`, `last_update`, and any
future `commit_hash` / `push_*` fields) remains authoritative only in
`ai-status.json`. This packet snapshots the most recent values for reviewer
convenience but does not replace machine truth.

---

## 1. Scope Boundary

In scope (support artifact only):

- restate the parent acceptance bar as a concrete reviewer checklist
- pin the 15 machine-truth dependencies and their closeout state
- enumerate the parent's verifiable anchors (commit, branch, changed files,
  guard script)
- record an **independent reproduction** of the parent's primary guard result
- record the integration level (`branch_pushed`) so the reviewer does not
  mistake branch closeout for dev-deploy closeout

Out of scope (would violate sidecar guardrails):

- editing L1/L2 product truth, the parent task entry in `ai-status.json`, or
  any implementation file the parent touched
  (`apps/tenant-console-web/lib/translations.ts`,
  `apps/tenant-console-web/lib/formatters.ts`,
  `apps/tenant-console-web/components/tenant-shell.tsx`,
  `apps/tenant-console-web/app/bookings/new/tenant-booking-create-form.tsx`,
  `scripts/i18n-guard.mjs`)
- approving, reopening, merging, or `done`-closing the parent task
- absorbing this sidecar into the mainline — absorption is the parent owner's
  decision after parent review approval

---

## 2. Machine Truth Anchors

### Sidecar (this task) — `ai-status.json → I18N2-VERIFY-SIDECAR-REVIEW`

- owner=`Claude`
- reviewer=`Codex`
- phase=`i18n-fullsweep-20260614`
- task_class=`sidecar`
- helper_parent=`I18N2-VERIFY`
- helper_kind=`review_packet`
- mutates_canonical=`false`
- artifacts=`support/sidecars/I18N2-VERIFY/I18N2-VERIFY-SIDECAR-REVIEW.md`
- live lifecycle fields (`status`, `next`, `last_update`) deferred to
  `ai-status.json`

### Parent — `ai-status.json → I18N2-VERIFY` (snapshot @ `2026-06-14T23:58:56Z`)

- owner=`Codex`
- reviewer=`Claude2`
- status=`review`
- phase=`i18n-fullsweep-20260614`
- branch=`codex/i18n2-verify`
- anchor commit=`63e04de5a64e17d73fecb36d3cb23f0d0fc35120`
  (`I18N2-VERIFY: add i18n guard and clear remaining tenant literals`,
  authored `2026-06-14 23:58:30 +0000`)
- push target=`origin/codex/i18n2-verify` (confirmed: local `codex/i18n2-verify`
  and `origin/codex/i18n2-verify` both point at `63e04de5a`)
- integration level=`branch_pushed` — commit `63e04de5a` is **not** an ancestor
  of `dev` or `main` at packet time

---

## 3. Dependency Closeout Map

The parent declares 15 dependencies. All are complete. Ten are still resident
in `ai-status.json` as `done`; five (the earliest wave) have been merged and
pruned out of live state by retention, but their closeout commits remain in
git history. Latest associated commit per dependency:

| Dependency | State source | Latest commit |
| --- | --- | --- |
| `I18N2-FE-PASSENGER` | merged+pruned | `f82aa18dd` merge passenger-web bilingual i18n (#705) |
| `I18N2-FE-CONCIERGE` | merged+pruned | `509d72b04` owner closeout finalize |
| `I18N2-TC-SETTINGS` | merged+pruned | `92b2c9176` centralize settings i18n via t() |
| `I18N2-TC-WEBHOOKS` | merged+pruned | `95f5c4bc6` Integrate webhooks i18n (typecheck-verified) |
| `I18N2-TC-APIKEYS` | merged+pruned | `b72d2a39b` include uncommitted constants/actions type additions |
| `I18N2-TC-COSTCENTERS` | `done` (Codex/Claude) | `8949f6896` anchor cost-centers i18n |
| `I18N2-TC-REPORTS` | `done` (Claude/Codex) | `36c0e6029` centralize reports i18n |
| `I18N2-TC-RULES` | `done` (Codex/Claude2) | `464a88efa` owner closeout finalize |
| `I18N2-TC-SLA-AUDIT` | `done` (Codex/Claude2) | `1f127ecd4` owner closeout finalize |
| `I18N2-TC-INVOICES-BILLING` | `done` (Codex/Claude2) | `544d51c78` (+UNBLOCK-HISTORY-REPAIR chain) |
| `I18N2-TC-PAX-ADDR` | `done` (Codex/Claude) | `0be3ed032` anchor tenant-console i18n |
| `I18N2-TC-USERS-INTGOV` | `done` (Codex/Claude) | `7b204a867` anchor fallback i18n cleanup |
| `I18N2-TC-NOTIFICATIONS` | `done` (Codex/Claude2) | `60f1d1906` centralize notifications copy (#707) |
| `I18N2-TC-FEATUREFLAGS` | `done` (Codex/Claude) | `161673462` anchor feature-flags i18n |
| `I18N2-TC-HOME-SHARED` | `done` (Codex/Claude) | `9394972d4` finish shared-lib i18n (formatters + notification-canvas) |

**Reviewer note:** the parent is a *cross-cutting* verification slice — its
job is to prove the union of all 15 slices passes one mechanical gate, not to
re-audit each slice's translation keys. Per-slice key-level review was already
performed by each slice's own reviewer (column 2 above).

---

## 4. Parent Change Shape (commit `63e04de5a`)

`git show --stat 63e04de5a` — 5 files, +691 / −239:

```
apps/tenant-console-web/app/bookings/new/tenant-booking-create-form.tsx |   2 +-
apps/tenant-console-web/components/tenant-shell.tsx                      |   2 +-
apps/tenant-console-web/lib/formatters.ts                               |   6 +-
apps/tenant-console-web/lib/translations.ts                            | 636 ++++++---
scripts/i18n-guard.mjs                                                  | 284 +++++  (new)
```

Shape read: the bulk is `translations.ts` (centralized copy) plus the new
guard. The three small edits (`tenant-booking-create-form.tsx`,
`tenant-shell.tsx`, `formatters.ts`) are the residual-literal cleanups the
guard would otherwise flag. No runtime/contract/registry/governance surface is
touched — this is presentation-layer copy + a CI-style lint script.

### Guard design (`scripts/i18n-guard.mjs`, 284 lines)

- Scans `app/`, `components/`, `lib/` under the three apps
  (`passenger-web`, `concierge-portal-web`, `tenant-console-web`).
- Parses `.ts`/`.tsx` with the `typescript` compiler API; excludes the
  `translations.ts` dictionaries themselves.
- Flags CJK / Latin user-facing string literals (JSX text + copy-bearing
  attributes `placeholder`/`title`/`alt`/`aria-label`) that are not routed
  through `t()`, while allowlisting machine tokens (locale tags, slugs,
  enum-style `A-Z0-9_-` identifiers, `Q-*` codes).

---

## 5. Independent Verification (this packet)

The parent's reported verification (from `ai-status.json.next`):

> passenger-web lint+typecheck+build green; concierge-portal-web
> lint+typecheck+build green; tenant-console-web lint+typecheck+build green;
> `node scripts/i18n-guard.mjs` OK (122 files across 3 apps). Commit
> `63e04de5…` pushed to `origin/codex/i18n2-verify`.

This packet independently re-ran the **primary guard** against the parent
commit in a throwaway detached worktree (`git worktree add --detach <wt>
63e04de5a`):

```
$ node scripts/i18n-guard.mjs
i18n-guard: OK (122 files scanned across 3 apps)
EXIT=0
```

✅ **Reproduced.** The guard passes at exit 0 with the same 122-file /
3-app scope the parent reported. The temp worktree was removed after the run;
no canonical state was touched.

Not independently re-run by this packet (heavier; per-app `node_modules`):
the per-app `lint` / `typecheck` / `build` triplets. These remain
**owner-reported** and are recommended for the parent reviewer to reproduce —
see §6.

---

## 6. Reviewer Checklist (for parent reviewer `Claude2`)

1. **Commit/push integrity** — confirm `origin/codex/i18n2-verify` == `63e04de5a`
   and that the diff matches §4 (`git show --stat 63e04de5a`). ✅ pre-verified
   in this packet.
2. **Guard passes** — `node scripts/i18n-guard.mjs` → `OK … 122 files across 3
   apps`, exit 0. ✅ independently reproduced in §5.
3. **Per-app build triplets** — re-run `lint`/`typecheck`/`build` for
   passenger-web, concierge-portal-web, tenant-console-web (owner-reported
   green; reproduce to confirm).
4. **Scope hygiene** — confirm the diff stays in presentation copy +
   `scripts/i18n-guard.mjs` and touches no contract/runtime/governance surface
   (§4).
5. **Dependency closure** — all 15 deps `done`/merged (§3); the verify slice is
   correctly cross-cutting, not a per-slice re-audit.
6. **Integration honesty** — record finalize at `branch_pushed`; do **not**
   claim `merged_to_dev` / `dev_deployed` — `63e04de5a` is not yet on `dev`.

---

## 7. Handoff

This support artifact is complete and handed to the sidecar reviewer (`Codex`).
It makes no canonical-truth changes. Parent approval, merge to `dev`, and the
parent `done` closeout remain with `Claude2` (parent reviewer) and `Codex`
(parent owner) respectively.
