# PH1GC-DRV-MP-002 Acceptance Packet & Dependency Map

- **Sidecar Kind:** `acceptance_packet`
- **Parent Task:** `PH1GC-DRV-MP-002` — Phase 1 gap closure — driver mobile device evidence packet
- **Sidecar Owner:** `Gemini2`
- **Assigned Reviewer:** `Codex`
- **Parent Owner / Reviewer (machine-truth snapshot):** `Codex2` / `Codex`
- **Refreshed:** `2026-05-23T16:43:45Z`
- **Snapshot Status:** sidecar `PH1GC-DRV-MP-002-SIDECAR-ACCEPTANCE` is `review` (`last_update=2026-05-23T16:38:17Z`). Parent `PH1GC-DRV-MP-002` is `blocked` (`last_update=2026-05-23T16:41:59Z`), depends on `PH1GC-DRV-MP-001`, and still does not carry `commit_hash` / `push_*` closeout fields in canonical `ai-status.json`.

> Snapshot note. The parent task's `planning_ref` still points at `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md`, which is not present in this checkout. Its live `next` field is now a blocker message describing the owner branch evidence state; this packet quotes that blocker picture directly and otherwise limits itself to verifiable machine truth plus repo-visible evidence anchors. It does not paraphrase unseen brief content.
>
> Provenance rule used here:
> - `origin/dev` anchors show what is already delivered on trunk.
> - completed dependency tasks may add stronger evidence through their recorded closeout commits or pushed task branches even when that content is not yet on `origin/dev`.
> - owner-branch placeholder files prove path preparation only; they do not upgrade real-device acceptance to `PASS`.

## 1. Scope Boundary

This sidecar is support-only.

- In scope: a reviewer-facing acceptance checklist, dependency map, evidence inventory, and no-overclaim guidance for `PH1GC-DRV-MP-002`.
- Out of scope: editing canonical truth, changing the parent task row, mutating runtime code, creating synthetic mobile evidence, or claiming Android/iPhone real-device pass without attached captures.
- Allowed write surface for this task: `support/sidecars/PH1GC-DRV-MP-002/PH1GC-DRV-MP-002-SIDECAR-ACCEPTANCE.md`.

## 2. Machine-Truth Snapshot

### 2.1 Parent task — `PH1GC-DRV-MP-002`

- `status=blocked`
- `owner=Codex2`
- `reviewer=Codex`
- `depends_on=["PH1GC-DRV-MP-001"]`
- `artifacts=["support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE/"]`
- current blocker summary recorded in `next`:
  - owner branch `origin/codex2/ph1gc-drv-mp-002` at `9be1a098361ec90b4e30f26854d24441c1c59a8b` already contains `support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE/` with 11 directive `§C` placeholder files plus blocked-state README and directive `§7` closeout
  - acceptance still lacks masked physical Android+iPhone captures, Expo/EAS build proof, Android signing proof, Apple/TestFlight proof, weak-network retry evidence, native push/location/online-offline/forwarded-task/earnings real-device captures, and delivery on `origin/dev`
- acceptance bullets recorded in machine truth:
  - `support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE/ exists on origin/dev with all 11 directive §C evidence items.`
  - `PII masking applied to driver name/phone in all captures.`
  - `Evidence proves: Android install + signing; iOS install + TestFlight; push notification delivery; location permission grant; weak-network retry; platform online/offline; forwarded task display; earnings display.`
  - `If sandbox device access is blocked, brief status remains blocked_external with the missing dependency surfaced — do NOT mark done.`
  - `Closeout report follows directive §7 format.`

### 2.2 Direct dependency — `PH1GC-DRV-MP-001`

`PH1GC-DRV-MP-001` is `done` in `ai-status.json` and records:

- `commit_hash=056e79f4d499d60e349939fec928f46bff083e1f`
- `commit_subject=PH1GC-DRV-MP-001: harden E2E-006 forwarder seed gate`
- `push_remote=origin`, `push_branch=codex/ph1gc-drv-mp-001`
- deterministic seeded selection via `E2E_SEED_OWNED_TASK_ID` and `E2E_SEED_FORWARDED_TASK_ID`
- default hard-fail when the mixed owned+forwarded seed is missing
- warning-skip allowed only through `E2E_ALLOW_MISSING_FORWARDER_SEED=true`

