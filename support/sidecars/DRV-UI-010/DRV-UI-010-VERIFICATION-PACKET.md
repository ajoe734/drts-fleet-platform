# DRV-UI-010 Design QA And Android Verification Packet

**Task:** `DRV-UI-010`
**Owner:** `Codex`
**Reviewer:** `Codex2`
**Date:** `2026-05-08`
**Source execution packet:** `docs/03-runbooks/driver-app-design-rebuild-execution-packet-20260507.md`

## 1. Verification Summary

- `pnpm --filter @drts/driver-app typecheck` passed on `2026-05-08`.
- `pnpm --filter @drts/driver-app test` passed on `2026-05-08` with `10` test files / `33` tests.
- Android/emulator evidence is filed under `support/sidecars/DRV-UI-010/`: `7` PNG screenshots, `6` UIAutomator XML dumps, and `1` extracted text snapshot.
- Visual verification coverage is partial rather than complete:
  - Captured and auditable: onboarding/workspace degraded state, jobs empty/error state, trip empty/error state, incident ready state, earnings screenshot.
  - Missing captures: platform presence, shift, settings.
  - Missing structured pairing: earnings has a screenshot but no matching XML/text snapshot.
- This task does not change runtime code. It records command results, evidence coverage, and the confirmed design-vs-runtime deltas that remain after the driver-app design rebuild.

## 2. Command Evidence

### Typecheck

Command:

```bash
pnpm --filter @drts/driver-app typecheck
```

Observed output:

```text
> @drts/driver-app@0.1.0 typecheck /home/edna/workspace/drts-fleet-platform/apps/driver-app
> tsc --noEmit
```

Result: `PASS` (exit code `0`)

### Tests

Command:

```bash
pnpm --filter @drts/driver-app test
```

Observed output:

```text
> @drts/driver-app@0.1.0 test /home/edna/workspace/drts-fleet-platform/apps/driver-app
> vitest run --passWithNoTests

 RUN  v4.1.4 /home/edna/workspace/drts-fleet-platform/apps/driver-app

 Test Files  10 passed (10)
      Tests  33 passed (33)
```

Result: `PASS` (exit code `0`)

## 3. Visual Evidence Inventory

| Surface                | Design reference                                                     | Runtime reference                                        | Evidence                                                                                                   | Coverage verdict                                                                                                                                 |
| ---------------------- | -------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Onboarding / workspace | `docs/05-ui/driver-app-design-20260507/driver-screens-1.jsx:153-257` | `apps/driver-app/app/onboarding.tsx:1252-1293,1299-1539` | `onboarding.png`, `onboarding.xml`, `current-screen.png`, `drv-ui-010-current.xml`, `ui-text-snapshots.md` | `PARTIAL` — only the degraded branch is captured; the ready cockpit branch is implemented but not visually captured in this packet.              |
| Jobs inbox             | `docs/05-ui/driver-app-design-20260507/driver-screens-2.jsx:4-122`   | `apps/driver-app/app/jobs.tsx:655-860`                   | `jobs.png`, `jobs-screen.png`, `jobs.xml`, `drv-ui-010-jobs.xml`, `ui-text-snapshots.md`                   | `PARTIAL` — captures verify title/filter/error/empty states, but not a populated ready-state inbox.                                              |
| Trip                   | `docs/05-ui/driver-app-design-20260507/driver-screens-2.jsx:205-347` | `apps/driver-app/app/trip.tsx`                           | `trip.png`, `trip.xml`, `ui-text-snapshots.md`                                                             | `PARTIAL` — captures verify the empty/error branch plus SOS entry CTA, not the active-trip or forwarded-state flows used in the design showcase. |
| Platform presence      | `docs/05-ui/driver-app-design-20260507/driver-screens-3.jsx:3-98`    | `apps/driver-app/app/platform-presence.tsx:182-287`      | none                                                                                                       | `GAP` — no screenshot or XML in the packet.                                                                                                      |
| Earnings               | `docs/05-ui/driver-app-design-20260507/driver-screens-3.jsx:100-165` | `apps/driver-app/app/earnings.tsx:337-452`               | `earnings.png`                                                                                             | `PARTIAL` — screenshot exists, but there is no matching XML dump or extracted text snapshot.                                                     |
| Shift                  | `docs/05-ui/driver-app-design-20260507/driver-screens-3.jsx:197-249` | `apps/driver-app/app/shift.tsx:270-395`                  | none                                                                                                       | `GAP` — no screenshot or XML in the packet.                                                                                                      |
| Incident / SOS         | `docs/05-ui/driver-app-design-20260507/driver-screens-3.jsx:262-330` | `apps/driver-app/app/incident.tsx:311-380`               | `incident.png`, `incident.xml`, `ui-text-snapshots.md`                                                     | `GOOD` — ready-state capture includes the main warning card, helper copy, and primary/secondary actions.                                         |
| Settings               | `docs/05-ui/driver-app-design-20260507/driver-screens-3.jsx:333-391` | `apps/driver-app/app/settings.tsx:367-533`               | none                                                                                                       | `GAP` — no screenshot or XML in the packet.                                                                                                      |

## 4. Confirmed QA Deltas

