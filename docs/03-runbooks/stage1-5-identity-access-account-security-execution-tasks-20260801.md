# Stage 1.5 Identity, Access, Account and Security Execution Tasks

Status: authorized for supervisor-managed execution  
Version: `2026-08-01.v1`  
Architecture authority: `docs/02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md`  
Machine registration: `scripts/dispatch-stage1-5-identity-access-account-security-20260801.py`

Run the registration script from the canonical checkout. If an isolated
worktree is required, export `AI_STATUS_ROOT` with the canonical checkout path;
the script propagates that root to every `ai-status.sh` transaction and verifies
the resulting canonical task records before reporting success.

## 1. Execution objective

Stage 1 is functionally close to complete, but the current login, account and
authorization baseline is not production-ready. This packet converts the
approved hardening plan into an executable dependency graph. The supervisor is
the only dispatcher; auto workers work in isolated task branches and must use
the repository task lifecycle, reviewer gate, commit evidence and normal push
rules.

The wave is complete only when production authentication has cryptographic
identity proof, every route is classified and default-deny, accounts and
sessions are durable, role or status changes revoke access within 60 seconds,
privileged actions require MFA/approval, all credentials have lifecycle
controls, security events and incident response are live, and the complete
negative matrix passes in staging.

## 2. Non-negotiable delivery rules

1. Never weaken an existing guard to make a test pass. Unknown routes,
   unverified identities, invalid realm/audience, unavailable session authority
   and unavailable audit authority fail closed.
2. Production must not accept email-only tenant login, caller-defined
   roles/scopes, bootstrap actor headers, demo identities, default tenants or a
   missing internal key as authority.
3. Browser credentials use Secure HttpOnly cookies and CSRF protection. Access
   tokens, refresh tokens, API keys, invitation tokens, authorization codes and
   private keys must not enter URLs, browser storage, logs, analytics or error
   details.
4. Identity is server-resolved from immutable subject plus durable membership.
   Client tenant, role, scope, actor and MFA booleans are consistency inputs at
   most, never authority.
5. Every human mutation records a non-null actor, reason code, before/after
   summary, request/trace correlation and policy version. If privileged audit
   persistence fails, the mutation fails.
6. Every task must add positive and negative tests for its own trust boundary.
   Unit-only evidence is insufficient for durable, cross-instance, browser or
   infrastructure claims.
7. A task can reach `done` only with a task-scoped commit, required trailers,
   normal push, reviewer approval and recorded integration status. Branch-only
   completion is not release completion.
8. P0 gates may not wait for UI work. UI tasks may not invent authority or
   replace backend enforcement.
9. Existing product semantics remain governed by the canonical L1/L2 documents.
   This packet hardens identity and access; it does not silently change booking,
   billing, dispatch or evidence business rules.
10. Vendor-specific activation that requires an external tenant or credential
    must be implemented behind the approved provider-neutral contract and
    recorded as a named live-environment gate. It must not be mocked as
    production evidence.

## 3. Parallelization strategy

The registration order is topological. A missing dependency must never be
interpreted as permission to start, so every dependency is registered before
its children. Four roots are intentionally file-disjoint enough to start in
parallel:

| Root task | Lane | Initial surface |
|---|---|---|
| `IAM-P0-003` | Gemini2 | route inventory and default-deny guard |
| `IAM-P0-004` | Gemini | production auth configuration validation |
| `IAM-ACC-001` | Codex2 | canonical principal/membership/invitation persistence |
| `IAM-AUD-001` | Codex | canonical append-only security events |

The owner map is a scheduling hint, not permission to bypass dependencies.
Supervisor reassignment is allowed only when machine truth records the reason
and preserves an independent reviewer.

## 4. Dependency waves

