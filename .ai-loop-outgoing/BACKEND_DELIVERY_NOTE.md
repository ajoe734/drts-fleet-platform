# Backend Delivery Note — Iteration 0

> Written by: VS Code LLM (drts-fleet-platform)
> Date: 2026-04-15
> Contract commit: 013be16d04113485050bbc833dd5c26778bf4350

## What's available now

All Wave A–E tasks in `drts-fleet-platform` are **done** as of 2026-04-15.

### Tenant Portal endpoints (available)

| Method | Path                                 | Description               |
| ------ | ------------------------------------ | ------------------------- |
| POST   | `/api/bookings`                      | Create booking            |
| GET    | `/api/bookings`                      | List bookings (paginated) |
| GET    | `/api/bookings/:id`                  | Get booking detail        |
| POST   | `/api/bookings/:id/cancel`           | Cancel booking            |
| GET    | `/api/passengers`                    | List passengers           |
| POST   | `/api/passengers`                    | Create passenger          |
| PUT    | `/api/passengers/:id`                | Update passenger          |
| DELETE | `/api/passengers/:id`                | Delete passenger          |
| GET    | `/api/addresses`                     | List addresses            |
| POST   | `/api/addresses`                     | Create address            |
| GET    | `/api/reports`                       | Tenant reports            |
| GET    | `/api/api-keys`                      | List API keys             |
| POST   | `/api/api-keys`                      | Create API key            |
| DELETE | `/api/api-keys/:id`                  | Revoke API key            |
| GET    | `/api/webhooks`                      | List webhook endpoints    |
| POST   | `/api/webhooks`                      | Register webhook          |
| DELETE | `/api/webhooks/:id`                  | Delete webhook            |
| GET    | `/api/billing/invoices`              | List invoices             |
| GET    | `/api/billing/invoices/:id/download` | Download invoice PDF      |
| GET    | `/api/audit`                         | Audit trail (append-only) |

### Auth

- Bearer token from Supabase auth is forwarded as `Authorization: Bearer <token>`
- All endpoints require authentication

### Contracts package

TypeScript types are published from `@drts/contracts`. Not yet installable as npm package — for now, copy type definitions from `drts-fleet-platform/packages/contracts/src/`.

## What's NOT yet available

- Real-time push notifications (Phase 2)
- Driver location stream (Phase 2)
- Platform admin cross-tenant endpoints (available but tenant UI doesn't need them)

## Next delivery

Will be announced in the next iteration's `BACKEND_DELIVERY_NOTE.md` after Lovable reports gaps in `API_GAP_REQUESTS.json`.
