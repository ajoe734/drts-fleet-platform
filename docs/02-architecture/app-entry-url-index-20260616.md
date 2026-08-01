# DRTS App Entry-URL Index (dev)

_Last verified: 2026-08-01, against the repository `deploy-dev` contract for `drts-dev-ray-tw-20260730`._

Authoritative source of truth for **which app serves which surface and at which
dev URL**. Resolve live URLs from the latest successful `deploy-dev.yml` run,
not by guessing a previous GCP project's host suffix.

> dev is public / no-auth. `deploy-dev` ships **9 active services** (8 web + API):
> `api, platform-admin-web, ops-console-web, fleet-partner-portal-web,
tenant-console-web, bank-console-web, enterprise-dispatch-web,
channel-partner-portal-web, referral-embed-web`.

## Internal management consoles

| App                        | Dev URL                                                           | Role                                                                                                                                               |
| -------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `platform-admin-web`       | https://drts-dev-platform-admin-web-4t7rg6fmeq-uc.a.run.app       | 車隊管理 (indigo). Also third-party referral governance: `/partners`, `/partners/[entrySlug]`, `/partners/[entrySlug]/rates`, `/partners/referral` |
| `ops-console-web`          | https://drts-dev-ops-console-web-4t7rg6fmeq-uc.a.run.app          | 營運管理 (coral): dispatch / incidents / maintenance / approvals                                                                                   |
| `fleet-partner-portal-web` | https://drts-dev-fleet-partner-portal-web-4t7rg6fmeq-uc.a.run.app | 車行管理 (emerald). The referral surface was extracted out — `/referral` now 404 (see channel-partner-portal-web)                                  |

## Line A — credit-card airport transfer (信用卡卡友機場接送)

| App                | Dev URL                                                   | Role                     |
| ------------------ | --------------------------------------------------------- | ------------------------ |
| `bank-console-web` | https://drts-dev-bank-console-web-4t7rg6fmeq-uc.a.run.app | Issuing-bank back office |

## Line B — corporate commute (企業內部派車)

| App                                | Dev URL                                                          | Role                                                                                              |
| ---------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `tenant-console-web`               | https://drts-dev-tenant-console-web-4t7rg6fmeq-uc.a.run.app      | Enterprise dispatch **admin** back office                                                         |
| `enterprise-dispatch-web`          | https://drts-dev-enterprise-dispatch-web-4t7rg6fmeq-uc.a.run.app | Enterprise dispatch employee **front** — S1 standalone site (root) + S2 in-app embed (`/embed/*`) |
| ~~`tenant-commute-hub` (Lovable)~~ | ~~tenant-commute-hub.lovable.app~~                               | **Retired** — superseded by enterprise-dispatch-web                                               |

## Third-party referral channel (物業 / 社區 / 渠道轉介)

Three independent surfaces (each its own app/route as of 2026-06-16):

The canonical onboarding contract is
`https://<referral-embed-host>/embed/<entrySlug>`, with one platform-admin
provisioned slug per partner. The concrete URL below is the formal 御和物業
partner entry on the **dev acceptance** authority. It is no longer the generic
seeded demo, but it is still not a production URL claim. The current production
deploy rail does not define a Referral Embed host.

| Surface                                                              | Dev URL                                                              | Role                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Embedded ride-hailing front (formal partner entry on dev acceptance) | https://refer.smarttransport.tw/embed/yuhe-residence                 | `referral-embed-web` — 御和物業 residents hail a ride inside the host app's webview. The authority record uses `entryHost=app.yuhe-living.com.tw`; the dev Cloud Run fallback is `https://drts-dev-referral-embed-web-4t7rg6fmeq-uc.a.run.app/embed/yuhe-residence`. `/` redirects to this entry after the source default is published. This is not evidence of a production host-app or DRTS production cutover. |
| Channel-partner self-service back office                             | https://drts-channel-partner-portal-web-4t7rg6fmeq-uc.a.run.app      | `channel-partner-portal-web` — partner views usage / revenue share / statements (`/dashboard`, `/usage`, `/statements`). `channel.smarttransport.tw` remains the custom-domain target, but the Cloud Run host above is the current ready URL.                                                                                                                                                                     |
| Platform-side channel governance                                     | https://drts-dev-platform-admin-web-4t7rg6fmeq-uc.a.run.app/partners | `platform-admin-web` `/partners*` — entry / attribution / revenue-share rate admin                                                                                                                                                                                                                                                                                                                                |

## Backend API

| App   | Dev URL                                      | Notes                                                       |
| ----- | -------------------------------------------- | ----------------------------------------------------------- |
| `api` | https://drts-dev-api-4t7rg6fmeq-uc.a.run.app | Control-plane API. `/api/health` = 200; root 404 is normal. |

## Partner Booking — PAUSED

`partner-booking-web` is intentionally paused as of 2026-08-01. This covers
both the standalone website (`/{tenantSlug}/program/site`) and bank-app embed
(`/{tenantSlug}/program/embed`). It has no active dev URL: deploy does not
build, deploy, expose, or smoke it; deploy cleanup removes the stale Cloud Run
service; and domain maintenance does not recreate `book.smarttransport.tw`.
The application source and route documentation remain available for a reviewed,
reversible re-enable change.

## Retired / not deployed / non-web

| App                    | Status                                                                                                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `passenger-web`        | **Retired** 2026-06-16 — removed from `deploy-dev`; embed surface moved to `referral-embed-web`. The old Cloud Run service may still serve a stale revision until manually deleted. |
| `concierge-portal-web` | **Retired / decommissioned.** It is not an active product or deployment target and must not be re-added to `deploy-dev.yml`, domain mappings, smoke acceptance, or URL inventories. |
| `tenant-portal-web`    | Not deployed (404).                                                                                                                                                                 |
| `assisted-entry-web`   | Stub / naming bridge only.                                                                                                                                                          |
| `driver-app`           | Native (Expo/React Native) app — no web URL.                                                                                                                                        |
