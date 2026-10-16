# PAX-RECEIPT-E04-CAPTURE-20261015

Owner: Codex · Reviewer: Claude2

## 2026-10-16 source preparation checkpoint

This is an implementation checkpoint, **not a review candidate or completed
acceptance**. Baseline: `b726c5cd0` (the assigned worktree's accepted dev source).
Initial reader anchor: `d5844da3c3f5cd88c058a3ca6aa21a36aa5f7d2a`.

The original task spec remains authoritative:
`/home/lupin/workspace/drts-fleet-platform/.local/passenger-transport-bureau-review-20261015/PAX-RECEIPT-E04-CAPTURE-20261015.md`.
Source diagnosis: `actual8558-E04-authoritative-field-reader-location.json`
(SHA256 `ec1eba12e124ff80f160c753dcdb2a7a249da01c08f8649ba686aca936de1c3a`)
and `actual127925-E04-operator-fleet-legal-name-link-readonly-location.json`
in the same directory. There have been no E04 candidates or review returns.

## Actual source and remaining repair units

- `OwnedMobilityService.completeDriverTask` and
  `finalizeDriverTaskCompletionInTransaction` call the synchronous surname
  getter and `buildMultiTaxiCertificateEvent`. The producer still does **not**
  supply `e04Snapshot`. This defect remains open at this checkpoint.
- `RegulatoryRegistryService.getDriverDeclaredSurnameSnapshot` reads the
  declared `driverSurname` and `updatedAt` from DriverProfileService; it does
  not infer a surname from a full name. The new
  `getDriverCompletionReceiptIdentity` first calls the existing
  `prepareProfileAuthority`, then obtains the public credential through a new
  driver-targeted production repository read. Missing/error reads do not use
  the registry's startup credential. A valid public E04 mask is retained;
  otherwise only actual trailing registration digits can produce a mask.
- `PaymentMethodService.getReceiptDisplay` resolves the original UUID and
  delegates to `PaymentMethodRepository.findReceiptDisplay`, which selects
  only `card_type,last4` for that owner and active method. No default-card
  selection, PSP request, token decryption or account lock is involved.
- The completion callers are not connected to these new ports yet. Existing
  completion/replay behavior and the CertificateSupport validator remain
  unchanged. The writer and passenger mapper must be exercised after capture
  is connected, including a master update followed by receipt reread and
  completion retry.

## Exact scope coordination needed

The current task scope has no Fleet master or Fleet contract write paths.
The original source diagnosis confirms that neither driver affiliation,
contract partner, display labels nor coincident IDs prove the operating
authorization's operator identity. The task progress requests normal Supervisor
scope coordination for exactly:

- `packages/contracts/src/index.ts`
- `apps/api/src/modules/fleet-partner/fleet-partner.service.ts`
- `apps/api/src/modules/fleet-partner/fleet-partner.repository.ts`

Intended minimum: optional explicit `multiTaxiOperatorIds` on the existing
Fleet JSON master/create/update contract, preserved by existing ACK-backed
master writes, plus a narrow unambiguous operator lookup. Owned completion
must resolve **this order's** `operatingAuthorizationId` to its persisted
operator, then read that explicit Fleet mapping and snapshot `legalName`.
Missing/ambiguous mapping must retain the existing missing-fields response.
No new migration, affiliation semantics, governance or validator change is
proposed. Existing allowed module files suffice for stateless repository DI
and ReviewSupply's canonical Fleet service writer.

After scope coordination, ReviewSupply must create an explicitly synthetic
Fleet through the existing writer, use the returned Fleet ID to persist the
explicit mapping and await ACK. It also needs an explicit synthetic declared
surname and structurally valid synthetic registration metadata through the
existing profile/registry ports. Existing opt-in and 演練／非正式 labels remain
required. No real institution or legal-issuance claim is authorized.

Only credential-read additions near the registry getter are included here;
C073 offboarding/debranding/lifecycle/persistFinalExitChangeOrThrow behavior
is not modified.

## Evidence matrix (§0.7)

| Finding / acceptance                                          | Source / repair                                                             | Baseline → checkpoint                                                                                                    | Checks / evidence                                                                                         | Remaining limits                                                                                     |
| ------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Completion produces no E04                                    | Both Owned completion callers and `buildMultiTaxiCertificateEvent`          | Confirmed by the original bounded producer/writer diagnosis; still open                                                  | Existing source probe and original spec; no new dynamic old/new capture claim                             | Fleet scope coordination, complete producer→writer→mapper regression and immutable replay proof      |
| Stale completion identity sources                             | Registry completion identity port and targeted credential repository reader | Baseline synchronous getter has no PG refresh; new reader tests exercise real profile/registry services and repositories | `tests/unit/pax-receipt-e04-capture-20261015/authority-readers.test.ts`; transport rows only are fixtures | Not yet connected to completion; real PG and credential lifecycle coverage remain pending            |
| Selected passenger payment display                            | Payment method service/repository metadata reader                           | New port reads owner+UUID metadata; invalid/legacy references remain absent                                              | Same unit file; no provider/cipher supplied                                                               | Real PostgreSQL ownership/deletion behavior and completion capture remain pending                    |
| `pax-receipt-e04_real-completion-snapshot-and-readback`       | Entire completion/event/receipt/readback pipeline                           | **Pending**                                                                                                              | No acceptance recorded                                                                                    | New same-SHA hosted PG/CI, writer/mapper and snapshot/replay evidence required                       |
| `pax-receipt-e04_explicit-simulation-and-shared-dev-delivery` | Explicit ReviewSupply sources and immutable Cloud Run delivery              | **Pending**                                                                                                              | No acceptance recorded                                                                                    | New review/CI/merge, immutable shared-dev delivery and new same-version three-journey smoke required |

Local check evidence is under the assigned worker's
`.local/pax-receipt-e04-capture-20261015/`. The unit boundary is SQL transport
fixtures, not runtime or PostgreSQL acceptance. No product server, browser
runner, database or Compose environment was started on this VM.

Check results and exact published checkpoint SHA are recorded below and in
the original task's machine-truth progress. Hosted checks have not been
triggered for this unfinished checkpoint.

### Local check results

Source/test checkpoint: `b7a03c16f` (only this evidence document changes after
that checkpoint). All commands below completed and their exit results were
read before this checkpoint was published.

| Command                                                                                                                                                         | Result                                                                   | Log under `.local/pax-receipt-e04-capture-20261015/` |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| `pnpm exec vitest run tests/unit/pax-receipt-e04-capture-20261015/authority-readers.test.ts tests/unit/pax-receipt-complaint-20261009/receipt-download.test.ts` | Exit 0; 2 files, 42 tests passed (13 new reader cases, 29 receipt cases) | `readers-receipt-unit.log`                           |
| `pnpm --filter @drts/contracts build`                                                                                                                           | Exit 0                                                                   | `contracts-build.log`                                |
| `pnpm --filter @drts/control-plane-auth build`                                                                                                                  | Exit 0                                                                   | `control-plane-auth-build.log`                       |
| `pnpm --filter @drts/api typecheck`                                                                                                                             | Exit 0 after rebuilding workspace dependencies                           | `api-typecheck.log`                                  |
| `pnpm exec eslint <four changed production TS files> tests/unit/pax-receipt-e04-capture-20261015/authority-readers.test.ts --max-warnings=0`                    | Exit 0                                                                   | `scoped-eslint.log`                                  |

The first reader run failed because the SQL profile fixture omitted
`deviceBindings`; this was a fixture failure, not a successful defect
reproduction. The fixture now extends the existing native profile shape.
The initial API typecheck also failed against stale contracts declarations;
rebuilding the two workspace packages resolved it. Neither initial failure
is claimed as a production regression reproduction or acceptance evidence.

No PG/browser/HTTP/deployment check has been run for this checkpoint. Both
required acceptance keys remain pending. This branch must remain in owner
progress until the Fleet scope request, full capture and required regressions
are completed; do not hand off these preparation anchors as a finished E04
candidate.
