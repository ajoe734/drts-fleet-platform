# Referral Embed Web

`apps/referral-embed-web` is the standalone host for the **third-party referral
channel embed** — the embedded DRTS ride-hailing webview that community /
property-management apps (and other referral channels) iframe so a resident can
hail a ride inside the host app, with per-trip attribution + revenue share back
to the channel partner.

> Status: **Paused** for dev (no active deployment / no active mapping).

It was extracted out of the retired generic `passenger-web` consumer app
(`REFERRAL-EMBED-MIGRATE-20260616`). The embed surface, its identity/handoff
state machine, and the entry-host allowlist middleware moved here verbatim;
`passenger-web` and its generic consumer routes (book / trip / receipts / …) are
gone.

## Canonical embed endpoint status

The surface is paused. There is no active canonical domain or Cloud Run
traffic target for partner onboarding at this stage. The old local dev host
`https://drts-dev-referral-embed-web-4t7rg6fmeq-uc.a.run.app` is retained only for
historical reference and **must not be used for active traffic or smoke tests**.

Partners should use the service only after explicit re-enable.

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
`tests/unit/referral-embed-security.test.ts`; this paused surface is not in active smoke acceptance.

## Relevant env

| Env                                 | Purpose                                                                                |
| ----------------------------------- | -------------------------------------------------------------------------------------- |
| `REFERRAL_EMBED_ALLOWED_HOSTS`      | space/comma-separated allowlist of partner `entryHost`s permitted to iframe `/embed/*` |
| `REFERRAL_EMBED_DEMO`               | `true` enables the deterministic demo handoff for dev/preview                          |
| `REFERRAL_EMBED_DEFAULT_ENTRY_SLUG` | optional canonical entry opened from `/`; dev uses `referral-demo-community`           |

## Local commands

- `pnpm --filter @drts/referral-embed-web dev` on port `3014`
- `pnpm --filter @drts/referral-embed-web typecheck | lint | build`