What that contributes here:

- stronger static evidence for forwarded-task visibility / route-lock behavior
- stronger static evidence for by-platform earnings split
- no claim of live mobile execution; parent closeout explicitly says live full-chain still depends on a seeded environment

### 2.3 Upstream evidence baseline — `WF-DRV-MP-001-DEVICE-EVIDENCE`

The closest existing machine-truth predecessor for real-device evidence is not a live-pass packet. It is a finalized hold report:

- task `WF-DRV-MP-001-DEVICE-EVIDENCE` is `done`
- artifact of record: `docs/04-uat/driver-mobile-real-device-test-report-20260519.md`
- closeout commit: `9d93e280acc87b8b7503166d5b09e407cd2abcd8`
- review notes explicitly preserve `provisional` / `HOLD` posture rather than claiming Android+iPhone pass

The unblock follow-up is also done:

- task `WF-DRV-MP-001-DEVICE-EVIDENCE-UNBLOCK-MANUAL-UNBLOCK`
- closeout commit: `1abff70f635a72aa6379c55767b283cef647fe1a`
- `resolved_parent_next`: await Android + iPhone hardware, weak-network environment, credentialed human-in-loop operator, and `EXT-003-BLK-001..007`; once available, execute `RD-01..RD-13` from `docs/04-uat/driver-mobile-real-device-test-report-20260519.md`

This is the strongest current machine-truth signal for `PH1GC-DRV-MP-002`: the real-device evidence surface is documented and review-approved as externally gated, not complete.

## 3. Dependency Map

### 3.1 Hard prerequisites

| Dependency | Current state | Why it matters to `PH1GC-DRV-MP-002` |
| --- | --- | --- |
| `PH1GC-DRV-MP-001` | `done` | Supplies deterministic E2E-006 seed/gate behavior via closeout commit `056e79f4d499d60e349939fec928f46bff083e1f`, so forwarded-task display and earnings evidence can be validated repo-locally before any real-device run. |
| `WF-DRV-MP-001-DEVICE-EVIDENCE` | `done` as hold/provisional report | Establishes the current scenario matrix (`RD-01..RD-13`) and documents which mobile evidence items are still blocked or static-only. |
| `WF-DRV-MP-001-DEVICE-EVIDENCE-UNBLOCK-MANUAL-UNBLOCK` | `done` | Names the external prerequisites that must clear before real Android/iPhone evidence can legitimately move from hold to pass. |
| `origin/codex2/ph1gc-drv-mp-002` placeholder evidence packet | owner branch only | Closes the sidecar-path gap on the owner branch with 11 directive `§C` placeholder files, but does not satisfy the acceptance requirement that the path and real captures exist on `origin/dev`. |
| `EXT-003` mobile distribution gate | external-gated | `EXT-003-BLK-001..007` block installable build, signing, tester, and first-launch evidence. |

### 3.2 Supporting evidence anchors

| Anchor | Current read | Why it matters |
| --- | --- | --- |
| `docs/04-uat/driver-mobile-real-device-test-report-20260519.md` | present on `origin/dev` | Canonical repo-visible evidence report for Android/iPhone real-device status. |
| `support/sidecars/EXT-003/EXT-003-MOBILE-DISTRIBUTION-GATE.md` | present | Enumerates the external blockers behind `RD-01` and mobile install/distribution claims. |
| `tests/e2e/E2E-006-driver-multi-platform.sh` | present on `origin/dev`; strengthened by closeout commit `056e79f4d499d60e349939fec928f46bff083e1f` | Static proof that owned + forwarded tasks can be distinguished, route-locked, and inspected with by-platform earnings semantics. |
| `origin/codex2/ph1gc-drv-mp-002:support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE/README.md` | present on owner branch only | Confirms the directive `§C` landing-zone path now exists on the owner branch but remains explicitly `blocked_external` pending real masked artifacts and `origin/dev` delivery. |
| `docs/04-uat/fbp-014a-e2e-matrix.md` | present | Existing route-locked forwarded-task matrix anchor used by the real-device report. |
| `docs/04-uat/phase1-uat-scenarios.md` | present | UAT expectations for task-assigned notification and forwarded-task behavior; useful for judging native push vs in-app-only evidence. |

### 3.3 Out of scope for this sidecar

