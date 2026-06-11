# PB-EMBED-R-20260611 Sidecar Acceptance Packet

> **Parent Task:** `PB-EMBED-R-20260611` - PB-EMBED (R): S2 online-banking embed identity states
> **Parent Owner / Reviewer:** `Codex2` / `Codex`
> **Sidecar Owner / Reviewer:** `Codex` / `Codex2`
> **Helper Kind:** `acceptance_packet`
> **Mutates Canonical:** `false`
> **Prepared:** `2026-06-11`

This packet is a support artifact only. It does not modify L1 product truth, runtime code, registry state, or governance implementation. Its purpose is to give the parent owner and reviewer a compact acceptance checklist, dependency map, and evidence plan for the PB embed identity-state slice.

## 1. Official Task Posture

### 1.1 Parent task status from machine truth

| Field | Value |
| --- | --- |
| ID | `PB-EMBED-R-20260611` |
| Status | `in_progress` |
| Owner | `Codex2` |
| Reviewer | `Codex` |
| Summary | `實作 S2 網銀內嵌身分狀態(pb-embed.jsx)：PB_EmbedHandoff/Reauth/Unsupported/Consent/Fallback；reference-token 身分、不擷取原始卡資料、compact chrome。` |

### 1.2 Recorded acceptance criteria

| Criterion | Reviewer expectation |
| --- | --- |
| Reuse existing card funnel + `lib/program-theme.ts` | New UI should stay on the existing partner-booking card program surface rather than inventing a second theme stack. |
| Match the `pb-states/pb-embed` canvas functions | The runtime should cover the five canvas states: `PB_EmbedHandoff`, `PB_EmbedReauth`, `PB_EmbedUnsupported`, `PB_EmbedConsent`, `PB_EmbedFallback`. |
| Issuer brand via `@drts/ui-tokens` `brands.ts` not raw hex | Card-brand colors and chrome should resolve from shared brand tokens, so realm token checks remain valid. |
| `zh-TW` via `t()` | User-facing copy for the new states should come through the translation helper, not inline hard-coded English. |
| `pnpm --filter @drts/partner-booking-web typecheck` and `build` pass | Parent owner should provide command evidence from the feature branch before closeout. |

## 2. State Mapping From Canvas To Runtime

The canonical design canvas for this slice is [`docs/05-ui/drts-design-canvas/pb-embed.jsx`](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-pb-embed-r-20260611-sidecar-acceptance/docs/05-ui/drts-design-canvas/pb-embed.jsx:1). Reviewer should confirm runtime parity against these five states:

| Canvas state | Intent | Runtime expectation |
| --- | --- | --- |
| `PB_EmbedHandoff` | Signed-in bank-app handoff | Session already resolved from issuer-provided reference token; user skips standalone login and proceeds directly into booking eligibility / booking entry. |
| `PB_EmbedReauth` | Token expired / re-auth required | Expired issuer session blocks continuation and sends the user back to the banking app for re-verification. |
| `PB_EmbedUnsupported` | Unsupported or untrusted host | Unauthorized embed host is blocked; page must not continue with booking flow. |
| `PB_EmbedConsent` | First-time scope acknowledgement | User sees explicit consent / scope messaging before continuing. |
| `PB_EmbedFallback` | No embed session | User is redirected to the standalone route/path instead of entering an unauthenticated embed flow. |

Cross-cutting constraints from the canvas that should remain true in runtime:

- Identity comes from a signed reference token or equivalent bank-session handoff, not a standalone credential form.
- The page must not collect raw card data.
- Host chrome stays compact and issuer-branded.
- User-visible experience stays in Traditional Chinese.

## 3. Dependency Map

The parent task declares three artifact surfaces in machine truth. Based on the current repo layout, the likely review surface is:

```text
PB-EMBED-R-20260611
├── docs/05-ui/drts-design-canvas/pb-embed.jsx
│   └── visual source for B1-B5 embed identity states
├── apps/partner-booking-web/app
│   └── route/layout entry points that decide which PB state renders
└── apps/partner-booking-web/lib
    ├── program-theme.ts          shared card-program theme from @drts/ui-tokens
    ├── translations.ts          zh/en copy helper; expected source for zh-TW strings
    ├── render-state-gate.tsx    existing state-gate seam that may host embed routing
    ├── api-client.ts            route context / authority lookup seam
    └── partner-booking-form.ts  existing card funnel behavior to be reused
```

Known upstream/shared dependencies visible in repo:

| Dependency | Why it matters |
| --- | --- |
| `@drts/ui-tokens` brand templates | Required to satisfy the "no raw hex brand colors" acceptance rule. |
| Existing partner-booking card funnel | The task brief explicitly says to reuse it rather than fork a separate embed-only funnel. |
| `translations.ts` `t()` helper | Required for `zh-TW` copy ownership and consistency. |
| `render-state-gate.tsx` / route context | Most likely seam for handing off among allowed / blocked / fallback states. |

Out-of-scope for this sidecar and should remain untouched by acceptance review unless the parent task explicitly expanded:

- L1 product truth documents
- shared runtime/governance outside the partner-booking-web slice
- raw card capture flows or new standalone authentication contracts

## 4. Reviewer Checklist

Use this checklist when reviewing the parent implementation branch.

### 4.1 Runtime behavior

- [ ] **Handoff path exists**: authenticated issuer session lands in the booking experience without asking for standalone login again.
- [ ] **Reauth path blocks safely**: expired or stale issuer session does not continue booking and gives a clear return-to-bank-app action.
- [ ] **Unsupported host path blocks safely**: unauthorized host cannot reach protected booking surfaces.
- [ ] **Consent path is explicit**: first-use scope acknowledgement exists before continuation when required by the implemented branch logic.
- [ ] **Fallback path exists**: no embed session drops to the standalone site/route instead of pretending the user is authenticated.

### 4.2 Contract and UX constraints

- [ ] **No raw card capture**: UI does not introduce card number / password / CVV inputs.
- [ ] **Theme reuse**: card-program branding comes from existing program theme / shared brand tokens.
- [ ] **Token source reuse**: issuer identity is represented as a reference-token/session handoff, not a newly invented auth contract.
- [ ] **zh-TW copy path**: new visible strings are routed through `t()` and rendered in Traditional Chinese.
- [ ] **Compact chrome**: embed host chrome remains a slim wrapper, not a full alternate application shell.

### 4.3 Verification evidence

- [ ] **Typecheck evidence**: `pnpm --filter @drts/partner-booking-web typecheck`
- [ ] **Build evidence**: `pnpm --filter @drts/partner-booking-web build`
- [ ] **If tests were added**: parent owner includes the exact command and result in handoff notes.

## 5. Evidence Collection Plan

The sidecar itself does not run or record parent-branch verification. The parent owner should attach, in the handoff note or review exchange:

1. Changed file list for the partner-booking-web slice.
2. Short mapping from each changed runtime state to one of the five canvas states.
3. Output summary for:
   - `pnpm --filter @drts/partner-booking-web typecheck`
   - `pnpm --filter @drts/partner-booking-web build`
4. Any known gaps, especially if consent or fallback behavior was intentionally deferred.

## 6. Sidecar Verdict

**Acceptance packet status:** `READY FOR REVIEW`

This packet is sufficient to support review of `PB-EMBED-R-20260611` without changing canonical truth. It provides:

- the machine-truth acceptance baseline,
- the B1-B5 dependency/state map,
- the reviewer checklist,
- and the expected validation evidence plan.

## 7. Handoff Note

Hand this packet to `Codex2` as the assigned reviewer-side support artifact for the parent task. The parent implementation remains owned by `Codex2`; this sidecar only narrows review scope and acceptance expectations.
