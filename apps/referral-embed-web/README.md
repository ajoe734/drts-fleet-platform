# Referral Embed Web

`apps/referral-embed-web` is the standalone host for the **third-party referral
channel embed** — the embedded DRTS ride-hailing webview that community /
property-management apps (and other referral channels) iframe so a resident can
hail a ride inside the host app, with per-trip attribution + revenue share back
to the channel partner.

It was extracted out of the retired generic `passenger-web` consumer app
(`REFERRAL-EMBED-MIGRATE-20260616`). The embed surface, its identity/handoff
state machine, and the entry-host allowlist middleware moved here verbatim;
`passenger-web` and its generic consumer routes (book / trip / receipts / …) are
gone.

## Canonical embed contract (source of truth for partner onboarding)

Partners iframe one URL per referral entry:

```
https://<referral-embed-host>/embed/<entrySlug>
```

- **formal partner entry on the dev acceptance rail:** `https://refer.smarttransport.tw/embed/yuhe-residence`
- **dev Cloud Run fallback:** `https://drts-dev-referral-embed-web-4t7rg6fmeq-uc.a.run.app/embed/yuhe-residence`
- `<entrySlug>` is the partner channel entry slug provisioned in platform-admin
  (`/partners`). `yuhe-residence` is the formal non-demo entry for 御和物業 on
  the current dev acceptance authority. The legacy `referral-demo-community`
  seed remains test data only and is not the default or a partner-facing URL.
- The `refer.smarttransport.tw` URL above is still a **dev acceptance URL**. It
  does not claim that the Yuhe host app or a DRTS production rail has completed
  production cutover.
- Dev keeps `REFERRAL_EMBED_DEMO=true` for deterministic acceptance identity;
  the partner entry and URL are formal, while authentication remains a dev-only
  acceptance fixture until a separately delivered host-backend credential flow.
- No production Referral Embed host is defined by the current production deploy
  rail. A production onboarding URL must use the provisioned partner slug and
  the separately approved production host.

> **Migration note:** this **supersedes** the old `passenger-web` embed host
> (`…passenger-web…/embed/<entrySlug>`). Any partner iframe still pointing at the
> passenger-web host must be repointed to the referral-embed host above —
> `passenger-web` is no longer deployed.

## Embed-host allowlist (security)

`/embed/*` is gated by `middleware.ts` against the `REFERRAL_EMBED_ALLOWED_HOSTS`
env (space/comma-separated host allowlist). A request whose `entryHost` is not on
the allowlist is denied with `403`. When
`REFERRAL_EMBED_DEFAULT_ENTRY_SLUG` is set, the service root redirects to that
canonical entry. Allowlist decision logic is unit-tested in
`tests/unit/referral-embed-security.test.ts`; the deployed surface is smoke-tested
by `playwright.referral-embed.config.ts`.

## Relevant env

| Env                                 | Purpose                                                                                |
| ----------------------------------- | -------------------------------------------------------------------------------------- |
| `REFERRAL_EMBED_ALLOWED_HOSTS`      | space/comma-separated allowlist of partner `entryHost`s permitted to iframe `/embed/*` |
| `REFERRAL_EMBED_DEMO`               | `true` enables the deterministic demo handoff for dev/preview                          |
| `REFERRAL_EMBED_DEFAULT_ENTRY_SLUG` | optional canonical entry opened from `/`; dev uses `yuhe-residence`                    |
| `REFERRAL_EMBED_STANDALONE_URL`     | absolute URL of a real standalone booking entry offered from the fallback screen when the embed can't complete handoff. Must resolve to a different host than the embed itself; a same-host value is treated as unset (it would recreate the fallback → embed → blocked loop this exists to fix). When unset, the fallback screen reports an honest "no alternate entry configured" state instead of linking anywhere. `ref_source` / `ref_entry_slug` / `ref_entry_host` query params are appended for source attribution. |

## Local commands

- `pnpm --filter @drts/referral-embed-web dev` on port `3014`
- `pnpm --filter @drts/referral-embed-web typecheck | lint | build`
