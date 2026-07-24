# Submitted Design Source Snapshot: `driver app (15).zip`

**Archive date:** 2026-07-23
**Archive type:** exact submitted-source snapshot
**Authority:** approved source provenance; canonical copy promoted 2026-07-24
**Source ZIP SHA-256:**
`634f27855d141633a1c1de102a2fee1c2a03850949f43b927c5fb6dea859a915`

This directory preserves the submitted system-design update that was promoted
to the canonical canvas after Product Owner approval on 2026-07-24. The ZIP
contains 138 entries. Eight source-facing files
were selected for archival after excluding generated previews, exports,
duplicate documents, uploads, and unchanged dependencies.

Seven of the eight files differ from `dev@2711c366f`; `Driver App.html` is
byte-identical to the current canonical file and is retained so the submitted
set can be audited as a whole.

## How to inspect

This is a source snapshot, not a standalone bundle:

1. start with `docs/05-ui/drts-design-canvas/` at the recorded baseline;
2. compare the eight files in this directory to audit the submitted version;
3. use the promoted canonical files for Fleet implementation handoff;
4. resolve every behavior conflict in favor of
   `08_multi_taxi_operations_ui_design_requirements_20260723.md` v1.2.

The exact file hashes and source-selection rules are in [`manifest.json`](./manifest.json).
The current Fleets packet is
[`10_full_17_screen_fleets_execution_tasks_20260724.md`](../../../../02-architecture/phase1-p5-s3-multi-taxi-20260720/10_full_17_screen_fleets_execution_tasks_20260724.md).

## Scope ruling

All 17 submitted screens are approved for production implementation:

- six authorization screens;
- three queue-operation screens;
- three rating-governance screens;
- five commerce/record/export screens.

Approval of a screen does not fabricate a write command. Revoke, restore,
vehicle suspend, rating restore, certificate regeneration, or legal-hold
write actions remain disabled until the corresponding command is implemented
and verified.
