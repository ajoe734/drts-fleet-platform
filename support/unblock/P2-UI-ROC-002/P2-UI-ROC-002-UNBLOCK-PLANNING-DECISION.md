# P2-UI-ROC-002 Unblock Planning Decision

## Scope

- Task: `P2-UI-ROC-002-UNBLOCK-PLANNING-DECISION`
- Parent: `P2-UI-ROC-002`
- Owner: `Codex2`
- Reviewer: `Codex`
- Decision date: `2026-06-26`
- Decision type: routing clarification plus scope-cut confirmation

## Diagnosis

`P2-UI-ROC-002` was labeled as blocked on a missing product/contract decision
for ROC Console takeover, alerts, incidents, evidence, and reports.

The canonical repo state shows the blocker was narrower than that label:

1. The route family behavior and contract semantics were already defined.
2. The referenced ROC visual canvas source (`docs/05-ui/drts-design-canvas/roc-screens-2.jsx`)
   did not exist, so engineering could not invent full screens.
3. The correct unblock was therefore to confirm the existing non-visual
   contract rules, cut scope to the allowed hold-state implementation, and
   route missing visual publication to design instead of reopening API or
   product semantics.

## Canonical Sources Consulted

Higher-precedence first per `AI_COLLABORATION_GUIDE.md` §2:

1. `docs/05-ui/roc-console-takeover-alerts-incidents-evidence-reports-screen-requirements-20260626.md`
2. `apps/roc-console-web/README.md`
3. `docs/02-architecture/cross-app-navigation-and-shell-topology-20260524.md`
4. `docs/02-architecture/ui-authority-actions-contract-20260524.md`
5. `docs/05-ui/drts-design-canvas/`
6. task machine truth for `P2-UI-ROC-002`

## Decision

`P2-UI-ROC-002` was unblocked on product/contract interpretation without any
new API or business-semantic decision.

The accepted planning decision is:

1. ROC response surfaces may ship only the shared ROC shell, route hold
   states, backend-authoritative action plumbing, and a design hand-off while
   the canonical ROC canvas is absent.
2. Engineering must not invent bespoke takeover/alerts/incidents/evidence/
   reports layouts when `roc-screens-2.jsx` is missing.
3. Existing behavioral and contract constraints are already binding:
   - takeover queue stays three-column and must not merge Tesla event,
     safety-operator report, and ROC disposition into one truth source
   - evidence shows summary plus freeze posture only
   - deep links to investigation / platform-admin resources come from backend
     `CrossAppResourceLink`, not client-composed URLs
   - write CTAs come only from `availableActions`
   - successful writes surface backend `ActionReceipt`
4. Missing work belonged to canonical visual publication, not to product
   semantics, contract naming, or frontend URL authority.

## Scope Cut And Routing

This unblock confirms a scope cut that the parent could safely implement:

1. In scope:
   - ROC shell scaffolding
   - response route hold states
   - action-rail plumbing for backend `availableActions` -> `ActionReceipt`
   - design hand-off packet defining required screens and behavior
2. Out of scope until canonical canvas publication:
   - invented final UI for `/takeover`, `/alerts`, `/incidents`, `/evidence`,
     or `/reports`
   - bespoke evidence drilldown inside ROC
   - client-authored platform-admin deep-link composition

The unresolved follow-up was design publication of ROC source screens into the
canonical design-canvas path named by the task brief.

## Parent Unblocked Next Step

At the time of unblock, the concrete next step for `P2-UI-ROC-002` was:

1. Implement only the allowed shell + hold-state scope.
2. Point the response routes at the canonical screen-requirements hand-off.
3. Preserve the accepted contract guardrails for three-column takeover truth,
   backend deep links, `availableActions`, and `ActionReceipt`.
4. Leave missing final visuals to the ROC canvas publication lane.

That next step has already been executed: machine truth records
`P2-UI-ROC-002` as `done`, reconciled from `origin/dev` at commit
`89adef4e416750bb1f26b71fbb601321b0b49977`
(`P2-UI-ROC-002: integrate ROC hold routes to dev (#973)`).

## Acceptance Mapping

| Acceptance item | Result |
| --- | --- |
| Resolve or route the missing product/contract decision through canonical planning artifacts | Resolved as a routing clarification: existing artifacts already defined contract semantics, while the missing ROC canvas forced a hold-state-only scope cut. |
| Record the decision | Recorded here: do not invent ROC response-screen visuals; use shell + hold-state + hand-off packet until canonical ROC canvas exists. |
| scope cut | Recorded in `Scope Cut And Routing`: only shell, hold states, action plumbing, and hand-off were in scope. |
| or explicit follow-up needed by the parent task | Recorded in `Parent Unblocked Next Step`: implement the hold-state scope and route visual completion to canonical canvas publication. |
| Produce task-scoped commit/push/PR evidence for any canonical change | This unblock packet is the canonical change; task-scoped git evidence is added in `Review And Verification Evidence`. |
| Update the parent task with the concrete unblocked next step | Recorded above, and already realized by merged parent commit `89adef4e416750bb1f26b71fbb601321b0b49977`. |

## Review And Verification Evidence

- Canonical artifact reviewed:
  - `docs/05-ui/roc-console-takeover-alerts-incidents-evidence-reports-screen-requirements-20260626.md`
- Parent-task implementation evidence reviewed:
  - `apps/roc-console-web/README.md`
  - task machine truth for `P2-UI-ROC-002`
- Git evidence reviewed:
  - `git log --oneline --decorate -n 8 -- apps/roc-console-web docs/05-ui/roc-console-takeover-alerts-incidents-evidence-reports-screen-requirements-20260626.md`
- Task-scoped branch / commit / PR evidence for this unblock packet:
  - owner branch: `codex2/p2-ui-roc-002-unblock-planning-decision`
  - decision commit: `e1e74a6b82643a4b9b43f356fee54d2f1a858a3f`
    (`docs(P2-UI-ROC-002-UNBLOCK-PLANNING-DECISION): record unblock routing decision`)
  - review-found stale tip in prior packet revision:
    `9c56f6641cc69dd46a8edfacf868b72f02922fef`
    (`docs(P2-UI-ROC-002-UNBLOCK-PLANNING-DECISION): add push and PR evidence`)
  - packet-alignment commit before this refresh:
    `cb1d4d6b69281ef323f404909b80e9b6b0cfb6fd`
    (`docs(P2-UI-ROC-002-UNBLOCK-PLANNING-DECISION): align packet with branch tip evidence`)
  - pushed ref: `origin/codex2/p2-ui-roc-002-unblock-planning-decision`
  - latest pushed head must be verified from git/PR evidence at handoff time,
    because packet refresh commits advance the branch tip
  - owner PR against `dev`: [#974](https://github.com/ajoe734/drts-fleet-platform/pull/974)
