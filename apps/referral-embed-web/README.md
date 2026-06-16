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

## Canonical embed endpoint (source of truth for partner onboarding)

Partners iframe one URL per referral entry:

```
https://<referral-embed-host>/embed/<entrySlug>
```

- **dev:** `https://drts-dev-referral-embed-web-waji3fer3a-uc.a.run.app/embed/<entrySlug>`
- `<entrySlug>` is the partner channel entry slug provisioned in platform-admin
  (`/partners`), e.g. `yuhe-residence`, `cambridge-community`.

> **Migration note:** this **supersedes** the old `passenger-web` embed host
> (`…passenger-web…/embed/<entrySlug>`). Any partner iframe still pointing at the
> passenger-web host must be repointed to the referral-embed host above —
> `passenger-web` is no longer deployed.

## Embed-host allowlist (security)

`/embed/*` is gated by `middleware.ts` against the `REFERRAL_EMBED_ALLOWED_HOSTS`
env (space/comma-separated host allowlist). A request whose `entryHost` is not on
the allowlist is denied with `403`. The standalone service root (`/`) is always
reachable (health checks). Allowlist decision logic is unit-tested in
`tests/unit/referral-embed-security.test.ts`; the deployed surface is smoke-tested
by `playwright.referral-embed.config.ts`.

## Relevant env

| Env                            | Purpose                                                                                |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| `REFERRAL_EMBED_ALLOWED_HOSTS` | space/comma-separated allowlist of partner `entryHost`s permitted to iframe `/embed/*` |
| `REFERRAL_EMBED_DEMO`          | `true` enables the deterministic demo handoff for dev/preview                          |

## Local commands

- `pnpm --filter @drts/referral-embed-web dev` on port `3014`
- `pnpm --filter @drts/referral-embed-web typecheck | lint | build`
