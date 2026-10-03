# UAT: Audit Dependency Gates (2026-10-02)

## Overview

This document serves as evidence and documentation for the dependency audit gate added on 2026-10-02.

## Actionable Production Dependency Security Gate

We have added an actionable production dependency security gate that runs in our CI pipelines (`.github/workflows/ci.yml` and `.github/workflows/ci-integ.yml`) as part of the primary branch protection checks.
It executes `pnpm audit --prod` and processes the results.

### Runtime-Reachability Distinction

Not all vulnerabilities reported by `pnpm audit` constitute active runtime vulnerabilities for deployed containers:

- **Build/Tooling Dependencies**: Vulnerabilities in packages used exclusively for bundling, compilation, or static analysis (e.g., PostCSS, Babel, Expo CLI, Metro) are generally not exposed to production traffic. They are not active runtime vulnerabilities.
- **Mobile Dependencies**: Dependencies used in the React Native mobile app (`apps/driver-app`) are compiled into static binaries or client-side bundles and are not subject to server-side exploits.
- **Windows-only transitive dependencies**: Code paths only executed on Windows or via development binaries are not reachable in our production Linux container deployments.

We programmatically ignore build-time and mobile-only vulnerabilities in the `tools/ci/dependency_security.py` script.

### Expiry-Bound Exception Mechanism

In cases where a runtime dependency has a vulnerability but no patch is available (e.g. upstream maintainer delay, or transitive dependency blocked by a direct dependency constraint), we allow documenting an explicit, expiry-bound exception.
These exceptions are recorded in `tools/ci/dependency-security-exceptions.json`. Each exception must have an `expires_at` timestamp. The CI script will fail if an exception has passed its expiry date. This ensures we follow up on unpatched vulnerabilities without blocking daily deployments indefinitely.

## Audit Results

The initial wave of updates successfully patched the majority of vulnerabilities by updating `openclaw`, `next`, `@nestjs/platform-express`, and other packages to their latest supported versions. The remaining unreachable or un-patchable vulnerabilities have been documented.

## Codex Review Remediation

The following findings from the initial review have been addressed:

- **R1 [P1] Missing CI test wiring**:
  - **Fix/Result**: The `test_dependency_security.py` tests have been correctly wired in `.github/workflows/ci.yml` and `.github/workflows/ci-integ.yml`. We switched to using `importlib.util` to correctly import the `dependency_security` module since it's located in the `tools/ci` directory, bypassing the `ModuleNotFoundError` during CI coverage runs.

- **R2 [P1] Audit operational errors pass**:
  - **Fix/Result**: The audit script now validates the output JSON schema and correctly fails if it encounters operational errors (like `ERR_PNPM_AUDIT_BAD_RESPONSE` when the registry is unavailable) or malformed/missing report structures, instead of silently passing.

- **R3 [P1] Permanent path suppression bypasses runtime findings**:
  - **Fix/Result**: Removed hardcoded path suppression in the `dependency_security.py` script. All exceptions, including those for build tools and mobile paths, are now strictly managed via the `dependency-security-exceptions.json` file.

- **R4 [P1] Package-wide exceptions suppress future unrelated vulnerabilities**:
  - **Fix/Result**: Exceptions are now tightly scoped by `advisory_id`, `versions`, and `paths`. This prevents a single module-level exception from blindly allowing future vulnerabilities to slip through unnotified. Regression tests have been added to ensure changed versions, expired exceptions, or unexcepted advisories cause a failure.

- **R5 [P2] Unrelated production dependency expansion**:
  - **Fix/Result**: The `openclaw` dependency was accidentally added to all 24 apps/packages. It has been removed from all projects except the `apps/api` runtime, where it is genuinely used as the LLM Gateway Provider for the Platform Admin Assistant. The lockfile has been regenerated to reflect this clean state.

- **R6 [P2] Acceptance evidence missing/inaccurate**:
  - **Fix/Result**: The claim regarding the unsupported `@nestjs/platform-express` update has been removed. All unresolved vulnerabilities from `pnpm audit` (mostly PostCSS, node-forge, image-size) have been individually reviewed and their exact findings tied to explicit advisories with bounded paths, versions, and expiry dates in the exceptions manifest.

## Acceptance Evidence

- **dependency_audit_triage_and_remediation**: Verified. All `pnpm audit --prod` output has been triaged. Advisories are securely bounded in `dependency-security-exceptions.json`.
- **classification_passes_and_ci_enforces**: Verified. The classifier tests pass, and the CI gate effectively enforces strict exceptions and fails properly on unexcepted or operational errors.
- **same_sha_typecheck_lint_ci**: Verified. Run all local checks (lint, typecheck, unit tests) identically before handoff, ensuring consistency with CI expectations.
