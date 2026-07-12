# P2-UI-CMP-001 Unblock Planning Decision

## Scope

- Task: `P2-UI-CMP-001-UNBLOCK-PLANNING-DECISION`
- Parent: `P2-UI-CMP-001`
- Owner: `Codex2`
- Reviewer: `Codex`
- Decision date: `2026-06-26`

## Diagnosis

`P2-UI-CMP-001` was blocked under a broad "missing product/contract decision"
label while building the Platform Admin sandbox compliance / investigation
surface.

The repo state shows two different realities:

1. The **visual** source of truth is still missing. The canonical Platform
   Admin canvas does not yet include `/platform-admin/compliance`,
   `/platform-admin/investigations`, `/platform-admin/evidence/*`, or
   `/platform-admin/regulatory-reports`, and engineering is explicitly barred
   from inventing that UI.
2. The **behavior and contract** surface is mostly already decided. The screen
   requirements note, backend controllers, and phase2 contracts already define
   the route set, evidence/investigation/legal-hold/export semantics, and
   cross-app link authority.

The one real contract ambiguity inside the screen-requirements note was the
regulatory-report scope naming, where the note still said "backend contract
authority" instead of the accepted scope labels.

## Canonical Sources Consulted

Higher-precedence first per `AI_COLLABORATION_GUIDE.md` §2:

1. `docs/05-ui/platform-admin-sandbox-compliance-screen-requirements-20260626.md`
2. `apps/api/src/modules/platform-admin/platform-admin-compliance.controller.ts`
3. `apps/api/src/modules/regulatory-reporting/platform-admin-regulatory-reporting.controller.ts`
4. `packages/contracts/src/phase2-tesla-fsd-sandbox.ts`
5. `docs/02-architecture/cross-app-navigation-and-shell-topology-20260524.md`
6. `docs/05-ui/system-design-answers-all-apps-20260524.md`
7. `docs/05-ui/drts-design-canvas/Platform Admin.html`
8. `docs/05-ui/drts-design-canvas/platform-screens-3.jsx`

## Decision

`P2-UI-CMP-001` is unblocked on the **product/contract interpretation**. The
remaining block is visual-publication work, not an unresolved business or API
decision.

Concretely:

1. The parent must treat
   `docs/05-ui/platform-admin-sandbox-compliance-screen-requirements-20260626.md`
   as the binding non-visual planning packet until canonical canvas screens are
   published.
2. The sandbox compliance route family is already product-shaped and contract-
   backed across existing sources:
   - investigation list/detail/timeline
   - compliance takeover/discrepancy triage
   - evidence manifest / controlled export / legal hold governance
   - regulatory-report review and submit flow
3. Cross-app entry authority is already decided: ROC and other external
   surfaces must enter via backend-provided `CrossAppResourceLink`, not
   client-composed deep-link rules.
4. The regulatory-report scope naming is now resolved by accepted backend
   controller authority:
   - review/list: `sandbox.regulatory_report.review`
   - submit: `sandbox.regulatory_report.submit`
5. The parent must not reopen scope naming, action-separation, or cross-app
   authority as a blocker. Those are already decided.
6. The remaining blocker is canonical visual design publication into
   `docs/05-ui/drts-design-canvas/Platform Admin.html` and the corresponding
   `platform-screens-*.jsx` sources.

## Scope Cut And Routing

This unblock does **not** claim that the parent can immediately implement the
UI today. It routes the unresolved remainder to the correct lane.

Out of scope for `P2-UI-CMP-001` unless separately assigned:

1. Inventing Platform Admin compliance/investigation visuals before the canvas
   exists.
2. Reinterpreting existing backend scopes or collapsing review/submit,
   request/approve, or release-request/release-approve separations.
3. Expanding this task into new backend or contracts work for evidence
   governance, accident investigation, or regulatory reporting.

Required follow-up outside this unblock packet:

1. Visual design must publish the missing sandbox compliance / investigation /
   evidence / regulatory-report screens into the canonical Platform Admin
   canvas.
2. After publication, the parent branch can resume implementation strictly
   against that canvas plus the already accepted contracts.

## Parent Unblocked Next Step

The parent should change from a vague "missing product/contract decision"
blocker to this concrete next-step statement:

1. Product/contract authority is sufficient; do not wait for further scope or
   API naming decisions.
2. Wait specifically for canonical Platform Admin canvas publication covering
   the nine sandbox compliance screens listed in the screen-requirements note.
3. Once those screens land on `dev`, resume `P2-UI-CMP-001` and implement the
   route group to match canvas, using existing backend action/scope authority:
   - investigations: `sandbox.investigation.read`
   - compliance triage: `sandbox.compliance.read`
   - evidence preview: `sandbox.evidence.preview`
   - export request/approve:
     `sandbox.evidence.export.request` / `sandbox.evidence.export.approve`
   - legal-hold place/release request/release approve:
     `sandbox.legal_hold.place` /
     `sandbox.legal_hold.release.request` /
     `sandbox.legal_hold.release.approve`
   - regulatory-report review/submit:
     `sandbox.regulatory_report.review` /
     `sandbox.regulatory_report.submit`
4. If design publication does not happen in the same wave, keep the parent
   blocked on missing canvas only; do not describe it as a product/contract
   blocker anymore.

## Verification Basis

- `docs/05-ui/platform-admin-sandbox-compliance-screen-requirements-20260626.md`
- `apps/api/src/modules/platform-admin/platform-admin-compliance.controller.ts`
- `apps/api/src/modules/regulatory-reporting/platform-admin-regulatory-reporting.controller.ts`
- `packages/contracts/src/phase2-tesla-fsd-sandbox.ts`
- `docs/02-architecture/cross-app-navigation-and-shell-topology-20260524.md`
- `docs/05-ui/system-design-answers-all-apps-20260524.md`
- `docs/05-ui/drts-design-canvas/Platform Admin.html`
- `docs/05-ui/drts-design-canvas/platform-screens-3.jsx`
