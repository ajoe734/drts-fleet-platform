# UI-FE-TEN-UMBRELLA Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `UI-FE-TEN-UMBRELLA` - Tenant Console rebuild umbrella status / closeout  
**Parent Owner:** `Codex2`  
**Parent Reviewer:** `Codex`  
**Sidecar Owner:** `Codex`  
**Sidecar Reviewer:** `Codex2`  
**Generated:** `2026-06-02` (UTC)  
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` - support-only; does not modify canonical truth, runtime behavior, or umbrella implementation.

This packet is the reviewer-facing support artifact for the tenant-console umbrella closeout. It
consolidates the machine-truth dependency state, the acceptance checklist implied by the umbrella
task, and the handoff notes needed by `Codex2` without editing canonical product truth or the
parent task record.

---

## 1. Scope Boundary

In scope:

- capture the sidecar machine-truth anchors for
  `UI-FE-TEN-UMBRELLA-SIDECAR-ACCEPTANCE`
- summarize the dependency completion state for all 14 tenant-console page rebuild tasks
- provide a reviewer-ready acceptance checklist for the umbrella closeout packet
- document what the umbrella reviewer should reconfirm before approving the parent task

Out of scope:

- editing L1/L2 product truth, runtime code, registry/governance files, or the parent task itself
- reopening or mutating dependency tasks that are already recorded as `done`
- claiming that this packet is the umbrella closeout; it is a support handoff only

---

## 2. Machine-Truth Anchors

### Sidecar - `UI-FE-TEN-UMBRELLA-SIDECAR-ACCEPTANCE`

- owner=`Codex`
- reviewer=`Codex2`
- status=`in_progress` at packet creation time
- depends_on=`UI-FE-TEN-USR`, `UI-FE-TEN-NTF`, `UI-FE-TEN-SLA`, `UI-FE-TEN-WH`,
  `UI-FE-TEN-APIK`, `UI-FE-TEN-BILL`, `UI-FE-TEN-INV`, `UI-FE-TEN-CC`, `UI-FE-TEN-RUL`,
  `UI-FE-TEN-IG`, `UI-FE-TEN-RPT`, `UI-FE-TEN-AUD`, `UI-FE-TEN-FF`, `UI-FE-TEN-SET`
- task_class=`sidecar`
- helper_parent=`UI-FE-TEN-UMBRELLA`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- artifact=`support/sidecars/UI-FE-TEN-UMBRELLA/UI-FE-TEN-UMBRELLA-SIDECAR-ACCEPTANCE.md`

Live workflow fields such as `status`, `next`, and `last_update` remain authoritative only in
`ai-status.json`.

### Parent umbrella - `UI-FE-TEN-UMBRELLA`

Machine-truth snapshot observed during this dispatch:

- `scripts/ai-status.sh show UI-FE-TEN-UMBRELLA` currently returns `Task not found`
- `archived_task_ids` still includes `UI-FE-TEN-UMBRELLA`
- the latest retained umbrella handoff from `Codex2` to `Codex` says:
  `Owner finalized approved umbrella closeout at 3d8350cd, reran scoped smoke verification
  (contracts build, ui-tokens build, tenant-console-web build, typecheck, test, git diff --check),
  and pushed the formal closeout commit for final reviewer acknowledgment.`
- the owner closeout branch tip remains `origin/codex2/ui-fe-ten-umbrella@3d8350cd`
- the parent closeout document at
  `docs/05-ui/tenant-console-rebuild-closeout-20260601.md` records:
  - owner=`Codex2`
  - reviewer=`Codex`
  - 14 currently recorded tenant-console dependency tasks `done`
  - 20-route IA present
  - Q-TEN01 cutover posture referenced

Interpretation:

- The umbrella owner closeout evidence exists and is internally consistent on the owner branch tip.
- The parent task body is no longer present in active `tasks[]`, so this packet must not claim a live
  parent `status` value that is no longer queryable from machine truth.
- This sidecar exists to reduce reviewer lookup time by collapsing the dependency map and
  acceptance gates into one packet while explicitly calling out the current archive-state caveat.

---

## 3. Dependency Map

All direct umbrella dependencies recorded for this sidecar are already `done`.

| Dependency | Status | Owner | Reviewer | Recorded closeout anchor |
| ---------- | ------ | ----- | -------- | ------------------------ |
| `UI-FE-TEN-USR` | `done` | `Codex2` | `Claude` | `c6e399253bd1eb922e01909fb7de09c81a12d300` |
| `UI-FE-TEN-NTF` | `done` | `Claude` | `Codex` | `4d210ca716ef012314645155469f6607e09e0034` |
| `UI-FE-TEN-SLA` | `done` | `Codex2` | `Codex` | `a1f4ccd33515b720b497de1aa7e62cc9f71cc1d6` |
| `UI-FE-TEN-WH` | `done` | `Codex2` | `Codex` | `8b4cd22c5efb881776e9db14d8b8da2de9c8729c` |
| `UI-FE-TEN-APIK` | `done` | `Codex2` | `Codex` | `d797886c378950f75f0e2b608116e216f2e2819d` |
| `UI-FE-TEN-BILL` | `done` | `Claude` | `Codex` | `e6f7cde8baaa4178a6eb8016a89324cd85994d4f` |
| `UI-FE-TEN-INV` | `done` | `Codex2` | `Codex` | `ab784217` |
| `UI-FE-TEN-CC` | `done` | `Codex` | `Claude` | `ddc3eec9d027b2a165c9e7d695cdb0ce0846df6a` |
| `UI-FE-TEN-RUL` | `done` | `Codex` | `Claude2` | `be50d0d26491c6657ea10469dd11123079de6c99` |
| `UI-FE-TEN-IG` | `done` | `Codex2` | `Codex` | `850cd4208443161aeeab3e699629522fbc39e9a4` |
| `UI-FE-TEN-RPT` | `done` | `Codex2` | `Codex` | `7ee3b93282c7dd5003c33b1d823c9b3ae4ac4e58` |
| `UI-FE-TEN-AUD` | `done` | `Codex` | `Codex2` | `02483a12` |
| `UI-FE-TEN-FF` | `done` | `Claude` | `Codex2` | `7d523632230e88f53dcad9ef43c11246efa21ddb` |
| `UI-FE-TEN-SET` | `done` | `Codex2` | `Codex` | `4e0227aa5d11de7ad66954deb821a9756af87567` |

Dependency assertions:

- No currently recorded umbrella dependency remains in `backlog`, `todo`, `in_progress`, or
  `review`.
- The dependency set covers the tenant-console route family named by the umbrella acceptance:
  users, notifications, SLA, webhooks, API keys, billing, invoices, cost centers, rules,
  integration governance, reports, audit, feature flags, and settings.

Reviewer caution:

- `UI-FE-TEN-RUL` records a reconciled closeout anchor on `origin/dev`; that is already the
  machine-truth state and should be treated as historical evidence, not as a new blocker from this
  sidecar.

---

## 4. Umbrella Acceptance Checklist

Legend: `[REQUIRED]` = direct umbrella acceptance or recorded dependency evidence.
`[SIDEcar]` = support artifact readiness for reviewer handoff.

### A. Dependency completion `[REQUIRED]`

- [x] All 14 page-level dependency tasks listed in the umbrella task are recorded as `done`.
- [x] Each dependency task records closeout evidence in machine truth with a commit anchor.
- [x] No dependency reopen is implied by this packet.

### B. Tenant-console surface coverage `[REQUIRED]`

- [x] The dependency set covers the 14 route slices named by the umbrella task.
- [x] The parent umbrella acceptance explicitly expects the 20-route IA, including the 9 required
      NEW routes, and the dependency map here aligns with that expectation.
- [x] The packet does not alter or reinterpret page-level acceptance beyond what each dependency
      task already recorded.

### C. Umbrella closeout evidence presence `[REQUIRED]`

- [x] The owner closeout branch tip is `origin/codex2/ui-fe-ten-umbrella@3d8350cd`.
- [x] The latest retained umbrella handoff records rerun verification for contracts build,
      ui-tokens build, tenant-console-web build, typecheck, test, and `git diff --check`.
- [x] The parent closeout document records the closeout doc, smoke gate, 20-route IA, and
      Q-TEN01 cutover-plan reference evidence expected by the umbrella acceptance.
- [x] This packet explicitly notes that the parent task body is currently archived / not queryable
      via `ai-status.sh show`, so reviewer follow-up should not rely on a stale parent `status`
      claim from this packet.

### D. Sidecar packet readiness `[SIDECAR]`

- [x] This packet is confined to `support/sidecars/UI-FE-TEN-UMBRELLA/`.
- [x] This packet captures support-only evidence and does not edit canonical truth.
- [x] This packet is reviewer-addressed and can be handed off to `Codex2`.

---

## 5. Reviewer Handoff Notes

For `Codex2` when reviewing this packet and the parent umbrella closeout:

1. Reconfirm this sidecar file exists on `codex/ui-fe-ten-umbrella-sidecar-acceptance` and is the
   branch tip artifact under `support/sidecars/UI-FE-TEN-UMBRELLA/`.
2. Reconfirm the owner closeout packet on `origin/codex2/ui-fe-ten-umbrella@3d8350cd` still
   matches the retained umbrella handoff evidence and closeout document.
3. Reconfirm the smoke verification named in the retained umbrella handoff remains the latest
   recorded evidence:
   - contracts build
   - ui-tokens build
   - tenant-console-web build
   - tenant-console-web typecheck
   - tenant-console-web test
   - `git diff --check`
4. Use this packet as the dependency checklist only; do not treat it as a replacement for the
   parent umbrella closeout artifact.
5. If lifecycle action is still required on the parent umbrella, route that as a machine-truth
   repair because the parent task body is currently archived / absent from active `tasks[]`.
6. If any dependency task reopens after this packet is handed off, refresh §3 and §4 before
   approving the sidecar.

---

## 6. Evidence Snapshot

Machine-truth evidence used to assemble this packet:

- `UI-FE-TEN-UMBRELLA-SIDECAR-ACCEPTANCE` sidecar status slice
- `UI-FE-TEN-USR` closeout evidence slice
- `UI-FE-TEN-NTF` closeout evidence slice
- `UI-FE-TEN-SLA` closeout evidence slice
- `UI-FE-TEN-WH` closeout evidence slice
- `UI-FE-TEN-APIK` closeout evidence slice
- `UI-FE-TEN-BILL` closeout evidence slice
- `UI-FE-TEN-INV` closeout evidence slice
- `UI-FE-TEN-CC` closeout evidence slice
- `UI-FE-TEN-RUL` closeout evidence slice
- `UI-FE-TEN-IG` closeout evidence slice
- `UI-FE-TEN-RPT` closeout evidence slice
- `UI-FE-TEN-AUD` closeout evidence slice
- `UI-FE-TEN-FF` closeout evidence slice
- `UI-FE-TEN-SET` closeout evidence slice
- retained umbrella handoff / archive-state snapshot observed during dispatch

Known limits:

- This packet intentionally does not restate the full contents of the parent closeout document.
- This packet intentionally does not mutate machine truth to reconcile any future lifecycle drift.
- This packet cannot assert a live parent `status` value because `UI-FE-TEN-UMBRELLA` is currently
  absent from active `tasks[]`.
