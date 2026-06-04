# Ops Console I18n Remediation Implementation

- Date: 2026-06-04
- Scope: `I18N-WP0` follow-up execution slices for `apps/ops-console-web`
- Current unblock focus: `I18N-OPS-04`

## 1. Why this file exists

`I18N-OPS-04` was dispatched against a missing planning anchor. The task brief
already referenced this path, but the file did not exist, which left the driver
list/detail/platform-actions remediation without a recorded copy policy for:

- zh-primary vs simultaneous `zh · en` body labels
- driver-platform glossary terms such as `re-auth`, `suppression`, and
  `binding`
- whether the current remediation wave should wait for `CanvasBiLabel`

This file is the canonical planning artifact for the 2026-06-04 ops-console
i18n remediation wave.

## 2. Decision

For the current Ops Console i18n remediation wave:

1. Runtime copy remains **single-locale output**, not simultaneous bilingual
   body copy.
2. In `zh` locale, touched Ops Console body surfaces are **zh-primary**.
3. `CanvasBiLabel` is **not** a prerequisite for this wave. It remains a
   separate body-parity follow-up primitive for surfaces that later choose to
   render explicit `zh · en` labels.
4. `I18N-OPS-04` should centralize copy into `lib/translations.ts` or shared
   localized helpers; it should **not** invent a local bilingual rendering
   pattern inside the driver pages.

## 3. Binding glossary for driver ops surfaces

Until a higher-precedence product/design artifact says otherwise, use these
terms in the touched driver ops surfaces:

| Source term | zh policy |
| --- | --- |
| `re-auth` | keep `re-auth` |
| `suppression` | `派遣抑制` |
| `binding` | `綁定` |
| `bound` | `已綁定` |
| `unbound` | `未綁定` |

This applies to the `I18N-OPS-04` scope:

- `app/drivers/page.tsx`
- `app/drivers/[driverId]/page.tsx`
- `components/driver-platform-actions.tsx`

## 4. Scope boundary

No product/API contract change is introduced here.

No scope cut is introduced here.

Explicit follow-up that stays out of `I18N-OPS-04`:

- If the broader Ops Console body-parity program later standardizes
  `CanvasBiLabel` for selected body surfaces, that rollout should land as its
  own UI parity/design task rather than reopening this i18n centralization
  slice.

## 5. Unblocked next step for I18N-OPS-04

Resume `I18N-OPS-04` with the driver list/detail/platform-actions remediation
treated as a **zh-primary localization cleanup**:

1. remove remaining inline copy decisions from the three task files
2. centralize them into translations/localized helpers
3. keep `en` and `zh` locale behavior single-language per locale
4. do not block on `CanvasBiLabel` or a broader bilingual-body redesign

## 6. Source basis

- `docs/05-ui/system-design-answers-all-apps-20260524.md`
- `docs/05-ui/ops-console-design-handoff-packet-20260525.md` §5.14-5.15, §7
- `docs/05-ui/ops-console-body-parity-audit-20260602.md` §8-10
- `docs/05-ui/drts-design-canvas/mgmt-tokens.jsx`
- `docs/05-ui/drts-design-canvas/ops-screens-1.jsx`
