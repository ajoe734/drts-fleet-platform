# OPX-MD-001 BFF & Frontend Handoff Packet

**Sidecar Task:** `OPX-MD-001-SIDECAR-BFF-HANDOFF`  
**Parent Task:** `OPX-MD-001`  
**Helper Kind:** `bff_handoff_packet`  
**Prepared by:** Codex2  
**Current Sidecar Owner:** `Codex`  
**Assigned Reviewer:** `Codex2`  
**Parent Owner / Reviewer:** `Codex2` / `Codex`  
**Last Revised:** `2026-04-29 (UTC)`  
**Status:** `review_approved` — shared L0 keeps this sidecar at owner=`Codex`, reviewer=`Codex2`, `status=review_approved`, `last_update=2026-04-29T19:07:10Z` after an availability-first owner rebalance from `Codex2` to `Codex`. The substantive packet content remains unchanged; only the formal owner closeout path moved to `Codex` with `NO_COMMIT_REQUIRED=1`.

---

## 1. Purpose

This sidecar translates the completed `OPX-MD-001` driver master lifecycle work
into a BFF/frontend handoff packet for downstream platform-admin consumers and
reviewers.

It answers four practical questions:

1. Which platform-admin driver surfaces are now canonically backed by
   `drts-fleet-platform`?
2. Which API/client contract fields are safe for frontend consumers to depend
   on?
3. How do lifecycle changes affect dispatch eligibility, profile visibility,
   and device-binding visibility?
4. What must the final owner/reviewer pair preserve before this support packet
   is formally closed?

This document is support-only. It does not change L1 truth, runtime behavior,
registry authority, or governance state.

---

## 2. Shared-Truth Baseline

The baseline below comes from machine truth plus the parent execution artifact:

- `ai-status.json` records parent task `OPX-MD-001` as `done`, owner
  `Codex2`, reviewer `Codex`, commit
  `32a9939ace7bf270ad639b4f7e704767bbdcc882`
  (`feat(OPX-MD-001): add driver master lifecycle controls`).
- `ai-status.json` records this sidecar as scoped only to
  `support/sidecars/OPX-MD-001/OPX-MD-001-SIDECAR-BFF-HANDOFF.md`.
- `ai-status.json`, `current-work.md`, and `ai-activity-log.jsonl` show that
  reviewer approval landed first, then the orchestrator rebalanced the sidecar
  owner from `Codex2` to `Codex` for final closeout. That ownership churn did
  not change the packet's technical conclusions.
- `docs/03-runbooks/phase1-operational-blueprint-execution-packet-20260429.md`
  defines the parent objective as creating the canonical platform-side flow for
  creating, activating, suspending, and retiring driver records, including
  eligibility and device-binding relation.
- Parent review notes in `ai-status.json` freeze three important behaviors:
  lifecycle states are `draft/active/suspended/retired`, missing persisted
  profiles no longer fabricate `profileUpdatedAt` or `deviceBindings`, and
  driver-device binding evidence writes back into driver profile state.
- The parent commit touched:
  `apps/api/src/modules/regulatory-registry`,
  `apps/api/src/modules/driver-profile`,
  `apps/platform-admin-web/app/fleet/page.tsx`,
  `packages/api-client/src/index.ts`, and
  `packages/contracts/src/index.ts`.

Important framing:

- This packet documents the **frontend/BFF consumption boundary** of the parent
  result, not a new canonical spec.
- It is allowed to summarize verified behavior from code/tests, but not to
  invent new lifecycle states, new authority paths, or new runtime guarantees.

---

## 3. What `OPX-MD-001` Established

`OPX-MD-001` made driver master lifecycle explicit and consumable from the
platform-admin fleet surface.

| Area                        | Canonical surface                                                                                | Parent result                                                                                            | Frontend/BFF implication                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Driver registry read        | `GET /api/regulatory-registry/drivers`                                                           | Driver rows now expose lifecycle, work-state, eligibility, profile freshness, and device-binding summary | Platform Admin can render driver master state from one canonical list surface     |
| Driver master create        | `POST /api/regulatory-registry/drivers`                                                          | Admin can create a new driver master record                                                              | New drivers enter as backend-owned master data, not ad hoc UI-only rows           |
| Driver lifecycle transition | `POST /api/regulatory-registry/drivers/:driverId/lifecycle`                                      | Admin can transition `draft -> active -> suspended -> retired`                                           | Lifecycle actions must go through the canonical command endpoint                  |
| Shared client surface       | `packages/api-client` methods `listDrivers`, `createDriverMaster`, `updateDriverMasterLifecycle` | Platform Admin uses shared client wrappers instead of local fetch semantics                              | Downstream web consumers should reuse shared client behavior and envelope parsing |
| Contract shape              | `DriverRegistryRecord` and lifecycle enums in `packages/contracts`                               | Lifecycle status, blocked reasons, `profileUpdatedAt`, and `deviceBindings` are explicit wire fields     | Frontend code may depend on these fields as the freeze-point contract             |
| Audit visibility            | registry audit summaries capture create/lifecycle updates with device-binding count              | Driver/profile/device-link changes are traceable                                                         | UI can treat registry state as auditable backend truth, not local derived truth   |

