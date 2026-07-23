# MTX-DESIGN-WAVE0 Manual Unblock Note

Last updated: 2026-07-23
Task: `MTX-DESIGN-WAVE0-UNBLOCK-MANUAL-UNBLOCK`
Parent task: `MTX-DESIGN-WAVE0`
Owner: `Gemini`
Reviewer: `Copilot`

## Summary

`MTX-DESIGN-WAVE0` is marked as `blocked` with an empty dependency list (`depends_on: []`) because it represents external human visual design team deliverables, not an internal code dependency gap or machine-truth workflow failure.

The task specifies:
- `summary_zh`: "Wave 0 設計閘（授權主控台/佇列語意/評價治理/車資支付留存營運畫面 + handoff QA)。屬人類視覺設計團隊,LLM 車道不得自行發明畫面;完成後解鎖 Fleet B/C/D/F 的 UI 部分。"
- LLM lanes are strictly forbidden from inventing these screens or UI components.

## What Is Already True

- `MTX-DESIGN-WAVE0` canonical task row:
  - owner=`Gemini`
  - reviewer=`Copilot`
  - status=`blocked`
  - depends_on=`[]`
- Deliverables required for `MTX-DESIGN-WAVE0`:
  - `MTX-DESIGN-001` / `MTX-DESIGN-002` (Authorization management & queue semantics screens)
  - `P5-DESIGN-001` / `P5-DESIGN-002` (Rating governance & fare payment retention operating screens)
  - `P5-S3-DESIGN-QA-001` (Design QA handoff)
- Non-UI backend execution tasks under `MTX-Fleets` (such as `MTX-CORE-001`, `MTX-AUTH-001`, `MTX-QUEUE-001`, `P5-RATE-001`) do **not** depend on `MTX-DESIGN-WAVE0` and can proceed independently.
- Only UI portions of Fleets B/C/D/F are held by `MTX-DESIGN-WAVE0`.

## Diagnosis

1. `MTX-DESIGN-WAVE0` has `depends_on: []`, making it appear "dependency-ready" to automated triage (`chairman-blocked-task-triage`).
2. However, the blocker is an **external human prerequisite** (`external_blocked`), as LLM worker lanes are explicitly prohibited from generating/inventing visual design assets for this gate.
3. There is no broken branch history or unmerged code dependency blocking `MTX-DESIGN-WAVE0`.

## Concrete Next Step For `MTX-DESIGN-WAVE0`

1. Retain `MTX-DESIGN-WAVE0` in external hold status until the human visual design team delivers the canvas assets (`MTX-DESIGN-001/002`, `P5-DESIGN-001/002`, `P5-S3-DESIGN-QA-001`) into `docs/05-ui/drts-design-canvas/`.
2. Allow non-UI backend tasks (`MTX-CORE-001`, `MTX-AUTH-001`, `MTX-QUEUE-001`, etc.) to continue execution without waiting for `MTX-DESIGN-WAVE0`.
3. Update `MTX-DESIGN-WAVE0`'s `next` field to reflect this explicit external hold condition so automated triage does not repeatedly flag it as an unexpected internal blocker.

## Non-Claim

This unblock note does not claim that `MTX-DESIGN-WAVE0` is completed, nor does it generate UI screens for `MTX-DESIGN-WAVE0`.
