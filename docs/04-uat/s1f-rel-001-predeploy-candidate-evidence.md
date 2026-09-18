# S1F-REL-001-PREDEPLOY — candidate deployment evidence

This is a run-record template, not proof that a candidate has been deployed.
The normal `Deploy — Dev` workflow must run `Candidate SHA operational
acceptance` successfully before this record may be completed.

## Candidate identity

- Source SHA: _pending normal Dev workflow run_
- Image tag: _pending_
- Migration execution: _pending_
- Deploy workflow URL: _pending_
- Operational acceptance workflow job URL: _pending_

## Required result

The workflow materializes
`tests/e2e/fixtures/candidate-journey-manifest.json` with the full checked-out
SHA, then `operations/verification/run-operational-browser-acceptance.sh` executes browser and
HTTP assertions against the deployed URLs. Every active API/BFF surface must
return that SHA in `x-drts-candidate-sha`; Partner Booking, Concierge, and the
retired Passenger service must return `404`.

## URL record

| Surface                  | URL     | Candidate SHA / result |
| ------------------------ | ------- | ---------------------- |
| API                      | pending | pending                |
| Platform Admin           | pending | pending                |
| Ops Console              | pending | pending                |
| Fleet Partner Portal     | pending | pending                |
| Tenant Console           | pending | pending                |
| Bank Console             | pending | pending                |
| Referral Embed           | pending | pending                |
| Enterprise Dispatch      | pending | pending                |
| Channel Partner Portal   | pending | pending                |
| Partner Booking (paused) | pending | 404 pending            |
| Concierge (retired)      | pending | 404 pending            |
| Passenger (retired)      | pending | 404 pending            |
