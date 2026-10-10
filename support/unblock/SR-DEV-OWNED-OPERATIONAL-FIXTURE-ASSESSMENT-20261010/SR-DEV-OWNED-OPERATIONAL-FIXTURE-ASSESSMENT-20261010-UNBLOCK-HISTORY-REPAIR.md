# SR-DEV-OWNED-OPERATIONAL-FIXTURE-ASSESSMENT-20261010 History Repair

## Contamination Analysis
The canonical TaskSpec CURRENT and historical `14:31` explicitly authorized the `72e7c5f85cd6b4d837dc5651273b5db41c5edb7b` baseline and consumed that one recovery, prohibiting additional routes without prospective disposition. The previous assertion that all successors through `-v6` descended from it was disproved (`git merge-base --is-ancestor 72e7c5f85cd6b4d837dc5651273b5db41c5edb7b d511d0378b3432829cce37d8dfd307d42d951143` exits 1). 
Actual parent `show` identifies four invalid published subjects, not merely cleanup ancestry:
- `490090`
- `5ebd73`
- `e87e60`
- `7aa2b7`

## Repair Path and Prospective Publication
To provide a non-destructive prospective publication path without force-pushing shared history, rewriting history, or bypassing checkers, a new successor branch `-v8` was created.
- **Base (dev) SHA:** `a55e6533b6738588df3bf87df8e45f5fde03b20b`
- **New -v8 SHA:** `cc460c779e1212cf46422a46f22ceccb4cd40f04`

This `-v8` commit restores four task-specific assessment blobs exactly as they were at the unapproved WIP anchor `769d0da4dccf3dc955e8a72e150f80c5f248925c` (which occurred at `21:50:56`, AFTER the actual reviewed `340797001822872611083257bd4583ef0c24bad4` / R2parentREOPEN at `21:45:22`):
- `.github/workflows/dev-owned-operational-fixture-assessment.yml`
- `docs/04-uat/dev-owned-operational-fixture-assessment-20261010.md`
- `operations/verification/assess-owned-operational-fixtures.py`
- `tests/unit/gcp-artifact-activation-20261004/test_owned_operational_fixture_assessment.py`

This preserves +137/-20 subsequent changes in three files versus `340797`, keeps `709232521646aefd2888e72c958507b2886268ee` as an ancestor, and passes the generic trailer check. Dev-range diff-check exited 0 and two trailer commits pass. The prescribed immutable `8ec22133a28f2fa19974ae0c0a3b3127cc5aa747..v8` checker with bypass unset exited 1 due to five inherited ReviewBus subjects (`a55e6533/25be6c10/e07c0b95/814d92d9/fe5779fa`).

## Routing and Parent Disposition
**Important:** This helper merge does NOT resume the unsupported parent. The parent task will remain blocked until concrete Supervisor-managed metadata/parent update and resolution explicitly consumes the full `-v8` SHA.
- **Source PR:** PR2542 (Remains OPEN / head `769d0da4dccf3dc955e8a72e150f80c5f248925c`)
- **Helper PR:** PR2547 (Remains OPEN / head `bff256ed1a72415c6e7499cec99f5c04cc326816`)
- **v8 PR lookup:** Returns `[]`
We are preserving the old/new heads and retaining the generic vs required full-range distinction.

## Retained Findings
The restored `769d0da4dccf3dc955e8a72e150f80c5f248925c` is treated as UNAPPROVED input, as its producer/test/UAT changes were never in the locked review. We retain and reverify every unresolved finding on the parent task:
- **F2:** Absent held shared reservation
- **F3:** Effective collector namespace/identity/runtime boundaries
- **F6:** Durable tests
- **F7:** Evidence
- **F8:** Publication

## Content-based Acceptance Mapping
- **Identify exact contamination:** Identified explicitly authorized base `72e7c5f85cd6b4d837dc5651273b5db41c5edb7b` vs the 4 invalid published subjects (`490090`, `5ebd73`, `e87e60`, `7aa2b7`).
- **Repair or document non-destructive repair path:** Provided `-v8` branch (`cc460c779e1212cf46422a46f22ceccb4cd40f04`) cleanly based on `a55e6533b6738588df3bf87df8e45f5fde03b20b` without bypassing checkers or rewriting history.
- **Produce task-scoped PR evidence:** Identified Source PR2542 and Helper PR2547. Documented the full range commands, exits, and SHAs (dev-range diff-check EXIT0, immutable range check EXIT1).
- **Update parent task with concrete unblocked step:** Maintained blocked status pending explicit Supervisor-managed parent disposition containing the full `-v8` SHA and outstanding hosted conditions.
