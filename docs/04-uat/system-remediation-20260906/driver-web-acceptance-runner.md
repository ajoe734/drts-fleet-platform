# SR-DRIVER-WEB-ACCEPTANCE-RUNNER-20260911: Driver web/SQLite and native-export acceptance

- Task: `SR-DRIVER-WEB-ACCEPTANCE-RUNNER-20260911`
- Owner: `Claude2` (reassigned mid-task from `Claude` via an
  availability-first supervisor reassignment; `Claude2` picked up the
  in-flight implementation, fixed the bugs the first hosted run exposed —
  see §5 — and pushed the candidate)
- Reviewer: `Claude`
- Parent: `SR-DRIVER-WEB-001` (merged as `cad0b6b3c03fdd79efb56a8762184bb0580ce461`,
  PR #1965). That candidate's own UAT doc,
  `docs/04-uat/system-remediation-20260906/SR-DRIVER-WEB-001.md` §"未執行 /
  誠實揭露的限制", states plainly: no `expo` CLI command was ever run, no
  browser check of `/`, `/onboarding`, `/sos` was ever performed, no native
  export was ever produced, and the acceptance workflow/validator files did
  not exist yet — everything in that doc is static source analysis plus
  type/unit tests, not runtime proof.
- Status of this document: written by this task's owner at implementation
  time; §5 ("Real run evidence") is filled in after the actual GitHub Actions
  run(s), not before — do not treat SHAs/run IDs in that section as
  authoritative until they are.

## 1. Why this task exists

`SR-DRIVER-WEB-001` fixed two real bundling defects (a native-only
`react-native-maps` import breaking the entire web bundle, and Metro's
default `resolver.assetExts` not including `wasm` so `expo-sqlite`'s web
runtime couldn't load) but, per its own honest disclosure, never ran `expo
export`, never opened a browser against the result, and never produced a
native export. This task supplies that missing real evidence: it does not
edit any file under `apps/driver-app/` (all `SR-DRIVER-WEB-001` write scopes,
untouched here), and it does not reopen or re-approve `SR-DRIVER-WEB-001`.

## 2. What this workflow actually runs, and where

Two independent jobs in `.github/workflows/driver-web-acceptance.yml`, both
GitHub-hosted only (this project's VM does not permit starting product
dev/preview/browser servers, and separately its tool sandbox classifies any
`expo` CLI invocation — even `expo --version` — as a deferred/blocked
dev-server-adjacent command, confirmed while building this task):

| Job | Required-acceptance gate | What it proves |
| --- | --- | --- |
| `web-export-and-browser-acceptance` | `driver_web_routes_and_sqlite_runtime` | A real `expo export -p web`, served over HTTP with the headers its SQLite runtime needs, real Chromium hitting `/`, `/onboarding`, `/sos`. |
| `native-export-acceptance` | `driver_native_export_import_boundaries` | A real `expo export --platform ios` followed by `expo export --platform android` into the same output dir (plain JS, no Hermes bytecode) whose output is grepped to prove the native map module was actually selected and the web-only fallback module was not. |

### 2.1 Web job: export, serve, browse

- `npx expo export -p web --output-dir dist` runs for real from
  `apps/driver-app`, with `EXPO_PUBLIC_API_URL` pinned to
  `http://127.0.0.1:1` (an address nothing listens on) instead of the real
  `extra.apiBaseUrl` Cloud Run URL in `app.json`. This job never exercises a
  real backend and must not depend on that Cloud Run URL's reachability or
  response shape — see `driver-web-browser-acceptance.spec.ts`'s header
  comment for the source-level proof that an unreachable API is always
  caught (`driver-identity-bootstrap.ts`'s `syncDriverIdentityBootstrap`
  funnels every identity-fetch failure into `onWarning` ->
  `console.warn`, never `console.error`; `app/onboarding.tsx`'s own
  `initializeDriverIdentity().catch(...)` likewise never reaches
  `console.error`).
- A "web bundle boundary" gate greps every exported JS file for
  `PROVIDER_GOOGLE` (the native `react-native-maps` import's own marker,
  `components/driver-trip-map.tsx:11,291`) and fails the job if it is
  present, proving `driver-trip-map.web.tsx` — not the native file — was
  actually selected by Metro's platform-extension resolution for the web
  bundle.
- `apps/driver-app` has no `web.output` key in `app.json`; reading
  `@expo/cli`'s `exportApp.js` directly confirms `useServerRendering` is only
  true for `web.output: "static"`/`"server"`, so this app's export is a
  single-bundle SPA (one `index.html`, all routing client-side). A generic
  static file server 404s on `/onboarding` and `/sos` because of this;
  `driver-web-static-server.mjs` serves `apps/driver-app/dist` with an
  index.html fallback for exactly that reason.
- `expo-sqlite`'s web runtime (`expo-sqlite/web/WorkerChannel.ts`) opens a
  Worker that allocates `SharedArrayBuffer`s for its lock/result channel.
  Chromium only exposes `SharedArrayBuffer` on cross-origin-isolated pages,
  which requires `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: require-corp` response headers — absent
  those, `initializeDriverLocationOfflineQueue()` (invoked unconditionally,
  bare `void`, no `.catch`, from `_layout.tsx`'s mount effect via
  `initializeDriverLocationHeartbeat()`) throws as an **unhandled promise
  rejection**. `driver-web-static-server.mjs` sets both headers on every
  response for exactly this reason, and the Playwright spec's
  zero-console-error / zero-page-error assertions are what would actually
  catch a regression here, not decoration.
- `/` and `/sos` are `PROTECTED_DRIVER_ROUTES` (`driver-identity-routing.ts`);
  with no provisioned identity (guaranteed here, since the API is
  unreachable), `_layout.tsx`'s bootstrap effect calls
  `resetDriverAppToOnboarding`, which client-side-redirects both to
  `/onboarding`. `driver-web-browser-acceptance.spec.ts` therefore asserts
  the real observed outcome — final URL `/onboarding` and the real
  `states.not_provisioned.title` heading ("裝置未啟用",
  `lib/strings.ts:292`) — for all three starting routes, plus the SQLite wasm
  asset network response, rather than asserting distinct per-route content
  that this environment has no real backend to produce honestly.

### 2.2 Native job: export, grep

- `expo export --platform` only accepts a single value (`android`, `ios`,
  `web`, or `all`; confirmed via `--help` and by the first hosted run's own
  `CommandError: Unsupported platform "ios,android"`), not a comma-separated
  list. The job therefore runs `npx expo export --platform ios --no-bytecode
  --output-dir dist-native --clear` followed by `npx expo export --platform
  android --no-bytecode --output-dir dist-native` (no `--clear` on the
  second call). Reading `@expo/cli`'s `exportApp.js` directly confirms
  `--clear` only resets the Metro bundler cache (`resetDevServer`), not the
  output directory, so the second invocation does not erase the first
  platform's bundle. `--no-bytecode` disables Hermes bytecode compilation
  (confirmed to exist by reading `@expo/cli`'s `resolveOptions.js` directly),
  so the output stays plain, grep-able JS instead of opaque `.hbc` bytecode.
- The gate asserts, per platform: at least one output JS file exists, it
  contains `PROVIDER_GOOGLE` (the real native map was bundled, not silently
  dropped), and it does **not** contain the web-only fallback module's own
  distinguishing string, `"畫面保留地址與 fallback 指引"`
  (`driver-trip-map.web.tsx:249`) — i.e. the native bundle did not
  accidentally pick up the web platform file.

## 3. Explicit scope boundaries (not covered by either job)

- No EAS build, no code signing, no physical iOS/Android device, no App
  Store/Play Store artifact. `expo export --platform ios,android` is local
  Metro bundling only — the same distinction `build-driver-ios.yml`'s own
  comment draws between itself (a paid, credentialed EAS cloud build) and
  anything runnable here.
- No live GPS, no live SOS delivery, no real driver identity/session, no
  real backend of any kind — `EXPO_PUBLIC_API_URL` is deliberately
  unreachable in the web job, and the native job never boots a JS runtime at
  all (it only inspects the serialized bundle text).
- The web job's three-route check converges on the same
  redirected-to-`/onboarding` outcome by design (see §2.1) because there is
  no real backend to provision a driver identity against; it does not
  independently exercise `/`'s or `/sos`'s *provisioned* UI states.
- Browser emulation only: fixed-viewport headless Chromium via
  `playwright.system-remediation.config.ts`, not physical-device rendering.

## 4. Local validation performed before pushing (worker VM only)

This VM's tool sandbox classifies any `expo` CLI call as a deferred
dev-server-adjacent command (reproduced: `expo --version` and `expo export`
both refused, matching `SR-DRIVER-WEB-001`'s own report), and separately
disallows starting browser/HTTP servers. Neither job in this workflow can
therefore be run locally; both require the dedicated GitHub Actions runners
in §5. What was run locally instead:

```
$ python3 tools/ci/test_driver_web_acceptance_workflow.py
Ran 30 tests in 0.516s
OK
```

Structure assertions (dispatch/push triggers, candidate-SHA validation and
verification in both jobs, always()-evidence upload, no VM-restricted
commands) plus real subprocess execution of every `PY_GATE`/`PY_STATUS`
heredoc against crafted fixtures — including a
`test_no_unsubstituted_github_expression_survives_into_any_extracted_heredoc`
check added after an early draft of this workflow left a `${{ env.* }}`
GitHub Actions expression inside a Python heredoc, which would have been a
syntax error at actual run time.

```
$ pnpm exec vitest run tests/unit/system-remediation/sr-driver-web-acceptance-runner/
Test Files  1 passed (1)
     Tests  1 passed (1)

$ pnpm exec vitest run tests/unit/system-remediation/sr-driver-web-001/
Test Files  2 passed (2)
     Tests  8 passed (8)
(SR-DRIVER-WEB-001's own metro.config.js / driver-trip-map platform-split
 unit tests, unaffected by this task's changes)

$ git diff --check
(exit 0, no output)

$ python3 -c "import yaml; yaml.safe_load(open('.github/workflows/driver-web-acceptance.yml'))"
(parses without error)
```

`pnpm exec tsc -p tsconfig.json --noEmit` was also run: it reports the same
pre-existing, unrelated failures present on `dev` before this task
(`pg`/`pdfjs-dist` module resolution and a duplicate-`ApiClient`-type
symlink artifact from this worktree's own path, none of which mention
`tests/e2e/system-remediation/sr-driver-web-001/**` or this task's new
files) and zero new errors from either new file.

## 5. Real run evidence

Three `push`-triggered hosted runs against this branch, all on
GitHub-hosted `ubuntu-latest` runners. The first two are kept here, not
scrubbed, because they are exactly the kind of real-runtime evidence this
task exists to produce — including of its own workflow's bugs, not just of
`apps/driver-app`:

| Run | SHA | Result | What it proved |
| --- | --- | --- | --- |
| [34569089458](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34569089458) | `a43f4e85b` | both jobs failed | `web` job: static server step ran `pnpm exec tsx driver-web-static-server.ts`, but `tsx` is only a devDependency of `apps/api`, not the workspace root — command not found. `native` job: `expo export --platform ios,android` — `CommandError: Unsupported platform "ios,android"`. |
| [34570107192](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34570107192) | `21b53296a` | `web` job partially passed, `native` job still failed | Static server fix worked: export, boundary gate, and server start all passed for real, and the browser suite **genuinely executed** — `/` and `/sos` passed, `/onboarding` failed on `expected at least one network response for expo-sqlite's wa-sqlite.wasm asset, got 0` (a real wasm-load race between the async SQLite init and the synchronous assertion, worse on direct navigation than on the client-redirect routes — see §2.1 and the spec's own comment). `native` job: same `ios,android` platform-arg bug, not yet fixed at this SHA. |
| [34570415756](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34570415756) | `fe40644f6` | **both jobs passed** | See below. |

`34570415756` (`fe40644f6`, both jobs `success`, `conclusion: success`):

```
web-export-and-browser-acceptance:
  Web bundle boundary gate: 2 JS files, zero PROVIDER_GOOGLE leaks.
  Driver web browser acceptance: 3/3 passed, zero skips.
  Run status recorded: passed

native-export-acceptance:
  {
    "ios":     {"bundle_file_count": 1, "has_native_map_provider": true, "leaks_web_only_fallback_marker": false},
    "android": {"bundle_file_count": 1, "has_native_map_provider": true, "leaks_web_only_fallback_marker": false}
  }
  Native import boundary gate: both platforms use the real native map and exclude the web fallback module.
  Run status recorded: passed
```

Both jobs' `run-status.json`, the Playwright JSON report, execution logs, and
native-bundle-boundary evidence JSON are uploaded as workflow artifacts
(`driver-web-acceptance-web-fe40644f66bb443d40768ba7018c908106fc9a87`,
`driver-web-acceptance-native-fe40644f66bb443d40768ba7018c908106fc9a87`) on
that run.

This closes both required-acceptance gates for real:
`driver_web_routes_and_sqlite_runtime` and
`driver_native_export_import_boundaries`. Scope boundaries in §3 remain
unperformed by design, not by omission.

## 6. Traceability

- Planning ref: `docs/04-uat/system-remediation-20260906/source/capabilities.json`
- Execution ref: `docs/03-runbooks/system-remediation-execution-tasks-20260906.md`
- Parent product doc: `docs/04-uat/system-remediation-20260906/SR-DRIVER-WEB-001.md`
- Sibling pattern this task follows: `.github/workflows/host-acceptance.yml`,
  `tools/ci/test_host_acceptance_workflow.py`,
  `docs/04-uat/system-remediation-20260906/host-acceptance-runner.md`
