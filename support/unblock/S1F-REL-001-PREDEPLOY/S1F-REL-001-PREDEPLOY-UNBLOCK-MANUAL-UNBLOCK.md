# S1F-REL-001-PREDEPLOY Manual Unblock Diagnosis

Last updated: 2026-08-13  
Task: `S1F-REL-001-PREDEPLOY-UNBLOCK-MANUAL-UNBLOCK`  
Parent: `S1F-REL-001-PREDEPLOY`  
Candidate: `295069bcbd9d24f4e5ec5e4cef3da759a858a274`

## Result

The parent is dependency-ready but correctly remains blocked.  This is not a
dependency, migration, service-health, or retired-service problem: the normal
Dev deployment reached those stages successfully, then failed its browser
release gate.  The candidate must not be re-run or handed off as accepted until
the three failures below are repaired and a newly built immutable candidate
passes both the deployed UI smoke and the candidate-bound operational suite.

## Verified evidence

| Evidence | Result |
| --- | --- |
| Deploy — Dev run [`31601295043`](https://github.com/ajoe734/drts-fleet-platform/actions/runs/31601295043) | Built and deployed the exact candidate SHA; migration, services, and health checks succeeded. |
| Dev UI smoke job | Failed: `2545` passed and `456` failed. Every reported failure is Fleet Partner Portal `/dashboard`, whose response was `404` rather than `200`. |
| Candidate SHA operational acceptance job | Skipped because the preceding UI-smoke job failed. Therefore this CI run is **not** evidence that the candidate-bound suite passed. |
| Direct deployed candidate runner, recorded in parent machine truth at 2026-08-13T01:41:03Z | Failed on the referral mutation selector and the Enterprise route control census. Partner Booking and Concierge retirement checks returned the required `404`. |
| Candidate source tree | `apps/fleet-partner-portal-web/app/dashboard/page.tsx` exists at `295069bc…`; the deployed `/dashboard` `404` is therefore a deployment/runtime route mismatch to resolve, not permission to remove the smoke assertion. |

## Blocking defects and bounded repair

1. **Fleet Partner Portal `/dashboard` is absent at the deployed runtime.**
   The source candidate contains the route, but the deployed UI smoke receives
   `404` and page text `This page could not be found.`. Repair the route/build
   packaging or deployment-source mismatch, then prove a deployed `200` for
   `/dashboard` for the matrix's Fleet roles, locales, viewports, and states.

2. **Referral create operation is not addressable by the formal runner.**
   The manifest requires
   `[data-drt-operation='referral-create']`, but the candidate's
   `apps/referral-embed-web/components/passenger-embed.tsx` renders the
   `確認叫車` action without that attribute. Add the exact operation annotation
   to the real create control and verify that it sends `POST /api/referral/booking`,
   returns an order ID, and reads back `CONFIRMED` with the candidate-SHA header.

3. **Enterprise `/bookings/new` has enabled controls with no declared behavior.**
   The direct runner found `62` enabled controls lacking either
   `data-drt-operation` or a nearest
   `data-drt-non-operational` plus explicit reason. Annotate each real
   operational control, and explicitly mark only intentionally unavailable
   controls. The census must be clean; weakening or skipping it is not an
   acceptable repair.

## Concrete parent next step

Resume `S1F-REL-001-PREDEPLOY` only to make this bounded repair slice.  The
owner must create a fresh immutable candidate containing all three fixes,
push it normally, and dispatch the normal Dev workflow for that SHA.  Closure
requires these ordered results:

1. Dev UI smoke is green, including Fleet `/dashboard`.
2. Candidate SHA operational acceptance runs (not `skipped`) and passes the
   referral mutation/readback and Enterprise control census as well as the
   existing fleet, admin, tenant, bank, channel, and retired-surface checks.
3. Record the new run URL, candidate SHA, deployed URLs, and branch/PR/CI
   evidence in parent machine truth before review handoff.

## Non-claim

This support artifact does not claim that candidate `295069bc…` passed release
acceptance or was published as a valid Dev release.  Its deployment is useful
failure evidence only; the parent remains a `deploy_blocked` release task until
a repaired candidate passes the gates above.
