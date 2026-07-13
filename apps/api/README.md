# API

NestJS API for the DRTS fleet platform monorepo.

Current scope:

- `GET /health`
- `GET /api/system/foundation/manifest`
- `GET /api/identity/context`
- `GET /api/tenant-partner/summary`
- `GET /api/regulatory-registry/summary`
- `GET /api/regulatory-registry/vehicles`
- `POST /api/regulatory-registry/vehicles/:vehicleId/compliance`
- `GET /api/regulatory-registry/drivers`
- `POST /api/regulatory-registry/drivers/:driverId/work-state`
- `GET /api/product-rule/catalog`
- `GET /api/audit`
- `GET /api/notifications`
- `POST /api/notifications/read`
- `GET|POST /api/tenant/notifications`
- `GET|POST /api/tenant/sla`
- `GET|POST /api/tenant/webhooks`
- `POST /api/tenant/webhooks/test`
- `GET /api/tenant/webhooks/deliveries`
- `GET /api/tenant/audit`
- `POST /api/orders`
- `GET /api/orders`
- `GET /api/orders/:orderId`
- `POST /api/orders/:orderId/dispatch`
- `POST /api/orders/:orderId/redispatch`
- `POST /api/call-center/orders`
- `POST /api/tenant/bookings`
- `GET /api/dispatch/tasks`
- `GET /api/dispatch/tasks/:dispatchJobId/candidates`
- `POST /api/dispatch/assign`
- `GET /api/driver/tasks`
- `GET /api/driver/tasks/:taskId`
- `POST /api/driver/tasks/:taskId/accept`
- `POST /api/driver/tasks/:taskId/reject`
- `POST /api/driver/tasks/:taskId/depart`
- `POST /api/driver/tasks/:taskId/arrived_pickup`
- `POST /api/driver/tasks/:taskId/start`
- `POST /api/driver/tasks/:taskId/complete`
- `GET|POST /api/call-center/sessions`
- `GET|POST /api/call-center/sessions/:callId`
- `POST /api/call-center/sessions/:callId/close`
- `POST /api/call-center/sessions/:callId/recording-callback`
- `GET|POST /api/complaints`
- `GET /api/complaints/:caseNo`
- `GET /api/complaints/:caseNo/timeline`
- `POST /api/complaints/:caseNo/resolve`
- `POST /api/complaints/:caseNo/close`
- `POST /api/complaints/:caseNo/reopen`
- `POST /api/complaints/:caseNo/sla-breach`
- `GET|POST /api/billing/tenant-profile`
- `GET|POST /api/billing/tenant-invoices`
- `GET /api/billing/tenant-invoices/:invoiceId`
- `GET|POST /api/billing/driver-fee-plans`
- `GET|POST /api/billing/driver-statements`
- `GET|POST /api/billing/reimbursements`
- `GET|POST /api/reporting/jobs`
- `GET /api/reporting/jobs/:jobId`
- `GET /api/reporting/dispatch-recordings`
- `GET|POST /api/filing/packages`
- `GET /api/filing/packages/:packageId`
- `GET|POST /api/forwarder/orders`
- `POST /api/forwarder/orders/:orderId/broadcast`
- `POST /api/forwarder/orders/:orderId/accept`
- `POST /api/forwarder/orders/:orderId/sync-status`
- `GET /api/forwarder/adapter-health`

Current status:

- Waves 1 through 6 baseline slices are implemented and executable.
- Wave 7 is in progress:
  - canonical SQL migrations and seeds are now adopted under `infra/migrations` and `infra/seeds`
  - auth/RBAC hardening, webhook/artifact runtime hardening, and wire-contract normalization are still in progress
- Most domain state is still being migrated from in-memory baseline services toward persistence-backed execution.

Helpful local commands:

- `pnpm dev:api`
- `pnpm db:init`
- `pnpm db:migrate`
- `pnpm db:seed`
- `pnpm db:verify`

LLM gateway runtime notes:

- `PLATFORM_ADMIN_ASSISTANT_ENABLED=false` keeps the assistant backend gated off by default.
- `LLM_GATEWAY_PROVIDER=mock` is the default and remains the fallback in local/CI when no `LLM_GATEWAY_API_KEY` is present.
- `LLM_GATEWAY_PROVIDER=openclaw` switches the Platform Admin assistant onto the embedded OpenClaw agent runtime.
- `OPENCLAW_AGENT_MODEL` defaults to `openai/gpt-5.5`; if only `LLM_GATEWAY_API_KEY` is mounted, the API maps it into the matching provider env for OpenClaw child runs.
- Real provider keys belong only in API runtime env / Secret Manager, never frontend runtime config.

Map provider runtime notes:

- `MAP_PROVIDER_BACKEND=mock` is the safe default for local development, tests, and CI.
- `MAP_PROVIDER_BACKEND=google` requires `GOOGLE_MAPS_GEOCODING_API_KEY` plus `GOOGLE_MAPS_ROUTES_API_KEY` in staging / production; otherwise the API startup guard fails closed.
- Set `MAP_PROVIDER_MODE=external` and `MAP_PROVIDER_NAME=google` to select the implemented Google Geocoding and Routes adapter. `POST /api/geo/route` returns distance, duration, and encoded polyline through the shared contract.
- Local / CI may still request `MAP_PROVIDER_BACKEND=google`; when the live keys are absent the runtime reports mock fallback in `/health` and keeps quota spend at zero.
- `MAP_PROVIDER_ALLOWED_ORIGINS` and `MAP_PROVIDER_BUDGET_ALERT_PCT` accept either `,` or `;` delimiters. Use `;` in deploy rails because `gcloud run deploy --set-env-vars` reserves `,`.
- `scripts/check-map-provider-config.sh` is the shared preflight for local shells and deploy workflows.
- `GET /health` and `GET /api/health` now include `mapProvider` readiness details alongside the base API status payload.