These deltas are the issues or drifts confirmed during this QA pass. They are recorded here; this task does not fix them.

| Severity | Surface                          | Design expectation                                                                                                                                                  | Runtime / evidence                                                                                                                                                                                                                                        | Classification                               |
| -------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Medium   | Workspace coverage               | The design showcase centers on a ready cockpit with hero next-action card, KPI row, platform strip, and quick links. See `driver-screens-1.jsx:153-257`.            | The filed Android captures only show the degraded branch (`工作台暫時降級`) from `apps/driver-app/app/onboarding.tsx:1252-1293`, confirmed by `drv-ui-010-current.xml` and `ui-text-snapshots.md`.                                                        | Evidence gap                                 |
| Low      | Jobs naming                      | The design inbox header is `任務` and the last filter pill is `需同步`. See `driver-screens-2.jsx:7-13`.                                                            | Runtime uses `任務收件匣` and `需同步/異常` in `apps/driver-app/app/jobs.tsx:56-62,657-660`; the same copy appears in `jobs.xml` and `ui-text-snapshots.md`.                                                                                              | Copy drift                                   |
| Low      | Trip naming                      | The design trip top bar is `進行中行程`. See `driver-screens-2.jsx:251-259`.                                                                                        | Runtime title is `行程作業台` (`apps/driver-app/app/trip.tsx:1016`), confirmed by `trip.xml` and `ui-text-snapshots.md`.                                                                                                                                  | Copy drift                                   |
| Medium   | Platform presence IA             | The design screen is framed as `平台連線` with three compact online/offline cards and a short explanatory panel. See `driver-screens-3.jsx:13-41`.                  | Runtime is framed as `平台健康中心` with health summary chips, blocking/qualification language, and a settings-management CTA in `apps/driver-app/app/platform-presence.tsx:184-253`. No Android capture is filed for the final surface.                  | IA drift plus evidence gap                   |
| Medium   | Earnings naming / content model  | The design screen title is `收入` and its main explanation is platform settlement authority with a compact platform breakdown. See `driver-screens-3.jsx:109-160`.  | Runtime title is `收益儀表板` and adds DRTS/external/shadow finance-authority panels plus statement-centric summaries in `apps/driver-app/app/earnings.tsx:339-447`. This likely reflects post-design productization work, but it is a real design drift. | Copy and information-architecture drift      |
| Medium   | Shift naming / interaction model | The design screen is `班次` with a concise active card, summary KPIs, availability notes, and a single `下班打卡` action. See `driver-screens-3.jsx:201-246`.       | Runtime is `班表與出勤` and behaves as a live clock-in/clock-out workflow with form fields, active/off-duty branches, and validation in `apps/driver-app/app/shift.tsx:273-395`. No Android capture is filed.                                             | IA drift plus evidence gap                   |
| Low      | SOS naming / action copy         | The design SOS screen title is `安全求援`, with a destructive CTA `長按確認求援`. See `driver-screens-3.jsx:265-327`.                                               | Runtime uses `SOS 緊急通報`, `重大安全通報`, and a primary CTA `送出 SOS` in `apps/driver-app/app/incident.tsx:315-380`, confirmed by `incident.xml` and `ui-text-snapshots.md`.                                                                          | Copy drift                                   |
| Medium   | Settings layout                  | The design settings screen is a compact card list with profile summary, platform binding rows, preference rows, and misc items. See `driver-screens-3.jsx:333-391`. | Runtime is a form-heavy edit surface with full profile, emergency contact, preferences, toggle settings, and platform binding management in `apps/driver-app/app/settings.tsx:370-533`. No Android capture is filed.                                      | Layout / interaction drift plus evidence gap |

## 5. Evidence Notes

- `onboarding.xml`, `drv-ui-010-current.xml`, `jobs.xml`, `drv-ui-010-jobs.xml`, `trip.xml`, and `incident.xml` confirm that the Android captures were taken from the native app package `com.cctechsupport.drts.driver` at `1080x1920`.
- `ui-text-snapshots.md` gives a quick text-only index for onboarding, jobs, trip, and incident; it is useful for reviewer spot-checks when opening the PNGs is unnecessary.
- The current packet does not prove visual parity for populated ready states on jobs/trip/workspace; it proves the captured degraded or empty-state branches only.
- The current packet does not include any emulator evidence for `platform-presence`, `shift`, or `settings`.

## 6. Acceptance Mapping

- `pnpm --filter @drts/driver-app typecheck`: `PASS`
- `pnpm --filter @drts/driver-app test`: `PASS`
- `Visual verification packet filed`: `PASS` via this packet plus the artifact set under `support/sidecars/DRV-UI-010/`, with explicit coverage gaps recorded in §3-§5

## 7. Reviewer Focus

- Confirm the command evidence in §2 matches the current owner handoff summary.
- Decide whether the copy / IA drifts in §4 are acceptable productization changes or should be split into follow-up tasks.
- Decide whether the visual coverage gaps for `platform-presence`, `shift`, and `settings` are acceptable for `DRV-UI-010`, or whether the task should stay open for fuller emulator capture.
- Spot-check that this packet stays within task scope: support-only QA documentation, no runtime code changes.
