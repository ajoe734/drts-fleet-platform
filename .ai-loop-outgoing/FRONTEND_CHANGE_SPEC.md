# Frontend Change Spec — Iteration 0 (Bootstrap)

> Written by: VS Code LLM (drts-fleet-platform)
> Date: 2026-04-15
> Iteration: 0 — initial wiring to core API

## Summary

This is the bootstrap iteration. No new UI pages are requested yet.
The goal is to establish the closed-loop protocol and verify that
`tenant-commute-hub` can reach `drts-fleet-platform` API endpoints.

## Scope

- [ ] Replace all direct Supabase calls for bookings / passengers / billing with calls to `drts-fleet-platform` REST API
- [ ] Add `Authorization: Bearer <token>` header to all API requests
- [ ] Add `X-Request-Id` header (UUID v4) to all mutating requests
- [ ] Add `Idempotency-Key` header to all POST command endpoints

## Base URL

```
VITE_CORE_API_BASE_URL=https://<staging-host>/api
```

Set this in `.env.local`. Do not hardcode.

## API endpoints available (from drts-fleet-platform)

See `BACKEND_DELIVERY_NOTE.md` for current delivery state.

## What Lovable should do

1. Read `FRONTEND_CHANGE_SPEC.json` for machine-readable task list
2. Implement each task, tracing to the spec entry id
3. After completing, write `LOVABLE_CHANGE_FEEDBACK.md` and `API_GAP_REQUESTS.json`
4. Commit and push
