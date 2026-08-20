# Regulatory Reports Execution Tasks (2026-08-20)

**Status:** ready for supervisor registration
**Baseline:** `origin/dev`
**Requirement:** PRD §9.10.1 — nine regulatory reports, confirmed still wanted 2026-08-20
**Registration:** `tools/task-dispatch/dispatch-regulatory-reports-20260820.py`

## 1. What is actually broken

`REGULATORY_REPORT_JOB_TYPES` declares all nine. `completeReportJob` builds rows for one.

| PRD §9.10.1        | Job type                   | Row builder | Source                                                    |
| :----------------- | :------------------------- | :---------: | :-------------------------------------------------------- |
| 車輛清冊           | `vehicle_roster`           |      —      | `regulatory-registry.listVehicles`                        |
| 駕駛清冊           | `driver_roster`            |      —      | `regulatory-registry.listDrivers`                         |
| 契約清冊           | `contract_roster`          |      —      | `regulatory-registry.listContracts`                       |
| 保險清冊           | `insurance_roster`         |      —      | `regulatory-registry.listPolicies`                        |
| 每月車輛增減月報   | `vehicle_monthly_delta`    |      —      | **no change-history source exists**                       |
| 最近六個月統計     | `six_month_statistics`     |      —      | machinery exists under a different name                   |
| 收費標準版本歷程   | `fare_version_history`     |      —      | **no version-history source exists**                      |
| 申訴案件明細       | `complaint_case_detail`    |      —      | `complaint.listComplaintCases` / `getComplaintExportView` |
| 派遣紀錄與錄音索引 | `dispatch_recording_index` |   **yes**   | already built                                             |

**The missing eight do not fail. They succeed empty.** `createReportJob` validates only
that `jobType` is non-blank; the job initialises `rows: []`; `completeReportJob` is a
sequence of `if (job.jobType === ...)` with no `else`. A `vehicle_roster` job therefore
reaches `completed`, produces a manifest and a checksum, and returns zero rows with
nothing signalling that the report was never implemented.

A caller cannot distinguish "no vehicles this period" from "this report does not exist".

**One of the eight is a naming mismatch, not missing work.** A
`buildSixMonthOperationsSummaryRows` builder exists and runs behind the job type
`six_month_operations_summary`. The enum declares `six_month_statistics`. Two different
strings for the report PRD §9.10.1 item 6 describes.

**Two of the eight have no source.** `vehicle_monthly_delta` needs vehicle lifecycle
change history, and no such history is stored. `fare_version_history` needs published
pricing-template versions; `pricing_template_id` appears in `V0005` and `V0006` as a
foreign key, but no module owns a version history to report on. These are not wiring.

## 2. Dispatch rules

1. The supervisor, not the planning agent, creates worker branches and starts auto workers.
2. Every worker starts from current `origin/dev` and records the exact base SHA.
3. Owner and reviewer are different lanes.
4. **No task may edit an L1 product-truth file** (`CANONICAL_DOCUMENT_MAP.md` section 2).
   If PRD §9.10.1 turns out to be wrong about a report, stop and report rather than
   editing it.
5. **`REG-RPT-001` merges first.** It converts eight silently-empty reports into explicit
   rejections. That is a deliberate, visible regression in API behaviour for those eight
   types, and it is the point: an error that names the missing report is safer than a
   valid-looking empty one, and it stops anyone building on results that were never real.
6. `REG-RPT-002` and `REG-RPT-003` both add methods to
   `reporting-filing.service.ts`. They are separable in meaning but will conflict in
   text; whichever merges second rebases.

## 3. Tasks

### REG-RPT-001 — Make an unimplemented report say so

**Priority:** P1
**Owner hint:** Codex
**Reviewer hint:** Claude2
**Dependencies:** none
**Workstream:** report-integrity

**Execution prompt**

Reject a report job whose type has no row builder, at creation, with an error naming the
type. Today `createReportJob` checks only that `jobType` is non-blank and every unbuilt
type completes with `rows: []`.

Derive the accepted set from the builders that exist rather than from a second
hand-maintained list. A list beside the dispatch table is the defect that took `dev` red
three times in one day through `repo-classification.json`; one source, or the same drift
returns.

Fix the `six_month_statistics` / `six_month_operations_summary` mismatch in the same
change, since it is the same defect wearing a different hat: a declared type whose
builder is unreachable. Decide which string is canonical, make the other resolve to it
or disappear, and say in the code which you chose.

This will make eight report types return errors until `REG-RPT-002` and `REG-RPT-003`
land. That is intended. Do not soften it into a warning.

**Owned artifacts**

- `apps/api/src/modules/reporting-filing/`
- `packages/contracts/src/index.ts` — only if the canonical six-month name changes
- `tests/unit/`, `tests/integration/`

**Acceptance**

