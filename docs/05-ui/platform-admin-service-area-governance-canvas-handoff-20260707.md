# Design Handoff — Platform Admin `/service-area-governance` canvas (2026-07-07)

**To:** the visual/design team (canonical canvas owners)
**From:** engineering (map/geofence wave closeout)
**Purpose:** unblock the one remaining product-UI gap from the map/geofence wave
by getting the `/service-area-governance` screen family published into the
canonical Platform Admin canvas.

> Engineering will **not** invent this UI. Per project rule (LLM/engineers do not
> author net-new visual design; screens come from the canvas), this note hands
> the design team a fully-specified, contract-backed screen brief so the canvas
> can be published. Implementation is queued as `MAP-FE-ADM-002`.

## 1. Confirmed gap

- The canonical canvas (`docs/05-ui/drts-design-canvas/Platform Admin.html` +
  `platform-screens{,-1,-2,-3}.jsx`) has **no** artboard/route for normal taxi
  **service-area governance**. It only defines Tenant Governance and Partner
  Governance surfaces.
- `docs/05-ui/drts-design-canvas/platform-sandbox.jsx` covers the **Phase 2
  sandbox** operating-area / approved-route surface. That is a **different
  authority boundary** and **must not be reused** as the taxi-geofence screen.
- Backend authority (`MAP-BE-006`), the shared `GeometryEditor` primitive
  (`MAP-UI-002`), and the full behavioural spec already exist — only the visual
  canvas is missing.

## 2. What to publish

**One canonical route:** `/service-area-governance` (may split into child routes
only if the visual team needs it). Full behaviour/data/API authority is in
**`docs/05-ui/platform-admin-service-area-governance-screen-requirements-20260703.md`**
— that packet is the source of truth; this note is just the cover.

Required page regions (§5 of the requirements packet):

1. Header / route identity
2. Record-type switcher (service-area boundary ↔ stop policy)
3. Map / geometry workspace (polygon + circle only; uses `GeometryEditor` — keep
   sandbox route-corridor editing visually distinct or absent on this surface)
4. Record list / version stack (draft → review → active → retired, effective dating)
5. Review / publish panel
6. Affected-sample preview (evaluator preview; backend stays authority)
7. Audit visibility (actor / version / decision receipts)

Primary flows the design must support (§6): (6.1) publish a no-pickup zone,
(6.2) validate backend impact before closeout, (6.3) retire/replace an active
policy safely — plus the empty / error / degraded states (§7).

## 3. Scope guardrails

- **In scope:** normal taxi service-area boundaries + stop policies under
  `/api/service-area/admin/*`.
- **Out of scope (do not merge in):** Phase 2 sandbox ODD operating areas,
  approved routes, experiment jurisdictions, sandbox suspend/resume — those live
  on the sandbox surface.

## 4. Design deliverable = done when

- `Platform Admin.html` + `platform-screens-*.jsx` publish the
  `/service-area-governance` route family covering regions §5.1–5.7 and flows
  §6.1–6.3, visually distinct from `platform-sandbox.jsx`.

## 5. Next step after canvas lands

Unblock and dispatch **`MAP-FE-ADM-002`**
(`.orchestrator/task-briefs/MAP-FE-ADM-002.md`): implement the route in
`apps/platform-admin-web` against the published canvas + existing contracts +
`GeometryEditor`. This closes the UI side of **Gate B** (governance safe to
publish) and `MAP-GAP-005`/`-011`.
