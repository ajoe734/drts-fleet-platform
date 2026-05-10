# XS-UI-004 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `XS-UI-004` — Shared Query And Filter Model Normalization
**Parent Owner:** `Codex2` (per `ai-status.json` machine truth — design execution packet
originally listed `Claude` as parent owner; this packet flags the drift but treats
`ai-status.json` as truth.)
**Parent Reviewer:** `Codex` (per `ai-status.json` machine truth — design execution packet
originally listed `Codex2` as parent reviewer; this packet flags the drift but treats
`ai-status.json` as truth.)
**Sidecar Owner:** `Claude2`
**Sidecar Reviewer:** `Codex2`
**Generated:** `2026-05-08` (UTC)
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` — support-only; does not modify canonical truth, the
design execution packet, runtime behavior, or any L1/L2 product surface.

This packet is a companion sidecar to the parent's filed normalization packet at
`support/sidecars/XS-UI-004/filter-normalization-packet.md`. The parent packet records the
canonical recommendation; this packet captures the acceptance checklist, the dependency map,
and the parent-finalize gate sequence so the parent owner has a copy-paste reference now that
parent reviewer (`Codex`) has approved.

---

## 1. Scope Boundary

In scope:

- Translate the parent task's `acceptance` field and the design-packet `Work` block into a
  concrete, citation-anchored acceptance checklist.
- Pin the dependency map and confirm each upstream slice is `done` in machine truth.
- Capture the parent-finalize gate sequence (commit / push / done) so the parent owner has the
  exact closeout reference now that the parent has reached `review_approved`.
- Note open finalize gaps (untracked parent artifact, no parent commit yet) so they are not
  lost on the parent owner side.

Out of scope:

- editing L1/L2 product truth (`phase1_*`, contracts bundle), the design execution packet, the
  source product spec, or the parent task's machine-truth fields
  (`ai-status.json -> XS-UI-004`).
- editing or rewriting the parent's filed normalization packet
  (`support/sidecars/XS-UI-004/filter-normalization-packet.md`) — this acceptance packet only
  cross-references its content and citations.
- editing any frontend / backend code under `apps/**` or `packages/**`. XS-UI-004 is an
  additive docs/evidence slice; downstream `TEN-UI-002`…`TEN-UI-008` consume the packet rather
  than being changed by it.
- approving or finalizing the parent task; parent reviewer (`Codex`) owns parent approval and
  parent owner (`Codex2`) owns parent commit/push/done.

---

## 2. Machine Truth Anchors

### Sidecar (this task) — `ai-status.json -> XS-UI-004-SIDECAR-ACCEPTANCE`

- owner=`Claude2`
- reviewer=`Codex2`
- status (at packet write): `in_progress` after a reviewer-driven `reopen`. Lifecycle so far
  in machine truth: started by `Claude2` → handed off to `Codex2` for review at
  `2026-05-08T21:34:58Z` → reopened by reviewer at the next status transition because §2 of
  this packet had not been refreshed to reflect the parent's `review_approved` snapshot. This
  refresh resyncs §2 to the current machine truth; on next handoff the status will move back
  to `review` for `Codex2`.
- task_class=`sidecar`
- helper_parent=`XS-UI-004`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- depends_on: `XS-UI-001` (mirrors the parent's dependency set)
- artifacts: `support/sidecars/XS-UI-004/XS-UI-004-SIDECAR-ACCEPTANCE.md` (this file)

### Parent — `ai-status.json -> XS-UI-004`

- owner=`Codex2`, reviewer=`Codex`
  - **Drift:** the design execution packet records this slice as
    `Owner: Claude / Reviewer: Codex2`
    (`docs/03-runbooks/tenant-console-and-cross-system-design-execution-packet-20260508.md:266-267`).
    `ai-status.json` is canonical for ownership; the design packet is a static planning doc
    written before the chairman reassigned the lane. This packet does not reconcile the
    drift; it flags it for the parent owner so the closeout commit message and `Reviewer`
    trailer can match `ai-status.json`.
- status=`review_approved` (per latest snapshot, `last_update=2026-05-08T21:29:44Z`) — parent
  reviewer (`Codex`) approved with the verification line "git diff --check --
  support/sidecars/XS-UI-004/filter-normalization-packet.md PASS"; parent owner (`Codex2`) now
  owns closeout (commit / push / `done`).
- depends_on: `XS-UI-001`
- artifacts (per `ai-status.json`): `support/sidecars/XS-UI-004` (directory)
  - As of packet write, the directory contains the parent's filed
    `filter-normalization-packet.md` (currently **untracked** in git per
    `git status --porcelain support/sidecars/XS-UI-004/` → `?? support/sidecars/XS-UI-004/`)
    and this acceptance sidecar.
- acceptance: `filter normalization packet filed`
- recorded outcome (parent `next` field at this snapshot):
  > "Review approved: filter-normalization packet satisfies acceptance. Spot checks confirm
  > the cited admin/tenant list-surface drift in current page/controller/api-client
  > implementations, preserves status vs rollout-stage vs derived-attention separation, and
  > standardizes q/status/stage/dateField/dateFrom/dateTo/page/pageSize for downstream TEN-UI
  > list work. Verification: packet content re-read; git diff --check --
  > support/sidecars/XS-UI-004/filter-normalization-packet.md PASS. No runtime/code tests
  > applicable for this docs-only artifact. Owner can finalize after normal review_approved
  > closeout flow."
- execution_packet: `TEN-UI-20260508`
- packet_path: `docs/03-runbooks/tenant-console-and-cross-system-design-execution-packet-20260508.md`
- design_review: `docs/05-ui/drts-management-ui-review-execution-tasks-20260508.md`
- design_source: `docs/05-ui/drts.zip`
- source_spec: `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md`
- commit_hash / push_remote / push_branch: **None** at packet write — parent finalize commit
  and push are the remaining gate before parent `done`.

### Authoritative source documents

- L1 / L2 product truth — list-query semantics drive from booking lists, partner readiness,
  tenant user lifecycle, and the page-based envelope:
  - `phase1_prd_detailed_v1.md`
  - `phase1_service_contracts_v1.md`
- Page-envelope shape (consumed by the recommended `page` / `pageSize` rule):
  - `apps/api/src/common/api-envelope.ts:7-49`
- Design execution packet — parent slice spec:
  - `docs/03-runbooks/tenant-console-and-cross-system-design-execution-packet-20260508.md`,
    section `### XS-UI-004 — Shared Query And Filter Model Normalization` (lines 264-286).
- Source product spec (cited inside the parent packet for date-range scope):
  - `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md` — booking
    period/status filter expectations referenced at lines 882-884, 921-922, and 1411 inside
    the parent packet.
- Companion canonical artifact:
  - `support/sidecars/XS-UI-004/filter-normalization-packet.md` (parent's filed packet)
- Sibling sidecar packets cross-referenced by the parent packet:
  - `support/sidecars/XS-UI-001/route-to-endpoint-map.md`
  - `support/sidecars/XS-UI-003/command-action-matrix.md`

---

## 3. Dependency Map

The parent task's `depends_on` set is `XS-UI-001`. That single upstream slice is `done` in
`ai-status.json` at packet write.

| Dep ID      | Title                            | Owner   | Reviewer | Status (truth)            | What this slice provides to XS-UI-004                                                                                                                                                                                                                                                                                                                                                                 |
| ----------- | -------------------------------- | ------- | -------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `XS-UI-001` | Route-To-Endpoint Mapping Packet | Claude2 | Codex    | `done` (commit `ac44883`) | Tenant-console route-to-endpoint map at `support/sidecars/XS-UI-001/route-to-endpoint-map.md` and the umbrella execution packet at `docs/03-runbooks/tenant-console-and-cross-system-design-execution-packet-20260508.md`. XS-UI-004's drift snapshot and surface-by-surface mapping rely on XS-UI-001 having already named and pinned the in-scope admin/tenant list surfaces and their controllers. |

Dependency assertion:

- The parent's normalization packet is a pure documentation layer over the surfaces and
  endpoints that `XS-UI-001` already named and pinned. No upstream slice needs to reopen for
  parent acceptance.
- If `XS-UI-001` later reopens (e.g., the route-to-endpoint map is revised so a list surface
  is added, removed, or relocated), the dependency map for `XS-UI-004` must be re-validated
  and the parent packet's §1 drift snapshot and §4 surface-by-surface mapping cross-checked
  before the parent can return to `done`.

Reverse dependents (for context, not acceptance gates):

- `TEN-UI-002` (Tenant Console Shell And Information Architecture Materialization,
  `depends_on` includes `XS-UI-004`) — must consume `SharedListQueryV1` parameter names as the
  shell-level query convention for tenant routes that surface lists.
- `TEN-UI-004` (booking list shell) — must replace the current one-off `?status=` URL
  contract with the shared multi-field query shape; this is called out as the most urgent
  downstream consumer in the parent packet (§4.5).
- `TEN-UI-007` (tenant users / audit / governance lists) — must adopt the same `q` /
  `status` / `page` / `pageSize` keys instead of inventing per-form filter names.
- Other tenant-wave slices (`TEN-UI-003`, `TEN-UI-005`, `TEN-UI-006`, `TEN-UI-008`) inherit
  the same shared shape if they expose list surfaces.

These reverse dependents are informational only; they do not gate XS-UI-004 finalization.

---

## 4. Acceptance Checklist

Each item below is the acceptance gate for parent `XS-UI-004` rephrased into a concrete,
citation-anchored check. Parent reviewer (`Codex`) has already run and signed off on the
acceptance (parent status=`review_approved` as of 2026-05-08T21:29:44Z); this checklist is
the support map for that review and for the parent owner's own self-check during finalize.

Legend: `[REQUIRED]` = explicit gate from the design packet or `ai-status.json -> acceptance`.
`[DERIVED]` = unwritten but implied by the design packet's `Work` block; the parent reviewer
may treat these as informational.

### A. Recorded acceptance command `[REQUIRED]`

`ai-status.json -> XS-UI-004 -> acceptance`:

- [x] `filter normalization packet filed`
  - Parent reviewer (`Codex`) recorded the gate as satisfied in the parent task's `next`
    field at the moment of `review_approved` (2026-05-08T21:29:44Z): "Review approved:
    filter-normalization packet satisfies acceptance."
  - Filed packet path: `support/sidecars/XS-UI-004/filter-normalization-packet.md`. Section
    7 of that packet states: "Acceptance requested by the execution packet is satisfied when
    this packet is filed as the canonical normalization recommendation for search, status,
    date-range, and pagination semantics across the selected admin and tenant list
    surfaces."
  - This sidecar does **not** re-author or extend the parent packet; reviewer-recorded
    approval is the machine-truth signal.

### B. Drift audit of current list surfaces `[REQUIRED]`

Design packet rule (`docs/03-runbooks/tenant-console-and-cross-system-design-execution-packet-20260508.md:276-281`):
"Normalize search / status / date-range / pagination expectations across the selected admin
and tenant list surfaces. Record where a shared DTO or filter-shape contract should be
introduced or reused rather than letting each surface invent its own query semantics."

The parent packet §1 ("Current drift snapshot",
`support/sidecars/XS-UI-004/filter-normalization-packet.md:28-55`) covers each in-scope
surface with cited evidence:

- [x] Platform Admin `/tenants` — local `filter` mixes rollout stage with persisted status;
      unfiltered list call. Citations: `apps/platform-admin-web/app/tenants/page.tsx:40-56`,
      `111-159`; `packages/api-client/src/index.ts:1534-1538`.
- [x] Platform Admin `/partners` — local `filter` mixes persisted `status` with derived
      `attention`. Citations: `apps/platform-admin-web/app/partners/page.tsx:32-50`, `100-140`;
      `packages/api-client/src/index.ts:1540-1544`.
- [x] Platform Admin `/users` — status-only local filter, no shared search/date/pagination.
      Citations: `apps/platform-admin-web/app/users/page.tsx:34-49`, `75-111`;
      `packages/api-client/src/index.ts:1675-1677`.
- [x] Platform Admin `/fleet` — full vehicle/driver/contract lists fetched in parallel,
      partitioned by local tab. Citations:
      `apps/platform-admin-web/app/fleet/page.tsx:97-125`.
- [x] Tenant `/booking-list` — only `?status=` is read from URL; full list fetched then
      filtered client-side; filter bar hardcodes the URL. Citations:
      `apps/tenant-portal-web/app/booking-list/page.tsx:30-47`,
      `apps/tenant-portal-web/components/booking-filter-bar.tsx:22-28`.
- [x] Tenant `/users` — no search/filter/pagination at all. Citations:
      `apps/tenant-portal-web/app/users/page.tsx:8-29`, `55-89`.
- [x] Backend / api-client evidence supporting drift: list controllers expose no query DTO
      (`apps/api/src/modules/platform-admin/tenants.controller.ts:17-20`,
      `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts:107-110`,
      `apps/api/src/modules/platform-admin/platform-admin.controller.ts:133-136`,
      `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts:364-372`,
      `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts:203-214`); api-client
      exposes only no-arg list methods (`packages/api-client/src/index.ts:538-540`,
      `1330-1335`, `1534-1544`, `1675-1677`, `1824-1833`, `1897-1900`); page envelope already
      exists but is mostly ignored (`apps/api/src/common/api-envelope.ts:27-49`,
      `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:801-815`).

### C. Recommended shared shape `[REQUIRED]`

Design packet acceptance language (line 285-286): "filter / query normalization packet filed
with explicit recommended shared shape."

- [x] An explicit shared TypeScript shape is recorded in the parent packet §3 ("Recommended
      shared DTO shape", `support/sidecars/XS-UI-004/filter-normalization-packet.md:115-131`):
      `SharedListQueryV1` with `q`, `status[]`, `stage[]`, `dateField`, `dateFrom`, `dateTo`,
      `page`, `pageSize`.
- [x] An explicit shared URL encoding example is recorded in §3 (lines 133-138).
- [x] Encoding rules pinned in §3 (lines 139-146): comma-delimited multi-select for
      `status` / `stage`, omit absent fields, ISO/UTC strings for date bounds, default
      `page=1, pageSize=25`.
- [x] Page-based envelope is consciously chosen over cursor-based, with citation to the
      current envelope shape (parent packet §2.3 / lines 98-104; envelope source
      `apps/api/src/common/api-envelope.ts:7-49`).

### D. Semantic separation rules `[REQUIRED]`

The product spec referenced inside the parent packet (lines 921-922, 1411, 882-884) requires
list filtering by period or status across multiple surfaces. The parent packet §2 records the
separation rules that protect those semantics:

- [x] §2.1 — `status` is reserved for persisted backend status enums only; rollout stage,
      derived readiness/attention, tab choice, and date presets are explicitly excluded
      (parent packet §2.1, lines 62-82).
- [x] §2.2 — separate keys for separate semantics: `q`, `status`, `stage`, `dateField`,
      `dateFrom`, `dateTo`, `page`, `pageSize`; derived UI-only chips (e.g. `attention`) stay
      local-only until a backend field exists (lines 83-96).
- [x] §2.4 — date ranges must be field-qualified via `dateField`; raw `from` / `to` is
      insufficient when different surfaces filter on different timestamps (lines 106-114).

### E. Surface-by-surface mapping `[DERIVED]`

The design packet does not require a per-surface map, but the `Work` block ("Normalize …
across the selected admin and tenant list surfaces") implies one is needed for downstream
slices to consume.

- [x] Platform Admin tenants — parent packet §4.1 (lines 149-165): split overloaded `filter`
      union into `status` (persisted) and `stage` (rollout).
- [x] Platform Admin partner entries — parent packet §4.2 (lines 166-181): keep `attention`
      local; if backend later adds readiness query, use a distinct key (`readinessState`), not
      `status`.
- [x] Platform Admin users — parent packet §4.3 (lines 183-194): direct adopt with no extra
      axis.
- [x] Platform Admin fleet — parent packet §4.4 (lines 196-208): keep separate list
      resources per tab; reuse the same `SharedListQueryV1` keys per resource; `activeTab` is
      navigation, not a filter field.
- [x] Tenant booking list — parent packet §4.5 (lines 210-227): replace one-off `?status=`
      URL with the shared shape; move filtering server-side or api-client-side around the
      canonical query.
- [x] Tenant users — parent packet §4.6 (lines 229-241): same `q` / `status` / `page` /
      `pageSize` model; downstream `TEN-UI-007` must not invent `roleStatus` / `inviteStatus`.

### F. Downstream consumer guidance `[DERIVED]`

- [x] `TEN-UI-002` shell-level convention (parent packet §5, lines 245-247).
- [x] `TEN-UI-004` booking list adoption with explicit replacement of the current `?status=`
      URL contract (parent packet §5, lines 247-249, restated in §4.5).
- [x] `TEN-UI-007` tenant users / audit / governance lists adoption (parent packet §5, lines
      249-251).
- [x] Future management surfaces must reuse the same parameter names; new keys only when
      the new axis is a distinct domain concept (parent packet §5, lines 251-253).

### G. Explicit non-goals `[DERIVED]`

The packet documents what it deliberately does **not** claim, so reviewer scope-creep
challenges are pre-answered:

- [x] Does not claim every backend endpoint already supports the shared DTO (parent packet
      §6, lines 257-258).
- [x] Does not create a readiness/attention backend filter owner for partner entries (parent
      packet §6, lines 259-261).
- [x] Does not force fleet/registry resources into one common endpoint; only one shared
      query vocabulary across per-resource lists (parent packet §6, lines 262-263).

### H. Scope containment `[DERIVED]`

Design packet write-scope rule for XS-UI-004 (lines 271-274): "additive docs/evidence only;
shared frontend contract surfaces only if normalization work is code-backed."

- [x] No code under `apps/**` or `packages/**` was modified for the parent acceptance; the
      parent diff is contained to `support/sidecars/XS-UI-004/filter-normalization-packet.md`
      alone (additive doc).
- [x] No edits leak into `phase1_*` truth, the design execution packet, the source product
      spec, or the contracts bundle.
- [x] This sidecar likewise touches only `support/sidecars/XS-UI-004/XS-UI-004-SIDECAR-ACCEPTANCE.md`.

### I. Open finalize gaps (still required for parent `done`) `[REQUIRED]`

The parent has reached `review_approved`. Reviewer (`Codex`) has signed off and recorded the
verification command (`git diff --check -- support/sidecars/XS-UI-004/filter-normalization-packet.md`
PASS). What remains are owner-side closeout steps. They are repeated here so this packet and
any future review packet surface the same closeout map.

- [ ] Parent owner (`Codex2`) needs a parent-scoped commit. The parent's filed packet
      (`support/sidecars/XS-UI-004/filter-normalization-packet.md`) is currently **untracked**
      in git (`git status --porcelain support/sidecars/XS-UI-004/` reports the directory as
      untracked at packet write). The closeout commit must:
  - subject must include `XS-UI-004`
  - body trailers must include:
    - `LLM-Agent: Codex2`
    - `Task-ID: XS-UI-004`
    - `Reviewer: Codex`
  - body should also record the verification line:
    - `Verification: git diff --check -- support/sidecars/XS-UI-004/filter-normalization-packet.md`
- [ ] Parent owner needs a normal non-force push of that commit; record `PUSH_REMOTE` and
      `PUSH_BRANCH` (current branch is `codex/dev-deploy-backend-android`). Per
      `AI_COLLABORATION_GUIDE.md` §5, if a safe normal push is not possible, the parent owner
      records a blocker/progress note rather than marking `done`.
- [ ] Optional but recommended: parent owner's commit message can also mention the design-
      packet ownership drift (design packet listed `Owner: Claude / Reviewer: Codex2`; truth is
      `Owner: Codex2 / Reviewer: Codex`). Reconciling the design packet itself is **not**
      required for parent `done`; this packet calls it out as documentation hygiene that
      parent owner may defer or hand to the design-packet owner.
- [ ] Optional but recommended: parent owner's closeout note reaffirms that no
      `apps/**` / `packages/**` code change was made and no L1/L2 truth was edited, mirroring
      the sibling sidecar's reviewer language for symmetry across the wave.

---

## 5. Parent Finalize Gate Sequence

Order of operations for parent `XS-UI-004`, now that `Codex` has approved
(`status=review_approved`):

1. Parent owner (`Codex2`) re-confirms the verification command on the final state of the
   working tree:

   ```bash
   git diff --check -- support/sidecars/XS-UI-004/filter-normalization-packet.md
   ```

   This is the same gate the reviewer ran. For an untracked file, `git diff --check` is a
   no-op; running

   ```bash
   git diff --no-index --check /dev/null support/sidecars/XS-UI-004/filter-normalization-packet.md
   ```

   gives a stricter whitespace check before staging (this is the same stricter command that
   `XS-UI-002` reviewer flagged as the right form for untracked-file whitespace verification,
   `ai-status.json -> XS-UI-002 -> next`).

2. Parent owner stages only the parent's write-scope file
   (`support/sidecars/XS-UI-004/filter-normalization-packet.md`) and creates a
   parent-scoped commit with the trailers listed in §4I.

3. Parent owner pushes the task-scoped commit with a normal non-force push and captures
   `COMMIT_HASH`, `COMMIT_SUBJECT`, `PUSH_REMOTE`, `PUSH_BRANCH`.

4. Parent owner runs `done` for the parent task, e.g.:

   ```bash
   AI_NAME=Codex2 \
     COMMIT_HASH=<sha> \
     COMMIT_SUBJECT="<subject including XS-UI-004>" \
     PUSH_REMOTE=origin \
     PUSH_BRANCH=codex/dev-deploy-backend-android \
     ./scripts/ai-status.sh done XS-UI-004 \
     "Owner finalized approved task: parent commit + push complete; filter-normalization packet filed at support/sidecars/XS-UI-004/filter-normalization-packet.md; verification git diff --check on the filed packet PASS; downstream TEN-UI consumers (TEN-UI-002 / TEN-UI-004 / TEN-UI-007) cleared to adopt SharedListQueryV1."
   ```

5. Sidecar tasks (`XS-UI-004-SIDECAR-ACCEPTANCE`, this packet) follow their own sidecar
   closeout — `NO_COMMIT_REQUIRED=1` is allowed because this sidecar is `task_class=sidecar`
   with `mutates_canonical=false`, but this sidecar does **not** substitute for parent
   finalization.

---

## 6. Reviewer Handoff Commands

Approve (sidecar only — does not approve the parent):

```bash
AI_NAME=Codex2 ./scripts/ai-status.sh approve XS-UI-004-SIDECAR-ACCEPTANCE \
  "Acceptance packet aligned with current machine truth: parent XS-UI-004 is status=review_approved with reviewer-recorded git diff --check PASS on support/sidecars/XS-UI-004/filter-normalization-packet.md; sole dependency XS-UI-001 is done (commit ac44883); acceptance gate (filter normalization packet filed) anchored to the parent packet's recommended SharedListQueryV1 shape, the surface-by-surface drift snapshot for /tenants /partners /users /fleet /booking-list /users, and the explicit non-goals; remaining parent-finalize gaps (parent commit + non-force push of the currently untracked filter-normalization-packet.md, optional design-packet owner-drift note) are flagged for parent owner Codex2 without modifying canonical truth."
```

Reopen if drift is found instead:

```bash
AI_NAME=Codex2 ./scripts/ai-status.sh reopen XS-UI-004-SIDECAR-ACCEPTANCE \
  "packet needs revision: [specify machine-truth drift, dependency-map error, missing acceptance gate, scope-creep into apps/**/packages/**/L1/L2 truth, or other support-scope violation]"
```

Blocker form (only if a structural problem prevents approval, e.g. `XS-UI-001` reopens):

```bash
AI_NAME=Codex2 ./scripts/ai-status.sh blocker XS-UI-004-SIDECAR-ACCEPTANCE \
  "blocker: [explain upstream/downstream change that invalidates this packet]"
```

---

## 7. Closeout Note

This sidecar is `task_class=sidecar` with `mutates_canonical=false`, so per
`AI_COLLABORATION_GUIDE.md` §5 commit evidence rule, owner closeout (`Claude2` -> `done`)
may use `NO_COMMIT_REQUIRED=1` after sidecar approval. The parent task `XS-UI-004` is **not**
a sidecar — it still requires the full commit / push / done sequence in §5 above before it
can be marked `done`. Nothing in this packet substitutes for that parent finalization, and
nothing in this packet authorizes any change to L1 / L2 truth, the design execution packet,
the source product spec, or the parent's filed normalization packet.
