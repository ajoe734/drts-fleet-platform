# Sidecar Acceptance Packet: BE-REF-PASSENGER-001

- **Parent Task:** `BE-REF-PASSENGER-001` (`Referral passenger booking, recovery, history, cancel, receipt, and rating authority`)
- **Sidecar Task:** `BE-REF-PASSENGER-001-SIDECAR-ACCEPTANCE`
- **Status:** `review_approved` (owner closeout pending at capture time)
- **Owner:** `Codex2`
- **Reviewer:** `Gemini2`
- **Parent Owner:** `Gemini2`
- **Parent Reviewer:** `Codex2`
- **Scope Guardrail:** support artifact only; no canonical truth or runtime implementation changes
- **Primary Machine Truth:** `ai-status.json`
- **Dispatch Dependency:** `BE-REF-HANDOFF-001` (`done` on `2026-08-01`, commit `6ea50dd2b3e5d7137b728672a8a160ff26bff925`)

## 1. Purpose

This packet gives `Gemini2` and the parent reviewer a compact acceptance checklist, dependency map, and current-head evidence set for `BE-REF-PASSENGER-001`.

It does not replace machine truth. Lifecycle state, ownership, and closeout evidence remain authoritative in `ai-status.json` and `ai-activity-log.jsonl`.

## 2. Machine-Truth Snapshot

Snapshot below reflects the task rows visible during this sidecar pass.

| Task ID | Status | Owner | Reviewer | Notes |
| --- | --- | --- | --- | --- |
| `BE-REF-HANDOFF-001` | `done` | `Codex` | `Gemini2` | Durable S2S handoff, consent ledger, entry-host binding, and HttpOnly session are already closed and pushed on `origin/dev`. |
| `BE-REF-PASSENGER-001` | `in_progress` | `Gemini2` | `Codex2` | Parent slice owns referral-passenger booking, recovery, history, receipt, cancel, and rating authority. |
| `BE-REF-PASSENGER-001-SIDECAR-ACCEPTANCE` | `review_approved` | `Codex2` | `Gemini2` | Review passed; owner closeout still needs commit/push/done evidence. |

Direct machine-truth facts for this sidecar:

- `depends_on`: `BE-REF-HANDOFF-001`
- `artifact`: `support/sidecars/BE-REF-PASSENGER-001/BE-REF-PASSENGER-001-SIDECAR-ACCEPTANCE.md`
- acceptance:
  - `Create support artifacts only`
  - `Do not edit canonical truth`
  - `Hand off the packet to the assigned reviewer`

Parent machine-truth facts to preserve during review:

- declared artifacts:
  - `packages/contracts/src/`
  - `apps/api/src/modules/owned-mobility/`
  - `apps/referral-embed-web/app/api/referral/`
  - `apps/referral-embed-web/lib/embed-booking-api.ts`
  - `tests/`
- acceptance:
  - `Handoff-consent-create-active-reload-history-receipt-cancel/completion-rating flows pass; cross-passenger/cross-partner/forged-tenant fail; retries do not duplicate; PII mask/download ownership pass; no production fixture success or 501 capability routes; lint/typecheck/build pass`

## 3. Dependency Map

### 3.1 Hard upstream dependency

| Dependency | Current status | Why it matters |
| --- | --- | --- |
| `BE-REF-HANDOFF-001` | `done` | Publishes the durable referral handoff primitives the parent must consume rather than re-invent: single-use artifact, exact `entryHost` binding, consent bundle enforcement, consent ledger persistence, and referral-passenger session issuance. |

### 3.2 Parent ownership boundaries

| Surface | Owned by | Reviewer expectation |
| --- | --- | --- |
| Partner ingress / referral embed handoff primitives | `BE-REF-HANDOFF-001` | parent must reuse handoff/session/consent machinery as-is |
| Referral passenger booking, recovery, history, receipt, cancel, rating authority | `BE-REF-PASSENGER-001` | parent must finish the rider lifecycle without reopening handoff semantics |
| Support packet | `BE-REF-PASSENGER-001-SIDECAR-ACCEPTANCE` | support-only evidence and checklist; no canonical changes |

### 3.3 Reviewer hazards already visible on HEAD

| Hazard | Why it matters |
| --- | --- |
| Dispatch brief names `docs/03-runbooks/referral-embed-stage1-recovery-execution-tasks-20260801.md`, but that path is not present in this worktree. | Reviewer should treat the dispatch brief plus machine truth as the planning anchor unless the owner supplies the moved/reconciled document path. |
| Parent artifact list names `apps/referral-embed-web/lib/embed-booking-api.ts`, but current HEAD exposes `apps/referral-embed-web/lib/embed-api.ts` instead. | Reviewer should verify whether this is a stale task row, a pending rename, or an unrecorded artifact drift before parent closeout. |
| `apps/referral-embed-web/lib/embed-fixtures.ts` still exists. | Parent acceptance explicitly forbids production fixture success; reviewer must confirm fixtures are demo-only and not used as live capability paths. |

## 4. Parent Acceptance Checklist

The parent reviewer should walk `BE-REF-PASSENGER-001` against four gates.

### 4.1 Handoff and consent reuse

- verify parent continues to use `/api/partner/ingress/referral-embed-handoff`, `/consume`, and `/consent`
- verify consent bundle still requires exact scopes `trip.manage`, `pii.trip`, `identity.bind`
- verify replay, expiry, and wrong-host outcomes stay enforced by the existing handoff repository/service path

### 4.2 Referral passenger authority and isolation