- A job whose type has no builder is rejected at creation, with an error naming the type.
- The accepted set is derived from the builders present, not from a parallel list; a test fails if someone adds a type without a builder and no rejection follows.
- `six_month_statistics` and `six_month_operations_summary` resolve to one report, and the code states which name is canonical.
- `dispatch_recording_index` and the operational report types continue to work unchanged.
- No job type reaches `completed` with `rows: []` because its builder is absent.

---

### REG-RPT-002 — The four rosters

**Priority:** P1
**Owner hint:** Gemini
**Reviewer hint:** Codex2
**Dependencies:** `REG-RPT-001`
**Workstream:** report-rosters

**Execution prompt**

Build row builders for `vehicle_roster`, `driver_roster`, `contract_roster`, and
`insurance_roster` against `regulatory-registry`, which already owns all four master
records.

PRD §9.6 states what each registry must hold; the roster is that data as a report, not a
new model. Do not add fields to the registry to make a report prettier — if a column PRD
§9.10.1 implies is genuinely absent from the registry, stop and report, because that is a
registry gap and not a reporting one.

Rows must reflect the filters the job carries. A roster that ignores its period filter and
returns everything is the same failure as returning nothing: a report that does not answer
the question asked.

**Owned artifacts**

- `apps/api/src/modules/reporting-filing/` — the four builders
- `tests/unit/`, `tests/integration/`

**Acceptance**

- Each of the four types returns rows drawn from the registry, proven against seeded data rather than fixtures local to the test.
- Job filters are honoured; a period or status filter changes the row set.
- Each row carries enough identity to trace back to its registry record.
- A roster with no matching records returns zero rows **and** the job still succeeds — which is now distinguishable from an unimplemented type, because `REG-RPT-001` rejects those.
- No field is added to `regulatory-registry` by this task.

---

### REG-RPT-003 — Complaint detail, six-month statistics, and the two without a source

**Priority:** P1
**Owner hint:** Codex2
**Reviewer hint:** Gemini2
**Dependencies:** `REG-RPT-001`
**Workstream:** report-crossmodule

**Execution prompt**

Build `complaint_case_detail` against `complaint.listComplaintCases` and
`getComplaintExportView`, which exist.

Confirm `six_month_statistics` reports the four figures PRD §9.10.1 names — 乘客要求派車
次數, 派遣次數, 平均可派車輛數, 申訴次數 — and not merely whatever the existing
`sixMonthOperationsSummary` provider happens to return. If the provider is missing one of
the four, that is the work.

`vehicle_monthly_delta` and `fare_version_history` have **no source to report from**.
Vehicle lifecycle change history is not stored, and no module owns published
pricing-template versions. Do not invent either by deriving from current state — a monthly
delta computed from today's rows is a fabrication that will look correct and be wrong.
Report what each would require and stop; they become their own task once someone decides
whether the underlying history should be captured.

**Owned artifacts**

- `apps/api/src/modules/reporting-filing/`
- `tests/unit/`, `tests/integration/`
- a short findings note for the two unsourced reports

**Acceptance**

- `complaint_case_detail` returns rows from the complaint module honouring job filters.
- `six_month_statistics` returns all four PRD-named figures, and a test names each.
- `vehicle_monthly_delta` and `fare_version_history` remain rejected by `REG-RPT-001`, with a written statement of what source each needs.
- Neither unsourced report is faked from current state.

---

### REG-RPT-004 — One test that outlives the tenth report

**Priority:** P1
**Owner hint:** Claude2
**Reviewer hint:** Codex
**Dependencies:** `REG-RPT-002`, `REG-RPT-003`
**Workstream:** report-acceptance

**Execution prompt**

Write the test that would have caught this. Enumerate `REGULATORY_REPORT_JOB_TYPES` at
runtime and assert, for every entry, either that a job produces rows against seeded data
or that creation is rejected with a named reason. Neither silence nor an empty success is
an acceptable outcome for any member of the enum.

The point is the enumeration. A test listing the nine types by hand passes forever and
says nothing about the tenth; this must fail when a type is added with no builder and no
rejection.

**Owned artifacts**

- `tests/integration/` or `tests/security/`
- `docs/04-uat/` evidence

**Acceptance**

- The test derives its cases from the exported enum, not from a literal list.
- Adding a temporary tenth type with no builder makes it fail, naming the type.
- Every currently-implemented report is asserted to return rows, not merely to complete.
- The two unsourced reports are asserted to be rejected, so their absence is pinned rather than forgotten.

## 4. Stop and escalation conditions

Workers stop and report when:

- a roster field PRD §9.10.1 implies is absent from the owning registry;
- the six-month provider cannot produce one of the four PRD-named figures;
- deriving `vehicle_monthly_delta` or `fare_version_history` appears possible from current state — it is not, and appearing so is the trap;
- a task needs to edit PRD §9.10.1 or any other L1 file.
