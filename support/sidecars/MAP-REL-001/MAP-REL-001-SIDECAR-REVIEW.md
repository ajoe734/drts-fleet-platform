# MAP-REL-001 Sidecar Review Packet

**Sidecar task:** `MAP-REL-001-SIDECAR-REVIEW` (helper_kind `review_packet`)
**Parent task:** `MAP-REL-001` — Map/geofence production release gates
**Prepared by:** `Claude2` (sidecar owner)
**Handed off to:** `Codex2` (sidecar reviewer)
**Date:** `2026-07-04`

> Support artifact only. This packet does **not** modify canonical truth. It
> assembles and cross-checks the parent owner's evidence so the reviewer can
> verify `MAP-REL-001` quickly. All verdicts below restate the owner's
> evidence and the independent existence/lineage checks this sidecar ran; they
> are not a new approval. Final gate authority for `MAP-REL-001` stays with the
> parent reviewer (`Codex`) and parent owner (`Codex2`).

## 1. What / Where To Review

| Field | Value |
| --- | --- |
| Parent owner | `Codex2` |
| Parent reviewer | `Codex` |
| Owner branch | `codex2/map-rel-001` |
| Owner tip (verify against this) | `codex2/map-rel-001@6b6e51a0e` |
| Evidence-declared branch@SHA | `codex2/map-rel-001@8db98ccc7ec72e24b457a1e94164c1cf0813abf7` |
| Manifest branchSha | `8db98ccc7ec72e24b457a1e94164c1cf0813abf7` |
| Parent status at packet time | `review` |

**SHA-lag note (benign):** The owner's `MAP-REL-001-FINAL-EVIDENCE.md` and the
manifest both self-declare `8db98ccc7`, while the live owner tip is
`6b6e51a0e`. The delta is exactly two follow-on refresh commits
(`8db98ccc7 refresh readiness report head`, `6b6e51a0e refresh release evidence
to current head`). At `6b6e51a0e` the only change to the evidence file is the
`Branch@SHA` line moving from `03f4cf3a9e…` to its own parent `8db98ccc7…` — the
standard self-referential off-by-one (a commit cannot embed its own hash). No
gate verdict, gate matrix, or manifest row changed across these refreshes.
Reviewer should still run gates at the live tip `6b6e51a0e`.

## 2. Upstream Dependency Intake

Both declared dependencies are `PASS` on the owner branch and were spot-read for
this packet.

| Dependency | Verdict | Source | Notes |
| --- | --- | --- | --- |
| `MAP-QA-002` cross-surface E2E | PASS | `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md` | `E2E-MAP-001..006` rerun PASS against owner branch; `E2E-MAP-007` is honestly `MANUAL-UAT` (no device/simulator automation for driver trip map) — not a silent automated claim. |
| `MAP-OBS-001` observability | PASS | `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md` | Metrics/audit/alerts implemented + tested. Production exporter wiring, dashboards, staged traffic explicitly `EXTERNAL-GATED` outside the task. |

## 3. Acceptance → Evidence Map

Parent acceptance criteria mapped to the owner's repo-backed evidence. Every
path in column 3 was existence-verified on the owner tip (see §5).

| # | Acceptance criterion | Evidence / where verified |
| --- | --- | --- |
| 1 | `MAP-REL-001-FINAL-EVIDENCE.md` populated with real artifacts | `support/sidecars/MAP-REL-001/MAP-REL-001-FINAL-EVIDENCE.md` (no template markers; see §6 check) |
| 2 | Gate A–E PASS | Gate Matrix in FINAL-EVIDENCE; §4 below |
| 3 | Rollout & rollback documented | `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`, `apps/api/src/modules/service-area/service-area.service.ts`, `apps/api/src/modules/feature-flags/feature-flags.service.ts` |
| 4 | PostGIS / provider prerequisites confirmed | `infra/migrations/V0047__service_area_geofence_authority.sql`, `scripts/check-map-provider-config.sh`, `apps/api/tests/unit/map-provider-config.test.ts`, `apps/api/README.md`, `.github/workflows/deploy-staging.yml`, `.github/workflows/deploy-prod.yml` |
| 5 | Manifest productionEvidence items linked | `support/sidecars/MAP-REL-001/MAP-FLEETS-EXECUTION-MANIFEST-20260701.json` (11 items `FLEETS-MAP-001..011`) |
| 6 | Each FLEETS-MAP item closed PASS w/ artifact path/link | Manifest Closeout table in FINAL-EVIDENCE; §4 |
| 7 | Readiness blocker report generated & linked | `support/sidecars/MAP-REL-001/MAP-REL-001-READINESS-BLOCKER-REPORT.md`, `.../artifacts/readiness-blocker-report.json` |
| 8 | Blocker handoff notes posted or skipped as duplicates | `support/sidecars/MAP-REL-001/MAP-REL-001-BLOCKER-HANDOFF-NOTES.md`, `.../artifacts/blocker-handoff-notes.json` |
| 9 | Gap inventory closeout updated | `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260701.md` (`MAP-GAP-001..013` all assigned+PASS per FINAL-EVIDENCE) |
| 10 | No template markers / placeholder tokens remain | §6 grep check (run at tip) |
| 11 | Concrete branch@sha + artifact path/link evidence | FINAL-EVIDENCE header + Artifact Index (mind §1 SHA-lag) |
| 12 | Each PASS row includes row-level artifact path/link | Gate Matrix + Manifest Closeout rows in FINAL-EVIDENCE |
| 13 | Dispatch integrity verifier PASS | `scripts/verify-map-geofence-dispatch-integrity.mjs` → `.../artifacts/dispatch-integrity.json` (§5 re-run) |
| 14 | Readiness verifier PASS | `scripts/report-map-geofence-readiness-blockers.mjs` → `.../artifacts/readiness-blocker-report.json` (§5 re-run) |
| 15 | No unsupported production claim | Driver Gate D = documented simulator fallback (not native execution); OBS production wiring = `EXTERNAL-GATED`; E2E-MAP-007 = `MANUAL-UAT`. See §7. |

