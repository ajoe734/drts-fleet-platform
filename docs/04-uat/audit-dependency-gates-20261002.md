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

- `apps/api`: NestJS is updated to `11.2.7`, `multer` is updated to `2.4.0` via dependency resolution, `openclaw` to `2026.9.2`, and `express` to `4.21.2`.

The remaining vulnerabilities (19 findings) have been individually documented and categorized as unreachable tooling paths or un-patchable package exceptions in our strict exception manifest (`tools/ci/dependency-security-exceptions.json`).

Specific Triage Findings:

- **uuid (1119441)**: Missing buffer bounds check in v3/v5/v6. Brought in via `apps__api>exceljs` and `apps__driver-app>expo>@expo/config-plugins`. The `exceljs` library uses `uuid.v4()` which is unaffected by this specific vulnerability (which only impacts v3/v5/v6 when user-provided buffers are used). Mobile tooling path is not exposed at runtime. Exception scoped strictly to these paths and versions.
- **decode-uri-component (1147955)**: DoS via query-string. Brought in via `apps__driver-app>expo-router`. This runs in the client-side React Native environment where a targeted Node.js event-loop exhaustion attack is not applicable or constitutes a localized client crash rather than a server breach.
- **image-size (1239765/1239766)**: DoS via Metro bundler. This is a build-time React Native tooling path and is not reachable in production.
- **node-forge (1240912), braces (1240992), postcss (4 findings), tar, ws, shell-quote, @babel/core**: These are all via Expo/React Native build and dev-middleware paths (`apps__driver-app>...`). Not exposed to production backend traffic.
- **protobufjs (1123492/1123964)**: Brought in via `apps__api>openclaw>@google/genai>protobufjs`. Used by the Google GenAI SDK for internal payload structuring, not dynamically parsing untrusted user `.proto` files at runtime.
- **body-parser (1123976)**: Brought in via `apps__api>@nestjs/platform-express>express>body-parser`. A minor size limit bypass. Expected to be resolved in future upstream NestJS/express releases; exception strictly scoped.
- **@hono/node-server (1139322)**: Path traversal via `@modelcontextprotocol/sdk`. MCP servers run internally in the API context for GenAI tools, not exposing general static file serving to public endpoints.

## Codex Review Remediation

The following findings from the review have been addressed:

- **R1 [P1] Missing CI test wiring / broken CI**:
  - **Fix/Result**: Retained repair. Test coverage and discovery pass.
- **R2 [P1] Audit operational errors pass**:
  - **Fix/Result**: The audit script now validates the `CompletedProcess` return code (enforcing 0 or 1). It also strictly validates the structure of the JSON report (ensuring `metadata` and `advisories` properties are objects, if present) and ensures that an exit code of 1 contains actual advisories to evaluate, preventing fail-open behavior.
- **R3 [P1] Permanent blanket path suppression bypasses runtime findings**:
  - **Fix/Result**: Retained repair. All exceptions, including those for build tools and mobile paths, are now explicitly managed via the `dependency-security-exceptions.json` file.
- **R4 [P1] Package-wide exceptions suppress future unrelated vulnerabilities**:
  - **Fix/Result**: Exceptions are now tightly scoped by `advisory_id`, `versions`, and `paths`. The parser strictly enforces that `versions` and `paths` are non-empty arrays, preventing the previous parser flaw where missing scopes were treated as unrestricted. 44 unscoped suppressions were removed, and exactly 19 tightly scoped ones were recreated based on strict triage. Package identity (`module_name`) is also strictly checked.
- **R5 [P2] Unrelated production dependency expansion**:
  - **Fix/Result**: Retained repair. The `openclaw` dependency is correctly scoped to `apps/api`.
- **R6 [P2] Acceptance evidence missing/inaccurate**:
  - **Fix/Result**: Updated this document to capture the 19 remaining findings with specific dispositions (not just generic wait-for-upstream), accurate versions, and removed unverified CI acceptance claims.
- **R7 [P1] Retained rollback of deliberate runtime upgrades**:
  - **Fix/Result**: Restored deliberate upgrades for `apps/api/package.json` (`@nestjs/*` 11.2.7, `openclaw` 2026.9.2, `express` 4.21.2) and regenerated `pnpm-lock.yaml`.
- **R8 [P2] NextRequest conflict**:
  - **Fix/Result**: Retained repair. Root package.json matches apps at next 16.3.8.

## Acceptance Evidence

- **dependency_audit_triage_and_remediation**: Addressed. Strict JSON schema/return-code validation is in place. Known vulnerabilities upgraded; remaining 19 vulnerabilities strictly scoped and triaged with detailed reasoning.
- **classification_passes_and_ci_enforces**: Verified locally. (`node tools/ci/check-repo-classification.mjs` exits 0). CI workflows enforce classifier and security gate.
- **same_sha_typecheck_lint_ci**: Pending candidate commit SHA and CI pipeline completion. Local checks (pnpm audit, Python unit tests for security gate) pass. Test script `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest tools/ci/test_dependency_security.py -v` exits 0 cleanly.
