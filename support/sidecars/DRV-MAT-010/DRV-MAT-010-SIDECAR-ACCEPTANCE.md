# DRV-MAT-010 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `DRV-MAT-010` — Driver app productization verification pack
**Sidecar Owner:** `Claude2`
**Assigned Reviewer:** `Codex2`
**Parent Owner / Reviewer (current snapshot):** `Codex2` / `Codex`
**Generated:** `2026-05-05` (UTC) · **Snapshot timestamp:** `2026-05-05T12:42:49Z`
**Snapshot Status:** Parent `DRV-MAT-010` is `review` in `ai-status.json` (`last_update: 2026-05-05T12:40:42Z`). The parent's working tree contains uncommitted edits to `apps/driver-app/app/trip.tsx`, `docs/03-runbooks/driver-app-productization-execution-packet-20260504.md`, the supervisor state files, and two unrelated sidecars. The verification packet itself lives at `support/sidecars/DRV-MAT-010/DRV-MAT-010-VERIFICATION-PACKET.md` and is the authoritative artifact for the four DRV-MAT-010 acceptance bullets. There is no parent closeout commit yet; `commit_hash` / `push_*` fields are not present on the parent task. This sidecar is a support-only acceptance frame. It does not finalize the parent task and does not pre-sign any closeout evidence.

> **Provenance.** Repo HEAD at packet generation is `e4edb86 feat(DRV-MAT-008): materialize driver earnings dashboard` on branch `codex/dev-deploy-backend-android`. The parent task references `evidence_refs[".orchestrator/evidence/gemini2-20260505T123303Z-d36dd929.json"]` from a Gemini2 round and the sidecar carries `.orchestrator/evidence/codex-20260505T123923Z-8cbe1d3e.json` as auto-reassignment evidence. This sidecar treats both as upstream context, not as substitutes for parent reviewer approval.

---

## 1) Scope Boundary

This sidecar curates support-only artifacts for `DRV-MAT-010`:

- In scope: acceptance framing pinned to the in-flight verification packet, dependency map, repo baseline, reviewer hotspot guidance, handoff wording, and notes for the parent owner before the next handback.
- Out of scope: editing `support/sidecars/DRV-MAT-010/DRV-MAT-010-VERIFICATION-PACKET.md`, `apps/driver-app/...`, the L1/L2 product truth, the design plan, or the execution packet (`docs/03-runbooks/driver-app-productization-execution-packet-20260504.md`). The sidecar does not commit, push, run typecheck/tests, or claim parent verification on behalf of the parent owner.

---

## 2) Current State Baseline

Anchored on `git status` + working tree at `e4edb86` and the canonical documents listed in §4.

### 2.1 Parent task machine state

- `ai-status.json` entry for `DRV-MAT-010`: `status=review`, `owner=Codex2`, `reviewer=Codex`, `phase="Driver App Productization"`, `last_update=2026-05-05T12:40:42Z`, `next="Verification packet ready at support/sidecars/DRV-MAT-010/DRV-MAT-010-VERIFICATION-PACKET.md. Re-ran pnpm --filter @drts/driver-app typecheck (pass) and pnpm --filter @drts/driver-app test (8 files / 26 tests passed). Packet records the exact '/' redirect, route-by-route PASS/N/A results with code anchors, Stack route inventory from app/_layout.tsx, and the visual-evidence blocker with exact environment failures: adb not found, emulator not found."`
- `depends_on=["DRV-MAT-002","DRV-MAT-003","DRV-MAT-004","DRV-MAT-005","DRV-MAT-006","DRV-MAT-007","DRV-MAT-008","DRV-MAT-009"]`. All eight dependencies are `done` in `ai-status.json` (see §4.1).
- `acceptance` from machine truth (4 bullets): `route checklist complete`, `typecheck recorded`, `tests recorded`, `visual evidence or blocker recorded`.
- `artifacts`: `support/sidecars/DRV-MAT-010`, `docs/03-runbooks/driver-app-productization-execution-packet-20260504.md`. The verification packet (`DRV-MAT-010-VERIFICATION-PACKET.md`) lives under the declared sidecar directory; the runbook is co-declared because verification status notes were added there.

### 2.2 Working tree snapshot

`git status --short` at packet time:

```
 M ai-status.json
 M apps/driver-app/app/trip.tsx
 M current-work.md
 M docs-site/ai-status.json
 M docs-site/current-work.md
 M docs/03-runbooks/driver-app-productization-execution-packet-20260504.md
 M support/sidecars/DRV-MAT-001/DRV-MAT-001-SIDECAR-ACCEPTANCE.md
 M support/sidecars/DRV-MAT-006/DRV-MAT-006-SIDECAR-ACCEPTANCE.md
?? docs-site/driver-app-verification-DRV-MAT-010.md
?? support/sidecars/DRV-MAT-009/DRV-MAT-009-SIDECAR-REVIEW.md
?? support/sidecars/DRV-MAT-010/
```

Classification (parent owner Codex2's slice vs. unrelated drift):

- Parent slice: `apps/driver-app/app/trip.tsx`, `docs/03-runbooks/driver-app-productization-execution-packet-20260504.md`, the new `support/sidecars/DRV-MAT-010/` directory (containing the verification packet plus this sidecar).
- Supervisor state churn (normal for an in-flight task): `ai-status.json`, `current-work.md`, `docs-site/ai-status.json`, `docs-site/current-work.md`.
- Stale read-only-mirror artifact from the first review round: `docs-site/driver-app-verification-DRV-MAT-010.md` (see §2.7).
- Unrelated, parallel work from other lanes (out of DRV-MAT-010 scope): `support/sidecars/DRV-MAT-001/DRV-MAT-001-SIDECAR-ACCEPTANCE.md`, `support/sidecars/DRV-MAT-006/DRV-MAT-006-SIDECAR-ACCEPTANCE.md`, `support/sidecars/DRV-MAT-009/DRV-MAT-009-SIDECAR-REVIEW.md`.

### 2.3 Verification packet (`support/sidecars/DRV-MAT-010/DRV-MAT-010-VERIFICATION-PACKET.md`)

The packet is the authoritative artifact for the four canonical acceptance bullets and is structured as:

- §1 Verification Summary records `pnpm --filter @drts/driver-app typecheck` and `pnpm --filter @drts/driver-app test` both passing on `2026-05-05` (8 files / 26 tests). It is explicit that visual evidence is **blocked**, not missing, due to absent Android tooling (`adb: not found`, `emulator: not found`).
- §2 Command Evidence captures the literal commands and observed pass output (exit 0).
- §3 Route Smoke Inventory enumerates the nine registered Expo Router screens and records that `/` is a `Redirect` (`apps/driver-app/app/index.tsx:3-4`) — directly answering the first review-round finding that "/ is only a Redirect to /onboarding".
- §4 Route-By-Route Checklist tabulates `PASS / N/A / BLOCKED` per route × state with line-anchored evidence into the current screen sources (`apps/driver-app/app/{onboarding,jobs,trip,incident,earnings,platform-presence,shift,settings}.tsx`).
- §5 Visual Evidence Blocker records the exact environment failures (`adb: not found`, `emulator: not found`) and explicitly classifies the result as an environment/tooling blocker, not a runtime regression.
- §6 Acceptance Mapping marks each of the four canonical bullets `PASS`, with the visual evidence row satisfied via §5 blocker record.
- §7 Reviewer Focus calls out that the packet must live under `support/sidecars/DRV-MAT-010/` (matching machine truth `artifacts`), that `/` must read as a redirect, and that the visual section must record an exact blocker rather than "pending".

### 2.4 Stack route registration anchor

`apps/driver-app/app/_layout.tsx:111-122` registers `index`, `onboarding`, `jobs`, `trip`, `incident`, `earnings`, `platform-presence`, `shift`, `settings` — nine screens. The verification packet's route table covers all nine and treats `/` as a redirect rather than a separate screen, which matches the registration.

### 2.5 Runbook delta (open review feedback)

`docs/03-runbooks/driver-app-productization-execution-packet-20260504.md` carries an uncommitted Verification Status block at lines 308-312 in the working tree:

```
**Verification Status:**
- **Typecheck:** Completed successfully.
- **Tests:** 26 tests passed across 8 files.
- **Visual Evidence:** Pending. Local environment limitations prevent generating emulator/Expo dev-client screenshots at this time. Awaiting further instructions or environment setup to capture visual evidence.
- **Blockers:** None identified for typecheck or tests. Visual evidence is pending due to environment constraints.
```

This contradicts the verification packet's record:

- Packet §5 records `BLOCKED` with exact failures (`adb: not found`, `emulator: not found`).
- Runbook block says `Pending` with `Blockers: None`.

This is the exact wording delta that reviewer `Codex` flagged in the second failed-review note (`ai-activity-log.jsonl` entry: "docs/03-runbooks/driver-app-productization-execution-packet-20260504.md:311-312 still says visual evidence is pending and blockers are none, which contradicts the packet's exact blocker record (adb not found, emulator not found) and does not satisfy the artifact-level acceptance for blocked visual evidence."). Parent owner `Codex2` recorded an `Addressing review feedback: sync runbook visual-evidence blocker wording...` progress note but the working tree still has the contradictory text. AC-4 of the parent task is gated on this reconciliation, not on the packet itself.

### 2.6 `apps/driver-app/app/trip.tsx` working-tree edit

`git diff HEAD apps/driver-app/app/trip.tsx` shows ~42 insertions / 5 deletions: the SOS link in the trip footer is being upgraded from a plain `Text style={styles.link}` into a `SharedActionButton title="開啟 SOS 緊急通報" variant="danger"` inside a new `sosCard` wrapper. The change imports `ActionButton as SharedActionButton` from `@/components/ui/ActionButton` and adds new styles (`sosCard`, `sosEyebrow`, `sosTitle`, `sosNote`, `sosButton`).

Scope classification (reviewer to confirm):

- `trip.tsx` is the canonical `DRV-MAT-004` artifact (closeout commit `7fc93c3`).
- DRV-MAT-010's write scope per the execution packet (line 285-286) is "docs/evidence only unless fixing defects discovered during verification".
- The diff is a UI uplift (adopt the shared `ActionButton` danger variant for the SOS entry point), not a regression fix surfaced by route smoke. The verification packet does not record a defect on this surface (`/trip` row is `PASS` across the board).
- The reviewer should classify this as either: (a) a verification-discovered defect fix that legitimately rides in DRV-MAT-010 — in which case the runbook §`DRV-MAT-010` Acceptance section should record it explicitly, or (b) DRV-MAT-004 follow-up that should not ride DRV-MAT-010's commit. The sidecar does not pre-sign either path.

### 2.7 `docs-site/driver-app-verification-DRV-MAT-010.md` stale mirror artifact

This untracked file under `docs-site/` is the original prose-only verification document that the first review round rejected ("submitted evidence pack does not satisfy DRV-MAT-010 acceptance ... only packet found is docs-site/driver-app-verification-DRV-MAT-010.md, which records generic expected states"). It violates two rules at once:

- It does not satisfy the packet's per-route checklist requirement; the canonical DRV-MAT-010 evidence is now `support/sidecars/DRV-MAT-010/DRV-MAT-010-VERIFICATION-PACKET.md`.
- `docs-site/*` is a read-only mirror per `AI_COLLABORATION_GUIDE.md §0.5`. Authoring a hand-written file in `docs-site/` directly is an out-of-band write to the mirror.

The sidecar does not delete this file — it flags it for the parent owner / parent reviewer to either (a) delete before closeout commit so the mirror stays read-only, or (b) replace via the normal sync flow. The packet under `support/sidecars/DRV-MAT-010/` is the canonical artifact.

### 2.8 Out-of-scope working-tree drift

- `support/sidecars/DRV-MAT-001/DRV-MAT-001-SIDECAR-ACCEPTANCE.md`: large rewrite of the DRV-MAT-001 sidecar, unrelated to DRV-MAT-010.
- `support/sidecars/DRV-MAT-006/DRV-MAT-006-SIDECAR-ACCEPTANCE.md`: refresh of the DRV-MAT-006 sidecar, unrelated to DRV-MAT-010.
- `support/sidecars/DRV-MAT-009/DRV-MAT-009-SIDECAR-REVIEW.md` (untracked): DRV-MAT-009 review packet, unrelated to DRV-MAT-010.
- `ai-status.json`, `current-work.md`, `docs-site/ai-status.json`, `docs-site/current-work.md`: supervisor state churn from the in-flight task plus unrelated lane status edits.

These should not ride DRV-MAT-010's closeout commit. The parent owner should keep the DRV-MAT-010 commit scoped to: (a) `docs/03-runbooks/driver-app-productization-execution-packet-20260504.md`, (b) `support/sidecars/DRV-MAT-010/DRV-MAT-010-VERIFICATION-PACKET.md`, (c) optionally `apps/driver-app/app/trip.tsx` if classified as in-scope per §2.6, (d) optionally a deletion of `docs-site/driver-app-verification-DRV-MAT-010.md` per §2.7.

Conclusion (canonical wording only):

- AC-1 `route checklist complete`: implementation evidence visible in the verification packet §3-§4 per §2.3, subject to parent reviewer confirmation of the [ ] rows in §3.
- AC-2 `typecheck recorded`: implementation evidence visible in the verification packet §1-§2 per §2.3, subject to parent reviewer confirmation.
- AC-3 `tests recorded`: implementation evidence visible in the verification packet §1-§2 per §2.3, subject to parent reviewer confirmation.
- AC-4 `visual evidence or blocker recorded`: **at risk**. The verification packet §5 records the blocker correctly, but the runbook block at lines 308-312 still says `Pending` / `Blockers: None`. The reviewer's most recent failed-review note treats this contradiction as breaking the artifact-level acceptance until the runbook wording is reconciled with the packet (see §3 AC-4, §5 hotspot #1, §9 note #1).

Drift status (current machine truth): the runbook wording delta and the `docs-site/` mirror artifact are recorded in this sidecar but are **not yet** reflected as explicit follow-ups in parent machine truth `DRV-MAT-010.next`. The latest parent `next` only references "Verification packet ready ..." rather than the open runbook wording fix. The sidecar flags both for the parent owner.

---

## 3) Parent Acceptance Framing

This restates the parent acceptance bullets against the in-flight working tree. The sidecar checklist marks observation rows; reviewer responsibilities remain unchecked.

### AC-1 — `route checklist complete`

- [x] `support/sidecars/DRV-MAT-010/DRV-MAT-010-VERIFICATION-PACKET.md` §3 enumerates the nine registered routes from `apps/driver-app/app/_layout.tsx:111-122` and explicitly classifies `/` as a redirect via `apps/driver-app/app/index.tsx:3-4`.
- [x] §4 tabulates `PASS / N/A / BLOCKED` per route × state (`Ready`, `Empty / Disabled`, `Loading`, `Error / Degraded`) with line-anchored evidence into the current screen sources for all nine routes.
- [ ] Reviewer should confirm each row's anchors still resolve in the current working tree (e.g. `apps/driver-app/app/trip.tsx:664-671` for the `/trip` Loading branch is consistent with the in-flight `trip.tsx` edit). The trip.tsx working-tree edit (§2.6) is small enough that the existing anchors should still hold, but the reviewer should not accept stale anchors as a closeout shortcut.
- [ ] Reviewer should not accept any row downgraded to "expected state" prose; the packet replaces the earlier `docs-site/driver-app-verification-DRV-MAT-010.md` style on purpose.

### AC-2 — `typecheck recorded`

- [x] The packet §1-§2 records `pnpm --filter @drts/driver-app typecheck` literal command + observed PASS output + exit code 0 on 2026-05-05.
- [ ] Reviewer should re-run typecheck against the closeout commit (not against the sidecar packet) and confirm the working-tree edit to `apps/driver-app/app/trip.tsx` (§2.6) does not regress typecheck once committed.

### AC-3 — `tests recorded`

- [x] The packet §1-§2 records `pnpm --filter @drts/driver-app test` literal command + observed pass output (`Test Files 8 passed (8) / Tests 26 passed (26)`) + exit code 0 on 2026-05-05.
- [ ] Reviewer should re-run tests against the closeout commit and confirm the same 8/26 result.

### AC-4 — `visual evidence or blocker recorded`

- [x] Verification packet §5 records the exact environment blocker (`adb: not found`, `emulator: not found`) and classifies it as environment/tooling, not runtime regression.
- [ ] **Open delta.** `docs/03-runbooks/driver-app-productization-execution-packet-20260504.md` lines 308-312 still carry the prior `Pending` / `Blockers: None` wording in the working tree. Reviewer `Codex` already flagged this as the blocker for AC-4 in the second failed-review note. Parent owner `Codex2` must reconcile the runbook wording with the packet's exact-blocker record before the next handoff. Acceptable resolutions are: (a) replace the block with `BLOCKED` wording naming the exact `adb` / `emulator` failures and pointing to the packet, or (b) remove the runbook-side status block entirely and rely on the packet as the single source.
- [ ] Reviewer should not interpret AC-4 as requiring screenshots. The acceptance bullet is "visual evidence **or blocker** recorded"; the blocker form is sufficient as long as it is exact and consistent across the packet and the runbook.
- [ ] Reviewer should not accept `docs-site/driver-app-verification-DRV-MAT-010.md` as evidence for AC-4. That file is in the read-only mirror and predates the sidecar packet; see §2.7.

---

## 4) Dependency Map

### 4.1 Formal Machine Dependencies

| Dep           | Source                   | Status | Commit    | Why It Matters                                                                                                                                                 |
| ------------- | ------------------------ | ------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DRV-MAT-002` | `DRV-MAT-010.depends_on` | `done` | `19879bc` | Shell + workstation home + raw-route header suppression. Powers the `/onboarding` redirect target and the unprovisioned routing posture verified in packet §3. |
| `DRV-MAT-003` | `DRV-MAT-010.depends_on` | `done` | `a479ab6` | Task inbox materialization. Powers the `/jobs` row (loading, disabled, ready, empty, degraded) verified in packet §4.                                          |
| `DRV-MAT-004` | `DRV-MAT-010.depends_on` | `done` | `7fc93c3` | Trip workflow command center. Powers the `/trip` row in packet §4. Owns `apps/driver-app/app/trip.tsx`, which has an uncommitted DRV-MAT-010 edit (§2.6).      |
| `DRV-MAT-005` | `DRV-MAT-010.depends_on` | `done` | `86700a8` | SOS incident flow. Powers the `/incident` row (loading, disabled, ready, error, confirm) verified in packet §4.                                                |
| `DRV-MAT-006` | `DRV-MAT-010.depends_on` | `done` | `28c17ed` | Driver shift + attendance materialization. Powers the `/shift` row in packet §4.                                                                               |
| `DRV-MAT-007` | `DRV-MAT-010.depends_on` | `done` | `b7e14a4` | Driver platform status UX (PlatformStatusCard / PlatformBinding). Powers the `/platform-presence` row in packet §4.                                            |
| `DRV-MAT-008` | `DRV-MAT-010.depends_on` | `done` | `e4edb86` | Driver earnings dashboard. Powers the `/earnings` row in packet §4. Repo HEAD at packet generation.                                                            |
| `DRV-MAT-009` | `DRV-MAT-010.depends_on` | `done` | `c13cbf4` | Driver settings materialization. Powers the `/settings` row in packet §4.                                                                                      |

All eight dependencies are `done` with task-scoped commits and pushes recorded in machine truth. The verification packet's per-route anchors trace into each dependency's canonical artifact.

### 4.2 Practical Review Anchors

| ID     | Anchor                                                                                              | Why It Matters                                                                                                                               |
| ------ | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| D-P-1  | `docs/03-runbooks/driver-app-productization-execution-packet-20260504.md:283-306`                   | Parent acceptance bullets (4) and verification commands (`pnpm --filter @drts/driver-app typecheck`, `pnpm --filter @drts/driver-app test`). |
| D-P-2  | `docs/03-runbooks/driver-app-productization-execution-packet-20260504.md:308-312`                   | Working-tree Verification Status block — open AC-4 wording delta (§2.5).                                                                     |
| D-P-3  | `docs/02-architecture/driver-app-productization-design-plan-20260504.md`                            | Design plan covering every `/route` and the productization required-states list.                                                             |
| D-P-4  | `support/sidecars/DRV-MAT-010/DRV-MAT-010-VERIFICATION-PACKET.md:1-128`                             | Authoritative parent artifact (verification summary, command evidence, route smoke, route-by-route checklist, blocker, mapping).             |
| D-P-5  | `apps/driver-app/app/_layout.tsx:111-122`                                                           | Stack route registration the packet's §3 inventory cites.                                                                                    |
| D-P-6  | `apps/driver-app/app/index.tsx:1-4`                                                                 | `/` → `/onboarding` redirect, replacing the earlier "home/dashboard" misclassification.                                                      |
| D-P-7  | `apps/driver-app/app/{onboarding,jobs,trip,incident,earnings,platform-presence,shift,settings}.tsx` | Per-route screen sources for the packet's §4 anchors.                                                                                        |
| D-P-8  | `ai-status.json` entry for `DRV-MAT-010`                                                            | Parent machine truth; current `status=review`, owner `Codex2`, reviewer `Codex`, last_update `2026-05-05T12:40:42Z`.                         |
| D-P-9  | `ai-activity-log.jsonl` entries scoped to `DRV-MAT-010`                                             | Two reviewer-failed-review notes from `Codex` (artifact-path round; runbook-wording round) and the latest progress notes.                    |
| D-P-10 | `docs-site/driver-app-verification-DRV-MAT-010.md`                                                  | Stale read-only-mirror artifact predating the sidecar packet (§2.7). Reviewer must classify before closeout.                                 |

### 4.3 Informative Consumer Map

| Consumer                   | Status                          | Why It Matters                                                                                                                                |
| -------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Parent owner `Codex2`      | `in_progress` (within `review`) | Owns the runbook wording reconciliation and the verification packet. Will produce the closeout commit + push when AC-4 wording is reconciled. |
| Parent reviewer `Codex`    | `next`                          | Will gate AC-1..AC-4 again after the runbook wording fix; already accepted route smoke + commands.                                            |
| Sidecar reviewer `Codex2`  | `next`                          | Will receive this packet for the support-only sidecar review handoff.                                                                         |
| Wave gate                  | `pending`                       | The execution packet (line 322-323) declares DRV-MAT-010 the final gate before claiming the driver-app productization wave is complete.       |
| Operations / handover docs | `downstream`                    | Whoever writes the wave-close summary should cite the four AC bullets from the packet rather than re-deriving them.                           |

---

## 5) Reviewer Hotspots (sidecar reviewer `Codex2`)

When reviewing this sidecar packet, prioritize:

1. The packet must reflect that parent `DRV-MAT-010` is `review` under owner `Codex2` / reviewer `Codex` at `2026-05-05T12:40:42Z`, with no parent commit yet. Do not let the packet pre-sign `commit_hash` / `push_*` fields or claim AC-4 has been re-approved by the parent reviewer.
2. The acceptance framing must trace to higher-precedence sources (D-P-1, D-P-3) and not invent acceptance language. The four canonical bullets are `route checklist complete`, `typecheck recorded`, `tests recorded`, `visual evidence or blocker recorded`.
3. The runbook wording delta at `docs/03-runbooks/driver-app-productization-execution-packet-20260504.md:308-312` is the open AC-4 blocker (§2.5). The packet must keep this flagged and must not pre-sign that the parent owner has reconciled it. If the parent owner reverts the block instead of rewriting it, that is a valid resolution and the sidecar does not require either path.
4. The `apps/driver-app/app/trip.tsx` working-tree edit (§2.6) is in DRV-MAT-004 territory by ownership. The reviewer must confirm whether to (a) classify it as a verification-discovered defect fix and ride DRV-MAT-010, or (b) carve it out into a separate slice. Either decision is acceptable; the sidecar only flags it.
5. The packet must keep `docs-site/driver-app-verification-DRV-MAT-010.md` framed as a stale mirror artifact (§2.7), not as evidence for AC-4. Reviewer should not accept a closeout commit that leaves the file under `docs-site/` unless it is justified as a sync output (which it is not — it predates the canonical packet).
6. The packet must not edit anything under `apps/`, `packages/`, `services/`, `runtime/`, the design plan, the execution packet, or the verification packet. Only `support/sidecars/DRV-MAT-010/DRV-MAT-010-SIDECAR-ACCEPTANCE.md` and machine state via `scripts/ai-status.sh` / `scripts/ai_status.py` are in scope.
7. Verify the dependency map status column matches `ai-status.json` (all eight dependencies should be `done`). Do not let an unrelated wave-001 or wave-002 task sneak into the dependency table.
8. The sidecar may finalize without a code commit. Closeout uses `NO_COMMIT_REQUIRED=1` per the AI Collaboration Guide §5 (sidecar acceptance packets are an explicit non-canonical case).

---

## 6) Evidence Inventory

| ID   | Evidence                         | Location                                                                                                  |
| ---- | -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| E-1  | Parent task machine state        | `ai-status.json` entry for `DRV-MAT-010`                                                                  |
| E-2  | Sidecar task machine state       | `ai-status.json` entry for `DRV-MAT-010-SIDECAR-ACCEPTANCE`                                               |
| E-3  | Parent execution instructions    | `docs/03-runbooks/driver-app-productization-execution-packet-20260504.md:283-306`                         |
| E-4  | Parent runbook open delta        | `docs/03-runbooks/driver-app-productization-execution-packet-20260504.md:308-312` (working tree)          |
| E-5  | Verification packet              | `support/sidecars/DRV-MAT-010/DRV-MAT-010-VERIFICATION-PACKET.md`                                         |
| E-6  | Stack route registration         | `apps/driver-app/app/_layout.tsx:111-122`                                                                 |
| E-7  | Index redirect                   | `apps/driver-app/app/index.tsx:1-4`                                                                       |
| E-8  | Per-route screen sources         | `apps/driver-app/app/{onboarding,jobs,trip,incident,earnings,platform-presence,shift,settings}.tsx`       |
| E-9  | Trip working-tree edit           | `git diff HEAD apps/driver-app/app/trip.tsx`                                                              |
| E-10 | Stale mirror artifact            | `docs-site/driver-app-verification-DRV-MAT-010.md` (untracked)                                            |
| E-11 | Reviewer failed-review notes     | `ai-activity-log.jsonl` entries by `Codex` for `DRV-MAT-010` (artifact-path round; runbook-wording round) |
| E-12 | Auto-reassignment evidence       | `.orchestrator/evidence/codex-20260505T123923Z-8cbe1d3e.json`                                             |
| E-13 | Parent owner re-handoff evidence | `.orchestrator/evidence/gemini2-20260505T123303Z-d36dd929.json` (referenced by parent `evidence_refs`)    |
| E-14 | Repo HEAD baseline               | `e4edb86 feat(DRV-MAT-008): materialize driver earnings dashboard`                                        |
| E-15 | Driver-app verification commands | `pnpm --filter @drts/driver-app typecheck`; `pnpm --filter @drts/driver-app test`                         |

---

## 7) Sidecar Acceptance Checklist

### AC-S1 — `Create support artifacts only`

- [x] Only writes `support/sidecars/DRV-MAT-010/DRV-MAT-010-SIDECAR-ACCEPTANCE.md`.
- [x] Content is acceptance framing, dependency map, baseline, reviewer guidance, and pre-closeout notes — no new canonical truth.
- [x] No claim that this sidecar implements DRV-MAT-010 verification, runs typecheck/tests, captures screenshots, or completes parent closeout.

### AC-S2 — `Do not edit canonical truth`

- [x] No edits to `phase1_*.md`, `docs/02-architecture/...` design plan, `docs/03-runbooks/...` execution packet, `support/sidecars/DRV-MAT-010/DRV-MAT-010-VERIFICATION-PACKET.md`, `apps/driver-app/...`, `packages/...`, `services/...`, `runtime/...`, or any test file.
- [x] Machine truth changes go through `scripts/ai-status.sh` / `scripts/ai_status.py` only.
- [x] All references in §2-§6 cite higher-precedence sources rather than restating product semantics.

### AC-S3 — `Hand off the packet to the assigned reviewer`

- [x] §8 handoff command targets sidecar reviewer `Codex2` per `DRV-MAT-010-SIDECAR-ACCEPTANCE.reviewer`.
- [ ] Reviewer `Codex2` may `approve` (sidecar passes) or `reopen` / `blocker` (with reason). Owner returns to revise if reopened.

---

## 8) Handoff Command

Owner (`Claude2`) -> Sidecar Reviewer (`Codex2`)

```bash
AI_NAME=Claude2 scripts/ai-status.sh handoff DRV-MAT-010-SIDECAR-ACCEPTANCE Codex2 \
  "Drafted support-only DRV-MAT-010 acceptance packet at support/sidecars/DRV-MAT-010/DRV-MAT-010-SIDECAR-ACCEPTANCE.md against the in-flight working tree (parent in review under Codex2/Codex, last_update 2026-05-05T12:40:42Z; no parent commit yet). Sections cover acceptance framing pinned to the four canonical bullets (route checklist complete, typecheck recorded, tests recorded, visual evidence or blocker recorded), a dependency map citing DRV-MAT-002..009 all done with task-scoped commits, a baseline summary of the verification packet at support/sidecars/DRV-MAT-010/DRV-MAT-010-VERIFICATION-PACKET.md and the Stack route inventory at apps/driver-app/app/_layout.tsx:111-122, and reviewer hotspots. Flagged the open AC-4 blocker: docs/03-runbooks/driver-app-productization-execution-packet-20260504.md:308-312 still says Pending / Blockers: None and contradicts the packet's BLOCKED record (adb not found, emulator not found). Also flagged the apps/driver-app/app/trip.tsx working-tree edit (SOS link → SharedActionButton danger variant) as DRV-MAT-004 territory needing scope classification, and the stale docs-site/driver-app-verification-DRV-MAT-010.md mirror artifact for cleanup before parent closeout. Did not edit canonical truth, did not run typecheck/tests, and did not modify the verification packet."
```

---

## 9) Notes For Parent Owner (`Codex2`) — Pre-`done` Reference

These are follow-up references for the parent owner before parent closeout. They are **not** new acceptance bars; they are observations the sidecar lane recorded while building the packet.

1. The open AC-4 blocker is the runbook wording at `docs/03-runbooks/driver-app-productization-execution-packet-20260504.md:308-312`. Reconcile it with the verification packet's exact blocker record (`adb: not found`, `emulator: not found`) before re-handoff. Either rewrite the block to read `Visual Evidence: BLOCKED` with the exact failures and a pointer to `support/sidecars/DRV-MAT-010/DRV-MAT-010-VERIFICATION-PACKET.md`, or delete the runbook block entirely and treat the packet as the single source. Both are acceptable; pick one and move on.
2. Keep the closeout commit scoped. The DRV-MAT-010 commit should land: (a) `docs/03-runbooks/driver-app-productization-execution-packet-20260504.md` (post-reconciliation), (b) `support/sidecars/DRV-MAT-010/DRV-MAT-010-VERIFICATION-PACKET.md`, and optionally (c) `apps/driver-app/app/trip.tsx` if you classify the SOS-button uplift as in-scope (§2.6), and (d) the deletion of `docs-site/driver-app-verification-DRV-MAT-010.md` (§2.7). Do not let unrelated working-tree drift (DRV-MAT-001 / DRV-MAT-006 / DRV-MAT-009 sidecars, supervisor state files) ride this commit.
3. If you choose to ride the `trip.tsx` SOS uplift on DRV-MAT-010, record the rationale in the commit body (e.g. "verification surfaced inconsistency with DRV-MAT-005 incident flow entry posture; aligned trip footer to shared ActionButton danger variant") and add `apps/driver-app/app/trip.tsx` to `DRV-MAT-010.artifacts`. Otherwise revert the diff before commit so DRV-MAT-004's closed surface stays untouched.
4. Verification command pattern stays `pnpm --filter @drts/driver-app typecheck && pnpm --filter @drts/driver-app test`. Re-run both against the closeout commit and record the two literal commands plus their pass output in the commit body, mirroring the DRV-MAT-006 / DRV-MAT-007 / DRV-MAT-009 closeout style.
5. Required commit trailers per AI Collaboration Guide §5: `LLM-Agent: <lane>`, `Task-ID: DRV-MAT-010`, `Reviewer: Codex`. Push must be a normal non-force push and `PUSH_REMOTE` / `PUSH_BRANCH` must be recorded at finalize time.
6. The supervisor state churn in `ai-status.json` / `current-work.md` / `docs-site/*` is normal in-flight signal. Do not commit those changes as part of DRV-MAT-010; let the sync flow regenerate them after the task transitions.
7. If the second review still fails, prefer `progress` / `blocker` to bouncing the task — the orchestrator already auto-reassigned this slot once (Gemini2 → Codex2, raw_ref `.orchestrator/evidence/gemini2-20260505T123303Z-d36dd929.json`). A clean blocker note is more useful than another silent worker exit.

---

## 10) Notes For Wave Gate Reader

1. The four formal acceptance bullets (`route checklist complete`, `typecheck recorded`, `tests recorded`, `visual evidence or blocker recorded`) are the gate, not screenshots. Once the runbook wording is reconciled, the parent acceptance is satisfied with blocker form.
2. The verification packet's per-route checklist is line-anchored into the current screen sources (DRV-MAT-002 .. DRV-MAT-009 closed surfaces). A future regression hunt should compare against those anchors rather than re-deriving expected states.
3. The visual-evidence blocker is environmental (no Android tooling on this host), not a runtime defect. Anyone who later wants to capture screenshots can do so on a host with `adb` + `emulator` without re-running the verification packet — the current packet stands until a route changes.
4. Per the execution packet line 322-323, DRV-MAT-010 is the final gate before claiming the driver-app productization wave is complete. The wave-close summary should cite this packet plus the parent's closeout commit, not the stale `docs-site/driver-app-verification-DRV-MAT-010.md` prose.
