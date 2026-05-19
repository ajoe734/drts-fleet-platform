# CTI / Recording / Filing Blueprint

- Status: draft blueprint for `COM-BLUEPRINT-001`
- Last updated: `2026-05-19`
- Owner lane: `Codex2`
- Primary workflow family: `WF-COM-001`

## 1. Purpose

This blueprint consolidates the current DRTS Phase 1 design truth for the
phone-booking to compliance chain:

1. CTI call session creation and call-linked phone booking
2. delayed recording callback and compliance-state resolution
3. complaint-case transfer that preserves `callId` / `orderId` continuity
4. dispatch recording index export
5. regulatory filing package generation
6. permissioned evidence access, retention, and audit

It is intended to make one architecture-level statement explicit:

- the repo now has a materially complete sandbox-verifiable workflow surface for
  `WF-COM-001`
- the repo still does not have live/staging proof for CTI provider callback,
  filing scheduler activation, recording export activation, or signed-download
  evidence outside repo-local and sandbox paths
- the current filing package remains a generic immutable package shell, not a
  complaint-aware regulator packet that assembles call, order, complaint, and
  recording evidence together

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
| `docs/04-uat/phase1-uat-scenarios.md` | UAT semantics | `OC-021` to `OC-025`, `NP-COM-001`, `NP-COM-002` |
| `docs/04-uat/fbp-014a-e2e-matrix.md` | sandbox proof shape | `E2E-003` step-by-step automated verification chain |
| `docs/03-runbooks/evidence-retention-and-evidentiary-access-policy.md` | retention and access authority | evidence families, read controls, audit expectations |
| `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` | release-language authority | `WF-COM-001` gate interpretation |

### 2.1 Historical verification on `EVD-VERIF-001`

The task brief asks this blueprint to consolidate `EVD-VERIF-001`. In the
current worktree, there is no standalone `support/sidecars/EVD-VERIF-001/*`
artifact checked out at `HEAD`. The verification sidecar is still inspectable
through repo history at commit `646ff01`
(`support/sidecars/EVD-VERIF-001/EVD-VERIF-001-VERIFICATION.md`), and that
historical packet materially changes how this blueprint should be read.

`EVD-VERIF-001` concluded:

- the repo can drive a repo-local chain for `call session -> phone order ->
  recording attach -> complaint transfer -> report artifact / filing package`
- the filing package is still generic and immutable, but not complaint-aware or
  regulator-ready
- there is still no real evidence bucket, regulator portal adapter, or active
  retention executor

Current binding evidence for live/staging claims remains `EXT-004`,
`COM-LIVE-001`, the UAT/E2E docs, and the repo contract/runtime anchors. The
historical `EVD-VERIF-001` result matters because it identifies a repo-local
productization gap, not just an external activation blocker.

## 3. System Boundary

`WF-COM-001` spans five internal authorities plus one external boundary:

| Layer | Authority | Responsibility |
| --- | --- | --- |
| call intake | `callcenter` | open call session, capture caller metadata, bind `callId`, accept delayed recording callback |
| operational order | dispatch / ops order flow | create phone-origin order, carry compliance flags, prevent silent dispatch of unresolved recording cases |
| complaint handoff | complaint service | create complaint case from call/order context and preserve case linkage for later investigation |
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
- complaint case
  - preserves `caseNo`
  - links `relatedOrderId`
  - links `relatedCallId`
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

### 4.3 Operational consequences

- dispatch queue is a projection, not a separate authority
- `recording_pending` is a dispatch/compliance gate, not a cosmetic label
- complaint transfer remains compatible with delayed callback arrival
- complaint linkage exists today, but filing-package assembly still does not
  consume complaint-case data as first-class packet content
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

`COM-CTI-SBX-001` established the sandbox webhook harness for:

- call started
- call ended
- recording pending
- recording ready
- recording failed

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

### 5.3 Repo-local scope limit from `EVD-VERIF-001`

Historical verification from `646ff01` matters because it proved the repo-local
chain can be exercised while also documenting where the current filing story
stops short.

The verified repo-local chain is:

1. call session opens
2. phone order links to the same `callId`
3. recording callback binds `recordingId`
4. complaint transfer can create a linked case
5. reporting export and filing-package generation remain available

The unclosed repo-local design gaps are:

- the filing package is still a generic immutable manifest plus signed-download
  metadata, not a complaint-aware regulator packet
- the complaint step is linked to call/session context, but the packet
  generator does not pull complaint-case data into package contents
- no real evidence bucket, regulator portal adapter, or active retention worker
  is proven here

That means sandbox proof is strong enough for the current workflow-family gate,
but not strong enough to claim that the regulatory packet itself is already
product-complete.

### 5.4 Live/staging activation

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
- complaint handoff continuity exists, even though complaint-aware packet
  assembly does not yet

### 7.2 What cannot be claimed now

These statements remain disallowed:

- the filing package is already complaint-aware or regulator-ready
- the current packet generator assembles complaint, call, order, and recording
  evidence into one regulatory submission envelope
- live CTI/provider callback verified
- staging filing scheduler activated
- production-ready recording retention proven from real media evidence
- signed recording/package download issuance proven from reachable staging/live
- `WF-COM-001` promoted beyond the current live-hold boundary by live evidence

The first two limits come from `EVD-VERIF-001` repo-local findings. The live
evidence limits remain governed by `EXT-004`.

### 7.3 Recommended reading of `WF-COM-001`

Use this interpretation consistently:

- repo and sandbox story: materially complete
- live/staging story: still blocked
- when `COM-LIVE-001` says `HOLD`, read that as the live/staging activation
  layer, not as a contradiction of the release-gate row that already records
  `PASS (sandbox evidence)`
- release-language read: keep the gate wording tied to explicit evidence level,
  never to implementation existence alone

## 8. Open Gaps And Ownership

| Gap | Current anchor | Next owner class |
| --- | --- | --- |
| complaint-aware filing-package assembly | `EVD-VERIF-001` at `646ff01`; current package remains generic manifest + signed URLs | reporting / compliance backend owner |
| regulator-facing packet envelope or submission adapter | `EVD-VERIF-001` at `646ff01` | compliance platform owner |
| active retention executor beyond metadata/read-path controls | `EVD-VERIF-001`; retention runbook is explicit that activation is repo-static pending `EXT-004` | security / compliance / platform ops |
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
- complaint linkage is preserved, but current filing assembly still stops at a
  generic package shell rather than a regulator-ready evidence bundle
- export and filing preserve both success and incomplete-compliance cases
- evidence access is permissioned, retention-aware, and audited
- sandbox proof is sufficient for the current `WF-COM-001` release-gate claim
- live/staging proof remains governed by `EXT-004` and is still open as of
  2026-05-19
