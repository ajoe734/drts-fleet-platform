# E2E-MTX-UI-FULL-001 Evidence Matrix

## Evidence Legend

| Code   | Meaning                                                                           |
| ------ | --------------------------------------------------------------------------------- |
| `U`    | Unit or source contract test                                                      |
| `I`    | API integration/repository/controller authority test                              |
| `PW-L` | Local browser flow using a local API process; not production environment evidence |
| `PW-C` | Browser flow with controlled/mock/fixture API responses                           |
| `PW-`  | No current browser evidence                                                       |

`verified` below means the production screen implementation and its declared
authority exist and have targeted automated evidence. It does not upgrade
`PW-C` into persisted production E2E. `partial` identifies a missing producer,
writer, browser journey, or cross-surface readback. `blocked_command` and
`blocked_ext` identify command-governance and external evidence boundaries.

## Seventeen-Screen Matrix

| Screen ID         | Production route/surface                                  | API authority                                                                                        | Existing evidence                                           | Positive coverage                                                                | Negative coverage                                                            | Status                                                                                     |
| ----------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `MTX-AUTH-UI-01`  | `/multi-taxi-authorizations`, registry                    | `GET /api/platform-admin/multi-taxi/authorizations`                                                  | U; PW-L local API create/list                               | Search/filter/sort and created authority registry read                           | Empty/loading and typed failures; permission browser state is intercepted    | `verified`; cross-surface persistence `partial`                                            |
| `MTX-AUTH-UI-02`  | `/multi-taxi-authorizations`, detail surface              | `GET /api/platform-admin/multi-taxi/authorizations/:authorizationId`                                 | U; PW-L local API detail                                    | Canonical identity, lifecycle, fare, area, window, audit values                  | Not-found/unavailable/stale classifications                                  | `verified`; lifecycle readback journey `partial`                                           |
| `MTX-AUTH-UI-03`  | `/multi-taxi-authorizations`, draft surface               | `POST/PUT /api/platform-admin/multi-taxi/authorizations[/:authorizationId]`                          | U; PW-L create through request API; browser validation      | Canonical create/update client wiring                                            | Required fields, invalid window, 409 classification                          | `verified`; browser command/readback `partial`                                             |
| `MTX-AUTH-UI-04`  | `/multi-taxi-authorizations`, lifecycle confirmation      | `POST .../:authorizationId/activate` and `/suspend`                                                  | U; PW-L opens server-preview confirmation                   | Fresh server preview and reason-bound command wiring                             | Missing reason, stale status, permission/capability classifications          | `verified`; browser mutation/readback `partial`                                            |
| `MTX-AUTH-UI-05`  | `/multi-taxi-authorizations`, vehicles surface            | `GET/POST .../:authorizationId/vehicles`                                                             | U; PW-L local API add/list                                  | Current/history classification and vehicle add authority                         | Invalid vehicle/effective window; unsupported remove disabled                | `verified`; queue reuse of same vehicle `partial`                                          |
| `MTX-AUTH-UI-06`  | `/multi-taxi-authorizations`, conflict/permission surface | Authorization API 401/403/404/409 responses                                                          | U; PW-C permission interception inside otherwise PW-L suite | Typed state rendering                                                            | Session, permission, stale conflict, unavailable                             | `verified`; real browser 401/403/409 `partial`                                             |
| `MTX-QUEUE-UI-01` | `/dispatch/queue`                                         | `GET /api/dispatch/queue`                                                                            | U; API I; PW-C fixture server                               | Required columns, filters, ordinary/multi-taxi isolation                         | Unavailable/empty and illegal action filtering                               | `verified`; same-authority persisted queue `partial`                                       |
| `MTX-QUEUE-UI-02` | `/dispatch/queue/[queueEntryId]`                          | `GET /api/dispatch/queue/:queueEntryId`                                                              | U; API I; PW-C fixture server                               | Server-owned detail and eligibility context                                      | Missing/unavailable and action sanitization                                  | `verified`; persisted list/detail readback `partial`                                       |
| `MTX-QUEUE-UI-03` | Queue detail denial surface                               | Queue detail server eligibility/denial                                                               | U; API I; PW-C physical-rank/taxi-stand cases               | Canonical denial copy and next action                                            | DOM check rejects bypass/force check-in; ordinary taxi remains isolated      | `verified`; inactive authority composition `partial`                                       |
| `P5-RATE-UI-01`   | `/p5-ratings`                                             | `GET /api/platform-admin/multi-taxi-ratings`                                                         | U; API I; PW-C                                              | Review queue filters and masked read model                                       | 401/403, malformed/stale, no fixture fallback                                | `verified`; Passenger-to-queue journey `partial`                                           |
| `P5-RATE-UI-02`   | `/p5-ratings/[ratingId]`                                  | `GET .../:ratingId`; `POST .../:ratingId/invalidate`                                                 | U; API I; PW-C invalidate                                   | Detail, moderation history, idempotent invalidation authority                    | Reason/confirmation/capability/conflict and sensitive-data guards            | `verified`; browser-to-DB readback `partial`                                               |
| `P5-RATE-UI-03`   | `/p5-ratings/drivers/[driverId]`                          | `GET /api/platform-admin/multi-taxi-rating-authorities/:driverId`                                    | U; API I; PW-C                                              | Rated/new-driver/unavailable authority                                           | Missing/inconsistent aggregate fails closed; direct edit absent              | `verified`; post-invalidation aggregate browser readback `partial`                         |
| `P5-COM-UI-01`    | `/p5-fare-anomalies` and `/[quoteSnapshotId]`             | `GET /api/product-rule/fare-anomalies[/:quoteSnapshotId]`; gated retry POST                          | U; API I; PW-                                               | Five canonical reasons, queue/detail, server action descriptors                  | Provider unavailable fails closed; no manual fare input                      | `verified` screen; producer and browser journey `partial`                                  |
| `P5-COM-UI-02`    | `/payments/[orderId]`                                     | `GET /api/payment-exceptions/:orderId`                                                               | U; API authority; PW-C 4 cases                              | Six states, masked provider reference, audit timeline                            | Failed/manual recovery never paid; 403/404/503; mark-paid dropped            | `verified` read; recovery `blocked_command`                                                |
| `P5-COM-UI-03`    | `/multi-taxi-certificates` and `/[certificateId]`         | `GET /api/platform-admin/multi-taxi/certificates[/:certificateId]`                                   | U; API authority; PW-C 7 cases                              | Search/detail and six support states                                             | Missing legal values stay unavailable; 403/404/500; regeneration disabled    | `verified` read; writer `partial`; regeneration `blocked_command`                          |
| `P5-COM-UI-04`    | `/platform-admin/p5/records`                              | `GET /api/platform-admin/multi-taxi-trip-records`                                                    | U; API authority; PW-C                                      | Canonical query/detail, 730-day retention, legal-hold state                      | Missing values unavailable; hold authority failure not treated as none       | `verified`; same-trip production browser path `partial`                                    |
| `P5-COM-UI-05`    | Records controlled-export/retention surface               | `POST/GET /api/platform-admin/multi-taxi-trip-records/export-jobs...`; hold read in record authority | U; API authority; PW-C                                      | Preview, persisted job contract, status, HTTPS download; active/none hold filter | Purpose/idempotency/URL guards; 403/503 models; hold create/release disabled | `verified` read/export; hold mutation `blocked_command`; persisted browser proof `partial` |

