## UI-CANVAS-REF-001 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `UI-CANVAS-REF-001` - Passenger Embed exact 15-page HTML canvas parity + Phase 2 retention  
**Parent Owner / Reviewer:** `Codex` / `Codex2`  
**Sidecar Owner / Reviewer:** `Codex2` / `Codex`  
**Generated:** `2026-08-01` (UTC)  
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` - support-only; does not modify canonical truth, runtime behavior, or parent task ownership/closeout state.

This packet prepares the reviewer handoff for `UI-CANVAS-REF-001-SIDECAR-ACCEPTANCE`.
It does not claim that parent `UI-CANVAS-REF-001` is finished. Machine truth still
shows the parent `in_progress` with an open integration gate after review approval.

---

## 1. Scope Boundary

In scope:

- capture the current authority chain for Referral Embed visual parity
- pin the machine-truth dependency map for the parent slice
- translate the parent acceptance string into reviewer-usable checkpoints
- record the still-open parent closeout / integration constraint so review does not
  overclaim `done`

Out of scope:

- editing `apps/referral-embed-web/**`, `docs/05-ui/**`, `packages/ui-tokens/**`,
  tests, or canonical task records
- re-running the parent's verification suite on its behalf
- claiming that missing or moved runbook paths are repaired by this packet
- moving the parent or sidecar directly to `done`

---

## 2. Machine-Truth Anchors

### Sidecar - `UI-CANVAS-REF-001-SIDECAR-ACCEPTANCE`

- owner=`Codex2`
- reviewer=`Codex`
- status=`in_progress` at packet write
- helper_parent=`UI-CANVAS-REF-001`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- depends_on=`REF-DOC-001`
- artifact=`support/sidecars/UI-CANVAS-REF-001/UI-CANVAS-REF-001-SIDECAR-ACCEPTANCE.md`

### Parent - `UI-CANVAS-REF-001`

- owner=`Codex`
- reviewer=`Codex2`
- status=`in_progress`
- depends_on=`REF-DOC-001`
- last_update=`2026-08-01T10:44:39Z`
- acceptance:
  - `15 HTML-derived runtime screenshots reviewed at 392x812; blue #1A45AD host chrome + Yuhe #0F766E brand/CTA; state=handoff is artboard 1; no production debug controls or slug hardcoding; lint/typecheck/build/a11y/visual tests pass`
- current `next` explicitly says the task cannot move to `done` yet because review-approved
  commit `cd74a85e` is only pushed on `origin/codex/ui-canvas-ref-001`, PR `#1221` is still
  open against `dev`, and merged-to-dev / dev-deployed evidence does not yet exist.

### Upstream Dependency - `REF-DOC-001`

- owner=`Codex`
- reviewer=`Gemini2`
- status=`done`
- closeout commit=`1391b6c1f11e7fee0fd5313ff70ea22eaded236b`
- subject=`REF-DOC-001: close out referral embed recovery docs`
- integration_status=`not_applicable`

Implication:

- This sidecar can treat the design / source-chain recovery as closed.
- This sidecar must not treat the parent UI implementation as closed.

---

## 3. Authority Chain

The parent brief and current repo state align on the following practical source chain:

1. `docs/05-ui/drts-design-canvas/Passenger Embed.html`
2. `docs/05-ui/drts-design-canvas/passenger-embed-screens.jsx`
3. `apps/referral-embed-web/README.md`
4. `apps/referral-embed-web/components/passenger-embed.tsx`
5. `apps/referral-embed-web/lib/embed-context.ts`
6. `apps/referral-embed-web/lib/embed-fixtures.ts`
7. `apps/referral-embed-web/lib/translations.ts`
8. `apps/referral-embed-web/app/globals.css`
9. `tests/e2e/referral-embed-surfaces.spec.ts`

Important note for reviewer:

- The machine-truth summaries for `REF-DOC-001` / `UI-CANVAS-REF-001` reference
  `docs/03-runbooks/referral-embed-stage1-recovery-execution-tasks-20260801.md`, but that
  file is not present in this worktree. This packet therefore anchors review on the files that
  actually exist in the repository today instead of pretending that absent path is reviewable.

Authority observations from the live files:

- `Passenger Embed.html` defines the exact canvas structure: 15 core artboards at `392x812`
  plus 4 Phase 2 fallback artboards, with `handoff` as the first artboard.
- The canvas explicitly states partner brand accent comes from `themeAccent`, not hardcoded
  screen-level colors.
- Runtime theme resolution in `embed-presentation.ts` uses `@drts/ui-tokens` realm/status
  tokens and falls back to `SURFACE_ACCENTS.tenant.light.fg` instead of inventing a raw palette.
- Runtime state resolution in `embed-context.ts` preserves the 5 identity states:
  `handoff`, `reauth`, `unsupported`, `consent`, `fallback`.
- The current E2E suite covers canonical entry routing, authorized iframe headers, blocked host
  behavior, real iframe load, true 404 for missing authority entries, and degraded authority
  failure rendering.

---

## 4. Dependency Map

| Task | Status | Relationship to this sidecar |
| --- | --- | --- |
| `REF-DOC-001` | `done` | Locks the restored referral embed design / functional source chain so the parent parity work has a stable authority baseline. |
| `UI-CANVAS-REF-001` | `in_progress` | Parent runtime parity slice that this packet frames for review; implementation authority remains with the parent branch / PR. |
| `UI-CANVAS-REF-001-SIDECAR-ACCEPTANCE` | `in_progress` | Support-only acceptance and dependency map for reviewer handoff; not a runtime authority source. |

Dependency assertion:

- No new dependency edges are introduced by this packet.
- The only formal upstream gate is already closed.
- The remaining blocker is downstream integration / closeout on the parent, not upstream design authority.

---

## 5. Parent Acceptance Checklist

### A. Visual authority parity

- [x] Canvas authority resolves from `Passenger Embed.html` and the loaded JSX dependencies.
- [x] Core canvas uses `392x812` phone artboards.
- [x] Artboard order keeps `handoff` as the first identity state.
- [x] The canvas includes the 15 core HTML-derived states plus the 4 Phase 2 fallback states.

### B. Token and branding contract

- [x] Canvas notes brand accent is driven by partner `themeAccent`.
- [x] Runtime accent resolution flows through partner entry data and `@drts/ui-tokens`, not a new app-local palette.
- [x] Tenant realm color anchor remains teal (`#0F766E`) via `REALM_COLORS.tenant.light.fg`.

### C. Runtime behavior contract

- [x] Runtime keeps the five identity states: `handoff`, `reauth`, `unsupported`, `consent`, `fallback`.
- [x] Runtime still constructs `/embed/[entrySlug]` URLs and passes through `entryHost`,
      `apiKey`, and `partnerUserRef`.
- [x] Security gate remains fail-closed for unauthorized hosts.

### D. Verification / integration gate

- [x] Parent machine truth records a green focused verification snapshot for build and the 7-case
      E2E referral-embed surface suite.
- [x] Parent machine truth records that the review-approved branch is pushed and PR `#1221` is open.
- [ ] Parent is **not yet eligible for `done`** because `merged_to_dev` / `dev_deployed` evidence
      is not recorded.

Reviewer interpretation:

- Approval of this sidecar means the packet accurately frames the parent acceptance surface and
  open gate.
- Approval of this sidecar does **not** mean the parent implementation is closed.

---

## 6. Evidence Anchors

| Acceptance point | Verdict | Evidence anchor | Notes |
| --- | --- | --- | --- |
| Canvas defines 15 core screens + 4 Phase 2 fallback screens | `met` | `docs/05-ui/drts-design-canvas/Passenger Embed.html` | Sections `A1`, `A2`, `A3-A6`, and `V1` are all present. |
| First artboard is `handoff` | `met` | `docs/05-ui/drts-design-canvas/Passenger Embed.html` | `DCArtboard id="handoff"` appears first in the identity-state section. |
| Screen chrome / brand-accent contract is canvas-driven | `met` | `docs/05-ui/drts-design-canvas/passenger-embed-screens.jsx`, `Passenger Embed.html` | Canvas comments explicitly forbid hardcoded screen-level accent invention. |
| Runtime resolves accent from partner entry + ui-tokens fallback | `met` | `apps/referral-embed-web/lib/embed-presentation.ts` | Uses entry `themeAccent` / `brandingMetadata.themeAccent`, then `SURFACE_ACCENTS.tenant.light.fg`. |
| Runtime preserves five identity states | `met` | `apps/referral-embed-web/lib/embed-context.ts` | `EmbedState` union and `toEmbedState(...)` preserve `handoff`/`reauth`/`unsupported`/`consent`/`fallback`. |
| Runtime keeps canonical embed URL shape | `met` | `apps/referral-embed-web/components/passenger-embed.tsx` | `buildHref(...)` always targets `/embed/${entrySlug}` and forwards handoff params. |
| README locks canonical partner-facing route shape | `met` | `apps/referral-embed-web/README.md` | Documents `https://<referral-embed-host>/embed/<entrySlug>`. |
| Security suite covers allow/deny iframe behavior | `met` | `tests/e2e/referral-embed-surfaces.spec.ts` | Explicit tests for allowed headers, blocked host, real iframe load, 404, and degraded failure. |
| Parent verification snapshot is green but integration closeout remains open | `met` | `ai-status` row for `UI-CANVAS-REF-001` | `next` includes passing build/E2E summary and the explicit "cannot move to done" note. |
| Upstream source-chain recovery is closed | `met` | `ai-status` row for `REF-DOC-001` | Dependency is `done` with commit/push metadata recorded. |

Result: 10 evidence points `met`, 0 unmet inside this sidecar's scope.

---

## 7. Reviewer Focus

Reviewer `Codex` should confirm:

1. this packet stays support-only and edits only `support/sidecars/UI-CANVAS-REF-001/`
2. the parent is described as `in_progress`, not prematurely as `done`
3. the upstream `REF-DOC-001` dependency is correctly treated as closed
4. the authority chain cites files that actually exist in the current worktree
5. the acceptance checklist matches the parent task's single acceptance string
6. the packet preserves the distinction between green focused verification and unresolved
   integration closeout

If any of those checks fails, reviewer should `reopen` the sidecar rather than `approve`.

---

## 8. Handoff Command

Owner handoff after verifying this packet:

```bash
AI_NAME=Codex2 scripts/ai-status.sh handoff UI-CANVAS-REF-001-SIDECAR-ACCEPTANCE Codex "UI-CANVAS-REF-001 acceptance packet ready at support/sidecars/UI-CANVAS-REF-001/UI-CANVAS-REF-001-SIDECAR-ACCEPTANCE.md. It pins the actual referral-embed authority chain present in the repo, confirms REF-DOC-001 is closed, maps the parent acceptance gate to Passenger Embed canvas parity, themeAccent/ui-tokens branding flow, embed state/security behavior, and the focused referral-embed E2E coverage, and explicitly preserves the open parent integration gate recorded in machine truth (review-approved branch pushed, PR #1221 still open, no merged_to_dev/dev_deployed evidence yet)."
```

Suggested reviewer approval wording:

```bash
AI_NAME=Codex scripts/ai-status.sh approve UI-CANVAS-REF-001-SIDECAR-ACCEPTANCE "UI-CANVAS-REF-001 acceptance packet approved: it stays support-only, correctly treats REF-DOC-001 as the closed authority-chain dependency, maps the parent parity gate to the existing Passenger Embed canvas/runtime/test surfaces, and accurately preserves the still-open parent integration gate instead of overclaiming done."
```

---

## 9. Local Verification For This Sidecar

- `git diff --check -- support/sidecars/UI-CANVAS-REF-001/UI-CANVAS-REF-001-SIDECAR-ACCEPTANCE.md`

---

## 10. Files Added By This Sidecar

```text
support/sidecars/UI-CANVAS-REF-001/UI-CANVAS-REF-001-SIDECAR-ACCEPTANCE.md
```