---

## 4. Canonical Driver Journey Handoff Matrix

The table below compresses the parent result into the frontend-consumer routes,
commands, and meaning of each returned field.

| Driver admin journey         | Primary UI surface                                      | Canonical API / BFF surface                                                                  | Expected contract / behavior                                                                                                                                                   | Handoff note                                                                                    |
| ---------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| List driver masters          | `apps/platform-admin-web/app/fleet/page.tsx` driver tab | `GET /api/regulatory-registry/drivers`                                                       | Each row includes `driverId`, `name`, `lifecycleStatus`, `workState`, `licensesValid`, `dispatchEligible`, `eligibilityBlockedReasons`, `profileUpdatedAt`, `deviceBindings[]` | Treat this as the authoritative driver-admin read model                                         |
| Create driver master         | Fleet driver-create form                                | `POST /api/regulatory-registry/drivers`                                                      | Create command accepts name/contact/profile seed fields; created record defaults to lifecycle `draft` and starts non-dispatchable until blockers clear                         | UI should assume newly created driver is not immediately dispatch-eligible                      |
| Activate driver              | Fleet driver action button                              | `POST /api/regulatory-registry/drivers/:driverId/lifecycle` with `lifecycleStatus=active`    | Backend sets lifecycle to `active`; if prior work state was `offline` or `suspended`, it normalizes to `available`                                                             | UI should refresh from backend after command rather than predicting final row state             |
| Suspend driver               | Fleet driver action button                              | `POST /api/regulatory-registry/drivers/:driverId/lifecycle` with `lifecycleStatus=suspended` | Backend sets lifecycle hold and forces work state to `suspended`                                                                                                               | Suspended drivers must render as not dispatch-eligible                                          |
| Retire driver                | Fleet driver action button                              | `POST /api/regulatory-registry/drivers/:driverId/lifecycle` with `lifecycleStatus=retired`   | Backend retires the master and forces work state to `offline`                                                                                                                  | Retired drivers remain visible as historical master records, not deletions                      |
| Review profile linkage       | Fleet driver table `Profile` column                     | `profileUpdatedAt` from driver list payload                                                  | `profileUpdatedAt != null` means a persisted driver profile exists; `null` means profile is still pending                                                                      | Do not fabricate “profile linked” if timestamp is null                                          |
| Review device linkage        | Fleet driver table `Device Bindings` column             | `deviceBindings[]` from driver list payload                                                  | List is copied from persisted driver profile bindings; missing profile yields an empty list                                                                                    | Empty bindings are a valid backend result, not a UI data-loss bug                               |
| Review dispatch hold reasons | Fleet driver table `Blocked By` column                  | `eligibilityBlockedReasons[]` from driver list payload                                       | Reasons include lifecycle and work-state blockers such as `lifecycle_draft`, `lifecycle_suspended`, `lifecycle_retired`, `work_state_offline`                                  | Render canonical codes/labels; do not collapse distinct backend blockers into one generic state |

---

## 5. Non-Negotiable Consumer Semantics

Frontend or BFF-adjacent consumers relying on this surface must preserve these
rules:

- Lifecycle truth is the canonical enum set
  `draft`, `active`, `suspended`, `retired`. Do not reintroduce old
  `onboarding` or `lifecycle_onboarding` wording in write paths or UI authority.
- Driver lifecycle commands must use
  `POST /api/regulatory-registry/drivers/:driverId/lifecycle`; do not add local
  state transitions or alternate mutation routes.
- `dispatchEligible` is backend-derived. It reflects lifecycle, license, and
  work-state blockers together; the UI must not recompute a separate canonical
  eligibility decision.
- `profileUpdatedAt` and `deviceBindings[]` are presence indicators of
  persisted driver-profile truth. If there is no stored profile, the UI must
  preserve `null` / empty-array semantics.
- Device-binding evidence belongs to the backend profile/registry chain. Do not
  mint synthetic device-link state in frontend storage.
- Shared client consumption should stay on `@drts/api-client` methods
  `listDrivers`, `createDriverMaster`, and `updateDriverMasterLifecycle`
  instead of duplicating fetch/envelope behavior.
- Audit trails remain observation of backend writes. They are not an alternate
  control plane for changing driver lifecycle.

---

## 6. Explicit Caveats And Freeze-Point Limits

These caveats are part of the handoff and should stay visible:

