# Concierge Portal Web

`apps/concierge-portal-web` materializes the Phase 1 call point / concierge
portal for `SYS-UI-005`.

This app is a repo-local assisted-entry shell that covers:

- local bootstrap sign-in for `concierge_operator` / `call_point_operator`
- fixed-site desk selection
- proxy booking over the existing callcenter + order APIs
- order lookup and dispatch trace readback
- callback creation / completion
- explicit denied / ineligible / degraded / recording-unavailable routes

Important constraints:

- canonical topology docs still refer to the assisted-entry family as
  `apps/assisted-entry-web`
- this workspace currently pins `next dev` / `next build` to `--webpack`
  because the default Next.js 16 Turbopack path does not yet resolve this
  monorepo app cleanly during local verification
- the repo does not yet expose a dedicated call-point auth actor or site
  bootstrap contract, so this app uses a limited-scope `ops_user` bootstrap
  header as a temporary bridge
- raw recording callback / complaint-case management still escalates into the
  ops control plane
