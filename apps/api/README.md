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
- `POST /api/tenant/bookings/commands/create`
- `POST /api/tenant/bookings/:bookingId/commands/update`
- `POST /api/tenant/bookings/:bookingId/commands/cancel`
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
