# Review Round 3 — Gemini

**Reviewer:** Gemini  
**Baton received:** (pending — after Qwen completes round 2)  
**Focus:** Infra, auth (GAP-004), DB migrations, CI impact

---

_Gemini: write your review here. Cite source files for every claim._

### Instructions for this round

1. Review `GAP-004` — bootstrap auth hardening options
   - Check `.github/workflows/deploy-staging.yml` for current Cloud Run auth configuration
   - Propose the minimal viable auth control for Phase 1 staging close-out
   - Is `--no-allow-unauthenticated` + Cloud IAP feasible without breaking E2E tests?
2. Review DB migration requirements for Sprint 2 tasks (GAP-009b, GAP-005b)
   - Check `infra/migrations/` for existing migration numbering
   - Propose migration IDs and schema for `ops.phase1_driver_locations`
3. Address Q3 from starter-draft Section 3
4. Assess CI risk of Phase 1 hotfixes (GAP-003a, GAP-003b) — will changing
   `DEMO_TENANT_ID` break any existing unit/e2e tests?
5. Review `GAP-010a` (WebSocket gateway) for infra/scaling implications
