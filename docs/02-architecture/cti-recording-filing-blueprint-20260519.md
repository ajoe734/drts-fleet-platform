# CTI / Recording / Filing Blueprint

Status: draft blueprint for `COM-BLUEPRINT-001`  
Last updated: 2026-05-19  
Owner lane: `Codex2`  
Primary workflow family: `WF-COM-001`

## 1. Purpose

This blueprint consolidates the current DRTS Phase 1 design truth for the
phone-booking to compliance chain:

1. CTI call session creation and call-linked phone booking
2. delayed recording callback and compliance-state resolution
3. dispatch recording index export
4. regulatory filing package generation
5. permissioned evidence access, retention, and audit

It is intended to make one architecture-level statement explicit:

- the repo now has a complete sandbox-verifiable workflow surface for
  `WF-COM-001`
- the repo still does not have live/staging proof for CTI provider callback,
  filing scheduler activation, recording export activation, or signed-download
  evidence outside repo-local and sandbox paths

This document does not replace the release-gate matrix or sidecar evidence
packs. It explains how to read them together.

## 2. Consolidated Sources

| Source | Role in this blueprint | What it contributes |
| --- | --- | --- |
| `docs/02-architecture/phase1-operational-system-design-blueprint-20260429.md` | canonical design truth | call-center flow, `recording_pending`, dispatch gating, complaint handoff |
| `phase1_prd_detailed_v1.md` | product truth | phone booking, regulatory filing, evidence-bearing operations |
| `phase1_service_contracts_v1.md` | contract truth | filing package authority, call recording / evidence surfaces |
| `packages/contracts/src/index.ts` | repo contract snapshot | call session, recording state, report job, filing package, controlled download shapes |
| `support/sidecars/EXT-004/EXT-004-CTI-RECORDING-FILING-GATE.md` | live activation gate | blocker model `EXT-004-BLK-001` to `EXT-004-BLK-008` |
| `support/sidecars/COM-LIVE-001/COM-LIVE-001-EVIDENCE-PACK.md` | current live evidence posture | dated 2026-05-19 probe result and non-claim boundary |
| `docs/00-context/phase1-origin-dev-execution-worklist-20260519.md` | sandbox task baseline | `COM-CTI-SBX-001` webhook-harness deliverables and acceptance language |
| `docs/04-uat/phase1-uat-scenarios.md` | UAT semantics | `OC-021` to `OC-025`, `NP-COM-001`, `NP-COM-002` |
| `docs/04-uat/fbp-014a-e2e-matrix.md` | sandbox proof shape | `E2E-003` step-by-step automated verification chain |
| `docs/03-runbooks/evidence-retention-and-evidentiary-access-policy.md` | retention and access authority | evidence families, read controls, audit expectations |
| `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` | release-language authority | `WF-COM-001` gate interpretation |

### 2.1 Historical verification note on `EVD-VERIF-001`

The task brief asks this blueprint to consolidate `EVD-VERIF-001`. In the
current worktree, there is no standalone `support/sidecars/EVD-VERIF-001/*`
path checked out. However, the historical verification report is still
inspectable at commit `646ff01`
(`support/sidecars/EVD-VERIF-001/EVD-VERIF-001-VERIFICATION.md`).

That historical report matters because it states more than provenance:

- the repo can simulate a fixture chain for call session, phone order, delayed
  recording attachment, complaint transfer, and filing generation
- the chain is still repo-local and stitched, not a live adapter-backed
  external evidence pipeline
- the highest-signal repo-local gap is the filing package itself: current
  implementation emits a generic immutable manifest plus signed-download URLs,
  not a regulator-ready packet that assembles complaint, call, order, and
  recording evidence into one schema-aware bundle

This blueprint therefore uses `EVD-VERIF-001` as historical verification input
with still-relevant findings. Current binding evidence for gate posture remains
`EXT-004`, `COM-LIVE-001`, the UAT/E2E docs, and the repo contract/runtime
anchors.

## 3. System Boundary

`WF-COM-001` spans four internal authorities plus one external boundary:

| Layer | Authority | Responsibility |
| --- | --- | --- |
| call intake | `callcenter` | open call session, capture caller metadata, bind `callId`, accept delayed recording callback |
| operational order | dispatch / ops order flow | create phone-origin order, carry compliance flags, prevent silent dispatch of unresolved recording cases |
| compliance export | `reporting-filing` | generate `dispatch_recording_index` export with masked recording references and missing-recording flags |
| evidence access | audit + controlled download surfaces | issue time-limited access, attach policy version, audit all reads/downloads |
| external CTI / filing activation | provider/staging env | real callback payloads, live media/storage behavior, staging scheduler runs, redacted live proof |

Core rule: the platform is authoritative for compliance state transitions after
it receives normalized CTI recording facts, but it is not authoritative for the
existence of an external CTI environment or the raw recording-media lifecycle.

## 4. Canonical Runtime Model

### 4.1 Core entities

The current repo contract model requires these key records:

- `CallSessionRecord`
  - `callId`
  - `linkedOrderId`
  - `recordingId`
  - `providerRecordingRef`
  - `recordingUrl`
  - `recordingState`: `ready | pending | missing`
  - `flags`
- phone-origin order
  - stores `call_id`
  - carries compliance state derived from recording status
- `ReportJobDetailRecord`
  - supports `dispatch_recording_index`
  - returns `rows[]` including `callId`, `recordingId`, `missingRecording`
- filing package
  - generated as immutable artifact with manifest/hash and controlled download

### 4.2 State and sequencing rules

The accepted design semantics are:

1. A CTI interaction opens a call session before or during phone booking.
2. A phone-origin order may be created before recording evidence arrives.
3. While `recordingId` is absent, the order remains explicitly
   `recording_pending`.
4. Recording callback may arrive later and bind recording metadata onto the call
   session and linked order.
5. Once recording binding succeeds, `recording_pending` clears and the order can
   move to normal recording-bound handling.
6. If recording never arrives, the workflow must preserve an explicit
   missing-recording signal into export and filing artifacts instead of hiding
   the gap.

This matches the accepted architecture rule from the Phase 1 operational
blueprint: `recording_pending` is visible in the same workbench as dispatch and
complaint handoff, and it is not allowed to disappear as an implicit side
effect.

### 4.3 Filing package boundary

The current filing implementation is authoritative for immutable package
metadata, manifest hashing, and controlled download issuance. It is not yet
authoritative for a regulator-specific evidence envelope.

Today the repo-local package builder still stops at:

- package item lists
- manifest entries with `itemType`, `artifactId`, and `manifestHash`
- package checksum
- signed zip/pdf download metadata

For `audit_request`, the package item types are still only
`audit_summary` and `statistics`. The package does not yet assemble complaint
case data, call-session metadata, linked order identifiers, recording
references, retention annotations, legal-hold state, or regulator submission
receipts into one complaint-aware packet. That is the core architecture gap
carried forward from `EVD-VERIF-001`.

### 4.4 Operational consequences

- dispatch queue is a projection, not a separate authority
- `recording_pending` is a dispatch/compliance gate, not a cosmetic label
- complaint transfer remains compatible with delayed callback arrival
- call recording binary content does not need to live in the ops console; the
  console tracks references and controlled-access URLs only

## 5. Verification Ladder

This workflow now has three distinct proof levels. They must not be conflated.

### 5.1 Repo-static

Repo-static proof means code and contract surfaces exist and are reviewable:

- call session and recording callback contract shapes exist
- reporting job and filing package shapes exist
- retention-policy and evidence-access rules exist
- negative-path requirements are named in UAT docs

Repo-static proof is enough to discuss design completeness. It is not enough to
claim live activation.

### 5.2 Sandbox-proven

Sandbox proof is the intended operational baseline for the repo itself.

`COM-CTI-SBX-001` defines the sandbox webhook-harness baseline for:

- call started
- call ended
- recording pending
- recording ready
- recording failed

Its acceptance language is the current sandbox contract for this workflow:

- call center can create a phone booking with `callId`
- `recording_pending` is visible before callback resolution
- recording-ready callback attaches `recordingId`
- missing recording remains visible as a compliance flag

`E2E-003` then defines the end-to-end sandbox chain:

1. open call session
2. create phone booking with `callId`
3. observe `recording_pending`
4. deliver recording callback
5. clear pending state and bind recording
6. export `dispatch_recording_index`
7. generate filing package
8. read retention metadata and audited download evidence

This is the correct level for a repo claim such as
`PASS (sandbox evidence)`.

### 5.3 Live/staging activation

Live or staging activation is separately governed by `EXT-004`.

The blocker packet explicitly requires:

- CTI provider or approved stub environment
- callback payload contract and security proof
- staging callback run evidence
- filing scheduler activation evidence
- recording export artifact evidence
- sensitive-retention and access sign-off
- one joined end-to-end packet across phone order, callback, proof, export,
  filing, and audit

`COM-LIVE-001` records that a fresh 2026-05-19 probe did not reach those
endpoints successfully. Therefore the live/staging layer remains open even
though sandbox and repo-static layers exist.

## 6. Evidence and Access Model

### 6.1 Evidence families

The compliance chain depends on three evidence families staying distinguishable:

| Evidence family | Authority | Key rule |
| --- | --- | --- |
| `call_recording` | `callcenter` | internal-only read posture; every read audited |
| `report_artifact` | `reporting-filing` | signed-download issuance audited; tenant-scoped reads where applicable |
| `filing_package` | `reporting-filing` | immutable package + manifest hash + long retention |

### 6.2 Required access posture

The baseline policy requires:

- controlled downloads instead of raw unaudited links
- policy version attached to evidence-read behavior
- `403` on unauthorized artifact access
- audit entries for allowed and denied sensitive access attempts

This is why `NP-COM-002` and `SC-040` are part of the workflow-family story,
not optional appendix tests.

### 6.3 Missing-recording behavior

The system must not "fail closed" by omitting incomplete rows. If a phone-origin
order never receives a recording:

- export still emits the row
- filing still emits the package
- the missing recording is made explicit
- remediation remains possible from named artifacts

That behavior is the core requirement behind `NP-COM-001`.

## 7. Release-Gate Interpretation

### 7.1 What can be claimed now

The architecture and verification stack support these claims:

- the workflow shape for CTI callback, recording export, filing package, and
  evidentiary access is fully named
- sandbox-level proof exists for the end-to-end repo workflow
- negative-path behavior is explicitly part of the release gate
- retention and audited access rules are bound to the same workflow family

### 7.2 What cannot be claimed now

These statements remain disallowed until `EXT-004` blockers close:

- live CTI/provider callback verified
- staging filing scheduler activated
- production-ready recording retention proven from real media evidence
- signed recording/package download issuance proven from reachable staging/live
- `WF-COM-001` promoted beyond the current live-hold boundary by live evidence

### 7.3 Recommended reading of `WF-COM-001`

Use this interpretation consistently:

- repo and sandbox story: materially complete
- live/staging story: still blocked
- release-language read: keep the gate wording tied to explicit evidence level,
  never to implementation existence alone

## 8. Open Gaps And Ownership

| Gap | Current anchor | Next owner class |
| --- | --- | --- |
| real CTI or approved stub endpoint | `EXT-004-BLK-001` | CTI provider / telephony PM |
| callback payload + signature/replay contract | `EXT-004-BLK-002` / `003` | CTI provider + security |
| staging before/after callback proof | `EXT-004-BLK-004` | QA + ops dispatch |
| filing scheduler run and package manifest | `EXT-004-BLK-005` | compliance operations |
| recording export artifact proof | `EXT-004-BLK-006` | reporting / compliance |
| retention/access sign-off | `EXT-004-BLK-007` | security / compliance / legal |
| joined end-to-end live packet | `EXT-004-BLK-008` | QA lead + ops + compliance |

## 9. Architecture Summary

The Phase 1 CTI / recording / filing chain should be read as a layered
compliance workflow:

- CTI creates or enriches call-session context
- phone booking can proceed before recording evidence arrives, but only with an
  explicit `recording_pending` state
- callback resolution is a first-class state transition, not hidden plumbing
- export and filing preserve both success and incomplete-compliance cases
- evidence access is permissioned, retention-aware, and audited
- sandbox proof is sufficient for repo-local closure
- live/staging proof remains governed by `EXT-004` and is still open as of
  2026-05-19