- generating or editing the parent's real-device captures
- altering `ai-status.json` task definitions beyond normal sidecar lifecycle updates
- reclassifying the existing hold report as a pass
- changing the parent acceptance bullets to hide the current gap between desired artifact path and repo-visible evidence

## 4. Acceptance Audit

### 4.1 Parent acceptance rows vs current evidence

| Parent acceptance item | Current evidence | Read at packet time | Reviewer note |
| --- | --- | --- | --- |
| `support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE/ exists on origin/dev with all 11 directive §C evidence items.` | The required directory now exists on owner branch `origin/codex2/ph1gc-drv-mp-002`, including all 11 placeholder files plus README/closeout notes, but `git ls-tree -r --name-only origin/dev` still does not show that sidecar path. Repo-visible trunk evidence still centers on `docs/04-uat/driver-mobile-real-device-test-report-20260519.md`. | `NOT YET SATISFIED` | The branch closes the path gap for future delivery, but the acceptance row is still unmet until the sidecar directory and its truthful contents land on `origin/dev`. |
| `PII masking applied to driver name/phone in all captures.` | No fresh Android/iPhone screenshots, recordings, or install artifacts are attached under the parent's target artifact path in this checkout. | `NOT VERIFIABLE` | Without live captures, masking cannot be audited. The packet should be treated as a blocker reminder, not proof. |
| `If sandbox device access is blocked, brief status remains blocked_external with the missing dependency surfaced — do NOT mark done.` | Existing hold report + unblock closeout already enumerate Android/iPhone hardware, weak-network environment, credentialed operator, and `EXT-003-BLK-001..007` as the missing inputs. Parent itself is currently `blocked`, not `done`, and its blocker text lists the still-missing capture families. | `SUPPORTED AS GUARDRAIL` | If live evidence is still unavailable, reviewer should expect the parent to preserve an external-block posture rather than force a green closeout. |
| `Closeout report follows directive §7 format.` | The cited `docs/00-context` directive/status-truth files are absent from this checkout, so exact format cannot be audited here. | `DEFERRED TO PARENT CLOSEOUT` | This sidecar does not invent the missing format; it only records the evidence state the parent closeout must faithfully report. |

### 4.2 Sub-claims inside the parent evidence bullet

The third parent acceptance row bundles several distinct claims. Current evidence does not support them equally.

| Claim | Current read | Evidence anchor | Gap to close |
| --- | --- | --- | --- |
| Android install + signing | `BLOCKED` | `RD-01` in `docs/04-uat/driver-mobile-real-device-test-report-20260519.md`; `EXT-003-BLK-001..007` in `support/sidecars/EXT-003/EXT-003-MOBILE-DISTRIBUTION-GATE.md` | Need build URL/hash, install log, signing proof, and first-launch capture. |
| iOS install + TestFlight | `BLOCKED` | same `RD-01` + `EXT-003` gate | Need TestFlight or equivalent install proof plus first-launch capture. |
| Push notification delivery | `NOT VERIFIED` | `RD-08` and report §4.3 say repo shows in-app counters/preferences but no `expo-notifications`, push-token registration, or native push permission handling | Need explicit native push evidence, or an approved decision that in-app polling/badge satisfies this requirement. |
| Location permission grant | `NO CURRENT ANCHOR` | no explicit location-permission evidence surfaced in the available report or `EXT-003` gate packet | Need device-side permission prompt / granted-state capture. |
| Weak-network retry | `STATIC EVIDENCE ONLY` | `RD-13`; report §4.5; `docs/03-runbooks/driver-app-native-dev-runbook.md` | Need real-device network-conditioning run plus request-id continuity proof. |
| Platform online/offline | `STATIC EVIDENCE ONLY` | `RD-05`; report §4.2 | Need device capture of toggle state change and API success. |
| Forwarded task display | `BLOCKED + STATIC EVIDENCE` | `RD-10`; `PH1GC-DRV-MP-001`; `tests/e2e/E2E-006-driver-multi-platform.sh`; `docs/04-uat/fbp-014a-e2e-matrix.md` | Need seeded forwarded task or live adapter data on an actual device. |
| Earnings display | `STATIC EVIDENCE ONLY` | `RD-12`; report matrix; `PH1GC-DRV-MP-001` dependency note | Need live screenshot showing by-platform earnings after task completion. |

