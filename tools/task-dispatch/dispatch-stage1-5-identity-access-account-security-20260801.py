#!/usr/bin/env python3
"""Register the complete Stage 1.5 IAM/security DAG for supervisor dispatch.

The script mutates machine truth only through tools/development-orchestrator/bin/ai-status.sh. It does not
start ad-hoc agents: the continuously running supervisor dispatches dependency-
ready tasks to isolated auto-worker worktrees.

Usage:
    AI_NAME=Codex python3 tools/task-dispatch/dispatch-stage1-5-identity-access-account-security-20260801.py --dry-run
    AI_NAME=Codex python3 tools/task-dispatch/dispatch-stage1-5-identity-access-account-security-20260801.py
    AI_NAME=Codex python3 tools/task-dispatch/dispatch-stage1-5-identity-access-account-security-20260801.py --allow-existing

When running from an isolated worktree set AI_STATUS_ROOT to the canonical
checkout so registration and post-write verification use canonical machine
truth rather than the worktree's static ai-status.json snapshot.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


REPO = Path(__file__).resolve().parents[2]
STATUS_ROOT = Path(
    os.environ.get("AI_STATUS_ROOT")
    or os.environ.get("ORCH_STATUS_ROOT")
    or REPO
).expanduser().resolve()
STATUS_FILE = STATUS_ROOT / "ai-status.json"
PHASE = "stage1.5-identity-access-account-security-20260801"
ARCHITECTURE_REF = (
    "docs/02-architecture/"
    "stage1-5-identity-access-account-security-hardening-plan-20260801.md"
)
EXECUTION_REF = (
    "docs/03-runbooks/"
    "stage1-5-identity-access-account-security-execution-tasks-20260801.md"
)


@dataclass(frozen=True)
class Task:
    task_id: str
    owner: str
    reviewer: str
    title: str
    summary: str
    depends_on: tuple[str, ...]
    artifacts: tuple[str, ...]
    acceptance: tuple[str, ...]
    priority: str
    wave: str
    workstream: str
    task_class: str = "implementation"
    mutates_canonical: bool = False


def task(
    task_id: str,
    owner: str,
    reviewer: str,
    title: str,
    summary: str,
    depends_on: tuple[str, ...],
    artifacts: tuple[str, ...],
    acceptance: tuple[str, ...],
    priority: str,
    wave: str,
    workstream: str,
    *,
    task_class: str = "implementation",
    mutates_canonical: bool = False,
) -> Task:
    return Task(
        task_id=task_id,
        owner=owner,
        reviewer=reviewer,
        title=title,
        summary=summary,
        depends_on=depends_on,
        artifacts=artifacts,
        acceptance=acceptance,
        priority=priority,
        wave=wave,
        workstream=workstream,
        task_class=task_class,
        mutates_canonical=mutates_canonical,
    )


# Topological order is mandatory: all dependencies appear before each child.
# This prevents the supervisor from observing an unregistered dependency as
# absent while this script is still materializing the graph.
TASKS = (
    task(
        "IAM-P0-003", "Gemini2", "Codex",
        "Classify every API route and enforce global default-deny",
        "Inventory every controller route and change the auth guard so an anonymous route requires both an explicit open-route marker and an inventory entry. Missing or conflicting policy metadata must deny at runtime and fail CI. Preserve only documented health and callback exceptions with bounded contracts.",
        (),
        ("apps/api/src/common/auth/", "apps/api/src/**/*.controller.ts", "tests/unit/", "tests/integration/", "docs/02-architecture/auth-route-inventory.md"),
        ("Every API route is classified", "Unknown route fails closed", "Adding an unclassified route fails CI", "Open routes have explicit rate and data exposure tests", "API lint typecheck and focused tests pass"),
        "P0", "A", "containment",
    ),
    task(
        "IAM-P0-004", "Gemini", "Codex2",
        "Fail production startup on unsafe authentication configuration",
        "Implement environment-aware startup validation for JWT issuer audience algorithm and key material plus cookie CSRF CORS session store audit store and secret references. Stage and production must refuse missing wildcard default or test-only values while local/test keeps explicit deterministic fixtures.",
        (),
        ("apps/api/src/main.ts", "apps/api/src/config/", "apps/api/src/common/auth/", "tests/unit/", "tests/integration/", "docs/03-runbooks/auth-production-configuration.md"),
        ("Unsafe stage or production configuration stops startup", "Local and test fixtures require explicit mode", "Validation errors name the missing control without leaking secrets", "Negative configuration matrix passes", "API build and container startup smoke pass"),
        "P0", "A", "containment",
    ),
    task(
        "IAM-ACC-001", "Codex2", "Gemini2",
        "Persist canonical principals memberships invitations and account states",
        "Add the canonical IAM data model and repository for immutable issuer-subject principals tenant and workforce memberships proof-based invitations and account state transitions. Include constraints indexes versioning safe backfill and least-privilege handling for records that cannot be matched to a trusted subject. Email is an attribute and never the primary authority key.",
        (),
        ("infra/migrations/", "packages/contracts/src/", "apps/api/src/modules/identity/", "apps/api/src/modules/tenant-partner/", "tests/unit/", "tests/integration/"),
        ("Principal uniqueness uses issuer and subject", "Membership and invitation boundaries are durable", "Invited and migration-pending records are not active", "Backfill is idempotent and least-privilege", "Migration rollback and repository tests pass"),
        "P0", "A", "accounts",
    ),
    task(
        "IAM-AUD-001", "Codex", "Gemini",
        "Persist canonical append-only security events with masking",
        "Define a canonical event envelope and append-only persistence for login session invitation account role device credential policy and break-glass actions. Derive the actor from server identity; mask email IP device token and before-after context; fail privileged mutation when its required security event cannot persist.",
        (),
        ("infra/migrations/", "packages/contracts/src/", "apps/api/src/common/audit/", "apps/api/src/modules/security-events/", "tests/unit/", "tests/integration/"),
        ("Required auth and governance event matrix is queryable", "Application role cannot update or delete security events", "No raw credentials or sensitive headers are persisted", "Privileged mutation fails when audit persistence fails", "Retention and tenant-bound query tests pass"),
        "P0", "A", "security-operations",
    ),
    task(
        "IAM-P0-001", "Gemini2", "Codex",
        "Disable email-only tenant session exchange outside local tests",
        "Replace the current tenant email-plus-membership session exchange with a production feature gate that requires verified identity proof. Reject invited suspended disabled migration-pending and unmatched memberships. Keep deterministic local fixtures only behind an explicit non-production switch and preserve non-enumerating external errors.",
        ("IAM-P0-003",),
        ("apps/api/src/modules/auth/auth.controller.ts", "apps/api/src/modules/auth/", "tests/unit/auth-bootstrap.test.ts", "tests/integration/"),
        ("Email alone cannot obtain a stage or production session", "Invited suspended and disabled users are denied", "Responses do not reveal account existence", "Explicit local fixture mode still works", "Negative tests and API build pass"),
        "P0", "B", "containment",
    ),
    task(
        "IAM-P0-005", "Gemini", "Codex2",
        "Enforce CORS allowlists and browser authentication security headers",
        "Replace permissive CORS with explicit environment and surface allowlists including methods headers and credentials. Add HSTS CSP frame-ancestors X-Content-Type-Options Referrer-Policy and no-store behavior for auth responses. Bound callback hosts return URLs body size and sensitive headers.",
        ("IAM-P0-004",),
        ("apps/api/src/main.ts", "apps/api/src/config/", "apps/*-web/middleware.ts", "tests/unit/", "tests/e2e/"),
        ("Unlisted origins fail preflight and credentialed requests", "Approved origins retain required browser flows", "Auth responses are no-store", "Security headers match surface embedding policy", "Browser security E2E and API build pass"),
        "P0", "B", "browser-security",
    ),
    task(
        "IAM-SES-001", "Codex2", "Gemini2",
        "Create durable sessions refresh families and token records",
        "Implement schema and repository support for browser and device sessions refresh-token families token hashes expiry rotation revocation reason device/risk summary and optimistic concurrency. Consumption and rotation must be atomic across API instances and revoked state must survive restart.",
        ("IAM-ACC-001",),
        ("infra/migrations/", "packages/contracts/src/", "apps/api/src/modules/auth/", "apps/api/src/modules/identity/", "tests/integration/"),
        ("Raw refresh and session secrets are never stored", "Concurrent refresh has one winner", "Revoked state survives process restart", "Expiry and family revocation are enforced", "Migration repository and Postgres integration tests pass"),
        "P0", "B", "sessions",
    ),
    task(
        "IAM-RBAC-001", "Codex", "Gemini",
        "Generate one RBAC and resource-policy catalog for every enforcement layer",
        "Create a single typed policy catalog for roles scopes realm constraints and resource-bound checks. Generate or consume the same catalog in API guards control-plane proxy and UI capability hints. Keep a bounded identity:read migration alias without granting mutation or export privileges.",
        ("IAM-P0-003",),
        ("packages/contracts/src/", "apps/api/src/common/auth/", "apps/control-plane-api/src/", "packages/ui-web/", "scripts/", "tests/unit/"),
        ("API and proxy scope presets derive from one source", "Unknown scope and role deny", "Migration aliases are least-privilege", "Tenant and object constraints are represented", "Generated output drift test passes"),
        "P0", "B", "authorization",
    ),
    task(
        "IAM-P0-002", "Gemini2", "Codex",
        "Make token minting a private verified server-side exchange",
        "Refactor /auth/token so only verified IAP or workload proof reaches minting. Resolve actor realm memberships roles scopes and resource boundaries from durable server state; reject caller-defined roles scopes tenant actor and system claims plus wrong issuer audience realm or inactive principal.",
        ("IAM-P0-001", "IAM-ACC-001", "IAM-RBAC-001"),
        ("apps/api/src/modules/auth/", "apps/api/src/common/auth/internal-key.middleware.ts", "apps/api/src/common/auth/jwt-auth.service.ts", "tests/unit/", "tests/integration/"),
        ("Caller privilege claims cannot affect minted tokens", "Wrong audience issuer or realm is denied", "Inactive principals cannot mint", "Resolved token boundaries match durable memberships", "Escalation and direct-path tests pass"),
        "P0", "B", "authentication",
    ),
    task(
        "IAM-CTR-001", "Codex2", "Gemini2",
        "Publish canonical IAM contracts OpenAPI and stable error codes",
        "Define versioned contracts for login callback session account membership invitation role approval access review break-glass device and credential APIs. Add stable non-enumerating authentication and authorization errors plus reason expectedVersion step-up and approval references for mutations.",
        ("IAM-ACC-001", "IAM-RBAC-001"),
        ("packages/contracts/src/", "openapi/", "apps/api/src/common/", "phase1_service_contracts_v1.md", "tests/contract/"),
        ("Contracts cover every Stage 1.5 command and query", "Public errors do not reveal membership details", "Mutation contracts require reason and concurrency data", "OpenAPI and runtime DTOs agree", "Contract lint generation and compatibility tests pass"),
        "P0", "B", "contracts",
    ),
    task(
        "IAM-IDP-001", "Gemini", "Codex2",
        "Implement tenant and partner-human OIDC PKCE BFF login",
        "Implement provider-neutral managed OIDC authorization-code plus PKCE through the approved BFF boundary. Validate state nonce verifier issuer audience redirect and callback host; establish Secure HttpOnly session; resolve immutable subject to active tenant or partner membership and trusted MFA claims.",
        ("IAM-P0-001", "IAM-P0-004", "IAM-P0-005", "IAM-ACC-001", "IAM-CTR-001"),
        ("apps/api/src/modules/auth/", "apps/*-web/app/api/auth/", "apps/*-web/middleware.ts", "packages/contracts/src/", "tests/e2e/"),
        ("Authorization code and PKCE happy path works", "State nonce verifier issuer audience and redirect negatives fail", "Session cookie is Secure HttpOnly and CSRF protected", "Subject resolves only active bounded memberships", "Real provider staging gate and browser E2E are documented"),
        "P0", "C", "authentication",
    ),
    task(
        "IAM-IDP-002", "Gemini2", "Codex",
        "Resolve verified IAP workforce subjects to platform and ops memberships",
        "Implement a verified IAP subject adapter for platform and operations users. Validate signed assertion and audience then map immutable subject and trusted groups to durable memberships with JIT or sync policy. Ignore spoofable email and role headers and emit drift/inactive denial events.",
        ("IAM-P0-002", "IAM-P0-004", "IAM-ACC-001", "IAM-CTR-001"),
        ("apps/api/src/modules/auth/", "apps/api/src/modules/platform-admin/", "apps/control-plane-api/src/", "infra/", "tests/integration/"),
        ("Verified IAP subject resolves durable membership", "Spoofed email and role headers are ignored", "Wrong audience and inactive workforce users fail", "Group drift applies least privilege and alerts", "IAP integration negative tests pass"),
        "P0", "C", "authentication",
    ),
    task(
        "IAM-SES-002", "Codex", "Gemini2",
        "Enforce revocable JWT and session claims with 60-second invalidation",
        "Issue sid jti tokenVersion auth_time amr acr issuer audience policyVersion and bounded resource claims. Validate algorithm allowlist and durable session/token/account/membership state on protected requests. Role status membership suspend revoke and compromise actions must block old access within 60 seconds.",
        ("IAM-SES-001", "IAM-P0-002", "IAM-IDP-001", "IAM-IDP-002", "IAM-CTR-001"),
        ("apps/api/src/common/auth/jwt-auth.service.ts", "apps/api/src/common/auth/", "apps/api/src/modules/auth/", "packages/contracts/src/", "tests/integration/"),
        ("Required claims are issued and verified", "alg none and confusion attempts fail", "Revoked or stale tokenVersion fails", "Role suspend and membership change propagate within 60 seconds", "Cross-realm and restart tests pass"),
        "P0", "C", "sessions",
    ),
    task(
        "IAM-P0-006", "Gemini2", "Codex",
        "Remove bootstrap identity and mock authority from stage and production",
        "Delete or technically fence bootstrap actor role scope tenant and default identity paths from stage and production. Keep explicitly configured test adapters only. Ensure missing internal identity no longer passes and scan deployment configuration for demo users shared test issuers and default tenants.",
        ("IAM-P0-002", "IAM-P0-003", "IAM-P0-004", "IAM-P0-005", "IAM-IDP-001", "IAM-IDP-002"),
        ("apps/api/src/common/auth/bootstrap-auth.guard.ts", "apps/api/src/common/auth/internal-key.middleware.ts", "apps/api/src/config/", "infra/", "tests/e2e/"),
        ("Stage and production reject every bootstrap header path", "Missing identity or internal proof fails closed", "No production demo seed or default tenant authority remains", "Local test adapter remains explicit", "Deployment and direct-path E2E pass"),
        "P0", "C", "containment",
    ),
    task(
        "IAM-KEY-001", "Gemini", "Codex2",
        "Implement managed asymmetric signing key rotation with kid",
        "Replace the single long-lived shared JWT secret with an asymmetric or cloud-managed key ring. Publish and verify kid-based current/previous keys with activate retire and overlap controls. Provide rotation rollback and emergency compromise procedures without relaxing issuer audience or algorithm checks.",
        ("IAM-P0-004", "IAM-SES-002"),
        ("apps/api/src/common/auth/", "infra/", "scripts/", "docs/03-runbooks/auth-signing-key-rotation.md", "tests/integration/"),
        ("Tokens carry and resolve kid", "Current and previous overlap works", "Retired and unknown keys fail", "Rotation and rollback drill preserves strict validation", "No private key enters repo image frontend or logs"),
        "P1", "C", "key-management",
    ),
    task(
        "IAM-ACC-002", "Codex2", "Gemini2",
        "Replace in-memory platform users with durable audited administration",
        "Migrate platform users and memberships from seed or in-memory state to canonical persistence. Implement bounded CRUD and workforce reconciliation with actor-aware reasoned before-after audit. On IdP or membership drift choose least privilege rather than unioning grants.",
        ("IAM-ACC-001", "IAM-IDP-002", "IAM-SES-002", "IAM-AUD-001"),
        ("apps/api/src/modules/platform-admin/", "apps/api/src/modules/identity/", "infra/migrations/", "tests/integration/"),
        ("Platform users survive restart", "Every mutation has actor reason and before-after", "Drift reconciliation is least-privilege", "Status and role changes revoke sessions", "CRUD isolation and migration tests pass"),
        "P1", "D", "accounts",
    ),
    task(
        "IAM-ACC-003", "Codex", "Gemini",
        "Implement tenant joiner mover leaver and proof-based invitation lifecycle",
        "Deliver invitation create resend accept expire revoke plus account activate suspend disable reactivate and offboard transitions. Store invitation secrets hash-only and single-use. Enforce tenant boundary invited-not-active self-escalation denial last-admin protection and immediate session/credential revoke on offboarding.",
        ("IAM-ACC-001", "IAM-IDP-001", "IAM-SES-002", "IAM-RBAC-001", "IAM-AUD-001"),
        ("apps/api/src/modules/tenant-partner/", "apps/api/src/modules/identity/", "packages/contracts/src/", "tests/integration/", "tests/e2e/"),
        ("Invitation tokens are hash-only single-use and expiring", "Invited user cannot log in before proof", "Self-escalation and last-admin removal fail", "Offboarding revokes access within 60 seconds", "Tenant lifecycle and enumeration negatives pass"),
        "P1", "D", "accounts",
    ),
    task(
        "IAM-MFA-001", "Gemini2", "Codex",
        "Enforce MFA and fresh step-up for privileged actions",
        "Create server-owned policy that evaluates trusted amr acr and auth_time for all listed high-risk platform ops finance compliance tenant partner and driver actions. Return stable MFA_REQUIRED or STEP_UP_REQUIRED errors and bind successful proof to the current principal session action and short freshness window.",
        ("IAM-IDP-001", "IAM-IDP-002", "IAM-SES-002"),
        ("apps/api/src/common/auth/", "apps/api/src/modules/identity/", "packages/contracts/src/", "tests/unit/", "tests/e2e/"),
        ("Every privileged action has a declared step-up rule", "Client MFA booleans cannot satisfy policy", "Stale wrong-session and wrong-action proof fails", "Fresh trusted proof succeeds only inside policy window", "Negative matrix and audit events pass"),
        "P1", "D", "mfa",
    ),
    task(
        "IAM-SES-003", "Codex2", "Gemini2",
        "Deliver session inventory logout-all and boundary-safe admin revoke",
        "Implement self session listing logout logout-all and scoped administrator revoke with CSRF optimistic concurrency and canonical audit. Return masked device IP and activity summaries only; prevent tenant admins from viewing or revoking sessions outside their tenant.",
        ("IAM-SES-002", "IAM-ACC-003", "IAM-AUD-001"),
        ("apps/api/src/modules/auth/", "apps/api/src/modules/identity/", "packages/contracts/src/", "tests/integration/", "tests/e2e/"),
        ("Self logout and logout-all revoke correct sessions", "Admin revoke is tenant and role bounded", "Device and IP summaries are masked", "CSRF and concurrent revoke negatives pass", "Audit and old-token rejection pass"),
        "P1", "D", "sessions",
    ),
    task(
        "IAM-RBAC-002", "Codex", "Gemini",
        "Implement privileged role request approval expiry and removal",
        "Add request independent approve reject activate expire and remove workflow for privileged roles. Enforce separation of duties no self-approval no self-escalation last-admin invariant fresh MFA expectedVersion effective windows session invalidation and complete audit.",
        ("IAM-RBAC-001", "IAM-ACC-002", "IAM-ACC-003", "IAM-MFA-001", "IAM-AUD-001"),
        ("apps/api/src/modules/identity/", "apps/api/src/modules/platform-admin/", "apps/api/src/modules/tenant-partner/", "packages/contracts/src/", "tests/integration/"),
        ("Requester cannot approve own grant", "SoD and last-admin invariants hold", "Grant activates and expires at declared times", "Role change revokes stale sessions", "Approval concurrency isolation and audit tests pass"),
        "P1", "D", "authorization",
    ),
    task(
        "IAM-DRV-001", "Gemini2", "Codex",
        "Persist driver device binding invitations and hash-only refresh families",
        "Replace process-local driver device binding and plaintext refresh token comparison with durable records. Implement single-use registration proof device ownership refresh expiry rotation reuse-family revoke suspend remote revoke and rebind invalidation with atomic cross-instance behavior.",
        ("IAM-ACC-001", "IAM-SES-001", "IAM-AUD-001"),
        ("infra/migrations/", "apps/api/src/modules/auth/driver-device-session.service.ts", "apps/api/src/modules/owned-mobility/", "packages/contracts/src/", "tests/integration/"),
        ("Driver binding and revoke survive restart", "Registration proof is single-use and expiring", "Refresh secrets are hash-only", "Concurrent reuse revokes the family and alerts", "Suspend revoke and rebind E2E pass"),
        "P0", "D", "driver-identity",
    ),
    task(
        "IAM-PRT-001", "Codex2", "Gemini2",
        "Add expiry ownership and dual rotation to partner credentials",
        "Extend tenant and partner API keys plus webhook credentials with named owner scope purpose issued expiry last-used rotation status and automatic old-key revoke. Return plaintext only once and keep hash-only authority. Add dormant use and approaching-expiry signals.",
        ("IAM-ACC-001", "IAM-SES-002", "IAM-AUD-001"),
        ("apps/api/src/modules/tenant-partner/", "apps/api/src/modules/webhooks/", "packages/contracts/src/", "infra/migrations/", "tests/integration/"),
        ("Plaintext credential is returned once", "Expired revoked and wrong-entry credentials fail closed", "Dual rotation overlap and old-key auto revoke work", "Owner last-used and expiry are auditable", "Cross-tenant and dormant-use tests pass"),
        "P1", "D", "partner-credentials",
    ),
    task(
        "IAM-SVC-001", "Gemini2", "Codex",
        "Make workload identity and audience-bound tokens the service primary path",
        "Implement workload identity federation or cloud OIDC validation for production service principals and mint short-lived audience-bound service tokens from registered capabilities. Remove caller-defined system scopes and prove service-to-service audience issuer replay and environment boundaries.",
        ("IAM-P0-002", "IAM-P0-004", "IAM-KEY-001"),
        ("apps/api/src/common/auth/", "apps/control-plane-api/src/", "infra/", "packages/contracts/src/", "tests/integration/"),
        ("Production service path uses workload proof", "Service tokens are short-lived and audience-bound", "Caller scopes and cross-environment proof are rejected", "Wrong audience issuer and replay tests pass", "No long-lived cloud key is required by deploy"),
        "P1", "D", "service-identity",
    ),
    task(
        "IAM-GOV-001", "Codex2", "Gemini2",
        "Implement privileged access review campaigns and remediation",
        "Deliver campaign create scope owner assignment certification reduce remove exception expiry overdue alert and immutable evidence for privileged platform tenant partner and operations memberships. Remediation must invoke the same role and session invalidation authority as direct administration.",
        ("IAM-RBAC-002", "IAM-SES-003", "IAM-AUD-001"),
        ("apps/api/src/modules/identity/", "packages/contracts/src/", "infra/migrations/", "tests/integration/", "docs/03-runbooks/access-review.md"),
        ("Campaign scope and reviewer ownership are durable", "Certify reduce and remove are tenant bounded", "Overdue state alerts and follows declared policy", "Removal revokes sessions", "Evidence is immutable and queryable"),
        "P1", "E", "governance",
    ),
    task(
        "IAM-BG-001", "Codex", "Gemini",
        "Implement two-person break-glass with short non-refreshable sessions",
        "Implement break-glass request approve activate use close expire and post-use review. Require different requester and approver least scope phishing-resistant or vault-controlled proof maximum 60-minute TTL no refresh continuous UI marker and immediate notification/audit.",
        ("IAM-RBAC-002", "IAM-MFA-001", "IAM-SES-002", "IAM-AUD-001"),
        ("apps/api/src/modules/identity/", "packages/contracts/src/", "infra/migrations/", "tests/integration/", "docs/03-runbooks/break-glass.md"),
        ("Requester cannot self-approve", "Grant scope and TTL cannot exceed policy", "Session cannot refresh and auto-expires", "Every use carries grant identity and alerts", "Close revoke and post-use review tests pass"),
        "P1", "E", "break-glass",
    ),
    task(
        "IAM-DRV-002", "Gemini", "Codex2",
        "Integrate driver secure storage remote logout and compromised-session UX",
        "Update driver mobile authentication to store refresh material only in platform secure storage and handle not-provisioned register expired revoked suspended reuse and rebind states. On remote revoke or reuse clear secrets and return to re-auth while preserving unsynchronized offline trip/proof work.",
        ("IAM-DRV-001", "IAM-SES-003"),
        ("apps/driver-app/", "packages/contracts/src/", "tests/e2e/", "docs/03-runbooks/driver-device-recovery.md"),
        ("Tokens never enter app logs or insecure storage", "All declared auth states have deterministic UX", "Remote revoke and reuse clear credentials", "Offline unsynchronized proof is preserved", "Mobile typecheck tests and device E2E pass"),
        "P1", "E", "driver-identity",
    ),
    task(
        "IAM-SVC-002", "Gemini", "Codex2",
        "Inventory rotate and retire temporary internal-key exceptions",
        "Find every remaining shared internal-key path and create a machine-readable exception inventory with owner purpose scope TTL network boundary rotation cadence usage signal and removal date. Reject undocumented production exceptions and migrate eligible callers to IAM-SVC-001.",
        ("IAM-SVC-001", "IAM-AUD-001"),
        ("apps/api/src/common/auth/internal-key.middleware.ts", "infra/", "scripts/", "docs/02-architecture/internal-key-exceptions.md", "tests/integration/"),
        ("Every production exception has complete metadata", "Undocumented or expired exception fails", "Rotation overlap and revoke are tested", "Usage and drift produce alerts", "Removal plan names owner and date"),
        "P1", "E", "service-identity",
    ),
    task(
        "IAM-UI-PLAT-001", "Gemini", "Codex2",
        "Build Platform Admin account role session review and break-glass surfaces",
        "Implement Platform Admin users memberships MFA last-login sessions role history invitation role approval access review and break-glass pages using server authority. Show before-after risk SoD last-admin expiry approval and active privileged-session state without exposing secrets or cross-tenant data.",
        ("IAM-ACC-002", "IAM-RBAC-002", "IAM-SES-003", "IAM-GOV-001", "IAM-BG-001"),
        ("apps/platform-admin-web/app/", "apps/platform-admin-web/lib/", "packages/ui-web/", "tests/e2e/"),
        ("All required governance journeys are usable", "UI renders server status and capability authority", "Step-up approval and conflict states are explicit", "Break-glass banner and exit are persistent", "A11y i18n typecheck build and E2E pass"),
        "P1", "E", "platform-ui",
    ),
    task(
        "IAM-UI-TEN-001", "Gemini2", "Codex",
        "Build tenant users roles sessions and credential lifecycle surfaces",
        "Implement tenant-scoped users and roles invitation resend revoke role change suspend session administration API key and webhook credential screens. Show owner scope expiry last-used rotation impact and step-up requirement before mutation; handle self-escalation and last-admin errors explicitly.",
        ("IAM-ACC-003", "IAM-SES-003", "IAM-PRT-001", "IAM-MFA-001"),
        ("apps/tenant-console-web/app/", "apps/tenant-console-web/lib/", "packages/ui-web/", "tests/e2e/"),
        ("Tenant user lifecycle journeys are complete", "Session and credential data is tenant bounded and masked", "Plaintext key appears only once", "Step-up last-admin and self-escalation states are clear", "A11y i18n typecheck build and E2E pass"),
        "P1", "E", "tenant-ui",
    ),
    task(
        "IAM-UI-DRV-001", "Codex2", "Gemini",
        "Build driver provisioning revoked suspended and rebind states",
        "Implement driver DeviceNotProvisioned RegisterDevice SessionExpired DeviceRevoked DriverSuspended Devices revoke and rebind surfaces on the durable driver auth contract. Separate auth recovery from trip and proof synchronization and avoid retry loops after revoke or compromise.",
        ("IAM-DRV-001", "IAM-DRV-002"),
        ("apps/driver-app/", "packages/ui-web/", "tests/e2e/"),
        ("Every declared driver auth state is reachable and tested", "Revoke and compromise return safely to re-auth", "Offline work is not silently discarded", "No secret is rendered or logged", "A11y i18n typecheck and device-flow tests pass"),
        "P1", "E", "driver-ui",
    ),
    task(
        "IAM-OBS-001", "Gemini2", "Codex",
        "Add IAM security metrics dashboards alerts and routing",
        "Implement metrics dashboards alert policies and routing for authentication and invitation abuse refresh reuse cross-tenant attempts privileged changes break-glass dormant or expiring credentials IdP drift and audit pipeline failure. Keep high-cardinality and sensitive labels out of telemetry.",
        ("IAM-AUD-001", "IAM-IDP-001", "IAM-SES-002", "IAM-DRV-001", "IAM-PRT-001", "IAM-RBAC-002", "IAM-SVC-002"),
        ("apps/api/src/observability/", "infra/monitoring/", "docs/03-runbooks/iam-alert-response.md", "tests/integration/", "support/sidecars/IAM-OBS-001/"),
        ("All required signals have owner threshold and route", "No PII or raw identity enters metric labels", "Refresh reuse and privileged change drills alert", "Audit pipeline failure pages and blocks privileged writes", "Dashboard and alert evidence is committed"),
        "P1", "E", "security-operations",
    ),
    task(
        "IAM-IR-001", "Gemini", "Codex2",
        "Exercise account takeover and credential compromise response",
        "Publish executable incident runbooks for user session driver device partner key service identity signing key and IdP compromise. Include identify contain revoke suspend preserve evidence rotate search blast radius recover communicate and post-incident actions then run staging tabletop and technical drills.",
        ("IAM-OBS-001", "IAM-BG-001", "IAM-KEY-001", "IAM-SVC-002"),
        ("docs/03-runbooks/account-takeover.md", "docs/03-runbooks/credential-compromise.md", "scripts/", "support/sidecars/IAM-IR-001/"),
        ("Runbooks name commands owners evidence and escalation", "Staging revoke and rotation drills complete", "Evidence preservation and legal hold paths are defined", "Recovery does not weaken guards", "Residual risks and response times are recorded"),
        "P1", "E", "incident-response",
    ),
    task(
        "IAM-UAT-001", "Codex", "Gemini2",
        "Build release-blocking automated IAM negative matrix",
        "Independently build the cross-cutting automated suite for email-only and callback attacks route classification realm scope role resource and tenant denial session revoke refresh concurrency restart credential expiry driver replay service audience CSRF CORS security headers audit failure and secret leakage.",
        ("IAM-P0-006", "IAM-IDP-001", "IAM-IDP-002", "IAM-SES-002", "IAM-ACC-001", "IAM-RBAC-001", "IAM-DRV-001", "IAM-AUD-001"),
        ("tests/security/", "tests/integration/", "tests/e2e/", ".github/workflows/", "support/sidecars/IAM-UAT-001/"),
        ("P0 authentication negatives are automated", "Authorization and tenant isolation matrix is automated", "Restart concurrency and reuse cases use durable storage", "Browser and secret leakage scans pass", "Suite is required by CI and evidence cites runs"),
        "P0", "F", "acceptance", task_class="verification",
    ),
    task(
        "IAM-UAT-002", "Gemini2", "Codex",
        "Run production-like IAM staging journeys and sign-off pack",
        "Execute real staging journeys for workforce tenant partner driver service account governance credential and incident flows. Collect sanitized request IdP database audit alert and UI evidence. Distinguish implemented tested and live-proven claims and obtain named Security SRE Ops and tenant-owner decisions.",
        ("IAM-KEY-001", "IAM-ACC-002", "IAM-ACC-003", "IAM-SES-003", "IAM-RBAC-002", "IAM-MFA-001", "IAM-GOV-001", "IAM-BG-001", "IAM-DRV-002", "IAM-PRT-001", "IAM-SVC-002", "IAM-UI-PLAT-001", "IAM-UI-TEN-001", "IAM-UI-DRV-001", "IAM-OBS-001", "IAM-IR-001", "IAM-UAT-001"),
        ("docs/04-uat/", "support/sidecars/IAM-UAT-002/", "tests/e2e/"),
        ("Minimum live staging journeys all have cited evidence", "External provider claims use real traces", "Security SRE Ops and tenant decisions are named", "Blocked gates remain explicit rather than mocked", "Evidence contains no secrets or unmasked PII"),
        "P1", "F", "acceptance", task_class="verification",
    ),
    task(
        "IAM-DOC-001", "Codex2", "Gemini",
        "Synchronize canonical product architecture contracts and security runbooks",
        "Reconcile the canonical PRD system analysis service contracts migration plan OpenAPI architecture account lifecycle security policies incident runbooks and UAT against implemented and live-proven behavior. Remove email-only bootstrap or other contradictory production claims and label external gates precisely.",
        ("IAM-UAT-002", "IAM-CTR-001"),
        ("phase1_prd_detailed_v1.md", "phase1_system_analysis_v1.md", "phase1_service_contracts_v1.md", "phase1_migration_plan_v1.md", "docs/02-architecture/", "docs/03-runbooks/", "docs/04-uat/", "CANONICAL_DOCUMENT_MAP.md"),
        ("Canonical layers and runtime have no contradictory auth claims", "OpenAPI contracts and migrations match implementation", "Implemented tested and live-proven labels are accurate", "Runbooks cite current commands and owners", "Docs links lint and diff checks pass"),
        "P1", "F", "documentation", task_class="documentation",
    ),
    task(
        "IAM-REL-001", "Codex", "Gemini2",
        "Integrate verify stage and release Stage 1.5 IAM hardening",
        "Integrate only reviewer-approved task commits onto current origin/dev through normal PRs. Run required CI security scans migrations expand-backfill-cutover checks and rollback drill; deploy staging once; verify all six gates and named sign-offs; then release through the normal publish path with exact SHA evidence.",
        ("IAM-DOC-001", "IAM-UAT-002", "IAM-IR-001"),
        (".github/workflows/", "infra/", "scripts/", "support/sidecars/IAM-REL-001/", "docs/04-uat/"),
        ("All dependency commits are reviewed and integrated", "Required CI and security scans pass", "Migration cutover and rollback evidence pass", "All release gates and named sign-offs are recorded", "Deployed and published SHAs match reviewed tree"),
        "P0", "F", "release", task_class="release", mutates_canonical=True,
    ),
)


def load_existing_tasks() -> dict[str, dict[str, object]]:
    if not STATUS_FILE.exists():
        return {}
    payload = json.loads(STATUS_FILE.read_text(encoding="utf-8"))
    return {
        str(item.get("id")): item
        for item in payload.get("tasks", [])
        if isinstance(item, dict) and item.get("id")
    }


def validate_graph() -> None:
    seen: set[str] = set()
    errors: list[str] = []
    valid_agents = {"Codex", "Codex2", "Gemini", "Gemini2"}
    for item in TASKS:
        if item.task_id in seen:
            errors.append(f"duplicate task id: {item.task_id}")
        if item.owner not in valid_agents or item.reviewer not in valid_agents:
            errors.append(f"unsupported lane on {item.task_id}")
        if item.owner == item.reviewer:
            errors.append(f"owner equals reviewer on {item.task_id}")
        missing_or_late = [dep for dep in item.depends_on if dep not in seen]
        if missing_or_late:
            errors.append(
                f"{item.task_id} dependencies are missing or not topological: "
                + ", ".join(missing_or_late)
            )
        if not item.artifacts or not item.acceptance:
            errors.append(f"{item.task_id} has incomplete execution details")
        seen.add(item.task_id)
    roots = [item.task_id for item in TASKS if not item.depends_on]
    expected_roots = ["IAM-P0-003", "IAM-P0-004", "IAM-ACC-001", "IAM-AUD-001"]
    if roots != expected_roots:
        errors.append(f"unexpected roots: {roots}")
    if errors:
        raise RuntimeError("Invalid IAM task graph:\n- " + "\n- ".join(errors))


def metadata_for(item: Task) -> dict[str, object]:
    return {
        "planning_ref": ARCHITECTURE_REF,
        "execution_ref": EXECUTION_REF,
        "priority": item.priority,
        "wave": item.wave,
        "workstream": item.workstream,
        "task_class": item.task_class,
        "security_sensitive": True,
        "release_gate": item.priority == "P0" or item.task_id.startswith("IAM-UAT"),
        "mutates_canonical": item.mutates_canonical,
        "registered_by": "dispatch-stage1-5-identity-access-account-security-20260801.py",
    }


def register(item: Task) -> None:
    env = os.environ.copy()
    env.setdefault("AI_NAME", "Codex")
    env["AI_STATUS_ROOT"] = str(STATUS_ROOT)
    env["ORCH_STATUS_ROOT"] = str(STATUS_ROOT)
    env.update(
        {
            "TASK_PHASE": PHASE,
            "TASK_TITLE": item.title,
            "TASK_SUMMARY_ZH": (
                f"[Architecture: {ARCHITECTURE_REF}; Execution: {EXECUTION_REF}] "
                f"{item.summary}"
            ),
            "TASK_DEPENDS_ON": ",".join(item.depends_on),
            "TASK_ARTIFACTS": ",".join(item.artifacts),
            "TASK_ACCEPTANCE": ",".join(item.acceptance),
            "TASK_METADATA_JSON": json.dumps(metadata_for(item), ensure_ascii=False),
            "TASK_MUTATES_CANONICAL": "true" if item.mutates_canonical else "false",
        }
    )
    result = subprocess.run(
        [
            "bash",
            "tools/development-orchestrator/bin/ai-status.sh",
            "assign",
            item.task_id,
            item.owner,
            item.reviewer,
            item.title,
        ],
        cwd=REPO,
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "unknown assignment error").strip()
        raise RuntimeError(f"{item.task_id} registration failed: {detail}")


def verify_materialized(expected_ids: set[str]) -> None:
    actual = load_existing_tasks()
    missing = sorted(expected_ids - actual.keys())
    if missing:
        raise RuntimeError("Tasks missing after registration: " + ", ".join(missing))
    by_id = {item.task_id: item for item in TASKS}
    errors: list[str] = []
    for task_id in sorted(expected_ids):
        expected = by_id[task_id]
        current = actual[task_id]
        if tuple(current.get("depends_on") or ()) != expected.depends_on:
            errors.append(f"{task_id} dependency mismatch")
        if current.get("owner") != expected.owner:
            errors.append(f"{task_id} owner mismatch")
        if current.get("reviewer") != expected.reviewer:
            errors.append(f"{task_id} reviewer mismatch")
        if not current.get("artifacts") or not current.get("acceptance"):
            errors.append(f"{task_id} missing artifacts or acceptance")
    if errors:
        raise RuntimeError("Materialized task verification failed:\n- " + "\n- ".join(errors))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate and print the DAG without mutating machine truth.",
    )
    parser.add_argument(
        "--allow-existing",
        action="store_true",
        help="Skip task IDs already present after verifying their graph fields.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    validate_graph()
    roots = [item.task_id for item in TASKS if not item.depends_on]
    print(f"Validated {len(TASKS)} IAM tasks; roots={','.join(roots)}")
    for item in TASKS:
        deps = ",".join(item.depends_on) or "<root>"
        print(
            f"{item.task_id:16s} P={item.priority} W={item.wave} "
            f"{item.owner:7s}->{item.reviewer:7s} deps={deps}"
        )
    if args.dry_run:
        return 0

    existing = load_existing_tasks()
    collisions = sorted(item.task_id for item in TASKS if item.task_id in existing)
    if collisions and not args.allow_existing:
        print(
            "Refusing to overwrite existing machine-truth tasks: "
            + ", ".join(collisions)
            + ". Re-run with --allow-existing only after verifying the partial wave.",
            file=sys.stderr,
        )
        return 2

    registered: set[str] = set()
    for item in TASKS:
        if item.task_id in existing:
            registered.add(item.task_id)
            print(f"SKIP {item.task_id}: already present")
            continue
        register(item)
        registered.add(item.task_id)
        print(f"ASSIGNED {item.task_id}: {item.owner} -> {item.reviewer}")

    verify_materialized(registered)
    print(
        f"Materialized and verified {len(registered)}/{len(TASKS)} tasks. "
        "The supervisor may now dispatch dependency-ready roots."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
