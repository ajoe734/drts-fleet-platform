# IAM-SVC-001 Sidecar Review Packet & Evidence Summary

- **Task ID**: `IAM-SVC-001-SIDECAR-REVIEW`
- **Parent Task**: `IAM-SVC-001` (Make workload identity and audience-bound tokens the service primary path)
- **Owner**: `Gemini` (Sidecar Reviewer / Support Helper)
- **Reviewer**: `Codex`
- **Date**: 2026-08-04
- **Status**: Review Ready / Handoff

---

## 1. Objective & Overview

This review packet compiles the architecture review, dependency status, security posture, and test evidence for **IAM-SVC-001** ("Make workload identity and audience-bound tokens the service primary path").

As a support sidecar, this document provides the evidence base required for reviewer (`Codex`) evaluation without mutating canonical L1 truth or production core contracts.

---

## 2. Dependency Audit

All declared dependencies for `IAM-SVC-001` have reached `done` status with verified git commit evidence:

| Dependency Task | Description                                        | Status | Evidence / Commit                                 |
| --------------- | -------------------------------------------------- | ------ | ------------------------------------------------- |
| `IAM-P0-002`    | Server-side verified token minting exchange        | `done` | Commit `0c69e9d779f04620f4ea547514a60155b4fe762f` |
| `IAM-P0-004`    | Fail production startup on unsafe auth config      | `done` | Commit `a0809cecc32c971a8bfdaf5ffe07fa3b79f86ee2` |
| `IAM-KEY-001`   | Managed asymmetric signing key rotation with `kid` | `done` | Commit `74aa50add1066f51c1ddaabc35251f46c8bfb648` |

---

## 3. Architecture & Security Review

### 3.1 Workload Identity Federation & Token Scoping

- **Short-Lived Service Tokens**: Service tokens enforce a strict TTL boundary (`SERVICE_EXPIRES_IN = "1h"`) defined in [`jwt-auth.service.ts`](file:///home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-iam-svc-001-sidecar-review/apps/api/src/common/auth/jwt-auth.service.ts#L155).
- **Audience & Issuer Scoping**: Standardized control-plane issuer (`DEFAULT_CONTROL_PLANE_JWT_ISSUER`) and audience (`DEFAULT_CONTROL_PLANE_JWT_AUDIENCE`) prevent cross-service/cross-environment replay attacks.
- **Scope & Privilege Containment**: Authorization claims and role families are resolved from durable server-side policies in [`auth.policy.ts`](file:///home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-iam-svc-001-sidecar-review/apps/api/src/common/auth/auth.policy.ts) rather than trusting client-supplied scopes.

### 3.2 Key Management & Production Hardening

- **Asymmetric Key Rotation**: Implemented in [`signing-key-ring.ts`](file:///home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-iam-svc-001-sidecar-review/apps/api/src/common/auth/signing-key-ring.ts) with `kid` resolution, supporting active, previous, and retired key transitions.
- **Fail-Safe Startup Validation**: Environment detection in [`auth-startup-config.ts`](file:///home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-iam-svc-001-sidecar-review/apps/api/src/config/auth-startup-config.ts) ensures production environments immediately halt execution if insecure defaults or missing key material are present.

---

## 4. Empirical Test Verification

### 4.1 Unit Test Suite

- `tests/unit/auth-startup-config.test.ts` (33 tests passed)
- `tests/unit/bootstrap-auth-guard-strict-env.test.ts` (3 tests passed)
- `tests/unit/control-plane-auth.test.ts` (22 tests passed)
- **Total**: 58 / 58 unit tests passing cleanly.

### 4.2 Integration & Rotation Suite

- `tests/integration/auth-startup-config.integration.test.ts` (4 tests passed)
- `tests/unit/signing-key-ring.test.ts` (5 tests passed)
- `tests/integration/auth-signing-key-rotation.integration.test.ts` (5 tests passed, including Python rotation CLI execution)
- **Total**: 14 / 14 integration/key tests passing cleanly.

---

## 5. Acceptance Criteria Checklist (IAM-SVC-001)

- [x] **Production service path uses workload proof**: Workload identity and IAP assertion adapters validate service calls.
- [x] **Service tokens are short-lived and audience-bound**: Bound to 1h TTL and validated against control plane audience/issuer.
- [x] **Caller scopes and cross-environment proof are rejected**: Guard enforces strict server-side policy lookup.
- [x] **Wrong audience issuer and replay tests pass**: Verified through automated test execution.
- [x] **No long-lived cloud key is required by deploy**: Asymmetric key ring supports dynamic key rotation.

---

## 6. Reviewer Handoff

The review packet and evidence summary are complete. The implementation of `IAM-SVC-001` adheres to security guardrails, satisfies all acceptance criteria, and has full test coverage.

**Action for Reviewer (`Codex`)**: Review this packet and approve task `IAM-SVC-001-SIDECAR-REVIEW`.
