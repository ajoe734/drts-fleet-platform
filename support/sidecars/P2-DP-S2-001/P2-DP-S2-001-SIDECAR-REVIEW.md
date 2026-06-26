# P2-DP-S2-001 — Sidecar Review Packet & Evidence Summary

> Support artifact only. Prepared by `Claude2` (sidecar task `P2-DP-S2-001-SIDECAR-REVIEW`,
> helper kind `review_packet`) to accelerate the assigned reviewer. This file does **not**
> mutate L1 canonical truth, contracts, runtime, registry, or governance. The parent owner
> (`Codex`) and the parent reviewer (`Codex2`) decide whether to absorb it into the mainline review.

- Parent task: **P2-DP-S2-001** — "Compliance CMP_Regulator panel scope + regulator-cases API (S2=b, no portal)"
- Parent owner / reviewer: `Codex` / `Codex2`
- Sidecar owner / reviewer: `Claude2` / `Codex`
- Packet captured: 2026-06-26 (against fetched `origin/*` at capture time)
- Parent status at capture: `review`

## 0. Snapshot anchors (machine truth at capture)

| Anchor | Value |
| --- | --- |
| Parent branch | `origin/codex/p2-dp-s2-001` |
| Parent tip | `6c8d9a178dc271f64b61aeafb7323ede09062a4a` — `P2-DP-S2-001: add regulator cases panel and API` |
| Anchor (wip) commit | `7cd64b243` — `wip(P2-DP-S2-001): anchor regulator-cases backend slice` |
| Branch base / merge-base vs dev | `ad6ec640a` (= P2-UI-CMP-001 merge commit) |
| `origin/dev` tip at capture | `557f2516e6aa98e11981ae87da41212e81dd9c16` (#969) |
| Dev advance past merge-base | 3 commits (#969 + intervening) — re-merge re-checked below |
| Diff scope | 10 files, **+1855 / −136** |

## 1. Dependency closure (both deps satisfied on `dev`)

| Dependency | Status | Evidence |
| --- | --- | --- |
| `P2-UI-CMP-001` | `done` | merged to `dev` @ `ad6ec640a` (also this branch's base) |
| `P2-DP-C1-001` | `done` | commit `17650b25e`, `push_branch=dev` |

Both dependencies are archived as `done` and reachable from `dev`, so the parent is **not**
dependency-gated. The branch is even based directly on the CMP-001 merge commit (`ad6ec640a`),
so the CMP-001 Compliance shell the new panel extends is present in the base tree.

## 2. Acceptance ↔ evidence map

Parent acceptance (single rolled-up line): *"CMP_Regulator panel shows the §2.3 elements;
regulator-cases API live; no external login realm added; controlled export + masking reused;
matches canvas; typecheck+build pass."*

| Acceptance clause | Verdict | Evidence |
| --- | --- | --- |
| **regulator-cases API live** (baseline routes) | ✅ matches brief | `platform-admin-regulator-cases.controller.ts` exposes `@Controller("platform-admin/compliance/regulator-cases")` with `GET /`, `GET /:caseId`, `GET /:caseId/exports`, `POST /:caseId/exports`, `GET /:caseId/access-logs` — exactly the brief's `GET/POST …/regulator-cases[/{caseId}][/exports|/access-logs]`. Service `platform-admin-regulator-cases.service.ts` (+442). |
| **no external login realm added** | ✅ confirmed | Controller is guarded by `@RequireRealms("platform")` and emits `realm: "platform"` — it **reuses the existing platform-admin realm**. No new `regulator` login realm / auth provider is introduced anywhere in the diff. |
| **CMP_Regulator panel shows §2.3 elements** | ✅ all 8 present | See §3 element checklist. Driven by 126 new `cmp.regulator.*` i18n keys + panel render in `sandbox-compliance-console.tsx` (+848). |
| **controlled export + masking reused** | ✅ reused | Export goes through existing controlled-export path (`POST …/exports` returns receipt; `exportReceipt`/`latestReceipt` keys), masking indicators surfaced (`legalHold*`, `masking` references in UI). No bypass of the existing controlled-export workflow observed. |
| **matches canvas** | ⚠ reviewer to confirm visually | Canvas `docs/05-ui/drts-design-canvas/compliance-screens.jsx` listed in parent artifacts; element set (selector/manifest/bundle/notification/export/hold/access-log/receipt) aligns with brief §2.3 enumeration. Pixel/structure parity is a reviewer judgement call — flagged, not asserted. |
| **typecheck + build pass** | ⓘ owner-reported, re-run advised | Owner `next` records: `pnpm --filter @drts/api typecheck`; `… @drts/api build`; `… @drts/platform-admin-web typecheck`; `… @drts/platform-admin-web build`; `pnpm exec vitest run apps/api/tests/integration/e2e-p2-sandbox-compliance-controls.test.ts`. Not independently re-executed in this sidecar (support-only). Reviewer should re-run on a clean checkout. |

## 3. §2.3 panel element checklist (all 8 covered)

| §2.3 element | Present | Key / signal |
| --- | --- | --- |
| experiment/case selector | ✅ | `cmp.regulator.caseLink`, regulator case list render |
| manifest summary | ✅ | `cmp.regulator.manifestTitle` / `manifestSubtitle` / `manifestItems` |
| bundle status | ✅ | `cmp.regulator.bundleTitle`, `bundle.bundleGenerated` / `manifestReady` / `missingManifest` |
| notification status | ✅ | `cmp.regulator.acknowledgedAt` / `deadlineAt` + bundle notification states |
| controlled export button | ✅ | `cmp.regulator.exportAction` / `exportTitle` / `exporting`; `POST …/exports` |
| legal hold / masking indicator | ✅ | `cmp.regulator.legalHoldActive` / `legalHoldClear`; `masking` references |
| access log table | ✅ | `cmp.regulator.accessLogTitle` / `accessLogActor` / `accessLogAction` / `accessLogResource` / `accessLogTime` |
| export receipt panel | ✅ | `cmp.regulator.exportReceiptSubtitle` / `latestReceiptTitle` / `latestReceiptEmpty` |

## 4. Closeout-gate & integration readiness pre-checks

| Check | Result |
| --- | --- |
| Final commit subject matches `CLOSEOUT_SUBJECT_RE` (`P2-DP-S2-001:` prefix) | ✅ `P2-DP-S2-001: add regulator cases panel and API` |
| Required commit trailers on tip | ✅ `LLM-Agent: Codex`, `Task-ID: P2-DP-S2-001`, `Reviewer: Codex2` |
| Branch pushed (non-force) | ✅ `origin/codex/p2-dp-s2-001` @ `6c8d9a178` |
| Clean re-merge into **current** `dev` tip (`557f2516e`) | ✅ `git merge-tree --write-tree origin/dev 6c8d9a178` → exit 0, **no conflict markers** (dev advanced 3 commits past base, still merges clean) |
| Shared contract `packages/contracts/src/phase2-tesla-fsd-sandbox.ts` is additive | ✅ `+133 / −0` — `git diff … -- <contract> \| grep -cE '^-[^-]'` = **0** real removals (no clobber of sibling phase-2 contract edits) |
| New test surface | ✅ `apps/api/tests/integration/e2e-p2-sandbox-compliance-controls.test.ts` (+111) asserts regulator summary/detail, legal-hold state, controlled export receipt, four-eyes self-approval rejection |

## 5. Changed-file inventory

```
 apps/api/src/modules/accident-investigation/accident-investigation.service.ts        |  13 +
 apps/api/src/modules/regulatory-reporting/platform-admin-regulator-cases.controller.ts | 147 ++
 apps/api/src/modules/regulatory-reporting/platform-admin-regulator-cases.service.ts    | 442 ++
 apps/api/src/modules/regulatory-reporting/regulatory-reporting.module.ts             |  17 ±
 apps/api/tests/integration/e2e-p2-sandbox-compliance-controls.test.ts                | 111 +
 apps/platform-admin-web/components/sandbox-compliance-console.tsx                    | 848 ±
 apps/platform-admin-web/lib/sandbox-compliance.ts                                    |  86 ±
 apps/platform-admin-web/lib/translations.ts                                          | 126 +
 packages/api-client/src/index.ts                                                     |  68 +
 packages/contracts/src/phase2-tesla-fsd-sandbox.ts                                   | 133 +
```

All paths are owned by the parent slice (regulatory-reporting module, platform-admin-web
Compliance console, shared contracts/api-client). No fragile-surface (`.orchestrator/**`,
`.github/**`, `docs/ops/**`) edits in the deliverable.

## 6. Reviewer handoff notes (for parent reviewer `Codex2`)

The sidecar's static evidence supports an **approve** trajectory, but these belong to the
reviewer's executable pass and are intentionally **not** asserted here:

1. **Re-run the owner-reported gates on a clean checkout** — api + platform-admin-web
   typecheck/build, and the new vitest integration file. Static read cannot confirm green.
2. **Canvas parity** — eyeball `CMP_Regulator` panel render vs
   `docs/05-ui/drts-design-canvas/compliance-screens.jsx` for the §2.3 layout (selector →
   manifest → bundle → notification → export → hold/masking → access-log → receipt).
3. **Controlled-export / masking reuse depth** — confirm the new `POST …/exports` path routes
   through the *existing* controlled-export approval + masking pipeline (the four-eyes
   self-approval rejection is covered by the new test) rather than a parallel implementation.
4. **Merge candidate** is the pushed tip `6c8d9a178` (subject + trailers pass, merges clean
   into current `dev`). Integration is at `branch_pushed`; no PR/merge evidence on `dev` yet.

No blocker found by the sidecar static pass. This packet is advisory; absorb at owner discretion.
