# Concierge Portal Web (Retired)

`apps/concierge-portal-web` materializes the Phase 1 call point / concierge
portal for `SYS-UI-005`.

Status as of 2026-07-31: this surface is **retired / decommissioned**. The repo
keeps the implementation for historical reference and local archeology only; it
is **not** an active deploy target, domain-mapping target, smoke URL, or
authoritative runtime surface.

This app is a repo-local assisted-entry shell that covers:

- local bootstrap sign-in for `concierge_operator` / `call_point_operator`
- fixed-site desk selection
- proxy booking over the existing callcenter + order APIs
- order lookup and dispatch trace readback
- callback creation / completion
- explicit denied / ineligible / degraded / recording-unavailable routes

Important constraints:

- canonical topology docs still refer to the assisted-entry family as
  `apps/assisted-entry-web`; that naming seam does **not** make this an active
  surface
- this workspace currently pins `next dev` / `next build` to `--webpack`
  because the default Next.js 16 Turbopack path does not yet resolve this
  monorepo app cleanly during local verification
- the repo does not yet expose a dedicated call-point auth actor or site
  bootstrap contract, so this app uses a limited-scope `ops_user` bootstrap
  header as a temporary bridge
- raw recording callback / complaint-case management still escalates into the
  ops control plane
- `deploy-dev.yml`, `domain-mappings-dev.yml`, active URL inventories, and
  release rails must keep excluding this surface
