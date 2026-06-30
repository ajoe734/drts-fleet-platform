# MAP Production Readiness Verifier

**Sidecar task:** `MAP-REL-001-SIDECAR-READINESS-VERIFY`

**Parent task:** `MAP-REL-001` - Map/geofence production release gates

**Parent owner/reviewer:** `Codex2` / `Codex`

**Sidecar owner/reviewer:** `Codex` / `Codex2`

**Scope boundary:** support artifact only. This verifier is a release guardrail; it does not replace implementation, E2E, observability, mobile UAT, or reviewer approval.

## 1. Purpose

`scripts/verify-map-geofence-production-readiness.mjs` is a fail-closed release readiness audit for the map/geofence wave.

It blocks any production-ready claim unless all of the following are true:

- Gate A-E required implementation tasks are `done` in `ai-status.json`.
- Final QA, OBS, and REL evidence files exist.
- `E2E-MAP-001` through `E2E-MAP-007` are explicitly marked `PASS`.
- Required observability topics are explicitly marked `PASS`.
- `Gate A` through `Gate E` are explicitly marked `PASS`.
- Required command families are present in the final evidence packet.

The verifier intentionally fails today because the fleet still has `review`, `todo`, and `backlog` blockers. That is correct behavior.

## 2. Command

Run from the repository root:

```bash
node scripts/verify-map-geofence-production-readiness.mjs
```

If the script lives in a sidecar worktree but the current machine truth is in another canonical root, pass both paths explicitly:

```bash
node scripts/verify-map-geofence-production-readiness.mjs \
  --root /home/edna/workspace/drts-fleet-platform \
  --status-file /home/edna/workspace/drts-fleet-platform/ai-status.json
```

Machine-readable output:

```bash
node scripts/verify-map-geofence-production-readiness.mjs --json
```

## 3. Required Final Evidence Files

The verifier expects these final closeout files:

| Evidence file | Required marks |
| --- | --- |
| `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md` | `E2E-MAP-001: PASS` through `E2E-MAP-007: PASS` |
| `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md` | `OBS-MAP-PROVIDER-OUTAGE: PASS`, `OBS-MAP-ADDRESS-AMBIGUITY: PASS`, `OBS-MAP-POLICY-DENIAL: PASS`, `OBS-MAP-COORDINATELESS-ATTEMPT: PASS`, `OBS-MAP-MANUAL-OVERRIDE: PASS`, `OBS-MAP-GEOMETRY-MUTATION: PASS` |
| `support/sidecars/MAP-REL-001/MAP-REL-001-FINAL-EVIDENCE.md` | `Gate A: PASS` through `Gate E: PASS` |

The exact text can include additional details after the mark, but each required row must include the required identifier and `PASS` on the same line.

## 4. Required Command Evidence

The final evidence packet must include the exact command family strings below:

```bash
pnpm --filter @drts/api test
pnpm --filter @drts/ui-web test
pnpm --filter @drts/ops-console-web typecheck
pnpm --filter @drts/platform-admin-web typecheck
pnpm --filter @drts/driver-app test
pnpm exec playwright test -c playwright.map-geofence-harness.config.ts
pnpm test:e2e
```

If a command is replaced by a narrower substitute, the final evidence file should still include the original command string and an explanation of the substitute. This keeps the verifier strict while allowing reviewer judgment.

## 5. Gate Task Coverage

The verifier checks task status by release gate:

| Gate | Required done tasks |
| --- | --- |
| Gate A | `MAP-BE-001`, `MAP-BE-002`, `MAP-BE-003`, `MAP-BE-004`, `MAP-BE-005`, `MAP-UI-001`, `MAP-FE-CALL-001`, `MAP-FE-OPS-001`, `MAP-QA-001`, `MAP-QA-002`, `MAP-OBS-001` |
| Gate B | `MAP-BE-006`, `MAP-UI-002`, `MAP-UI-002-HARDEN-001`, `MAP-UI-002-INTEGRATE-001`, `MAP-FE-ADM-001`, `MAP-FE-CALL-001`, `MAP-QA-002`, `MAP-OBS-001` |
| Gate C | `MAP-BE-003`, `MAP-BE-005`, `MAP-FE-OPS-001`, `MAP-QA-001`, `MAP-QA-002` |
| Gate D | `MAP-BE-003`, `MAP-BE-005`, `MAP-MOB-DRV-001`, `MAP-QA-002` |
| Gate E | `MAP-INFRA-001`, `MAP-UI-001`, `MAP-BE-004`, `MAP-BE-005`, `MAP-FE-CALL-001`, `MAP-FE-TEN-001`, `MAP-FE-CON-001`, `MAP-QA-001`, `MAP-QA-002`, `MAP-OBS-001` |

`review_approved`, `review`, `todo`, and `backlog` are not accepted as production-ready states. The release owner can still attach reviewer context, but the machine gate remains closed until the task is `done`.

## 6. Do-Not-Claim Rule

If the verifier exits non-zero, `MAP-REL-001` must not say:

- "production-ready"
- "Gate A/B/C/D/E pass"
- "E2E complete"
- "driver navigation validated"
- "provider outage safe"

Safe wording while it fails:

```text
Map/geofence release readiness is blocked by the verifier. See the FAIL rows for missing task status or final evidence.
```

## 7. Current Expected Result

At the time this sidecar was created, the expected verifier result is `FAIL` because:

- Multiple backend/UI/callcenter/foundation tasks are still `review`.
- `MAP-FE-ADM-001`, `MAP-QA-002`, `MAP-OBS-001`, and `MAP-REL-001` are still `todo`.
- Tenant, concierge/partner, and driver surfaces are still `backlog`.
- Final QA/OBS/REL evidence files do not exist yet.

That failure is useful: it prevents support plans from being mistaken for production evidence.