| Wave | Purpose | Tasks |
|---|---|---|
| A | Immediate containment and durable foundations | `IAM-P0-003`, `IAM-P0-004`, `IAM-ACC-001`, `IAM-AUD-001` |
| B | Close exposed bootstrap/browser paths and establish policy/contracts | `IAM-P0-001`, `IAM-P0-005`, `IAM-SES-001`, `IAM-RBAC-001`, `IAM-P0-002`, `IAM-CTR-001` |
| C | Verified IdP, sessions, signing and production bootstrap removal | `IAM-IDP-001`, `IAM-IDP-002`, `IAM-SES-002`, `IAM-P0-006`, `IAM-KEY-001` |
| D | Account governance, MFA and credential families | `IAM-ACC-002`, `IAM-ACC-003`, `IAM-SES-003`, `IAM-RBAC-002`, `IAM-MFA-001`, `IAM-DRV-001`, `IAM-PRT-001`, `IAM-SVC-001` |
| E | Privileged governance, apps and security operations | `IAM-GOV-001`, `IAM-BG-001`, `IAM-DRV-002`, `IAM-SVC-002`, `IAM-UI-PLAT-001`, `IAM-UI-TEN-001`, `IAM-UI-DRV-001`, `IAM-OBS-001`, `IAM-IR-001` |
| F | Independent acceptance, controlled synchronization and release | `IAM-UAT-001`, `IAM-UAT-002`, `IAM-DOC-001`, `IAM-REL-001` |

## 5. Task registry

### 5.1 Containment and contracts

| Task | Priority | Execution contract |
|---|---|---|
| `IAM-P0-001` | P0 | Disable email-only tenant session exchange outside explicit local/test mode. Invited, suspended, disabled and unmatched membership states must not receive a session. Preserve deterministic local fixtures behind a feature gate only. |
| `IAM-P0-002` | P0 | Make `/auth/token` a private verified exchange. Resolve realm, actor, memberships, roles and scopes server-side from trusted IAP/workload proof; reject caller-supplied privilege claims and wrong audience. |
| `IAM-P0-003` | P0 | Inventory every controller route and enforce default-deny. Anonymous access requires an explicit open-route marker plus inventory entry; unmatched or conflicting metadata fails tests and runtime authorization. |
| `IAM-P0-004` | P0 | Add production startup validation for issuer, audience, algorithms, signing/cookie/CSRF keys, origins, session store, audit store and required secret references. Missing or unsafe values stop startup. |
| `IAM-P0-005` | P0 | Replace permissive CORS with explicit per-environment allowlists and add HSTS, CSP, frame, content-type, referrer and no-store controls for authentication responses. Test preflight and credentialed denial. |
| `IAM-P0-006` | P0 | Remove bootstrap identity headers, mock principals, default tenant and scope override from stage/prod paths. Keep only explicit test harness support and prove direct production requests are rejected. |
| `IAM-CTR-001` | P0 | Publish canonical identity/session/account/role/invitation/credential contracts, stable non-enumerating errors and OpenAPI. Align generated policy names and migration compatibility. |

### 5.2 Verified identity, sessions and keys

| Task | Priority | Execution contract |
|---|---|---|
| `IAM-IDP-001` | P0 | Implement tenant and partner-human OIDC authorization-code plus PKCE through a BFF. Validate state, nonce, code verifier, issuer, audience, redirect allowlist and IdP MFA claims; bind subject to durable membership. |
| `IAM-IDP-002` | P0 | Resolve verified IAP workforce subject to durable platform/ops memberships. Reject spoofed email headers, wrong audience, unmapped/inactive users and client-provided roles. Detect group/membership drift. |
| `IAM-SES-001` | P0 | Add durable session, refresh family and token records with hash-only secrets, expiry, rotation, revoke reason, device/risk context and indexes. Prove restart and concurrent consume behavior. |
| `IAM-SES-002` | P0 | Issue and enforce `sid`, `jti`, `tokenVersion`, `auth_time`, `amr`, `acr`, issuer, audience and policy version. Check durable revocation and invalidate all affected sessions within 60 seconds of status/membership/role change. |
| `IAM-SES-003` | P1 | Deliver self session inventory, logout, logout-all and boundary-safe admin revoke APIs with audit and CSRF. Expose only masked device/IP summaries. |
| `IAM-KEY-001` | P1 | Move signing to an asymmetric or managed key ring with `kid`, current/previous overlap, activation and retirement times. Add rotation and rollback drill evidence; never relax issuer/audience on rollback. |