- verify referral-passenger identity remains `actorType=referral_passenger`, `realm=partner`, and entry-scoped by `partnerEntrySlug`
- verify cross-entry and wrong-host session reuse stay fail-closed
- verify cross-passenger, cross-partner, and forged-tenant access attempts fail rather than downgrade into partial reads
- verify parent reuses owned-mobility only through explicit passenger/partner isolation guards

### 4.3 Rider lifecycle completion bar

- verify create, active-trip reload, history, receipt, cancel, completion, and rating flows all exist as real capability paths
- verify retries on create/cancel/rating do not duplicate state transitions
- verify receipt visibility preserves ownership semantics and PII masking
- verify no production `501` response or fixture-backed success remains on the capability routes needed by the parent acceptance

### 4.4 Verification gates

- verify owner supplies executable evidence for the final tree
- verify lint, typecheck, and build pass on the parent branch state
- verify acceptance evidence includes the end-to-end handoff -> consent -> passenger flow, not only unit tests

## 5. Repo-Visible Evidence On Current HEAD

These anchors are reviewer aids only. They do not replace the parent owner's own verification and handoff evidence.

### 5.1 Handoff and consent contract surfaces

- `packages/contracts/src/referral-channel.ts:68-169` defines:
  - exact required consent scopes
  - referral embed handoff artifact/session contracts
  - referral-passenger session identity shape
- `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts:199-335` exposes:
  - `POST /api/partner/ingress/handoff`
  - `POST /api/partner/ingress/referral-embed-handoff`
  - `POST /api/partner/ingress/referral-embed-handoff/consume`
  - `POST /api/partner/ingress/referral-embed-handoff/consent`
- `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:5253-5435` enforces:
  - `120s` single-use artifact issuance
  - exact `entryHost` matching
  - exact consent-scope bundle matching
  - explicit replay / expiry / wrong-host failures
- `apps/api/src/modules/tenant-partner/referral-embed-handoff.repository.ts:154-309` implements:
  - atomic consume on `admin.phase1_referral_embed_handoffs`
  - consent ledger persistence on `admin.phase1_referral_embed_consent_ledger`
  - replay detection by artifact hash and bundle version

### 5.2 Referral embed web session surfaces

- `apps/referral-embed-web/app/api/referral/session/route.ts:72-115` exchanges handoff artifacts, records consent, writes the cookie-backed session, and clears session state on failure
- `apps/referral-embed-web/lib/embed-api.ts:139-185` is the actual current-head client surface for handoff, consume, and consent calls
- `apps/referral-embed-web/lib/embed-context.ts:136-150` drops session state on cross-entry or entry-host mismatch and marks missing-session fallback

### 5.3 Isolation and attribution anchors

- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:589-603` stamps `partnerEntrySlug` from the referral handoff identity onto passenger orders
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:9928-9962` contains referral-passenger / entry-scoped authorization guards on partner-owned flows
- `apps/api/tests/unit/owned-mobility.service.test.ts:6498-6516` proves referral attribution is stamped only for referral-passenger rides and stays null otherwise

### 5.4 Test anchors already visible

- `apps/api/tests/unit/tenant-partner.controller.test.ts:37-100` verifies short-lived bearer issuance and durable re-bind for the same `partnerUserRef`
- `apps/api/tests/unit/tenant-partner.controller.test.ts:123-255` verifies internal bootstrap hardening and fail-closed behavior when the internal key path is misused
- `apps/api/tests/unit/tenant-partner.service.test.ts:625-679` verifies matching handoff passenger access and cross-entry rejection for eligibility flows
- `apps/api/tests/unit/referral-embed-handoff.repository.test.ts:27-148` verifies atomic consume plus replay / expiry / wrong-host outcomes
- `tests/unit/referral-embed-security.test.ts:21-131` verifies authorized embed hosts, denied unauthorized origins, and `403` on cross-entry session reuse
- `tests/e2e/E2E-016-referral-channel.sh:73-138` already hard-verifies the upstream handoff identity bind and durable passenger mapping

## 6. What Still Must Come From The Parent Handoff

Current HEAD shows the handoff substrate and some referral embed session plumbing, but the parent reviewer still needs explicit handoff evidence for:

- real referral passenger create/history/receipt/cancel/completion/rating routes and their final contract shape
- proof that retries do not duplicate create, cancel, or rating effects
- proof that no production `501` or fixture-backed success remains on the parent capability routes
- proof that receipt download / ownership behavior is source-correct and PII-safe
- lint / typecheck / build results on the owner's final tree

## 7. Evidence Notes

- The dispatch brief's planning-doc path is missing from the assigned worktree, so this packet cites only machine truth and repo-visible current-head anchors.
- `apps/referral-embed-web/lib/embed-booking-api.ts` is not present on current HEAD. The closest live surface is `apps/referral-embed-web/lib/embed-api.ts`.
- This sidecar does not assert that the parent acceptance already passes. It only narrows the review surface and records where evidence must come from.

## 8. Sidecar Verification

This pass changes only `support/sidecars/BE-REF-PASSENGER-001/BE-REF-PASSENGER-001-SIDECAR-ACCEPTANCE.md`.

Verification performed for the sidecar artifact:

- `AI_COLLABORATION_GUIDE.md` review
- `scripts/ai-status.sh show BE-REF-PASSENGER-001-SIDECAR-ACCEPTANCE`
- `scripts/ai-status.sh show BE-REF-PASSENGER-001`
- `scripts/ai-status.sh show BE-REF-HANDOFF-001`
- current-head anchor review for contracts, controller, service, repository, referral embed web session route, embed context, and unit/E2E tests

No runtime checks were run for this sidecar itself because it is support-only and does not change executable behavior.