## 5. Reviewer Checklist

- [ ] Confirm this packet does not claim parent `PH1GC-DRV-MP-002` is ready for `done`.
- [ ] Confirm the packet preserves the machine-truth distinction between:
      `PH1GC-DRV-MP-001` being done,
      `WF-DRV-MP-001-DEVICE-EVIDENCE` being done as a hold/provisional report,
      and `PH1GC-DRV-MP-002` still lacking live real-device artifacts.
- [ ] Confirm the packet explicitly flags the artifact-path mismatch:
      parent acceptance expects `support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE/`,
      while repo-visible evidence currently centers on
      `docs/04-uat/driver-mobile-real-device-test-report-20260519.md`.
- [ ] Confirm `push notification delivery` is not overclaimed from in-app counters/preferences.
- [ ] Confirm `location permission grant` is left as missing evidence rather than inferred.
- [ ] Confirm the only file added by this task is this sidecar packet.

## 6. Reviewer Verification Commands

```bash
python3 -c 'import json,os; p=os.path.join(os.environ["AI_STATUS_ROOT"],"ai-status.json"); d=json.load(open(p)); ids=["PH1GC-DRV-MP-002-SIDECAR-ACCEPTANCE","PH1GC-DRV-MP-002","PH1GC-DRV-MP-001","WF-DRV-MP-001-DEVICE-EVIDENCE","WF-DRV-MP-001-DEVICE-EVIDENCE-UNBLOCK-MANUAL-UNBLOCK"]; [print(i, next(t for t in d["tasks"] if t["id"]==i)["status"]) for i in ids]'
git show 056e79f4d499d60e349939fec928f46bff083e1f:tests/e2e/E2E-006-driver-multi-platform.sh | sed -n '1,120p'
git rev-parse 056e79f4d499d60e349939fec928f46bff083e1f 9d93e280acc87b8b7503166d5b09e407cd2abcd8 1abff70f635a72aa6379c55767b283cef647fe1a 9be1a098361ec90b4e30f26854d24441c1c59a8b
git ls-tree -r --name-only origin/dev | grep 'driver-mobile-real-device-test-report-20260519.md\|WF-DRV-MP-001-DEVICE-EVIDENCE'
git ls-tree -r --name-only origin/codex2/ph1gc-drv-mp-002 support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE/
git show origin/codex2/ph1gc-drv-mp-002:support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE/README.md | sed -n '1,220p'
sed -n '1,220p' docs/04-uat/driver-mobile-real-device-test-report-20260519.md
sed -n '1,200p' support/sidecars/EXT-003/EXT-003-MOBILE-DISTRIBUTION-GATE.md
git diff --stat -- support/sidecars/PH1GC-DRV-MP-002/PH1GC-DRV-MP-002-SIDECAR-ACCEPTANCE.md
```

## 7. Evidence Inventory

- `ai-status.json` rows:
  - `PH1GC-DRV-MP-002-SIDECAR-ACCEPTANCE`
  - `PH1GC-DRV-MP-002`
  - `PH1GC-DRV-MP-001`
  - `WF-DRV-MP-001-DEVICE-EVIDENCE`
  - `WF-DRV-MP-001-DEVICE-EVIDENCE-UNBLOCK-MANUAL-UNBLOCK`
- `docs/04-uat/driver-mobile-real-device-test-report-20260519.md`
- `support/sidecars/EXT-003/EXT-003-MOBILE-DISTRIBUTION-GATE.md`
- `tests/e2e/E2E-006-driver-multi-platform.sh`
- `docs/04-uat/fbp-014a-e2e-matrix.md`
- `docs/04-uat/phase1-uat-scenarios.md`
- `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`

## 8. Handoff Guidance

This packet is intentionally conservative.

- It supports parent owner `Codex2` and reviewer `Codex` by pinning the real dependency picture in one place.
- It does not replace the parent owner's need to either attach real Android/iPhone evidence or keep the task externally blocked.
- It should be rejected if anyone tries to use `PH1GC-DRV-MP-001` static evidence alone to satisfy the parent's live-device acceptance bar.
- It should also be rejected if the parent closeout claims native push or location-permission proof without new artifacts.

Support artifact refreshed for review by `Codex` against canonical machine truth. No canonical truth or runtime files were modified.
