# WF-FIN-GOV-DECISION — Parent task closeout

Status: closed (owner closeout)
Task: `WF-FIN-GOV-DECISION`
Phase: Phase 1 v3
Owner: `Claude`
Reviewer: `Copilot`
Date: 2026-05-19

## Decision recap

User approved Q3 = **Option B** on 2026-05-19. Authoritative record lives in
`docs/00-context/phase1-v3-resolution-20260519.md` §Q3; the open-question doc
`docs/00-context/phase1-v3-conflicts-and-open-questions-20260519.md` §2 (Question 3)
and §7 mark this question closed for revision (see the §7 row labelled
`WF-FIN-001 / WF-FIN-GOV-001` → `resolved in §2 above`).

Approved outcome:

```text
WF-FIN-001      Baseline Billing / Invoice / Report Export      (unchanged, PASS (static evidence))
WF-FIN-GOV-001  Governance-aware Billing / Reporting / Settlement (new enrichment row)
```

`WF-FIN-GOV-001` depends on:

- `WF-TGV-001` (Tenant Governance — supplies cost-center / quota / approval semantics)
- `WF-FIN-001` (Baseline Finance — supplies invoice / report / settlement carrier)

Rename (Option A) and pure-alias variants were rejected: renaming would break
existing release-gate semantics for `WF-FIN-001`, and the v3 governance scope
(cost center, approval rules, quota, partner-program, platform earnings) is
substantive net-new content that belongs in a separate row.

## Surface impact summary

| Surface                                                                         | Required change                                | Status                                                                  |
| ------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------- |
| `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`                  | add `WF-FIN-GOV-001` matrix row (no rename of `WF-FIN-001`) | LANDED via `WF-FIN-GOV-001-MATRIX` closeout `24c24a7` on `origin/codex2/wf-fin-gov-001-matrix` |
| `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md`                | net-new governance-aware UAT artifact          | LANDED via `FIN-GOV-UAT-001` closeout `67df6f2` on `origin/codex2/fin-gov-uat-001` |
| `tests/e2e/E2E-010-governance-aware-billing-reporting.sh`                       | net-new E2E shell + indexes/docs sync          | IN PROGRESS under `WF-FIN-GOV-001-E2E` (owner Codex2)                   |
| `docs/00-context/phase1-v3-resolution-20260519.md`                              | record canonical decision (Q3=B)               | LANDED in PR #165 (`2103814`)                                           |
| `docs/00-context/phase1-v3-conflicts-and-open-questions-20260519.md` §2/§7      | mark Question 3 closed                         | Resolved (§7 row reads `resolved in §2 above`)                          |

`WF-FIN-001`'s existing `PASS (static evidence)` gate read is preserved exactly
— this closeout does not rewrite or downgrade baseline-finance evidence.

## What this closeout confirms

- The canonical product-truth decision exists and is final: keep
  `WF-FIN-001` as the baseline finance workflow and add `WF-FIN-GOV-001`
  as a separate governance-aware enrichment row, with the dependency edge
  `WF-FIN-GOV-001 → {WF-TGV-001, WF-FIN-001}`.
- The downstream task chain is already shaped from Q3 and is in flight:
  `WF-FIN-GOV-001-MATRIX` `done` → `FIN-GOV-UAT-001` `done` →
  `WF-FIN-GOV-001-E2E` `in_progress` (Codex2).
- The unblock helper
  `WF-FIN-GOV-DECISION-UNBLOCK-PLANNING-DECISION` is `done`
  (commit `ed5b1a6` on
  `origin/codex2/wf-fin-gov-decision-unblock-planning-decision`).
- No new product-semantic content is added by this closeout; it is an
  owner-closeout sidecar that points reviewers at the existing
  authoritative artifacts.

## Prohibitions inherited from the resolution doc

- Do not rename `WF-FIN-001` to `WF-FIN-GOV-001` (Option A was rejected).
- Do not collapse `WF-FIN-GOV-001` into `WF-FIN-001` as an alias-only
  governance dimension under the existing row (the "alias variant" of
  Option B was rejected in favor of a separate row).
- Do not retroactively rewrite `WF-FIN-001`'s gate read, evidence references,
  or historical closeouts. Baseline finance evidence stays as `PASS (static
  evidence)` until a higher-fidelity gate uplift is recorded against
  `WF-FIN-001` specifically.
- Do not state `WF-FIN-GOV-001` as gate-closed until `WF-FIN-GOV-001-E2E`
  lands its closeout with the required E2E shell + matrix linkage.
- Historical evidence sidecars and dashboards that already cite `WF-FIN-001`
  by name are immutable history; do not rewrite them. New governance-aware
  artifacts MUST use `WF-FIN-GOV-001` and link back to the resolution doc.

## Evidence pointers

- Authoritative decision: `docs/00-context/phase1-v3-resolution-20260519.md` §Q3
- Closed open-question record:
  `docs/00-context/phase1-v3-conflicts-and-open-questions-20260519.md` §2 (Question 3) and §7
- Resolution + 15-follow-on registration: PR #165 (commit `2103814`)
- Downstream matrix:
  - `WF-FIN-GOV-001-MATRIX` (status `done`, owner `Codex2`, reviewer `Codex`)
  - Closeout commit `24c24a7` on `origin/codex2/wf-fin-gov-001-matrix`
- Downstream UAT:
  - `FIN-GOV-UAT-001` (status `done`, owner `Codex2`, reviewer `Codex`)
  - Closeout commit `67df6f2` on `origin/codex2/fin-gov-uat-001`
- Downstream E2E (still active):
  - `WF-FIN-GOV-001-E2E` (status `in_progress`, owner `Codex2`, reviewer `Codex`)
- Unblock helper closeout (planning-decision routing):
  - `WF-FIN-GOV-DECISION-UNBLOCK-PLANNING-DECISION` (status `done`, owner `Codex2`, reviewer `Claude2`)
  - Commit `ed5b1a6` on `origin/codex2/wf-fin-gov-decision-unblock-planning-decision`
  - Artifact:
    `support/unblock/WF-FIN-GOV-DECISION/WF-FIN-GOV-DECISION-UNBLOCK-PLANNING-DECISION.md`
    (lives on the helper branch; pending the next wave merge into `dev`)

## Reviewer checklist (Copilot)

- [ ] `docs/00-context/phase1-v3-resolution-20260519.md` §Q3 still reads
      "Decision: Keep BOTH rows" with `WF-FIN-001` baseline +
      `WF-FIN-GOV-001` governance enrichment, dependency
      `WF-FIN-GOV-001 → {WF-TGV-001, WF-FIN-001}`.
- [ ] `docs/00-context/phase1-v3-conflicts-and-open-questions-20260519.md`
      §7 row for `WF-FIN-001 / WF-FIN-GOV-001` still reads
      `resolved in §2 above`.
- [ ] `ai-status.json` still shows `WF-FIN-GOV-001-MATRIX` and
      `FIN-GOV-UAT-001` as `done` with the commit/push pairs cited above,
      and `WF-FIN-GOV-001-E2E` as `in_progress` under Codex2.
- [ ] `WF-FIN-GOV-DECISION-UNBLOCK-PLANNING-DECISION` is still `done` with
      commit `ed5b1a6` on
      `origin/codex2/wf-fin-gov-decision-unblock-planning-decision`.
- [ ] This closeout sidecar does not rewrite product semantics; it only
      records the parent-task closeout and points at authoritative
      artifacts.
