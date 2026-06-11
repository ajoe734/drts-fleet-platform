# BANK-UI-HOME-20260610 Sidecar Acceptance Packet

This document is the support-only acceptance packet for
`BANK-UI-HOME-20260610-SIDECAR-ACCEPTANCE`. It does not change canonical
truth, runtime behavior, or the parent task row. It consolidates the
reviewer-facing checklist, dependency map, and known machine-truth gaps for
the bank-console home screen task `BANK-UI-HOME-20260610`.

Anchors used here come from:

- `scripts/ai-status.sh show BANK-UI-HOME-20260610-SIDECAR-ACCEPTANCE`
- `scripts/ai-status.sh show BANK-UI-HOME-20260610`
- `docs/02-architecture/credit-card-airport-transfer-change-manifest-20260610.md`
- `scripts/dispatch-bank-console-screens-20260610.sh`
- `docs/05-ui/drts-design-canvas/Bank Console.html`
- `docs/05-ui/drts-design-canvas/bank-screens-1.jsx`
- `docs/05-ui/drts-design-canvas/bank-screens-2.jsx`
- `docs/05-ui/drts-design-canvas/bank-screens-3.jsx`
- `packages/ui-tokens/src/brands.ts`
- `packages/ui-tokens/src/realms.ts`
- `apps/bank-console-web/app/page.tsx`
- `apps/bank-console-web/app/layout.tsx`
- `apps/bank-console-web/components/bank-shell.tsx`
- `apps/bank-console-web/lib/navigation.ts`
- `apps/bank-console-web/lib/translations.ts`

## 1. Scope Boundary

- **Task ID:** `BANK-UI-HOME-20260610-SIDECAR-ACCEPTANCE`
- **Parent Task:** `BANK-UI-HOME-20260610`
- **Helper Kind:** `acceptance_packet`
- **Sidecar Owner:** `Codex`
- **Sidecar Reviewer:** `Claude2`
- **Parent Owner:** `Claude`
- **Parent Reviewer:** `Codex`
- **Mutates Canonical:** `false`

This packet may only:

- summarize machine-truth state already recorded for the parent task
- map the parent task's declared dependencies to concrete repo anchors
- define reviewer checkpoints for `BK_Home`
- record risks or gaps without editing parent code or canonical docs

This packet may not:

- edit `ai-status.json` directly
- change parent scope or acceptance beyond existing task/dispatch/canvas truth
- invent new visuals beyond the bank canvas
- pre-approve any runtime implementation

## 2. Machine-Truth Anchors

### 2.1 Sidecar row

At packet refresh time, `scripts/ai-status.sh show BANK-UI-HOME-20260610-SIDECAR-ACCEPTANCE`
reports:

- owner=`Codex`
- reviewer=`Claude2`
- status=`review_approved`
- task_class=`sidecar`
- helper_parent=`BANK-UI-HOME-20260610`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- depends_on=
  `CCAT-APP-SCAFFOLD-20260610`,
  `CCAT-API-USAGE-20260610`,
  `CCAT-API-CONTRACTS-20260610`,
  `CCAT-API-STATEMENTS-20260610`
- artifact=
  `support/sidecars/BANK-UI-HOME-20260610/BANK-UI-HOME-20260610-SIDECAR-ACCEPTANCE.md`

### 2.2 Parent row

At packet refresh time, `scripts/ai-status.sh show BANK-UI-HOME-20260610`
reports:

- title=`Re-build bank-console home (BK_Home) — canvas now on dev`
- owner=`Claude`
- reviewer=`Codex`
- status=`in_progress`
- phase=`bank-console-screens-202606`
- depends_on=
  `CCAT-APP-SCAFFOLD-20260610`,
  `CCAT-API-USAGE-20260610`,
  `CCAT-API-CONTRACTS-20260610`,
  `CCAT-API-STATEMENTS-20260610`
- artifacts=
  `apps/bank-console-web/app/page.tsx`,
  `apps/bank-console-web/app/layout.tsx`,
  `docs/05-ui/drts-design-canvas/bank-screens-{1,2,3}.jsx`,
  `docs/05-ui/credit-card-airport-transfer-screen-requirements-20260610.md`

Parent acceptance already recorded in machine truth:

- home shows quota + SLA + settlement posture cards gated by role
- figures reconcile with the detail pages
- screen matches its `BK_*` function in the bank canvas
- all cardholder and card references remain masked
- zh-TW stays primary via central `t()`
- issuer brand is sourced from `@drts/ui-tokens`, not raw hex
- `pnpm --filter @drts/bank-console-web typecheck` and `build` pass

## 3. Dependency Map

### 3.1 Dependency set as declared by dispatch

The parent task and this sidecar both declare the same hard dependency set:

- `CCAT-APP-SCAFFOLD-20260610`
- `CCAT-API-USAGE-20260610`
- `CCAT-API-CONTRACTS-20260610`
- `CCAT-API-STATEMENTS-20260610`

These same IDs are also baked into
`scripts/dispatch-bank-console-screens-20260610.sh`, where
`BANK-UI-HOME-20260610` is assigned with the identical dependency chain.

### 3.2 Repo-level meaning of each dependency

`docs/02-architecture/credit-card-airport-transfer-change-manifest-20260610.md`
defines the dependency semantics:

- `CCAT-APP-SCAFFOLD-20260610`
  - app shell for `apps/bank-console-web`
  - Next App Router scaffold
  - `@drts/ui-web` + `@drts/ui-tokens` tenant-realm chrome
  - nav skeleton and placeholder pages
  - Dockerfile and deploy rail
- `CCAT-API-CONTRACTS-20260610`
  - `GET /api/tenant/contracts`
  - `GET /api/tenant/contracts/:contractId`
- `CCAT-API-STATEMENTS-20260610`
  - `GET /api/tenant/settlement-statements`
  - `GET /api/tenant/settlement-statements/:period`
- `CCAT-API-USAGE-20260610`
  - `GET /api/tenant/program-usage`

Reviewer implication:

- `BK_Home` is not a standalone visual task
- its KPI cards are only reviewable as complete if they align with the detail
  surfaces and API shapes that those dependencies imply

### 3.3 Current repo baseline

Current repo state shows the scaffold layer exists, while the home route itself
is still placeholder-oriented:

- `apps/bank-console-web/app/page.tsx` still renders a pending-design overview,
  not the final `BK_Home` composition
- `apps/bank-console-web/app/layout.tsx` already wraps the route in `BankShell`
- `apps/bank-console-web/components/bank-shell.tsx` explicitly keeps chrome on
  the `tenant` realm via `buildCanvasTheme({ surface: "tenant", ... })`
- `apps/bank-console-web/lib/navigation.ts` identifies the issuer in data labels
  (`中信銀行 · CTBC ISSUER`) while keeping the top-level chrome brand as `DRTS`
- `apps/bank-console-web/lib/translations.ts` already provides central `t()`
  strings for the bank console
- sibling routes already exist at:
  - `app/bookings/page.tsx`
  - `app/contracts/page.tsx`
  - `app/statements/page.tsx`
  - `app/programs/page.tsx`
  - `app/users/page.tsx`
  - `app/audit/page.tsx`

Reviewer implication:

- the parent task should replace only the home surface, not re-architect shell,
  nav, or locale plumbing
- "figures reconcile with detail pages" is a real cross-route contract because
  the detail routes already exist in the app tree

### 3.4 Machine-truth visibility gap

At packet refresh time,
`scripts/ai-status.sh show CCAT-APP-SCAFFOLD-20260610` and the three
`CCAT-API-*` IDs do not resolve as task rows from this worker context, even
though they are referenced by both the parent task and the dispatch/manifest
docs.

This packet treats that as a reviewer-visible risk, not as permission to infer
completion:

- the dependency IDs are authoritative as declared prerequisites
- their actual lifecycle status was not recoverable through `show <task-id>`
  during this refresh
- reviewer should re-check whether those rows were renamed, completed under
  another ID, or not yet materialized in machine truth

## 4. Design and Token Contract

### 4.1 Visual authority

`Bank Console.html` and `bank-screens-1.jsx` define the home authority:

- `BK_Home`
- three role cuts:
  - `admin`
  - `ops`
  - `finance`
- home KPI strip
- upcoming airport-transfer table
- recent exceptions
- quota cards
- SLA card
- settlement posture card

