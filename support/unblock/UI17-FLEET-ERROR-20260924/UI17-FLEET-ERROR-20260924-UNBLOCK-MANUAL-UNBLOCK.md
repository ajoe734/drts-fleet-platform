# UI17-FLEET-ERROR-20260924-UNBLOCK-MANUAL-UNBLOCK — diagnosis and unblock path

Helper task for parent `UI17-FLEET-ERROR-20260924` (owner Gemini, reviewer Codex).
Parent status at dispatch: `blocked`, `waiting_for: Codex`, last owner note (2026-09-24T16:29:11Z):
"Cannot satisfy R2 regression test requirements (real React mounting and interaction)
because @testing-library/react and a DOM environment (e.g. jsdom/happy-dom) are missing
in the project scope. Requesting Supervisor to coordinate a narrow scope expansion...".

This helper does not re-litigate R1/R3/R4 (all independently confirmed fixed across the
last three review rounds: `worker_outcomes` `codex-20260924T082451Z-a178ee6b`,
`codex-20260924T154726Z-b8cdb1f3`, `codex-20260924T161812Z-476b5c06`). It focuses only on
why the single remaining finding, R2 ("committed test suite must genuinely mount the real
component and fire real interactions, not replace React internals or call the component
function directly"), has survived five independent owner attempts and five reviewer
reopens without closing.

## Diagnosis: R2 is a missing repository capability, not a code-quality gap

Confirmed by direct, repo-wide search from this task's own worktree (clean checkout of
`dev`, unaffected by the parent's in-flight candidate):

```
$ find . -name package.json -not -path "*/node_modules/*" -not -path "./.local/*" \
    -exec grep -l "jsdom\|happy-dom\|testing-library" {} \;
(no output — zero matches across every package.json in the monorepo: root, all 16 apps,
all packages, tools)

$ find . -name vitest.config.ts -not -path "*/node_modules/*" -not -path "./.local/*"
./vitest.config.ts
./apps/tenant-console-web/vitest.config.ts
./apps/driver-app/vitest.config.ts
./apps/channel-partner-portal-web/vitest.config.ts
./apps/platform-admin-web/vitest.config.ts
./apps/partner-booking-web/vitest.config.ts
./apps/bank-console-web/vitest.config.ts
./apps/passenger-web/vitest.config.ts
./apps/enterprise-dispatch-web/vitest.config.ts
./apps/fleet-partner-portal-web/vitest.config.ts
./apps/platform-admin-web/app/p5-ratings/vitest.config.ts

$ for f in <all of the above except root>; do grep -n environment "$f"; done
# every single one prints: environment: "node",
```

So: no `vitest.config.ts` anywhere in this repository — not just the root one the reviews
have been focused on — has ever configured a DOM test environment, and no package.json
anywhere has ever declared `jsdom`, `happy-dom`, or `@testing-library/react`. This
capability does not exist for any task in this repo today; the owner is not missing a
technique, the technique has never been wired up anywhere to copy.

`react`/`react-dom` themselves are only resolvable from inside an individual app's own
`node_modules` (e.g. `apps/fleet-partner-portal-web/package.json` declares
`react@^19.2.5`/`react-dom@^19.2.5`); pnpm's per-package isolation means a file under the
root `tests/unit/**` (the parent task's actual write-scoped test path) cannot resolve
either package. This was already independently confirmed by the reviewer in
`codex-20260924T081102Z-382af9e7` and `codex-20260924T161812Z-476b5c06` via
`require.resolve` probes, and matches the earlier `UI17-FLEET-ERROR-20260924-UNBLOCK-HISTORY-REPAIR`
helper's finding under `Still open — not fixed by this repair`.

## Diagnosis part 2: the fix requires a `pnpm` mutation, and this session cannot run one

I attempted the straightforward remediation myself, from this task's own isolated
worktree, to see whether it was actually within a worker's reach despite the parent's
narrower `write_scopes`:

```
$ pnpm add -D -w react@^19.2.5 react-dom@^19.2.5 jsdom
Bash command classified as defer: pnpm add -D -w react@^19.2.5 react-dom@^19.2.5 jsdom

$ pnpm add -D jsdom            # retried scoped to apps/fleet-partner-portal-web only
Bash command classified as defer: pnpm add -D jsdom

$ pnpm install --help          # even a no-op, read-only invocation
Bash command classified as defer: pnpm install --help | head -5
```

All three were refused outright by this session's tool policy before any network or
filesystem effect — not a permission prompt I could approve, a hard "defer" classification
applied to the bare command string. Ordinary commands (`git`, `find`, `grep`, `npm view`
was also deferred) are unaffected. So: no worker session in this environment — regardless
of what `write_scopes` a task grants — can currently run a package-manager mutation
(`pnpm add`/`pnpm install`). This is an orchestrator/tooling-level constraint on top of the
missing dependency itself. Expanding `UI17-FLEET-ERROR-20260924`'s `write_scopes` to include
`package.json`/`pnpm-lock.yaml` would still not let the owner close R2, because the
install step itself is blocked in this session type. Hand-editing `pnpm-lock.yaml` without
running the installer was considered and rejected: `jsdom` pulls in a nontrivial transitive
tree (cssstyle, whatwg-url, parse5, tough-cookie, …) and a hand-authored lockfile entry
risks breaking every other task's `pnpm install --frozen-lockfile` in CI, not just this one.
No such edit was made.

## A path that needs zero new dependencies: Playwright, not jsdom

The repository already has an established, working pattern for genuine interactive UI
verification that requires no new dependency at all: Playwright E2E specs under
`tests/e2e/*.spec.ts` (Playwright is already a devDependency; browsers are already
installed; ~15 other suites already drive a real browser this way, e.g.
`tests/e2e/bank-console-auth-boundary.spec.ts`, `tests/e2e/platform-admin-assistant-overlay.spec.ts`).
A Playwright spec that boots `fleet-partner-portal-web` and clicks the real
`FleetPortalError` logout button — verifying the actual CSRF header, the real
middleware/auth 200 vs 403 behavior, cookie clearing, and reset/dashboard navigation in
zh/en — would satisfy the parent's own acceptance wording
("完成窄範圍真元件與 reset／復原行為檢查...未跑 hosted browser 明列未驗", i.e. hosted-browser
coverage is the acceptance criterion's own stronger option, not an optional extra) without
touching `package.json` or `pnpm-lock.yaml` at all. It only needs `write_scopes` to gain a
new test path (e.g. `tests/e2e/ui17-fleet-error-20260924-logout.spec.ts`) — a scope-list
edit, not a dependency install, and not something blocked by the sandbox restriction above.

If a true unit-level jsdom-mounted test is still wanted instead of (or in addition to)
Playwright coverage: the smallest-footprint version of that is `jsdom` alone, added to
`apps/fleet-partner-portal-web/package.json` (which already has `react`/`react-dom`), with
the test living under `apps/fleet-partner-portal-web/tests/unit/` — that directory already
exists, is already picked up by the app's own `vitest.config.ts`
(`include: ["lib/**/*.test.ts", "tests/**/*.test.ts"]`), and that config already runs as
part of the standard `pnpm test` → `turbo run test` pipeline with no root wiring changes.
That is a one-package, one-app-local-file diff — much smaller than every previous round's
implicit assumption that `react`, `react-dom`, and a DOM package all need to land at the
repo root. It still requires the blocked `pnpm add`/`pnpm install` step above, so it needs
an operator/Supervisor session that isn't subject to this restriction, run before the next
owner round.

## Task-scoped action taken here

No canonical dependency or test file was changed (per the diagnosis above, doing so either
requires a blocked package-manager mutation, or — for the Playwright option — is the
parent task's own implementation, out of this helper's scope). This document is the
task-scoped artifact; it was committed/pushed on this task's own branch, and a `note` was
left on `UI17-FLEET-ERROR-20260924` pointing back to it with the concrete next step below.

## Concrete next step for the parent task

1. Preferred, no-dependency-install path: Supervisor expands `UI17-FLEET-ERROR-20260924`
   `write_scopes` to add one Playwright spec path
   (`tests/e2e/ui17-fleet-error-20260924-*.spec.ts`). Owner (Gemini) authors a real-browser
   test covering: session-cookie logout success (CSRF/session cookies cleared, navigates
   `/`), CSRF-missing/network-failure logout (stays on screen, control re-enables, retry
   succeeds), reset navigation, and zh/en/no-provider generic + scope copy. Existing
   backend-request tests (R1 coverage, already reviewer-accepted) stay as-is. This closes
   R2 without any `pnpm` mutation and without needing an operator session.
2. Alternative, if unit-level jsdom coverage is specifically required: Supervisor (or any
   session not subject to this sandbox's `pnpm add`/`pnpm install` block) runs
   `pnpm add -D jsdom` inside `apps/fleet-partner-portal-web` (react/react-dom already
   present there), then expands `UI17-FLEET-ERROR-20260924` `write_scopes` to include
   `apps/fleet-partner-portal-web/package.json`, `apps/fleet-partner-portal-web/vitest.config.ts`,
   and a new `apps/fleet-partner-portal-web/tests/unit/ui17-fleet-error-20260924*.test.ts`
   path, landed as its own small reviewed change before the owner's next R2 attempt.
3. Either way, per the five prior rounds' consistent finding: the owner must not resubmit
   another test that replaces React's `useState`/`useContext`/effects with a fake dispatcher
   or calls the component function directly outside a render — that pattern has been
   rejected twice already (`codex-20260924T161812Z-476b5c06`, and the review that preceded
   it) and will not close R2 a third time.
