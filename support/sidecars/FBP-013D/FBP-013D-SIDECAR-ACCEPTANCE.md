# FBP-013D Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `FBP-013D` — final evidence synthesis and closeout packet  
**Current Owner:** Codex2  
**Assigned Reviewer:** Codex  
**Parent Reviewer At Snapshot:** Claude  
**Last Revised:** 2026-04-16 (UTC, finalize sync)  
**Status:** ACTIVE SUPPORT ARTIFACT — sidecar `FBP-013D-SIDECAR-ACCEPTANCE` is `review_approved`; parent `FBP-013D` is `in_progress`.

---

## 1) Scope Boundary

本 sidecar 只整理 `FBP-013D` 所需的 acceptance checklist、dependency map、evidence inventory、以及 reviewer / owner handoff 指引。

- **In scope:** support-only closeout scaffolding、child evidence cross-reference、release-gate checklist、reviewer hotspot map。
- **Out of scope:** 修改 L1 canonical truth、改寫 child pack 結論、變更 runtime / registry / governance / contracts 實作、或直接替 parent `FBP-013D` 做主線定稿。

---

## 2) Machine-Truth Snapshot

以 `ai-status.json`、`current-work.md`、`ai-activity-log.jsonl` 與現有 support artifacts 為唯一共同真相：

- Parent `FBP-013D`
  - owner=`Gemini`
  - reviewer=`Claude`
  - status=`in_progress`
  - depends_on=`["FBP-013A","FBP-013B","FBP-013C"]`
  - acceptance:
    1. `三個 child evidence packs 被整合成可審批的最終 closeout packet`
    2. `release / pilot / production decision gate 與 evidence trace 關聯清楚`
    3. `paired verification child 與主線 execution family 的引用關係完整`
- Sidecar `FBP-013D-SIDECAR-ACCEPTANCE`
  - owner=`Codex2`
  - reviewer=`Codex`
  - status=`review_approved`
  - helper kind=`acceptance_packet`
  - `mutates_canonical=false`

### Child Dependency State at Snapshot

| Child      | Shared-Truth Status | Why It Matters To `FBP-013D`                                                                     |
| ---------- | ------------------- | ------------------------------------------------------------------------------------------------ |
| `FBP-013A` | `done`              | staging deploy evidence pack is finalized and now safe to cite directly for live deploy evidence |
| `FBP-013B` | `done`              | smoke evidence pack is finalized and downstream-consumable                                       |
| `FBP-013C` | `done`              | UAT/sign-off evidence pack is finalized and downstream-consumable                                |

### High-Signal Shared-Truth Notes

- `FBP-013A.next` now states the owner finalized the pack after reviewer-side wording cleanup in commit `e0b256d`; `FBP-013D` synthesis is explicitly unblocked.
- `FBP-013A` pack records green GitHub Actions run `#24522301392` and marks live evidence `E-11/E-12/E-13` populated.
- `FBP-013B.next` states the smoke evidence pack is finalized and now correctly documents bootstrap-header auth, `GET /api/health`, `/api/admin/flags` scope, and the `FBP-013A` live-staging boundary.
- `FBP-013C.next` states the UAT/sign-off evidence pack is finalized, with `45/45` non-deferred P1 scenarios statically verified and downstream `FBP-013D` handoff ready.
- `FBP-013D-SIDECAR-ACCEPTANCE` review was auto-rerouted from `Gemini` to `Codex` after repeated `Gemini` worker failures; current reviewer-of-record is `Codex`.

---

## 3) Parent Acceptance Expansion

以下三條 acceptance criteria 直接沿用 `ai-status.json -> FBP-013D.acceptance`，本 packet 只把它們展開成 reviewer 與 parent owner 都可直接消費的 evidence anchor。

### AC-1: 三個 child evidence packs 被整合成可審批的最終 closeout packet

**Required synthesis inputs**

| Evidence family         | Current anchor                                                       | Expected use in final closeout                                                                     |
| ----------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Staging deploy evidence | `support/sidecars/FBP-013A/FBP-013A-STAGING-DEPLOY-EVIDENCE-PACK.md` | cite deploy topology, migration proof, secret wiring, health check, and green-run evidence         |
| Smoke evidence          | `support/sidecars/FBP-013B/FBP-013B-SMOKE-EVIDENCE-PACK.md`          | cite 6-case critical-path coverage, bootstrap auth model, failure triage, and static/live boundary |
| UAT/sign-off evidence   | `support/sidecars/FBP-013C/FBP-013C-UAT-EVIDENCE-PACK.md`            | cite 93-scenario coverage math, deferred-item triage, and sign-off gate matrix                     |

**PASS condition for parent closeout**

- `FBP-013D` must consume all three child packs explicitly, not merely mention the task IDs.
- `FBP-013A` should be cited as the live deployment / migration / health evidence source.
- `FBP-013B` should be cited as the static smoke evidence source.
- `FBP-013C` should be cited as the UAT coverage and sign-off evidence source.