The canvas also defines the required semantics:

- read-only issuer surface
- masked references
- quota as a first-class bank metric
- finance card visibility only for finance-capable roles
- DRTS remains authority for operations/contract truth

### 4.2 Token boundary

The bank design contract has two simultaneous rules that review must hold
together:

- shared chrome stays on tenant-realm tokens
  - `packages/ui-tokens/src/realms.ts` defines tenant realm teal
  - `apps/bank-console-web/components/bank-shell.tsx` already uses that realm
- issuer-specific visual accents inside the working surface must come from
  `@drts/ui-tokens`
  - `packages/ui-tokens/src/brands.ts` provides `CTBC` navy/gold brand tokens

Reviewer should reject either failure mode:

- replacing shell chrome with an invented issuer palette
- hardcoding issuer navy/gold outside token-derived values

The intended composition is already visible in the current app:

- shell = tenant realm
- in-surface issuer accents = token-derived CSS variables / component styling

## 5. Parent Acceptance Checklist (`BANK-UI-HOME-20260610`)

### 5.1 Scope gates

- [ ] `apps/bank-console-web/app/page.tsx` renders the canvas-defined `BK_Home`
      experience, not the current placeholder card grid
- [ ] the screen matches `docs/05-ui/drts-design-canvas/bank-screens-1.jsx`
      `BK_Home` rather than an invented adaptation
- [ ] the page remains read-only and does not introduce dispatch, contract, or
      settlement mutation controls
- [ ] role-cut behavior exists for `admin`, `ops`, and `finance`

### 5.2 Data and reconciliation gates

- [ ] KPI/home figures reconcile with sibling detail pages and their domains:
      bookings, contracts/SLA, statements, and programs/quota
- [ ] quota posture aligns with the programs/quota domain
- [ ] SLA posture aligns with contracts/SLA domain
- [ ] settlement posture aligns with statements domain
- [ ] upcoming trips and exception summaries stay in the issuer-airport-transfer
      dimension, not corporate tenant-console cost-centre semantics

### 5.3 Privacy and locale gates

- [ ] all cardholder, benefit, and card references remain masked
- [ ] zh-TW remains primary via central `t()` plumbing
- [ ] no inline locale ternaries or app-local translation fork appears in the
      home implementation

### 5.4 Visual/token gates

- [ ] shared shell chrome still uses tenant realm tokens
- [ ] issuer navy/gold accents come from `@drts/ui-tokens` CTBC token sources
- [ ] no raw hex issuer palette is introduced into page/component code for the
      home task
- [ ] the home surface preserves the canvas hierarchy:
      KPI strip, upcoming bookings, exceptions, quota, SLA, settlement posture

### 5.5 Verification gates

- [ ] `pnpm --filter @drts/bank-console-web typecheck`
- [ ] `pnpm --filter @drts/bank-console-web build`
- [ ] visual/manual comparison against `BK_Home` in the bank canvas
- [ ] reviewer cross-checks that any data constants or mock data used on the
      home page remain consistent with the sibling detail surfaces

## 6. Reviewer Handoff Notes (`Claude2`)

1. Reconfirm the sidecar file is still the only support artifact changed for
   this task.
2. Reconfirm `BANK-UI-HOME-20260610` is still owned by `Claude` and reviewed by
   `Codex`; this packet does not transfer parent ownership.
3. Treat the unresolved `CCAT-*` `show` failures as a machine-truth audit item.
   Approval of this packet means the gap is documented, not that the upstream
   work is proven complete.
4. When the parent diff arrives, review the shell/issuer split carefully:
   tenant realm for chrome, token-derived CTBC accents inside the page surface.
5. Reject any parent closeout that claims acceptance without:
   `typecheck`, `build`, canvas parity, masked references, and cross-page figure
   reconciliation.

## 7. Packet Self-Check

- [x] Support artifact only; no canonical truth was edited
- [x] Parent and sidecar task rows were anchored through `scripts/ai-status.sh show`
- [x] Dependency IDs were mapped to manifest and dispatch sources
- [x] Current app baseline and home placeholder state were recorded
- [x] Design authority and token boundary were translated into reviewer gates
- [x] The dependency visibility gap was documented explicitly instead of guessed away
