# RGX-004 Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`
**Parent Task:** `RGX-004` — Add narrow dispatch scheduling workflow to ops dispatch page
**Prepared By:** Claude (Lane: governance review / consensus synthesis)
**Reviewer:** Codex
**Generated:** 2026-04-13
**Status:** COMPLETE — review approved, ready for parent task close-out

---

## 1. Review Scope

This packet summarises Claude's review of Codex's RGX-004 implementation against the canonical acceptance criteria recorded in `ai-status.json`. It is a **support artifact only** — no canonical truth is modified.

Implementation commit under review: `a98280be668be99498271fde6ba6e7a5f08fc1eb`

Files changed:

- `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx` (new, 299 lines)
- `apps/ops-console-web/app/dispatch/page.tsx` (refactored, 45 lines)

Prerequisite commit (API client dispatch wrappers): `eaa652a` — "feat(apps): connect phase1 clients to shared api surfaces"

---

## 2. Acceptance Criteria Evaluation

Each criterion maps to the canonical acceptance in `ai-status.json` for `RGX-004`.

### AC-1 — No longer read-only order list

| Check                                                         | Result  |
| ------------------------------------------------------------- | ------- |
| Page renders actionable UI beyond a static table row          | ✅ PASS |
| At minimum one interactive element per dispatchable order row | ✅ PASS |

**Evidence:** `dispatch-workflow.tsx` renders a table where every row with a dispatch job has at minimum a "View Candidates" or "Assign" button. Rows with `redispatch_required` or `exception_hold` status additionally render a "Redispatch" button.

---

### AC-2 — Driver / vehicle candidate selection

| Check                                                                  | Result  |
| ---------------------------------------------------------------------- | ------- |
| UI surfaces vehicle and driver identifiers for candidate selection     | ✅ PASS |
| Selection state is reflected before the assignment action is triggered | ✅ PASS |
| Backed by `DispatchCandidate` contract type                            | ✅ PASS |

**Evidence:**

- `DispatchCandidate` is imported from `@drts/contracts` (`dispatch-workflow.tsx:8`)
- `listDispatchCandidates(jobId)` is called on demand via "View Candidates" button
- Candidates rendered in a `<select>` with label format: `{vehicleId} ({driverId}) - {etaMinutes}m`
- `selectedCandidate` state tracks the `vehicleId|driverId` key per job before assignment fires

---

### AC-3 — ETA display

| Check                                                                          | Result  |
| ------------------------------------------------------------------------------ | ------- |
| ETA visible per candidate or per dispatch job                                  | ✅ PASS |
| Source: `DispatchCandidate.etaMinutes` or `DispatchJobRecord.latestEtaMinutes` | ✅ PASS |
| No hardcoded or fabricated ETA values                                          | ✅ PASS |
| Null handling present                                                          | ✅ PASS |

**Evidence:**

- `job.latestEtaMinutes` shown in the ETA column with explicit `!== null && !== undefined` guard (`dispatch-workflow.tsx:153-160`)
- Candidate-level `etaMinutes` shown inline in dropdown options (`dispatch-workflow.tsx:182`)
- No literal ETA values present anywhere in the component

---

### AC-4 — Assignment action

| Check                                                        | Result  |
| ------------------------------------------------------------ | ------- |
| Ops user can trigger assignment from UI                      | ✅ PASS |
| Calls endpoint with `dispatchJobId`, `vehicleId`, `driverId` | ✅ PASS |
| Redispatch surface present                                   | ✅ PASS |

**Evidence:**

- `handleAssign` calls `client.assignDispatch({ dispatchJobId, vehicleId, driverId })` (`dispatch-workflow.tsx:53-57`)
- `AssignDispatchCommand` contract is satisfied: `dispatchJobId` comes from `job.dispatchJobId`, `vehicleId`/`driverId` parsed from composite candidate key
- `handleRedispatch` calls `client.redispatchOrder(orderId)` (`dispatch-workflow.tsx:68-74`)
- Assign button is disabled until a candidate is selected, preventing empty submissions

---

### AC-5 — Queue / reservation / exception handling workflow surface

