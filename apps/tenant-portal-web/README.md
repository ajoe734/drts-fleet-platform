# Tenant Portal Web

> **SUNSET — NOT PRODUCTION**
>
> `apps/tenant-portal-web` has been retired as a production tenant portal target.
> **Do not deploy or extend this app for production use.**
>
> **Sunset rule:** `SUNSET-001-tenant-portal-web` — executed 2026-04-15 under FBP-007.
>
> **Reason:** `tenant-commute-hub` is the sole production tenant UI. It has been cut over to
> `drts-fleet-platform` as its exclusive BFF/authority (FBP-005, FBP-006). This internal
> Next.js shell served as a scaffolding reference during Phase 1 Wave D implementation but
> is not the canonical production surface.
>
> **Status:** frozen reference shell. No further feature development. May be hard-deleted
> once the wave-D scaffolding is no longer needed for historical reference.
>
> **Canonical production tenant portal:** `tenant-commute-hub` (external repo)
> **Canonical BFF/authority:** `drts-fleet-platform` → `/api/tenant/*`
> **Sunset record:** `docs/02-architecture/authority/fbp-007-tenant-portal-web-sunset.md`

---

Next.js scaffold shell — retained as a frozen reference only.

Historical placeholder routes (no longer maintained):

- `/`
- `/booking-list`
- `/reports`
