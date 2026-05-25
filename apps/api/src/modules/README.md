# API Domain Modules

This directory marks the intended backend domain boundaries for Phase 1.

Planned module map:

1. `identity`
2. `tenant-partner`
3. `regulatory-registry`
4. `product-rule`
5. `order`
6. `dispatch`
7. `forwarder`
8. `driver-task`
9. `callcenter`
10. `complaint`
11. `billing-settlement`
12. `reporting-filing`
13. `audit-notification`
14. `notification`

Current rule:

- do not add deep business logic yet
- add new backend slices under one of these domains instead of inventing a new service prematurely
- use `packages/contracts` for envelopes and DTO placeholders
