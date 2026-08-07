# Assisted Entry Naming Bridge

Canonical topology and handoff docs currently refer to the call point /
concierge surface as `apps/assisted-entry-web`.

For `SYS-UI-005`, the machine-truth task artifact path is
`apps/concierge-portal-web`, which now contains the actual repo-local
implementation.

This directory intentionally stays as a documentation bridge so existing docs do
not point at a missing path while the naming seam is reconciled in a later
control-plane update.
