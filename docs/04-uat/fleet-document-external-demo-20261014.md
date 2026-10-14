# FLEET-DOCUMENT-EXTERNAL-DEMO-20261014

Owner: Codex · Reviewer: Codex2. Base: `620bc67bf394d45281393391d7c7f14bf933794e`.
Task specification: `/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261014T0109-root/fleet-document-demo-registration/task-spec.json`.
Initial implementation; no previous review findings/candidate.

## Source and implementation boundary

- `components/fleet-supply-workspace.tsx`: `uploadDocument` requests a real upload intent, calls `putFleetDocument`, hashes the selected File, confirms metadata and refreshes detail. `submitSubmission` / `withdrawSubmission` POST real commands with `expectedRevisionNo`. Withdrawn records reuse submit with the resubmit label.
- `app/cases/[caseId]/case-reply-composer.tsx`: `uploadAttachment` requests an intent, sends File bytes with `putFleetDocument`, confirms and refreshes. Retries retain the actual selected File.
- `lib/fleet-document-upload.ts`: `putFleetDocument` waits for PUT/scanner success; `fleetDocumentRequest` uses the existing control-plane proxy. No demo branches will be added to either caller/helper.
- `packages/contracts/src/phase1-delta-supply-eligibility.ts`: authoritative supply document types and `draft` / `submitted` / `withdrawn` terminology. The demo models only an illustrative subset, without real IDs, revision commands, checksums or scan receipts.
- `lib/i18n.tsx` and `lib/translations.ts`: Fleet uses `zh` / `en`. New scoped demo copy will use the existing locale hook and partner Canvas theme.
- `lib/fleet-document-demo.ts`: independent reducer, fixed harmless metadata, local event replay and simulation-tagged export. Skipped scanner remains `skipped`; positive simulated outcome is `simulated_pass`, never real `clean`.

## Work and evidence journal

Implementation in progress. Actual page controls and jsdom interaction regressions are the next unit. Repository checks only on this VM; no product runtime, browser/E2E, PG or Docker infrastructure.

| Finding / requirement | Source and change | Baseline → result | Command / exit / version / evidence | Unverified limitations |
| --- | --- | --- | --- | --- |
| Missing independent document simulation | Baseline has no Fleet `app/demo`; see original task diagnosis `external-document-simulation-gap.json`. Add isolated `/demo` and navigation. | Baseline static absence confirmed; implementation pending. | Source inspection at base SHA above. | Hosted route/render acceptance pending. |
| Storage/scanner pending, failure, retry and explicit skip | `transitionDocumentDemo` retains example metadata and distinct skipped states. | New capability; actual control tests pending. | Pending. | No provider execution or genuine scan evidence. |
| Confirm, submit, withdraw, resubmit, reset and export | Reducer and planned actual page handlers. | Pending. | Pending. | Illustrative local workflow only. |
| Production behavior preserved | Existing upload/confirm callers untouched; existing regression planned. | Pending. | Pending. | No live provider / full-system / native / production acceptance claimed. |

No formal required acceptance keys are listed on this source task. Existing Pi operational evidence work, Receipt HOLD and paused/deferred/native/full production gates remain independent. Only the root release coordinator may cut/deploy the later immutable release after source review/CI/merge.
