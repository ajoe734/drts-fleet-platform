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

| Surface | File |
| --- | --- |
| Shell (left nav, top bar, sidebar footer, locale) | `components/roc-shell.tsx`, `lib/roc-shell-nav.ts`, `components/roc-health-footer.tsx` |
| `availableActions` → `ActionReceipt` plumbing | `components/roc-action-rail.tsx`, `lib/action-runtime.ts` |
| Realm-scoped API client | `lib/api-client.ts` (`x-realm: roc`) + `app/control-plane-proxy/[...path]/route.ts` |

The home page renders the shell plus a demonstration `availableActions` rail
that exercises the `ActionReceipt` tracking-number contract end-to-end.

## Scripts

```bash
pnpm --filter @drts/roc-console-web typecheck   # next typegen && tsc --noEmit
pnpm --filter @drts/roc-console-web build        # next build --webpack
pnpm --filter @drts/roc-console-web dev          # http://localhost:3010
```
