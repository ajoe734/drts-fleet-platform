# C111 tenant binding repair: planning decision routing

Date: 2026-09-08. Helper owner: Codex2; reviewer: Codex.
Parent: `SR-QA-WEBHOOK-001-FIX-TENANT-BINDING`; owner Codex; reviewer Gemini.
Inspected integration base: `fa0fd8257950764526a522d091be9d97effa82b9`.

## Decision and authority

Route `Q-SR-QA-WEBHOOK-TENANT-BINDING-001` to Supervisor/Claude for explicit
write-scope authorization and dependency sequencing. The existing repair task
already requires 403 for another tenant's authenticated JWT paired with the
victim's `x-tenant-id`. Preserve that acceptance, including issue/rotate/revoke,
same-tenant lifecycle, and SQL evidence. No scope cut is accepted.

This planning helper does not grant product edit authority. Parent machine truth
has `write_scopes: []`, `status: blocked`, and `waiting_for: Claude`. A planning
PR or its approval alone must not resume implementation.

## Cited contract and evidence

- `phase1_prd_detailed_v1.md` §9.1.2 defines tenant API-key management and role
  restrictions on sensitive API/Webhook modules; it does not grant cross-tenant
  access through caller-supplied headers.
- `phase1_system_analysis_v1.md` §11.1 requires tenant/platform permission
  isolation. `phase1_service_contracts_v1.md` §3.1 owns authentication and
  principals; §3.2 owns tenant API keys and tenant user-role mapping.
- `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md`
  SC-038 requires one-time plaintext disclosure. Its “Tenant A API key cannot
  access tenant B resources” scenario prohibits cross-tenant exposure. That
  API-key authentication scenario supports isolation but is not a substitute
  for the parent's specific JWT/header 403 regression.
- At the inspected base, `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`
  `listApiKeys` passes `requireTenantId(tenantId)` from the header into the
  service. Issue/rotate/revoke also pass header-derived tenant scope and an
  identity. Inspect binding across the complete middleware/guard/service chain
  before choosing the repair location; this static observation is not a new
  full-AppModule reproduction.
- Parent machine truth attributes a narrow-module HTTP leak to source commit
  `6b9de8287abb48e5770524c3addf5e5e41f8f663`, based on
  `e2df37f821ce76d8a3639ceaac6d253299c0a31c`, and references
  the historical HTTP evidence location in the parent's `evidence_refs` field
  (filename `evidence-auth-http.json`). Retrieve it from the source commit
  before reproducing; it is absent from this integration checkout, as is the
  referenced UAT report. Those
  results are inherited task evidence, not rerun or independently verified here.

## Concrete follow-up and proposed scopes

Supervisor/Claude must record the following in canonical task state before
resuming the repair owner:

1. Inspect active IAM/tenant owners and shared-file claims. Identify concrete
   prerequisite task IDs and serialize overlaps, or explicitly record that none
   remain. Do not infer authorization from a completed IAM task.
2. Authorize a minimal selection from these proposed product surfaces after
   inspecting the complete request chain:
   `apps/api/src/common/auth/bootstrap-auth.guard.ts`,
   `apps/api/src/common/auth/internal-key.middleware.ts`,
   `apps/api/src/common/auth/auth.extractor.ts`,
   `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`, and
   `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`.
   These are candidates for scope allocation, not a requirement to edit all of
   them. No wildcard auth rewrite, role expansion, schema or UI change is granted.
3. Allocate repair-specific test/evidence paths under
   `tests/unit/system-remediation/sr-qa-webhook-001-fix-tenant-binding/` and
   `tests/e2e/system-remediation/sr-qa-webhook-001-fix-tenant-binding/`, plus
   any explicit existing API test file needed by the chosen repair. Preserve the
   separate QA task's ownership of its current test and UAT paths.
4. Add `SR-QA-WEBHOOK-001-FIX-TENANT-BINDING` to the upstream
   `SR-QA-WEBHOOK-001` dependency/acceptance ordering, preserving existing
   dependencies and all C111–C115 gates. Record prerequisite merge ordering on
   the repair itself if shared IAM/tenant work is still pending.

## Resume and acceptance gate

Once those scope/dependency decisions are recorded, Codex resumes the existing
repair with reviewer Gemini: obtain the source reproduction, establish a full
AppModule/PostgreSQL harness with two real tenant JWTs, then implement the
smallest authorized binding repair. Verify cross-tenant GET returns 403 with no
victim key metadata; cross-tenant issue/rotate/revoke return 403 and leave key
rows unchanged; same-tenant lifecycle and SQL readback pass. Preserve existing
role and step-up/MFA requirements, with real authentication evidence rather than
guard bypasses. Successful lifecycle audit effects remain part of existing
contracts; key plaintext must not enter committed evidence.

Review/CI/merge must refer to the same repair candidate. The QA owner reruns
upstream acceptance after that merge. This helper neither proves the security
repair nor closes external C112–C115 evidence gaps. If a new cross-realm access
exception is requested, route it through the open question for product decision
instead of treating this scope request as permission.

## Helper verification and delivery

This change is planning-only; no UI, API, or schema was edited. Verification is
document/source inspection, `git diff --check`, and checking referenced product
paths. Runtime security tests belong to the authorized repair and were not run
by this helper. Task-scoped commit, pushed branch and PR are recorded through
the helper's candidate handoff. Keep parent status blocked/waiting for Claude
until the explicit resume gate above is satisfied.

PR #1810's original canonical-consistency failure identified the absent
historical HTTP evidence as a live repository-path citation. The reference above
now points to the parent machine-truth field and source commit, explicitly
recording that retrieval is required. No replacement security evidence was
created. Revalidation uses
`python3 tools/ci/git/check_canonical_consistency.py --ci --base origin/dev --head HEAD`
after committing this correction, alongside `git diff --check`.

## Reassigned delivery recovery

On 2026-09-08 Codex2 recovered the task-specific planning content from prior
candidate `26d557781e255395f32484c32166ea29a535006e` onto the assigned Codex2
branch based on `6f6f418fdd6c7fa0811765710f66a5608e0b8ad0`. This candidate
supersedes the planning delivery in PR #1810, whose diff also contained an
unrelated UV-EXEC-010 history-repair artifact. Only this helper artifact and
the open-question entry are included in the replacement delivery. The routing
and parent authorization gate above are unchanged; the current parent still
has empty write scopes and waits for Claude. The new candidate requires its
own review and CI evidence.
