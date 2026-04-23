# System Design Input Requests

Date: `2026-04-22`
Status: answered on `2026-04-22`; preserved as the original intake log

Accepted decision records:

- `SD-001` + `SD-002` -> `docs/01-decisions/SD-DP-20260422-001-phase1-entry-and-receipt-topology.md`
- `SD-003` -> `docs/01-decisions/SD-DP-20260422-002-identity-cutover-topology.md`
- `SD-004` -> `docs/01-decisions/SD-DP-20260422-003-design-truth-supersession-rule.md`

## Purpose

This file preserves the original set of system-design questions that needed an
answer before the repo could claim complete narrative alignment.

It intentionally excludes:

- repo-local implementation hardening already materialized into execution mode
- external partner enablement that needs credentials or sandbox access
- control-plane wording drift that can be fixed without changing product truth

## Original Questions For System Design

### SD-001 Passenger Entry Topology

Question:

Should Phase 1 canonical product truth formally remove first-party
`Passenger App / Web` from the in-scope entry surfaces and replace it with
third-party ride-hailing app / partner-channel demand entry?

Why this needs a design answer:

- current execution strategy is now "do not build a first-party passenger app"
- the canonical PRD still lists `Passenger App / Web` as in scope
- the system analysis still includes passenger entry inside Phase 1 scope

Current conflicting anchors:

- `phase1_prd_detailed_v1.md:114-123`
- `phase1_system_analysis_v1.md:86-99`
- `docs/03-runbooks/execution-mode-candidate-backlog.md`

Needed answer format:

- `A` Keep first-party passenger surface in Phase 1 scope
- `B` Remove it from Phase 1 scope and declare third-party entry as the
  intended topology
- `C` Keep it as a future option but explicitly out of the current completion
  bar

Historical default before answer:

- follow the latest human instruction in execution
- do not rewrite L1 canonical design files yet

### SD-002 Receipt Delivery Without First-Party Passenger UI

Question:

If Phase 1 does not ship a first-party passenger surface, what is the intended
receipt delivery channel?

Options that need explicit confirmation:

- receipt delivered by the third-party ride-hailing platform
- receipt delivered by a partner / tenant channel
- receipt delivered by DRTS through email / SMS / download link
- receipt is backoffice-only in Phase 1
- receipt is explicitly out of scope for Phase 1

Why this needs a design answer:

- finance / reporting closeout confirmed backoffice/operator flows
- passenger receipt UI was intentionally not materialized
- implementation should not invent a new customer-delivery channel

Current anchors:

- `support/sidecars/MSC-F1-001/MSC-F1-001-FINANCE-REPORTING-AUDIT.md`
- `support/sidecars/MSC-P1-001/MSC-P1-001-SURFACE-DECISION-PACKET.md`

Historical default before answer:

- keep passenger receipt UI deferred
- do not create a replacement channel in execution without design approval

### SD-003 Cloud IAP / OIDC Cutover Topology

Question:

For `GAP-P2S3-001`, should the production identity boundary move:

- `A` `drts-api` first only
- `B` `drts-api` plus web surfaces in the same wave
- `C` another staged topology defined by system design

Why this needs a design answer:

- the repo is implementing Bearer/OIDC verification already
- the remaining blocker is not only code, but also rollout topology
- smoke / deploy / caller assumptions depend on the chosen cutover shape

Current anchors:

- `docs/03-runbooks/gap-p2s3-001-cloud-iap-checklist.md`
- `docs/03-runbooks/master-system-closeout-checklist.md`

Historical default before answer:

- keep repo implementation API-first capable
- do not assume web surfaces move in the same wave

### SD-004 Design-Truth Supersession Rule During Execution

Question:

When a new product decision conflicts with existing PRD / SA wording while
execution is already underway, what is the approved superseding record?

Options that need explicit confirmation:

- direct edit to the canonical L1 design files
- accepted decision packet that temporarily supersedes the old wording
- a new dedicated system-design spec added to the canonical layer

Why this needs a design answer:

- execution should not rewrite product truth ad hoc
- current passenger-surface strategy already differs from old L1 wording
- the team needs a stable rule for future design changes without letting
  implementation retroactively redefine scope

Current anchors:

- `CANONICAL_DOCUMENT_MAP.md`
- `AI_COLLABORATION_GUIDE.md`
- `PHASE1_OPEN_QUESTIONS.md`

Historical default before answer:

- implementation may change code and execution docs
- L1 canonical design files should remain unchanged unless the human or
  system-design function explicitly approves the superseding artifact

## Items That Do Not Need System Design

These are real remaining gaps, but they should not be sent to the system-design
department because they need execution inputs rather than design semantics.

### EX-001 Grab Taiwan real adapter integration

- Needs partner API contract, credentials, sandbox, and evidence
- Anchor: `apps/api/src/modules/forwarder/grab-taiwan.adapter.ts`

### EX-002 tenant-commute-hub authority annex audit

- Local code access is now confirmed and the annex audit has been completed in
  this workspace
- Anchors:
  - `docs/02-architecture/tenant-commute-hub-boundary.md`
  - `docs/02-architecture/authority/rgx-010-tenant-commute-hub-authority-annex-audit-20260422.md`
- Outcome:
  - this is now clearly an execution / merge / rollout gap, not a system-design
    ambiguity
  - local workspace cutover evidence existed first, and the gap then advanced
    through PRs to merged remote `main` in both repos
  - targeted local live smoke now passes through the tenant landing branch plus
    local `drts-api`
  - the former backend PR mergeability blocker was resolved by explicit owner
    risk acceptance despite unrelated clean-branch CI debt
  - the remaining work is residual identity-hardening, not system-design
    clarification

### EX-003 current-work / sprint wording drift

- Needs execution/control-plane doc sync only
- Does not need product-semantic redesign

## Execution Boundary Rule

Until the questions above are answered:

- implementation may continue on repo-local hardening tasks already in
  `ai-status.json`
- execution docs may be updated to reflect runtime truth
- canonical L1 product-truth files should not be rewritten to match code
  mid-execution
