# DRTS App Entry-URL Index (dev)

_Last verified: 2026-07-31, against the live `deploy-dev` (`drts-dev-ray-tw-20260730`) deployment._

Authoritative source of truth for **which app serves which surface and at which
dev URL**. Resolve live URLs from the latest successful `deploy-dev.yml` run,
not by guessing a previous GCP project's host suffix.

> dev is public / no-auth. `deploy-dev` ships **10 services** (9 web + API):
> `api, platform-admin-web, ops-console-web, fleet-partner-portal-web,
tenant-console-web, bank-console-web, partner-booking-web,
enterprise-dispatch-web, channel-partner-portal-web, referral-embed-web`.

## Internal management consoles

| App                        | Dev URL                                                           | Role                                                                                                                                               |
| -------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `platform-admin-web`       | https://drts-dev-platform-admin-web-4t7rg6fmeq-uc.a.run.app       | 車隊管理 (indigo). Also third-party referral governance: `/partners`, `/partners/[entrySlug]`, `/partners/[entrySlug]/rates`, `/partners/referral` |
| `ops-console-web`          | https://drts-dev-ops-console-web-4t7rg6fmeq-uc.a.run.app          | 營運管理 (coral): dispatch / incidents / maintenance / approvals                                                                                   |
| `fleet-partner-portal-web` | https://drts-dev-fleet-partner-portal-web-4t7rg6fmeq-uc.a.run.app | 車行管理 (emerald). The referral surface was extracted out — `/referral` now 404 (see channel-partner-portal-web)                                  |

## Line A — credit-card airport transfer (信用卡卡友機場接送)

| App                   | Dev URL                                                      | Role                                                                                            |
| --------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `partner-booking-web` | https://drts-dev-partner-booking-web-4t7rg6fmeq-uc.a.run.app | Cardholder front (`/{tenantSlug}/program/site` official site + `/program/embed` bank-app embed) |
| `bank-console-web`    | https://drts-dev-bank-console-web-4t7rg6fmeq-uc.a.run.app    | Issuing-bank back office                                                                        |

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
provisioned slug per partner. The concrete URL below is the seeded **dev demo /
acceptance** entry only; it is not a production URL claim. The current
production deploy rail does not define a Referral Embed host.

| Surface                                             | Dev URL                                                              | Role                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Embedded ride-hailing front (dev demo / acceptance) | https://refer.smarttransport.tw/embed/referral-demo-community        | `referral-embed-web` — resident hails a ride inside the host app's webview. This seeded dev entry is not a production partner URL. The dev Cloud Run fallback is `https://drts-dev-referral-embed-web-4t7rg6fmeq-uc.a.run.app/embed/referral-demo-community`; `/` redirects to the configured dev acceptance entry. |
| Channel-partner self-service back office            | https://drts-channel-partner-portal-web-4t7rg6fmeq-uc.a.run.app      | `channel-partner-portal-web` — partner views usage / revenue share / statements (`/dashboard`, `/usage`, `/statements`). `channel.smarttransport.tw` remains the custom-domain target, but the Cloud Run host above is the current ready URL.                                                                       |
| Platform-side channel governance                    | https://drts-dev-platform-admin-web-4t7rg6fmeq-uc.a.run.app/partners | `platform-admin-web` `/partners*` — entry / attribution / revenue-share rate admin                                                                                                                                                                                                                                  |

## Backend API

| App   | Dev URL                                      | Notes                                                       |
| ----- | -------------------------------------------- | ----------------------------------------------------------- |
| `api` | https://drts-dev-api-4t7rg6fmeq-uc.a.run.app | Control-plane API. `/api/health` = 200; root 404 is normal. |

## Retired / not deployed / non-web

| App                    | Status                                                                                                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `passenger-web`        | **Retired** 2026-06-16 — removed from `deploy-dev`; embed surface moved to `referral-embed-web`. The old Cloud Run service may still serve a stale revision until manually deleted. |
| `concierge-portal-web` | **Retired / decommissioned.** It is not an active product or deployment target and must not be re-added to `deploy-dev.yml`, domain mappings, smoke acceptance, or URL inventories. |
| `tenant-portal-web`    | Not deployed (404).                                                                                                                                                                 |
| `assisted-entry-web`   | Stub / naming bridge only.                                                                                                                                                          |
| `driver-app`           | Native (Expo/React Native) app — no web URL.                                                                                                                                        |