| Check                                                               | Result  |
| ------------------------------------------------------------------- | ------- |
| Orders with exception/redispatch states are visually differentiated | ✅ PASS |
| `reservationHoldStatus` rendered for non-none values                | ✅ PASS |
| No full queue dashboard required — workflow surface sufficient      | ✅ PASS |

**Evidence:**

- `redispatch_required` → row styled `bg-red-50`, Redispatch button shown (`dispatch-workflow.tsx:109,119`)
- `exception_hold` → row styled `bg-yellow-50`, Redispatch button shown (`dispatch-workflow.tsx:110,121`)
- `reservationHoldStatus !== "none"` renders a blue badge showing the hold status value (`dispatch-workflow.tsx:135-139`)
- Status badges with per-status CSS classes for `ready_for_dispatch`, `assigned`, `redispatch_required`, `exception_hold` (`dispatch-workflow.tsx:252-265`)

---

## 3. Risk Disposition (from RGX-004-SIDECAR-ACCEPTANCE)

| Risk                                       | Original Severity | Resolution                                                                                                          |
| ------------------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| R-1: API client wrappers missing           | Medium            | ✅ RESOLVED — `listDispatchJobs`, `listDispatchCandidates`, `assignDispatch` added in `eaa652a`                     |
| R-2: Server/client component boundary      | Medium            | ✅ RESOLVED — `page.tsx` is server component; `dispatch-workflow.tsx` has `"use client"` at line 1                  |
| R-3: `latestEtaMinutes` null handling      | Low               | ✅ RESOLVED — explicit null/undefined guard at `dispatch-workflow.tsx:153`                                          |
| R-4: `reservationHoldStatus` enum coverage | Low               | ✅ MITIGATED — implementation uses `!== "none"` guard; all non-none values render a badge regardless of enum member |

---

## 4. Minor Observations (Non-Blocking)

These are informational only and do not block approval:

1. **Candidate key parsing (`parts[0]!`, `parts[1]!`)** — The composite key `vehicleId|driverId` is parsed with non-null assertion at `dispatch-workflow.tsx:47-48`. Because the value is always generated from the same format in the option `value` attribute, the risk of a malformed key is negligible. No change required.

2. **`dispatch_failed` status not visually differentiated** — The acceptance criteria specify `redispatch_required` and `exception_hold`. The `dispatch_failed` status is not mentioned as an explicit requirement in the canonical acceptance list; omission is consistent with the narrow scope commitment.

3. **Commit message encoding** — Commit `a98280b` has literal `\n` characters in the message body rather than newline characters. The trailers (`LLM-Agent`, `Task-ID`, `Reviewer`) are present and parseable but not on separate lines. This is a formatting quirk; it does not affect the substance of the commit or the evidence chain.

---

## 5. Commit Evidence Record

| Field                   | Value                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| Commit Hash             | `a98280be668be99498271fde6ba6e7a5f08fc1eb`                                                              |
| Commit Subject          | `feat(RGX-004): add dispatch scheduling workflow surface to ops dispatch page`                          |
| LLM-Agent               | Codex                                                                                                   |
| Task-ID                 | RGX-004                                                                                                 |
| Reviewer                | Claude                                                                                                  |
| Files Changed           | `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx`, `apps/ops-console-web/app/dispatch/page.tsx` |
| Prior Dependency Commit | `eaa652a` — API client dispatch wrappers                                                                |

---

## 6. Review Decision

**APPROVED**

All five acceptance criteria are met. All four flagged risks from the acceptance sidecar are resolved. The implementation is correctly scoped: it enriches the existing dispatch page without adding new route segments or changing canonical contract schemas. The server/client component architecture is sound. No canonical truth conflicts identified.

**Recommended next step:** Codex (as reviewer) approves RGX-004 in `ai-status.json`, then marks the parent task `done` with commit evidence `a98280b`.

---

## 7. Sidecar Closure Note

This packet is a **support artifact only**. It does not modify:

- `ai-status.json`
- Any L1 canonical product truth
- Any contract schema
- Any runtime or governance implementation

`NO_COMMIT_REQUIRED=1` — review packet closure.