| Caveat                                                  | Verified parent behavior                                                                                               | Consumer implication                                                                                |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Newly created drivers are not instantly dispatchable    | Parent tests expect create result to default to `lifecycleStatus=draft`, `workState=offline`, `dispatchEligible=false` | Onboarding UI should present “created but not yet eligible” as normal                               |
| Missing persisted profile is real, not synthesized away | Parent review/tests verify no fabricated `profileUpdatedAt` or `deviceBindings` for missing profile records            | Frontend must show profile/device state as pending rather than pretending a profile exists          |
| Lifecycle actions normalize work-state                  | Activation can move `offline` or `suspended` drivers back to `available`; suspend/retire force non-active work states  | Refresh-after-write is required; optimistic local mirroring may drift from canonical state          |
| This slice is platform-admin focused                    | Parent write scope touched platform-admin fleet and registry contracts, not driver-app onboarding UX                   | Do not claim this packet delivered new driver-app onboarding screens or end-user self-service flows |

---

## 7. Frontend / BFF Handoff Notes

### 7.1 Platform Admin Fleet Consumers

- Use the Fleet driver tab as the canonical operator surface for this slice.
- Treat row badges and hold reasons as projections of backend contract fields.
- After create or lifecycle actions, reload the canonical driver list rather
  than mutating local derived truth as if it were authoritative.

### 7.2 API Client Consumers

- Reuse `packages/api-client/src/index.ts` methods already added by the parent:
  `listDrivers`, `createDriverMaster`, and `updateDriverMasterLifecycle`.
- Preserve the existing envelope/list parsing behavior instead of introducing a
  task-local client variant.

### 7.3 Audit / Governance Readers

- Registry audit entries now summarize lifecycle transitions with lifecycle
  state, work state, eligibility blockers, and device-binding count.
- Use those audit traces as evidence that lifecycle/profile/device links are
  backend-written and reviewable, not as permission to move control logic out of
  the registry.

---

## 8. Reviewer Outcome And Remaining Owner Check

Historical reviewer approval already confirmed the following points:

1. The packet stays support-only and does not modify parent runtime,
   contracts, or L1/L2 truth.
2. Every lifecycle claim matches the parent done state of `OPX-MD-001` and the
   verified enum set `draft/active/suspended/retired`.
3. The handoff preserves the important freeze-point semantic that missing
   persisted profiles do **not** fabricate `profileUpdatedAt` or
   `deviceBindings`.
4. The listed consumer rules do not move dispatch-eligibility or lifecycle
   authority into frontend code.
5. The packet is sufficient for downstream platform-admin/frontend consumers to
   wire or review the driver-admin surface without inventing extra endpoints or
   unsupported onboarding claims.

The only remaining owner responsibility is to keep this support artifact aligned
with the latest shared-truth ownership snapshot and finalize the sidecar to
`done` via the status script. The historical review note still mentions return
to `Codex2` because the reviewer approval predated the later owner rebalance.

---

## 9. Recorded Workflow / Closeout Commands

Original owner handoff to reviewer:

```bash
AI_NAME=Codex2 ./scripts/ai-status.sh handoff OPX-MD-001-SIDECAR-BFF-HANDOFF Codex \
  "OPX-MD-001 sidecar handoff packet ready in support/sidecars/OPX-MD-001/OPX-MD-001-SIDECAR-BFF-HANDOFF.md. It freezes the platform-admin driver lifecycle/admin surface around GET/POST /api/regulatory-registry/drivers and POST /api/regulatory-registry/drivers/:driverId/lifecycle, documents profileUpdatedAt/deviceBindings presence semantics, and keeps dispatch eligibility as backend-owned truth. Support artifact only; no canonical/runtime changes."
```

Historical reviewer approval:

```bash
AI_NAME=Codex \
REVIEW_FILE=support/sidecars/OPX-MD-001/OPX-MD-001-SIDECAR-BFF-HANDOFF.md \
REVIEW_NOTES_ZH='審查通過：handoff packet 正確整理 OPX-MD-001 已完成的 driver master lifecycle/admin surface，driver list/create/lifecycle command 與 parent done state 對齊，且保留缺少 persisted profile 時不得虛構 profileUpdatedAt / deviceBindings 的語義。dispatchEligible 仍明確維持 backend-owned，未把 authority 移回前端。|回到 owner（Codex2）以 NO_COMMIT_REQUIRED=1 做 done closeout。' \
./scripts/ai-status.sh approve OPX-MD-001-SIDECAR-BFF-HANDOFF \
  "Review approved. Handoff packet preserves the OPX-MD-001 driver lifecycle/admin surface, profile/device-binding semantics, and backend-owned eligibility rules without changing canonical truth."
```

Current owner closeout after availability-first reassignment:

```bash
AI_NAME=Codex NO_COMMIT_REQUIRED=1 ./scripts/ai-status.sh done OPX-MD-001-SIDECAR-BFF-HANDOFF \
  "Done: OPX-MD-001 BFF/frontend handoff packet recorded the platform-admin driver lifecycle surface, explicit profile/device-binding semantics, and downstream consumer rules without changing canonical truth."
```

---

This packet is a sidecar support artifact. It records the frontend/BFF handoff
boundary established by completed parent task `OPX-MD-001`; it does not replace
the parent execution packet, registry authority, or machine-tracked task
evidence.
