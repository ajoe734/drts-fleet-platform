# Phase 1 Open Questions

These questions are intentionally isolated here so the repo does not silently invent answers.

## Open Items

| ID    | Question                                                                                                                                                 | Source                  | Interim Default                                                                                                      |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Q-001 | Can one `call_session` create more than one order, or should Phase 1 UI remain one-call-one-primary-order?                                               | service contracts       | allow backend data model to stay extensible, but keep current planning assumption at one primary order per call flow |
| Q-002 | Should airport-related booking contracts keep a dedicated `flight_ref` field in Phase 1 even before flight-tracking runtime exists?                      | service contracts       | reserve the field in contracts and examples, but do not implement flight monitoring logic                            |
| Q-003 | Does driver payout stop at statement and reimbursement request, or does Phase 1 also need a real wallet ledger and payout accounting flow?               | service contracts + PRD | assume statement and reimbursement flow only; no real wallet ledger yet                                              |
| Q-004 | For forwarded orders, do we need a strong local `trip completed` truth, or only a mirrored completion projection from the external platform?             | service contracts       | assume mirrored projection only                                                                                      |
| Q-005 | Do filing and report artifacts need storage-level object lock, or are immutable manifest plus hash guarantees enough for Phase 1?                        | service contracts       | assume immutable manifest and controlled access first                                                                |
| Q-006 | Should passenger app and passenger web become first-class apps in this repo during Phase 1, or stay as external clients consuming shared APIs?           | SA + migration plan     | keep them out of repo structure for now and treat them as external clients                                           |
| Q-007 | When a booking or complaint rule conflicts with a UI placeholder that already exists, should implementation change the UI skeleton or bend the contract? | extracted glossary      | change the UI skeleton; never bend the product contract to fit an old placeholder                                    |