### 5.3 Accounts, authorization and privileged governance

| Task | Priority | Execution contract |
|---|---|---|
| `IAM-ACC-001` | P0 | Implement canonical principal, subject binding, membership, invitation and account-state persistence with uniqueness, tenant boundary, expiry and safe backfill. Email is not the primary identity key. |
| `IAM-ACC-002` | P1 | Replace seed/in-memory platform users with durable actor-aware CRUD and workforce membership reconciliation. Record complete before/after/reason audit and retain least privilege on drift. |
| `IAM-ACC-003` | P1 | Implement tenant joiner/mover/leaver and proof-based invitation lifecycle. Enforce invited-not-active, self-escalation denial, last-admin protection, offboarding revoke and reactivation review. |
| `IAM-RBAC-001` | P0 | Create one generated policy catalog for API guards, control-plane proxy and UI capability hints. Add role/scope/resource constraints, migration aliases and parity/drift tests. |
| `IAM-RBAC-002` | P1 | Implement privileged role request, independent approval, effective/expiry time and removal. Enforce separation of duties, no self-approval, fresh MFA and session invalidation. |
| `IAM-MFA-001` | P1 | Enforce trusted `amr`/`acr`/`auth_time` step-up policy for every named high-risk action. Frontend booleans are ignored; stale or missing proof returns stable step-up errors. |
| `IAM-GOV-001` | P1 | Implement privileged access review campaigns, owner certification, reduce/remove remediation, overdue alerts and immutable evidence with tenant/resource boundaries. |
| `IAM-BG-001` | P1 | Implement break-glass request, two-person approval, least-scope activation, maximum 60-minute non-refreshable session, visible banner, immediate expiry/revoke and post-use review. |

### 5.4 Driver, partner and service credentials

| Task | Priority | Execution contract |
|---|---|---|
| `IAM-DRV-001` | P0 | Replace process-local driver binding and plaintext refresh comparison with durable binding, one-time invitation and hash-only refresh families. Enforce expiry, rotation, reuse detection, suspend, revoke and rebind. |
| `IAM-DRV-002` | P1 | Integrate mobile secure storage, device registration/rebind, remote logout and compromised-session UX. Clear secrets on revoke/reuse without dropping unsynchronized offline proof. |
| `IAM-PRT-001` | P1 | Add owner, scope, expiry, last-used, dual-key rotation and automatic old-key revoke for tenant/partner API and webhook credentials. Plaintext is returned once and expiry fails closed. |
| `IAM-SVC-001` | P1 | Make workload identity federation and audience-bound short-lived service tokens the production primary path. Remove caller-defined system scopes and prove cross-service audience denial. |
| `IAM-SVC-002` | P1 | Inventory every temporary shared internal-key exception with owner, scope, TTL, network boundary, rotation and removal date. Alert on usage/drift and remove undocumented exceptions. |

### 5.5 Product surfaces and security operations

| Task | Priority | Execution contract |
|---|---|---|
| `IAM-AUD-001` | P0 | Define and persist canonical append-only security events for auth, session, account, role, invitation, device and credential activity. Mask sensitive fields and fail privileged mutation when audit cannot persist. |
| `IAM-OBS-001` | P1 | Add metrics, dashboards and routed alerts for login abuse, invitation abuse, refresh reuse, cross-tenant attempts, privilege changes, break-glass, dormant/expiring credentials and audit pipeline failure. |
| `IAM-IR-001` | P1 | Publish and exercise account takeover and credential compromise runbooks including revoke, suspend, evidence preservation, key rotation, blast-radius query, recovery and post-incident review. |
| `IAM-UI-PLAT-001` | P1 | Build Platform Admin users, memberships, sessions, role approval, access review and break-glass surfaces using backend authority. Include risk/SoD/expiry state and persistent privileged-session banner. |
| `IAM-UI-TEN-001` | P1 | Build tenant-scoped users/roles, invite, session and API-key lifecycle surfaces. Show step-up requirements before mutation and enforce last-admin/self-escalation behavior from server errors. |
| `IAM-UI-DRV-001` | P1 | Build driver not-provisioned, register, expired, revoked, suspended, devices, revoke and rebind states. Keep authentication state separate from offline trip/proof synchronization. |

