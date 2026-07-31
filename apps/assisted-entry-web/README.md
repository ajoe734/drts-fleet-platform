# Assisted Entry Naming Bridge

Canonical topology and handoff docs currently refer to the call point /
concierge surface as `apps/assisted-entry-web`.

As of 2026-07-31, that assisted-entry / concierge family is **retired**. This
directory is a documentation bridge only. It is not a deployable app, active
runtime surface, domain-mapping target, or URL-inventory entry.

The historical repo-local implementation lives at
`apps/concierge-portal-web`.

This directory intentionally stays as a documentation bridge so existing docs do
not point at a missing path while the naming seam is reconciled in a later
control-plane update.
