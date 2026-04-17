# Review Round 3 — Gemini

**Reviewer:** Gemini
**Baton received:** 2026-04-17T04:55:00Z
**Focus:** Infra/auth (GAP-004), DB migrations, CI impact of hotfixes, WebSocket scaling

---

## Q3: GAP-004 — Bootstrap Auth Hardening

**Code verified — `.github/workflows/deploy-staging.yml:317,342,356`:**

All three Cloud Run deploy steps include `--allow-unauthenticated`:

```yaml
--allow-unauthenticated \
```

This makes the staging service fully public — no Cloud IAM check at the Cloud Run level.
Any actor with the correct bootstrap headers can impersonate any tenant.

**Feasibility of `--no-allow-unauthenticated` for Phase 1 staging:**

E2E tests in `tests/e2e/` call the API directly with bootstrap headers.
If we remove `--allow-unauthenticated`, every E2E test call would get `403 Forbidden`
unless we also attach a valid OIDC token.

**Proposed minimal viable fix for Phase 1 (not full IAP):**

Add a `x-drts-internal-key` header check at the NestJS middleware level:

- API reads `DRTS_INTERNAL_KEY` env var (Cloud Run secret)
- Requests without the key get 401 immediately
- E2E tests include the key in headers (stored in GitHub Actions secret)

This is ~20 LOC in a NestJS middleware, zero Cloud IAP setup,
and doesn't change the bootstrap header auth semantics.

**Full Cloud IAP / OIDC (GAP-P2S3-001) remains Phase 2 Sprint 3.**
The minimal internal key check becomes **GAP-P2S1-006 revised scope.**

**CI impact:** Deploy workflow needs one env var injection:

```yaml
--set-env-vars="DRTS_INTERNAL_KEY=${{ secrets.DRTS_INTERNAL_KEY }}"
```

---

## DB Migration Numbering

**Verified:** Latest migration is `V0018__platform_earnings.sql`.
Next: `V0019`.

**Required migrations from backlog:**

| Migration                            | Task             | When     |
| ------------------------------------ | ---------------- | -------- |
| `V0019__driver_locations.sql`        | GAP-P2S2-005/006 | Sprint 2 |
| `V0020__settlement_driver_index.sql` | GAP-P2S3-006     | Sprint 3 |

**Schema proposal for `V0019__driver_locations.sql`:**

```sql
CREATE TABLE IF NOT EXISTS ops.phase1_driver_locations (
  driver_id       TEXT NOT NULL,
  lat             DOUBLE PRECISION NOT NULL,
  lng             DOUBLE PRECISION NOT NULL,
  accuracy_m      DOUBLE PRECISION,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (driver_id)
);
CREATE INDEX ON ops.phase1_driver_locations (updated_at DESC);
```

Single-row-per-driver (upsert on primary key) — stores latest known position only.
History tracking is out of scope for Phase 2 Sprint 2.

---

## CI Impact of Hotfixes

**GAP-P1-001 and GAP-P1-002 (DEMO_TENANT_ID — now moved to P2-S1):**

Confirm Codex Round 1 verdict: these are NOT P1 hotfixes.
Unit tests in `tests/unit/maintenance.test.ts` and E2E scripts use `tenant-demo-001`
as the tenant header. A DEMO_TENANT_ID removal would require updating:

- `tests/e2e/E2E-001-enterprise-dispatch.sh` (tenant header injection)
- `tests/e2e/E2E-004-tenant-attribution.sh` (multi-tenant assertion)

**GAP-P1-003 (webhook disclaimer):** Frontend-only change, zero CI risk.

**GAP-P1-004 (moved to P2-S1):** Enterprise dispatch test fixtures at
`tests/unit/owned-mobility.test.ts:258` use `minPhotoCount: 1` — confirmed no P1 change.

---

## WebSocket Gateway Scaling Assessment (GAP-P2S2-008)

NestJS WebSocket gateway on Cloud Run has a known limitation:
Cloud Run is **stateless/ephemeral** — horizontal scaling breaks WebSocket sessions
because connections are pinned to specific instances.

**Recommendation:** For Phase 2, use a **long-polling SSE endpoint** instead of
full WebSocket gateway for initial implementation:

- SSE works with Cloud Run multi-instance (no sticky sessions needed)
- NestJS has built-in SSE support via `@Sse()` decorator + `fromEvent(EventEmitter)`
- Phase 3 can upgrade to WebSocket with Redis pub-sub if needed

**Proposed revision:** GAP-P2S2-008 → "NestJS SSE endpoint for driver task events"
(instead of WebSocket gateway). GAP-P2S3-004 (ops-console SSE dispatch board) aligns.

---

## Summary Verdict

- **Auth GAP-P2S1-006 revised:** Minimal internal key middleware (20 LOC) instead of
  Cloud IAP. Unblocks staging security without E2E test disruption.
- **DB migrations:** V0019 (driver_locations), V0020 (settlement index). Schema proposed.
- **Hotfix CI safety:** P1-001/002 correctly moved to P2-S1 by Codex. Confirmed.
- **WebSocket → SSE:** Cloud Run stateless constraint makes SSE the correct choice
  for Phase 2. WebSocket with Redis pub-sub is Phase 3 concern.

**Passing baton to Copilot for Round 4.**
