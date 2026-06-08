# DRTS Design Canvas — v0.6 (2026-05-25)

This directory is the **visual design hand-off bundle** from the visual design team, produced via [claude.ai/design](https://claude.ai/design) against the functional packets at `docs/05-ui/*-design-handoff-packet-20260525.md` and the system design authority at `docs/05-ui/system-design-answers-all-apps-20260524.md`.

## How to open

1. Open [`DRTS Index.html`](./DRTS%20Index.html) in a browser — this is the entry point.
2. From the index, click any surface card to drill into that app's full canvas (`Driver App.html` / `Platform Admin.html` / `Ops Console.html` / `Tenant Console.html`).
3. Each surface canvas is a React + Babel-standalone in-browser prototype — no build step needed.

## What's here

```
DRTS Index.html              Cross-surface entry / browsing landing
Driver App.html              10 mobile routes, dual device frames, hero trip flow
Platform Admin.html          18 desktop routes, indigo accent
Ops Console.html             20 desktop routes, coral accent, multi-board dispatch
Tenant Console.html          20 desktop routes (9 NEW per Q-TEN02), teal accent
archive/                     Partner Booking — deferred per Q-TEN03 to apps/partner-booking-web
chats/chat1.md               Full design conversation context (read for intent)
*.jsx                        Design tokens, primitives, shells, per-app screens
.design-canvas.state.json    Canvas viewport state
```

JSX file groups:

| Group             | Files                                                                                             | Purpose                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Shared shell      | `design-canvas.jsx`, `tweaks-panel.jsx`, `macos-window.jsx`, `android-frame.jsx`, `ios-frame.jsx` | Canvas wrapper + theme tweaks panel + window/device chrome                                                      |
| Mgmt shared layer | `mgmt-tokens.jsx`, `mgmt-primitives.jsx`, `mgmt-shell.jsx`, `mgmt-auth.jsx`, `mgmt-data.jsx`      | Design tokens + primitive components + shell layout + auth chrome + fixture data — shared across 3 web consoles |
| Driver layer      | `driver-tokens.jsx`, `driver-primitives.jsx`, `driver-screens-{1,2,3}.jsx`                        | Independent design system for mobile (cannot share `@drts/ui-web` per answers Q-X04)                            |
| Ops Console       | `ops-screens-{1,2,3}.jsx`                                                                         | 20-route ops console screens                                                                                    |
| Platform Admin    | `platform-screens-{1,2,3}.jsx`, `platform-screens.jsx`                                            | 18-route platform admin screens (`.jsx` is consolidated reference)                                              |
| Tenant Console    | `tenant-screens-{1,2,3}.jsx`, `tenant-screens.jsx`                                                | 20-route tenant console screens                                                                                 |

## Status — what this means for the codebase

**These are prototypes, not production code.** Per the bundle's own README (which has been moved here as this file):

> The design medium is HTML/CSS/JS — these are prototypes, not production code. Your job is to recreate them pixel-perfectly in whatever technology makes sense for the target codebase (React, Vue, native, whatever fits). Match the visual output; don't copy the prototype's internal structure unless it happens to fit.

So:

- ✅ **Visual decisions in this bundle are now authoritative.** Color palette, typography, layout patterns, component shapes, IA, density — these are the answers to the §7 "purely visual open questions" in each hand-off packet.
- ✅ **The functional packets remain authoritative** for behavior contracts (`availableActions`, `EmptyReason`, refresh tier, audit receipts, etc.). They're not replaced — they pair with this canvas.
- ❌ **The JSX files are NOT the implementation.** They use Babel-standalone in-browser, inline demo data, no API wiring, no contracts. The production implementation rebuilds the visuals using the real stack (Next.js + `@drts/ui-web` for the 3 web consoles, Expo + native components for driver-app) and wires through the contracts that engineering will land per answers §7.

## Implementation roadmap (not part of this PR)

This PR (`LAND-DESIGN-CANVAS-V06`) only lands the canvas into the repo. The subsequent implementation work:

1. **Engineering**: implement the 12 new contracts from [system-design-answers §7](../system-design-answers-all-apps-20260524.md) (`UiHealthEnvelope`, `UiRefreshMetadata`, `ResourceActionDescriptor`, `EmptyStateEnvelope`, `ActionReceipt`, `UserNotificationRecord`, `CrossAppResourceLink`, `SearchResultRecord`, `DriverOpsInstruction`, `DriverMatchingSuppression`, `TenantIntegrationReadinessSummary`, `TenantRolloutStateMachineRecord`). These block any real visual implementation that needs CTA authority / refresh / empty / receipt behavior.
2. **PR A — `@drts/ui-web` tokens + ops-console** rebuild. New design tokens (carrying canvas accents) and the first app's screen conversions land in the same PR so the visual swap is coherent.
3. **PR B** — platform-admin rebuild.
4. **PR C** — tenant-console rebuild (largest; 9 NEW routes per Q-TEN02).
5. **PR D** — driver-app rebuild (separate `apps/driver-app` Expo / React Native stack — independent design system).
6. **Future** — `apps/partner-booking-web` rebuild once that app is in scope (Q-TEN03 deferral).

## Files in this bundle that were NOT copied from the source

The source bundle also included three nested directories that are NOT brought across:

- `docs/` — duplicates of `docs/01-product/*.md`, `docs/01-decisions/*.md`, `docs/05-ui/*.md` already in this repo. Skipping avoids stale copies.
- `export/` — older self-contained Driver App export artifact, superseded by the current `Driver App.html`.
- `.scratch/` — debug screenshot from the design session.

## Relationship to the predecessor stub

Before this PR, `docs/05-ui/drts-design-canvas/` held five orphan files (`Partner Booking.html`, `design-canvas.jsx`, `ios-frame.jsx`, `partner-screens.jsx`, `tweaks-panel.jsx`) from an earlier design iteration on a stranded branch. Those have been replaced; the relevant Partner Booking content lives under [`archive/`](./archive/) and carries an `archive/README.md` explaining the Q-TEN03 deferral.

## Source

- Original bundle URL (Anthropic Design hand-off): `https://api.anthropic.com/v1/design/h/iGghPqwC6WaLG36cwuxVug?open_file=DRTS+Index.html`
- Landed by Claude on 2026-05-25 as part of `LAND-DESIGN-CANVAS-V06`.
- Bundle's own README (`CODING AGENTS: READ THIS FIRST`) merged into this file; raw text retained in [`chats/chat1.md`](./chats/chat1.md) header.

If the visual design team produces a v0.7+ revision, replace the contents of this directory atomically (new PR, single commit) and update the version stamp at the top of this README + the design-landed note in each `*-design-handoff-packet-*.md`.
