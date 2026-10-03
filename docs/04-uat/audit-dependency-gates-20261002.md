# UAT: Audit Dependency Gates (2026-10-02)

## Overview

This document serves as evidence and documentation for the dependency audit gate added on 2026-10-02.

## Actionable Production Dependency Security Gate

We have added an actionable production dependency security gate that runs in our CI pipelines (`.github/workflows/ci.yml` and `.github/workflows/ci-integ.yml`) as part of the primary branch protection checks.
It executes `pnpm audit --prod` and processes the results.

### Runtime-Reachability Distinction

Not all vulnerabilities reported by `pnpm audit` constitute active runtime vulnerabilities for deployed containers:

- **Build/Tooling Dependencies**: Vulnerabilities in packages used exclusively for bundling, compilation, or static analysis (e.g., Babel, Expo CLI, Metro) are generally not exposed to production traffic. They are not active runtime vulnerabilities.
- **Mobile Dependencies**: Dependencies used in the React Native mobile app (`apps/driver-app`) are compiled into static binaries or client-side bundles and are not subject to server-side exploits.
- **Windows-only transitive dependencies**: Code paths only executed on Windows or via development binaries are not reachable in our production Linux container deployments.

We programmatically ignore these through explicitly documented, expiry-bound exceptions in the `tools/ci/dependency-security-exceptions.json` file.

### Expiry-Bound Exception Mechanism

In cases where a dependency has a vulnerability but no patch is available (e.g. upstream maintainer delay, or transitive dependency blocked by a direct dependency constraint) or it is strictly not reachable at runtime (build/mobile tools), we allow documenting an explicit, expiry-bound exception.
These exceptions are recorded in `tools/ci/dependency-security-exceptions.json`. Each exception must have an `expires_at` timestamp. The CI script will fail if an exception has passed its expiry date. This ensures we follow up on unpatched vulnerabilities without blocking daily deployments indefinitely.

## Audit Results and Remediations

The initial wave of updates successfully patched the majority of vulnerabilities by updating `openclaw`, `next`, `multer`, `express` and `@nestjs/*` to their latest supported versions:

- `apps/api`: NestJS is updated to `11.2.7`, `multer` is updated to `2.4.0` via dependency resolution, `openclaw` to `2026.9.2`, and `express` implicitly to `5.2.1`.

The remaining vulnerabilities (19 findings) have been individually documented and categorized as unreachable tooling paths or un-patchable package exceptions in our strict exception manifest (`tools/ci/dependency-security-exceptions.json`).

Specific Triage Findings:

- **uuid (1119441)**: Missing buffer bounds check in v3/v5/v6. Brought in via `apps__api>exceljs` and `apps__driver-app>expo>@expo/config-plugins`. The `exceljs` library uses `uuid.v4()` (lib/xlsx/xform/sheet/cf-ext/cf-rule-ext-xform.js:1,43,77) which is unaffected by this specific vulnerability. Mobile tooling path is not exposed at runtime. Exception scoped strictly to these paths and versions.
- **decode-uri-component (1147955)**: DoS via query-string. Brought in via `apps__driver-app>expo-router`. While graph inclusion is established via `expo-router/entry`, the vulnerable `queryString.parse` in `getStateFromPath.js:538` is commented out. The fork uses `new URL(...).searchParams` and `expo.parseQueryParams`. Thus, the affected decoder in `query-string` is not actually reachable through Expo Router.
- **image-size (1239765/1239766)**: DoS via Metro bundler. This is a build-time React Native tooling path and is not reachable in production.
- **node-forge (1240912), braces (1240992), postcss (4 findings), tar, ws, shell-quote, @babel/core**: These are all via Expo/React Native build and dev-middleware paths (`apps__driver-app>...`). Not exposed to production backend traffic.
- **protobufjs (1123492/1123964)**: Brought in via `apps__api>openclaw>@google/genai>protobufjs`. Used by the Google GenAI SDK for internal payload structuring, not dynamically parsing untrusted user `.proto` files at runtime.
- **body-parser (1123976)**: Brought in via `apps__api>@nestjs/platform-express>express>body-parser`. A minor size limit bypass. The advisory requires an INVALID supplied limit, not ordinary default parsing. `apps/api/src/main.ts:15-17` uses default NestFactory options which register default JSON/urlencoded parsers with a 100kb limit, without override. Thus, this vulnerability is not reachable with the default configuration.
- **@hono/node-server (1139322)**: Path traversal via `@modelcontextprotocol/sdk`. The vulnerability is Windows serve-static specific. `apps/api/Dockerfile` selects `node:22-alpine` (Linux), meaning this vulnerability is not applicable to our deployed platform.

## Review Provenance and Acceptance Evidence

This candidate incorporates corrections from consecutive Codex reviews and binds the eventual successor through handoff:
- **Baseline**: `1ae89472e38a56433fe43d192b84d5922257209f`
- **Historical Checked Source (Eighth Review)**: `2022f28e225c37ff197c3b36140e1385e5ef5056`
- **Adjacent Source (Ninth Review)**: `4e04fd073212194139edee4154e4db3f54342552`
- **Gate SHA256**: `ad39abf0bd5f44ab1dd866ef82da8fef0410358a1fb95fa88764e3a2b9d67617`
- **Manifest SHA256**: `a44502fc0a45dfba87d705d5b79517d6fdca52f73029cb4414297d7f274763e4`

### Findings and Acceptance Mapping

The following matrix maps review findings (R1-R9) and required acceptance criteria to traceable commands and results:

| Finding / Criteria | Validation Command / Source | Result & Evidence |
| :--- | :--- | :--- |
| **R1**: Missing CI test wiring | `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest tools/ci/test_dependency_security.py -v`<br>`PYTHONDONTWRITEBYTECODE=1 python3 tools/ci/check_test_coverage.py` | Exits 0, 17 tests PASS.<br>Exits 0, all 80 test files wired. Both CI paths run the suite. |
| **R2**: Audit operational errors pass<br>**R6**: Accurate UAT evidence | 61-case actual-main harness (mocking `subprocess.run` to provide `pnpm audit` output to `main -> run_audit`) | Review source: eighth-review evidence for 2022 (canonical Codex worker_outcome codex-20261003T021410Z-97b64061 at 2026-10-03T02:20:43Z). Valid clean/excepted reports pass (0). Invalid counters correctly reject. See R2 Regression Evidence below for historical matrix. |
| **R3**: Permanent blanket path bypass<br>**R4**: Package-wide exceptions bypass | 7-case actual-main manifest harness (mocking file loading, running `main -> real exception matching paths`) | Review source: eighth-review evidence for 2022. PASS. Unknown/unscoped advisory controls reject. Exact exceptions, missing scopes, duplicates handled correctly. |
| **R5**: Unrelated production expansion<br>**R7**: Retained rollback<br>**R8**: NextRequest conflict | Code inspection `package.json`, `pnpm-lock.yaml` | Resolved: `apps/api` depends on Nest 11.2.7, OpenClaw 2026.9.2, multer 2.4.0, Express 5.2.1, Next 16.3.8. |
| **R9**: Local commit policy failures | `PYTHONDONTWRITEBYTECODE=1 python3 tools/ci/git/check_commit_trailers.py --base 2b4b6b96aed1c41ae4b252681e0466ee808cbd0e --head 5cd63e7d43dc14629c43a3840306378bbdc72bdb` | Historical 5cd63e7d43dc14629c43a3840306378bbdc72bdb / tenth-review evidence: 10 commits OK; run 37097869320/job/111131397237 SUCCESS. The successor's full-range check is rerun before handoff and successor CI is bound through handoff. |
| **Acceptance**: `dependency_audit_triage_and_remediation` | `pnpm audit --prod --json` \| `tools/ci/dependency_security.py` | Actual pnpm audit exits 1 (19 distinct IDs, 20 counted findings). Gate script on that output exits 0 only after applying the 19 strict exceptions. |
| **Acceptance**: `classification_passes_and_ci_enforces` | Local verification and Hosted CI | Workflows `.github/workflows/ci.yml` and `ci-integ.yml` enforce gate and integration aggregate requires success. |
| **Acceptance**: `same_sha_typecheck_lint_ci` | Hosted CI pipelines | Historical 5cd63e7d43dc14629c43a3840306378bbdc72bdb evidence: integration run 37097869344, lint 111131468050 and typecheck 111131468023 SUCCESS. Successor CI remains pending through handoff until observed on its SHA. |

### R2 Regression Evidence (Guide 0.7)

The table below demonstrates the repair of false-accept operational cases between the baseline (`1ae89472e`), prior candidate (`ac03f8e3c`), and historical checked source (`2022f28e2` / `4e04fd073` / `5cd63e7d4`).

| Condition | Command / Test | Execution Version | Baseline (`1ae89472e`) | Prior Candidate (`ac03f8e3c`) | Source (`2022`/`4e04`/`5cd63`) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `rc=0`, missing advisories/vulnerabilities | `test_rc0_metadata_empty` | Python 3.12.3 | `exit 0` (False Accept) | `exit 1` (Reject) | `exit 1` (Reject) |
| `rc=0`, non-zero vulnerabilities | `test_rc0_metadata_vulnerabilities` | Python 3.12.3 | `exit 0` (False Accept) | `exit 1` (Reject) | `exit 1` (Reject) |
| `rc=0`, empty advisories | `test_rc0_advisories_empty_vulnerabilities` | Python 3.12.3 | `exit 0` (False Accept) | `exit 1` (Reject) | `exit 1` (Reject) |
| `rc=1`, empty findings array | `test_rc1_known_advisory_empty_findings` | Python 3.12.3 | `exit 0` (False Accept) | `exit 1` (Reject) | `exit 1` (Reject) |
| `rc=1`, empty paths array | `test_rc1_known_advisory_empty_paths` | Python 3.12.3 | `exit 0` (False Accept) | `exit 1` (Reject) | `exit 1` (Reject) |
| `rc=1`, string path instead of array | `test_rc1_known_advisory_string_paths` | Python 3.12.3 | `exit 0` (False Accept) | `exit 1` (Reject) | `exit 1` (Reject) |
| `rc=0`, empty counter object `{}` | `test_rc0_metadata_vulnerabilities_empty` | Python 3.12.3 | `exit 0` (False Accept) | `exit 0` (False Accept) | `exit 1` (Reject) |
| `rc=0`, missing critical counter | `test_rc0_metadata_vulnerabilities_missing_counter` | Python 3.12.3 | `exit 0` (False Accept) | `exit 0` (False Accept) | `exit 1` (Reject) |
| `rc=0`, negative numeric counts (`-1`) | `test_rc0_metadata_vulnerabilities_negative_numeric` | Python 3.12.3 | `exit 0` (False Accept) | `exit 0` (False Accept) | `exit 1` (Reject) |
| `rc=0`, invalid type counts (`1.5`, `True`) | `test_rc0_metadata_vulnerabilities_invalid_type` | Python 3.12.3 | `exit 0` (False Accept) | `exit 1` (Reject) | `exit 1` (Reject) |
| `rc=0`, string numeric counts (`"0"`) | `test_rc0_metadata_vulnerabilities_string_numeric` | Python 3.12.3 | `exit 0` (False Accept) | `TypeError` | `exit 1` (Reject) |

