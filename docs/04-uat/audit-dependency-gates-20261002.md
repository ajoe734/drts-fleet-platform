# UAT: Audit Dependency Gates (2026-10-02)

## Overview

This document serves as evidence and documentation for the dependency audit gate added on 2026-10-02.

## Actionable Production Dependency Security Gate

We have added an actionable production dependency security gate that runs in our CI pipeline via the `.github/workflows/dependency-security.yml` workflow.
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
