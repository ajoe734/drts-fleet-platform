Deterministic route suite coverage lives in `deterministic-route-suite.spec.ts`.

The suite asserts, per route:

- single shell / single `main`
- no `pageerror`
- no unexpected `console.error`
- tab strip round-trip where the page exposes tabs
- at least one enabled non-destructive button does not crash the page
- primary modal flows open and close on key form pages