### AC-2: release / pilot / production decision gate 與 evidence trace 關聯清楚

**Required gate framing**

| Gate                        | Evidence anchor                                    | Current shared-truth reading                                                                                         |
| --------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Release / staging readiness | `FBP-013A` green run `#24522301392`                | deploy, migrate, deploy-services, and health-check all passed                                                        |
| Smoke readiness             | `FBP-013B` §§2-7                                   | smoke suite is staging-runnable; live artifact boundary remains explicit                                             |
| UAT / pilot gate            | `FBP-013C` §§5-7                                   | all non-deferred P1 scenarios are statically verified; live execution and deferred-item acceptance remain gate items |
| Production decision trace   | `docs/03-runbooks/phase1-rollout.md` + child packs | parent must connect rollout decisions back to child evidence instead of creating parallel truth                      |

**PASS condition for parent closeout**

- Every release / pilot / production statement in `FBP-013D` must point to a child evidence anchor or the rollout runbook.
- Any remaining open item must be labeled as an explicit decision or residual risk, not implied away.

### AC-3: paired verification child 與主線 execution family 的引用關係完整

**Required relationship map**

| Execution family | Verification child | Role in final synthesis                             |
| ---------------- | ------------------ | --------------------------------------------------- |
| staging deploy   | `FBP-013A`         | live infra / migration / health proof               |
| smoke            | `FBP-013B`         | reviewable critical-path API evidence               |
| UAT and sign-off | `FBP-013C`         | operator journey coverage and sign-off trace        |
| final synthesis  | `FBP-013D`         | consolidates the above without mutating child truth |

**PASS condition for parent closeout**

- `FBP-013D` should preserve that verification evidence lives in the child packs.
- The parent packet should act as synthesis and release-decision glue, not as a replacement copy of the child artifacts.

---

## 4) Dependency Map

### Formal Machine Dependencies

| Dep        | Status | Evidence available now | Notes                                                                                                     |
| ---------- | ------ | ---------------------- | --------------------------------------------------------------------------------------------------------- |
| `FBP-013A` | `done` | Yes                    | finalized staging pack is safe to cite directly for deploy, migration, secret wiring, and health evidence |
| `FBP-013B` | `done` | Yes                    | finalized smoke pack is safe to cite directly                                                             |
| `FBP-013C` | `done` | Yes                    | finalized UAT pack is safe to cite directly                                                               |

### Informative Upstream Context

| Context         | Anchor                                | Why It Matters                                                               |
| --------------- | ------------------------------------- | ---------------------------------------------------------------------------- |
| Rollout runbook | `docs/03-runbooks/phase1-rollout.md`  | release / pilot / production decision language should stay aligned here      |
| UAT checklist   | `docs/04-uat/phase1-uat-checklist.md` | preserves priority math and deferred tracker baseline consumed by `FBP-013C` |
| UAT scenarios   | `docs/04-uat/phase1-uat-scenarios.md` | canonical scenario inventory that `FBP-013C` maps into evidence              |

### Downstream Consumers

| Consumer           | Status | Expected dependency on `FBP-013D`                                           |
| ------------------ | ------ | --------------------------------------------------------------------------- |
| `FBP-014B`         | `todo` | integrated cross-repo evidence run waits on final `FBP-013` closeout        |
| `FBP-014` umbrella | `todo` | depends on the `FBP-013` evidence-closeout family being internally coherent |

---

## 5) Child Evidence Inventory

### `FBP-013A` — staging deploy evidence

| Item               | Anchor                      | Snapshot                                                             |
| ------------------ | --------------------------- | -------------------------------------------------------------------- |
| Deploy status      | pack header + machine truth | finalized parent task (`done`) with all three AC passing             |
| Green deploy proof | run `#24522301392`          | all four jobs green                                                  |
| Live evidence      | `E-11`, `E-12`, `E-13`      | CI run URL, migrate success log, health-check HTTP 200               |
| Key synthesis use  | §§3-6, §8                   | deploy topology, migration inventory, secret wiring, gap resolutions |

### `FBP-013B` — smoke evidence

| Item                   | Anchor      | Snapshot                                                                      |
| ---------------------- | ----------- | ----------------------------------------------------------------------------- |
| Smoke status           | pack header | finalized parent task (`done`)                                                |
| Critical-path coverage | §2          | 6 smoke cases inventory                                                       |
| Auth / route truth     | §§3-4       | bootstrap headers, `system` default actor, `GET /api/health`                  |
| Scope decision         | §6.3        | `/api/admin/flags` implemented, intentionally outside smoke gate              |
| Key synthesis use      | §§2-7       | static smoke evidence, triage guidance, live-boundary statement to `FBP-013A` |

### `FBP-013C` — UAT and sign-off evidence