## Cross-Surface Flow Matrix

| Flow                                                   | Existing evidence                                                                                  | Verdict                                                             |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Approved authorization to authorized vehicle           | Local API-backed Authorization browser evidence                                                    | `verified` locally, not production                                  |
| Authorized vehicle to virtual queue                    | Separate authorization and queue tests; no shared persisted identifier                             | `partial`                                                           |
| Queue to Passenger disclosure                          | Unit/API behavior exists; no shared browser journey                                                | `partial`                                                           |
| Disclosure to fare/payment/certificate                 | Passenger unit evidence plus separate commerce tests; fare producer and certificate writer missing | `partial`                                                           |
| Passenger rating to moderation and aggregate           | API unit/integration plus controlled Rating browser evidence                                       | `partial`                                                           |
| Completed trip to record and controlled export         | API authority plus controlled Records browser evidence                                             | `partial`; no single persisted browser readback                     |
| Inactive authority and physical-rank/taxi-stand denial | Separate authority and queue negative tests                                                        | `partial`; not one persisted scenario                               |
| Fare provider unavailable                              | API/UI fail-closed tests                                                                           | `verified` contract; live provider `blocked_ext`                    |
| Payment failed/manual recovery                         | API/UI/PW-C tests                                                                                  | `verified` read; recovery `blocked_command`; live PSP `blocked_ext` |
| Certificate unavailable/regeneration                   | API/UI/PW-C tests                                                                                  | `verified` state; writer `partial`; regeneration `blocked_command`  |
| Record/export permission and legal hold                | API/UI tests; hold state separate from retention                                                   | `verified` contract; full browser authority denial `partial`        |

## S3 Release Dependency

S3 is not part of the 17-screen count. Fleet G locally verified repository-owned
attachment, fail-closed scan, alert timestamp, and Ops rendering behavior.
The following remain `blocked_ext` and are not inferred from hermetic tests:

- Android and iOS physical-device offline replay;
- external malware scanner contract/provider execution;
- production alert-to-Ops traces and p95.

## Automated Census Boundary

`tests/unit/mtx-full-suite-contract.test.ts` verifies:

1. the exact 17-ID set;
2. production route source existence;
3. explicit Screen ID surface mapping;
4. production API controller authority markers;
5. absence of executable queue bypass, manual fare, and mark-paid controls;
6. disabled legal-hold create/release with no mutation call;
7. `V0059/V0060/V0061` migration order.

It is intentionally named and documented as a route/contract census. It is not
a live-provider E2E and does not use browser interception to create success.
