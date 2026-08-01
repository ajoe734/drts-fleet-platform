# BE-REF-HANDOFF-001 Sidecar Acceptance Packet

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `BE-REF-HANDOFF-001` — Durable S2S single-use handoff, consent ledger, entry-host binding, and HttpOnly session  
**Parent Owner:** `Codex2`  
**Parent Reviewer:** `Gemini2`  
**Sidecar Owner:** `Gemini2`  
**Sidecar Reviewer:** `Codex2`  
**Generated:** `2026-08-01` (UTC, packet rev3)  
**Snapshot Anchor (parent `last_update`):** `2026-08-01T10:22:55Z`  
**Snapshot Anchor (sidecar `last_update`):** `2026-08-01T10:22:24Z`  
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` — support-only; does not modify canonical truth, runtime behavior, contract surface, or parent task implementation files.

---

## 1. Scope Boundary

### In Scope
- Define the formal acceptance checklist and verification criteria for `BE-REF-HANDOFF-001`.
- Pin upstream machine-truth dependency on `REF-DOC-001` (status: `done`, commit: `1391b6c1f11e7fee0fd5313ff70ea22eaded236b`).
- Map component boundaries across contract schemas, backend partner services, DB migrations, Referral Embed Web API/middleware, and security test suites.
- Explicitly differentiate existing workspace baseline paths from new target artifacts designated for creation under `BE-REF-HANDOFF-001`.
- Provide a structured handoff document for reviewer (`Codex2`) evaluation and verification, including reachable local worktree instructions and the original owner branch reference `gemini2/be-ref-handoff-001-sidecar-acceptance`.

### Out of Scope
- Modifying L1 product specs or canonical design documents (`phase1_prd_detailed_v1.md`, `phase1_service_contracts_v1.md`, etc.).
- Writing or refactoring primary production code or migrations (owned strictly by parent task `BE-REF-HANDOFF-001`).
- Direct mutation of machine-truth task state outside prescribed `scripts/ai-status.sh` tools.

---

## 2. Machine Truth Anchors & Dependency Map

### 2.1 Sidecar Task Snapshot (`BE-REF-HANDOFF-001-SIDECAR-ACCEPTANCE`)
- **ID:** `BE-REF-HANDOFF-001-SIDECAR-ACCEPTANCE`
- **Title:** Prepare BE-REF-HANDOFF-001 acceptance packet and dependency map
- **Owner:** `Gemini2`
- **Reviewer:** `Codex2`
- **Phase:** `referral-embed-stage1-recovery-20260801`
- **Depends On:** `[REF-DOC-001]`
- **Task Class:** `sidecar`
- **Helper Parent:** `BE-REF-HANDOFF-001`
- **Helper Kind:** `acceptance_packet`
- **Mutates Canonical:** `false`
- **Artifacts:** `support/sidecars/BE-REF-HANDOFF-001/BE-REF-HANDOFF-001-SIDECAR-ACCEPTANCE.md`

### 2.2 Parent Task Snapshot (`BE-REF-HANDOFF-001`)
- **ID:** `BE-REF-HANDOFF-001`
- **Title:** Durable S2S single-use handoff, consent ledger, entry-host binding, and HttpOnly session
- **Summary:** Implement the DRTS-owned server-to-server handoff defined by the recovered spec. Long-lived partner credentials stay backend-only. Issue a two-minute single-use artifact; bind exact slug/host/user/consent; consume atomically in durable storage; establish Secure HttpOnly session; activate persistent identity only after exact `trip.manage`/`pii.trip`/`identity.bind` consent; keep entry-scoped CSP fail-closed and block legacy credential query.
- **Owner:** `Codex2`
- **Reviewer:** `Gemini2`
- **Status:** `in_progress`
- **Depends On:** `[REF-DOC-001]`

#### 2.2.1 Repository Path Audit & Component Mapping
To prevent ambiguity during review, repository paths associated with `BE-REF-HANDOFF-001` are categorized into existing workspace baseline files vs. target artifacts created during implementation:

1. **Existing Baseline Paths (Already Present in Repository Workspace):**
   - `packages/contracts/src/` — Base contract definitions and schemas for partner referral handoff.
   - `apps/api/src/modules/tenant-partner/` — Backend tenant-partner services and controllers.
   - `infra/migrations/` — Database migrations for tenant partner & consent tables.
   - `apps/referral-embed-web/lib/embed-security.ts` — Existing security helper module.
   - `apps/referral-embed-web/lib/embed-runtime.ts` — Existing runtime helper module.
   - `apps/referral-embed-web/lib/embed-api.ts` — Existing API wrapper helper.
   - `apps/referral-embed-web/middleware.ts` — Edge middleware handling CSP and routing headers.
   - `apps/api/tests/` / `tests/` — Test directories for unit, integration, and security E2E suites.

2. **Target Artifact Paths (To Be Created/Implemented by `BE-REF-HANDOFF-001`):**
   - `apps/referral-embed-web/app/api/referral/session/` — New Next.js API route handler for establishing partner session from single-use handoff token.
   - `apps/referral-embed-web/lib/embed-partner-session.ts` — New frontend helper for managing Secure HttpOnly session state and cookie verification.

### 2.3 Upstream Dependency (`REF-DOC-001`)
- **ID:** `REF-DOC-001`
- **Title:** Restore and lock Referral Embed design + functional source chain
- **Status:** `done`
- **Owner:** `Codex`
- **Reviewer:** `Gemini2`
- **Commit Hash:** `1391b6c1f11e7fee0fd5313ff70ea22eaded236b`
- **Push Ref:** `origin/codex/ref-doc-001`
- **Integration Status:** `not_applicable` (Docs / specification recovery)

---

## 3. Core Acceptance Criteria & Verification Matrix

The acceptance bar for `BE-REF-HANDOFF-001` requires empirical proof across 6 core pillars:

| Pillar | Requirement Summary | Target Subsystems | Verification Method |
| --- | --- | --- | --- |
| **1. Credential Security** | Partner credentials strictly backend-only. No raw secrets or tokens in browser query params or URLs. | `apps/api/src/modules/tenant-partner/`, `apps/referral-embed-web/` | E2E & Route Inspection (`no browser credential URLs`) |
| **2. Single-Use Handoff Artifact** | 2-minute TTL, single-use token exchange, atomic Postgres consumption (replay prevention). | `infra/migrations/`, `apps/api/src/modules/tenant-partner/` | Postgres Atomic Replay & Expiry Tests |
| **3. Binding & Host Enforcement** | Exact slug / host / user / consent version binding. Rejection (403) on host mismatch or cross-entry spoofing. | `apps/referral-embed-web/lib/embed-security.ts`, `apps/referral-embed-web/middleware.ts` | Host Mismatch & Cross-Entry Unit/Integration Tests |
| **4. Consent Ledger & Activation** | Exact versioned consent bundle (`trip.manage`, `pii.trip`, `identity.bind`) recorded in ledger prior to persistent identity activation. | `packages/contracts/src/`, `apps/api/src/modules/tenant-partner/` | Consent Ledger Serialization & Audit Assertions |
| **5. HttpOnly Session & CSP** | Issue Secure HttpOnly session cookie; entry-scoped fail-closed CSP header enforcement. | `apps/referral-embed-web/app/api/referral/session/` (target route), `apps/referral-embed-web/middleware.ts` | HTTP Header & Cookie Security Assertions |
| **6. Build & Test Suite** | Contracts, API, and Web lint, typecheck, build, and E2E pass clean. | Full repository build pipeline | `pnpm lint`, `pnpm typecheck`, `pnpm test` |

---

## 4. Acceptance Checklist for Reviewer Walkthrough

When reviewing parent task `BE-REF-HANDOFF-001`, the reviewer (`Gemini2` / `Codex2`) should walk through the following verification points:

- [ ] **No Browser Credential Leaks**: Inspect URL query handling in `apps/referral-embed-web`. Ensure no partner secrets, access keys, or bearer tokens are passed via frontend query strings or client state.
- [ ] **Postgres Atomic Handoff Consumption**: Verify database migration adding handoff token table with unique index, `consumed_at` timestamp, and `expires_at` (2-minute window). Confirm SQL query uses atomic `UPDATE ... SET consumed_at = NOW() WHERE token = $1 AND consumed_at IS NULL AND expires_at > NOW()`.
- [ ] **Replay & Expiry Prevention**: Verify tests covering simultaneous/duplicate token exchange requests — exactly 1 succeeds and second receives `401 Unauthorized` / `400 Bad Request`. Verify expired tokens (> 2 mins) fail closed.
- [ ] **Exact Host & Slug Binding**: Verify `embed-security.ts` checks request `Host` / `Origin` against authorized tenant/partner entry hosts. Verify cross-entry attempts yield `403 Forbidden`.
- [ ] **Versioned Consent Ledger**: Verify consent payload schema requires versioning and explicit scopes (`trip.manage`, `pii.trip`, `identity.bind`). Verify identity is activated only after receipt of clean consent record.
- [ ] **Secure HttpOnly Cookies**: Verify `Set-Cookie` headers use `HttpOnly; Secure; SameSite=Lax` (or `Strict` as appropriate). Verify client JS cannot access session cookies.
- [ ] **Fail-Closed CSP Headers**: Verify middleware sets Content-Security-Policy headers blocking unauthorized framing or inline script execution.
- [ ] **Automated Test Execution**:
  - `pnpm --filter @drts/contracts test`
  - `pnpm --filter @drts/api test`
  - `pnpm --filter @drts/referral-embed-web test`

---

## 5. Reviewer Handoff & Verification Instructions

1. **Local Task Branch / Worktree Availability**:
   Supervisor dispatch assigned reviewer worktree `/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/codex2-be-ref-handoff-001-sidecar-acceptance` on branch `codex2/be-ref-handoff-001-sidecar-acceptance`. If the reviewer is not already in that worktree, reuse the existing branch/worktree first:
   ```bash
   existing=$(git worktree list --porcelain | awk 'BEGIN{p=""} /^worktree /{p=substr($0,10)} /^branch refs\\/heads\\/codex2\\/be-ref-handoff-001-sidecar-acceptance$/{print p; exit}')
   if [ -n "$existing" ]; then
     cd "$existing"
   elif git show-ref --verify --quiet refs/heads/codex2/be-ref-handoff-001-sidecar-acceptance; then
     git switch codex2/be-ref-handoff-001-sidecar-acceptance
   else
     git switch -c codex2/be-ref-handoff-001-sidecar-acceptance origin/dev
   fi
   ```

2. **Owner Branch Ref Availability**:
   The original sidecar handoff branch remains `gemini2/be-ref-handoff-001-sidecar-acceptance` on remote `origin`. Reviewers who need to inspect the owner snapshot directly can fetch the packet via:
   ```bash
   git fetch origin gemini2/be-ref-handoff-001-sidecar-acceptance
   git checkout origin/gemini2/be-ref-handoff-001-sidecar-acceptance -- support/sidecars/BE-REF-HANDOFF-001/BE-REF-HANDOFF-001-SIDECAR-ACCEPTANCE.md
   ```

3. **Handoff Protocol**:
   - Owner (`Gemini2`) executes `AI_NAME=Gemini2 scripts/ai-status.sh handoff BE-REF-HANDOFF-001-SIDECAR-ACCEPTANCE Codex2 "Updated acceptance packet with repository path audit and pushed ref to origin"`.
   - Reviewer (`Codex2`) verifies the artifact on `origin/gemini2/be-ref-handoff-001-sidecar-acceptance` and approves via `AI_NAME=Codex2 scripts/ai-status.sh approve BE-REF-HANDOFF-001-SIDECAR-ACCEPTANCE "Approved sidecar acceptance packet"`.