### 5.6 Acceptance and release

| Task | Priority | Execution contract |
|---|---|---|
| `IAM-UAT-001` | P0 | Create the independent automated negative matrix for authentication, authorization, session, credential, route classification, tenant isolation, restart/concurrency and secret leakage. Make it release-blocking. |
| `IAM-UAT-002` | P1 | Run production-like staging journeys and assemble cited evidence for Security, SRE, Ops and tenant-owner sign-off. External IdP/cloud claims require real traces rather than mocks. |
| `IAM-DOC-001` | P1 | Reconcile PRD, system analysis, service contracts, migration, OpenAPI, architecture, account/security runbooks and UAT wording against implemented/live-proven status. Remove contradictory production claims. |
| `IAM-REL-001` | P0 | Integrate only reviewed commits, run required CI/security scans/migrations/rollback drill, deploy staging, verify all gates, obtain named sign-off and then release through the normal dev-to-publish path. |

## 6. Required acceptance matrix

The individual tasks own focused tests; `IAM-UAT-001` independently owns the
cross-cutting release suite.

### Authentication

- email-only, invited, unknown, suspended and disabled tenant identities fail;
- OIDC wrong state, nonce, PKCE, issuer, audience, redirect and expired code fail;
- spoofed IAP email, wrong workforce audience and inactive membership fail;
- production bootstrap headers, caller roles/scopes and demo principals fail;
- errors do not reveal whether an account or membership exists.

### Authorization

- every route is classified and adding an unclassified route breaks CI;
- wrong realm, role, scope, tenant, partner, entry, driver and object ownership fail;
- self-escalation, self-approval, last-admin removal and SoD conflicts fail;
- stale/missing MFA and expired approval fail before mutation;
- UI hiding is never the only enforcement.

### Sessions and credentials

- logout, logout-all, admin revoke, suspend, role change and offboarding make old
  tokens unusable within 60 seconds;
- refresh reuse revokes the whole family once across concurrent instances;
- restart does not restore revoked session, driver binding or credential state;
- invitation, refresh, API key, webhook key and signing key expiry fail closed;
- key overlap and rollback preserve issuer/audience enforcement;
- no raw secret appears in DB projections, logs, URLs, browser storage or evidence.

### Operations

- canonical security events have actor/outcome/reason/correlation/policy data and
  masked context;
- privileged mutation fails if append-only audit persistence is unavailable;
- alerts route and page according to severity during staging drills;
- break-glass expires automatically and cannot refresh or self-approve;
- account takeover, credential compromise, key rotation and rollback drills have
  timestamps, owners, commands, results and residual-risk decisions.

## 7. Release gates

| Gate | Required proof |
|---|---|
| Gate 0: Containment | email-only and production bootstrap closed; every route classified; startup config fail-closed |
| Gate 1: Identity/session integrity | trusted IdP/IAP proof; durable revocation; refresh reuse detection; key rotation |
| Gate 2: Least privilege | durable account lifecycle; generated policy parity; MFA; approval; last-admin and SoD enforcement |
| Gate 3: Credential/device security | driver, partner and service credential lifecycle plus secure client handling |
| Gate 4: Security operations | append-only events, dashboards, alerts, break-glass and incident drills |
| Gate 5: Acceptance/release | automated negative matrix, real staging evidence, named sign-off, reviewed integration and rollback proof |

No gate may be waived because UI, happy-path tests or documents are complete.
If an external credential or tenant blocks live proof, the affected task remains
blocked with an owner and exact evidence request; it is not marked done.

## 8. Definition of done

Stage 1.5 is done only when all 36 tasks have review-approved commit and
integration evidence, all P0/P1 controls are implemented, all release gates pass,
and runtime, OpenAPI, migrations, UAT and canonical documents describe the same
production behavior. The final release task must record PRs, CI runs, migration
and rollback evidence, deployed SHA, staging journeys, sign-offs and any explicit
residual-risk acceptance.