## 4. Gate & Manifest Summary (owner-declared)

| Gate | Verdict | Manifest item(s) |
| --- | --- | --- |
| Gate A — Callcenter safe | PASS | `FLEETS-MAP-001` |
| Gate B — Governance safe | PASS | `FLEETS-MAP-002` |
| Gate C — Ops safe | PASS | `FLEETS-MAP-003` |
| Gate D — Driver safe | PASS | `FLEETS-MAP-004` |
| Gate E — Degraded safe | PASS | `FLEETS-MAP-005` |
| Rollout/flags/provider/PostGIS/gap/blockers | PASS | `FLEETS-MAP-006..011` |

All 11 manifest `productionEvidence` rows carry PASS + artifact paths in the
owner's Manifest Closeout table.

## 5. Reviewer Verification Commands

Run from a checkout of the owner tip (`git switch codex2/map-rel-001 && git rev-parse HEAD` → expect `6b6e51a0e…`):

```bash
# Re-run the two verifiers cited by acceptance #13 and #14
node scripts/verify-map-geofence-dispatch-integrity.mjs      # expect PASS
node scripts/report-map-geofence-readiness-blockers.mjs       # expect PASS
node scripts/note-map-geofence-blocker-handoffs.mjs           # expect PASS / skip-no-unique-blockers

# Confirm the 11 manifest items are present
python3 -c "import json;d=json.load(open('support/sidecars/MAP-REL-001/MAP-FLEETS-EXECUTION-MANIFEST-20260701.json'));print(len(d['productionEvidence']),'items');[print(i['id']) for i in d['productionEvidence']]"
```

## 6. No-Placeholder Check

Run at the owner tip to satisfy acceptance #10:

```bash
grep -RInE 'TODO|TBD|PLACEHOLDER|<[A-Z_]+>|XXX|FIXME' \
  support/sidecars/MAP-REL-001/MAP-REL-001-FINAL-EVIDENCE.md \
  support/sidecars/MAP-REL-001/MAP-FLEETS-EXECUTION-MANIFEST-20260701.json
# expect: no matches
```

## 7. Reviewer Flags (must-check, none are blockers on their face)

1. **SHA-lag (§1)** — evidence/manifest declare `8db98ccc7`; live tip is
   `6b6e51a0e`. Benign self-referential off-by-one; re-run gates at tip.
2. **Gate D is documented-fallback, not native device** — `MAP-MOB-DRV-001`
   simulator fallback (`mobile-simulator-fallback-20260704.json`); the evidence
   deliberately does not claim native device execution. Confirm this framing is
   acceptable for release sign-off.
3. **`E2E-MAP-007` is `MANUAL-UAT`** in `MAP-QA-002` — honest manual step, not
   automated. Confirm the manual UAT is tracked for release.
4. **Observability production wiring is `EXTERNAL-GATED`** in `MAP-OBS-001` —
   exporter wiring / dashboards / staged traffic sit outside this task. Confirm
   these are owned by a separate release step, not silently assumed done.

## 8. Independent Checks This Sidecar Ran

- Existence-verified **37/37** artifact paths cited by `MAP-REL-001-FINAL-EVIDENCE.md`
  against `origin/codex2/map-rel-001` (owner tip) — 0 missing.
- Confirmed owner-tip lineage: `472750f33 → 8db98ccc7 → 6b6e51a0e`, and that the
  only evidence-file delta across the two refresh commits is the self-declared
  `Branch@SHA` line (no verdict/matrix/manifest changes).
- Confirmed both dependencies (`MAP-QA-002`, `MAP-OBS-001`) read `PASS` in their
  FINAL-EVIDENCE files.

## 9. Handoff

Packet ready for `Codex2` sidecar review. Recommended reviewer action: run §5
verifiers and §6 placeholder check at owner tip `6b6e51a0e`, confirm the four
§7 flags are acceptable, then approve this sidecar. Absorption of this packet
into the mainline `MAP-REL-001` review remains the parent owner/reviewer's call.
