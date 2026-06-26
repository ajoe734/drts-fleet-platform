# ROC Console Web (`@drts/roc-console-web`)

Phase 2 Tesla FSD sandbox — Regulatory Operations Centre (監理運營中心) web app.

**This is a design-system scaffold only.** Per decision packet §C2
(`docs/02-architecture/phase2_tesla_fsd_sandbox_system_design_decision_packet_c1c6_b1b5_20260625.md`),
the ROC Console:

- reuses the **Ops Console shell** + `@drts/ui-web` primitives — no second
  component library, no bespoke screen UI;
- shares the neutral dark control-plane canvas with Ops, differentiated only by
  the independent **blue/cyan `roc` accent** (`@drts/ui-web` `canvas-tokens`);
- consumes the **`roc` semantic token aliases** in `@drts/ui-tokens`
  (`packages/ui-tokens/src/roc.ts`, §4.3 table) for surfaces, accent and status
  state colours.

ROC **screens are owned by the visual-team canvas** and are intentionally NOT
built here. What this scaffold wires:

| Surface                                           | File                                                                                   |
| ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Shell (left nav, top bar, sidebar footer, locale) | `components/roc-shell.tsx`, `lib/roc-shell-nav.ts`, `components/roc-health-footer.tsx` |
| `availableActions` → `ActionReceipt` plumbing     | `components/roc-action-rail.tsx`, `lib/action-runtime.ts`                              |
| API client + control-plane proxy                  | `lib/api-client.ts` + `app/control-plane-proxy/[...path]/route.ts`                     |

The response routes named in `P2-UI-ROC-002` (`/takeover`, `/alerts`,
`/incidents`, `/evidence`, `/reports`) intentionally render a shared hold state
that points at
`docs/05-ui/roc-console-takeover-alerts-incidents-evidence-reports-screen-requirements-20260626.md`.
That keeps the scaffold aligned with the UI design contract until the missing
canonical ROC canvas lands.

**Auth realm.** ROC routes are guarded by `@RequireRealms("system", "ops")`
(P2-ROC-001) and `auth.policy` maps `roc/*` to `baseAllowedRealms("ops")`. There
is **no separate `roc` auth realm** — decision packet §C2 rejects a new
console/auth realm and §10.3 keeps the existing controller prefix/authority. ROC
duty staff therefore authenticate as an `ops_user` in the `ops` realm; a
ROC-specific actor id / fallback email keeps audit attribution distinct from the
generic Ops Console operator. Write actions return the real backend
`ActionReceipt`; failures surface as failures — the scaffold never synthesises an
`accepted` receipt.

The home route renders the shared `CanvasEmptyState` primitive (no bespoke
screen). The `availableActions` → `ActionReceipt` rail is reusable plumbing that
real ROC screens mount once the visual-team canvas defines them.

## Scripts

```bash
pnpm --filter @drts/roc-console-web typecheck   # next typegen && tsc --noEmit
pnpm --filter @drts/roc-console-web build        # next build --webpack
pnpm --filter @drts/roc-console-web dev          # http://localhost:3010
```