| Item              | Anchor                      | Snapshot                                                                                                                  |
| ----------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| UAT status        | pack header + machine truth | finalized parent task (`done`); static evidence complete, with live gate trace preserved for downstream rollout decisions |
| Coverage math     | §§4-5                       | 93 scenarios total; `45/45` non-deferred P1 static-verified                                                               |
| Deferred tracker  | §6                          | 4 deferred P1 + 1 deferred P2                                                                                             |
| Sign-off matrix   | §7                          | pilot / production gate requirements preserved                                                                            |
| Key synthesis use | §§5-7, §10                  | scenario math, deferral rationale, sign-off traceability                                                                  |

---

## 6) Reviewer Hotspots For `Codex`

`Codex` reviewing this sidecar should focus on whether the packet is useful for parent synthesis, not on re-reviewing every child artifact from scratch.

1. Confirm the dependency map stays aligned with machine truth: parent formal deps are still exactly `FBP-013A`, `FBP-013B`, `FBP-013C`.
2. Confirm the packet now reflects `FBP-013A` as `done`, with the green run `#24522301392` and `e0b256d` reviewer-side wording cleanup preserved as the final staging evidence anchor.
3. Confirm `FBP-013B` is treated as the smoke evidence source of truth, especially for bootstrap auth, `GET /api/health`, and the explicit `FBP-013A` live-run boundary.
4. Confirm `FBP-013C` is treated as the UAT/sign-off source of truth, especially for `45/45` non-deferred P1 static verification and the 5 deferred items.
5. Confirm the packet keeps `FBP-013D` framed as synthesis glue, not as a replacement for child evidence.

### Suggested Parent-Synthesis Pull List

When `Gemini` continues `FBP-013D`, the high-yield material to absorb first is:

1. `FBP-013A` pack header, §§3-6, §8, and the E-11/E-12/E-13 table.
2. `FBP-013B` pack §§2-7 plus the acceptance summary table around AC-P1..AC-P5.
3. `FBP-013C` pack §§5-7 and the downstream note that `FBP-013D` may cite scenario math, deferred-item triage, and sign-off traceability.

---

## 7) Sidecar Acceptance Checklist

### AC-S1 — Support artifact only

- [x] Output limited to `support/sidecars/FBP-013D/FBP-013D-SIDECAR-ACCEPTANCE.md`
- [x] No canonical truth files changed
- [x] No runtime / registry / governance / contract implementation changed

### AC-S2 — Shared-truth aligned dependency map

- [x] Parent acceptance copied directly from `ai-status.json`
- [x] Parent formal dependencies kept as `FBP-013A`, `FBP-013B`, `FBP-013C`
- [x] Child status descriptions match the current shared truth snapshot
- [x] `FBP-013A` green-run evidence captured together with the current `done` state and finalize note

### AC-S3 — Reviewer handoff ready

- [x] `Codex` reviewer hotspots are explicit
- [x] Evidence inventory points to concrete child-pack anchors
- [x] Parent-synthesis pull list is included

---

## 8) Handoff Commands

### Owner -> Reviewer (`Codex2` -> `Codex`)

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py handoff FBP-013D-SIDECAR-ACCEPTANCE Codex "FBP-013D acceptance packet ready in support/sidecars/FBP-013D/FBP-013D-SIDECAR-ACCEPTANCE.md. It preserves machine-truth dependencies on FBP-013A/B/C, maps each child pack to its synthesis role, and gives a release-gate checklist plus reviewer hotspot list for Codex. Support artifact only; no canonical truth changes."
```

### Reviewer Approve (`Codex`)

```bash
AI_NAME=Codex python3 scripts/ai_status.py approve FBP-013D-SIDECAR-ACCEPTANCE "FBP-013D acceptance packet approved: dependency mapping stays aligned with shared truth, FBP-013A/B/C are all finalized evidence sources, and the packet is usable as a support-only synthesis scaffold for the parent closeout."
```

### Reviewer Reopen (`Codex`)

```bash
AI_NAME=Codex python3 scripts/ai_status.py reopen FBP-013D-SIDECAR-ACCEPTANCE "Please correct the FBP-013D sidecar packet: <describe mismatch in dependency map, child status wording, or synthesis guidance>."
```

### Owner Closeout (`Codex2`, after approval)

```bash
NO_COMMIT_REQUIRED=1 AI_NAME=Codex2 python3 scripts/ai_status.py done FBP-013D-SIDECAR-ACCEPTANCE "Owner finalized approved sidecar; FBP-013D acceptance packet is ready in support/sidecars/FBP-013D/ for Gemini to absorb into the parent evidence synthesis without changing canonical truth."
```

---

## 9) Operator Notes

1. This packet is intentionally narrow: it should accelerate `FBP-013D`, not create a competing closeout artifact.
2. `FBP-013A` is now `done`, so parent synthesis may cite it directly as the finalized live deploy evidence source alongside `FBP-013B` and `FBP-013C`.
3. If parent synthesis discovers unresolved contradictions across the child packs, that should reopen the relevant parent task or child pack directly, not be silently patched here.
