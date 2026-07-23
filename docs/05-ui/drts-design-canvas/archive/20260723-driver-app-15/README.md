# Submitted Design Delta: `driver app (15).zip`

**Archive date:** 2026-07-23
**Archive type:** exact delta overlay
**Authority:** non-canonical visual reference
**Source ZIP SHA-256:**
`634f27855d141633a1c1de102a2fee1c2a03850949f43b927c5fb6dea859a915`

This directory preserves the submitted system-design update without replacing
the canonical canvas. The ZIP contains 138 entries. Eight source-facing files
were selected for archival after excluding generated previews, exports,
duplicate documents, uploads, and unchanged dependencies.

Seven of the eight files differ from `dev@2711c366f`; `Driver App.html` is
byte-identical to the current canonical file and is retained so the submitted
set can be audited as a whole.

## How to inspect

This is a delta overlay, not a standalone bundle:

1. start with `docs/05-ui/drts-design-canvas/` at the recorded baseline;
2. overlay the eight files in this directory only for visual comparison;
3. do not copy the overlay into production code;
4. resolve every behavior conflict in favor of
   `08_multi_taxi_operations_ui_design_requirements_20260723.md` v1.1.

The exact file hashes and source-selection rules are in [`manifest.json`](./manifest.json).
The implementation disposition and Fleets packets are in
[`09_uploaded_system_design_archive_execution_tasks_20260723.md`](../../../../02-architecture/phase1-p5-s3-multi-taxi-20260720/09_uploaded_system_design_archive_execution_tasks_20260723.md).

## Scope ruling

The following visual ideas may be adapted to existing production routes:

- authorization fields and supported lifecycle actions;
- multi-taxi service and virtual-matching labels;
- the inline legal-denial explanation;
- the minimum operational-record query and direct download;
- S-3 screens as current-head verification references.

The following concepts are not authorized by this archive:

- dedicated queue navigation or queue-only routes;
- six separate authorization pages;
- revoke, restore, vehicle suspend, or other unsupported commands;
- rating moderation, payment exception, fare anomaly, or certificate consoles;
- legal hold, export-job orchestration, or retention-policy administration.

Archiving a frame preserves evidence; it does not create a product requirement.
