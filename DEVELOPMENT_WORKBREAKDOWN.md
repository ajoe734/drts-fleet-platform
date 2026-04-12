# Development Work Breakdown

Status: seed work-package proposal for multi-LLM review. This file becomes assignable only after consensus.

## Summary

This file lists the current proposed work packages that may later become supervisor tasks. It is intentionally unassigned because the repo is still in `discussion_planning` mode.

## Current Rule

- work packages are defined here first
- multiple LLM lanes review and challenge this document against the canonical specs
- only after the consensus packet is accepted may these slices be converted into `ai-status.json` tasks and assigned to auto workers

## Work Packages

| ID     | Wave   | Slice                            | Deliverables                                                                             | Depends On           | Ready For Supervisor |
| ------ | ------ | -------------------------------- | ---------------------------------------------------------------------------------------- | -------------------- | -------------------- |
| W0-001 | Wave 0 | Canonical document alignment     | updated collaboration guide, canonical map, status metadata                              | none                 | no                   |
| W0-002 | Wave 0 | Phase 1 reference adoption       | tracked Phase 1 specs, extracted bundles, reference locations                            | W0-001               | no                   |
| W0-003 | Wave 0 | Repo landing zones               | `packages/contracts`, `packages/shared-test-fixtures`, `infra/migrations`, `infra/seeds` | W0-001               | no                   |
| W0-004 | Wave 0 | Target architecture and roadmap  | architecture doc, roadmap, open questions, decision ledger                               | W0-001               | no                   |
| W1-001 | Wave 1 | Identity baseline                | auth envelope, realm split, backend auth module skeleton                                 | W0-004               | later                |
| W1-002 | Wave 1 | Tenant-partner baseline          | tenant, partner, site, address book, webhook metadata contracts                          | W0-004               | later                |
| W1-003 | Wave 1 | Regulatory baseline              | vehicle, driver, contract, insurance, exclusivity contracts and module skeleton          | W0-004               | later                |
| W1-004 | Wave 1 | Audit-notification baseline      | append-only audit model, webhook delivery log, signed-download policy                    | W0-004               | later                |
| W2-001 | Wave 2 | Owned order contracts            | order domain enums, command DTOs, error envelopes, acceptance fixtures                   | W1-001,W1-002        | later                |
| W2-002 | Wave 2 | Dispatch core skeleton           | dispatch job, attempt, assignment, trace contracts and module skeleton                   | W2-001,W1-003        | later                |
| W2-003 | Wave 2 | Driver task skeleton             | task lifecycle, proof gate, shift, earnings read-model contracts                         | W2-002               | later                |
| W2-004 | Wave 2 | Call-center intake skeleton      | call session, recording pending, phone booking orchestration shape                       | W2-001               | later                |
| W3-001 | Wave 3 | Business booking contracts       | enterprise and airport subtype contracts and validation rules                            | W2-001,W1-002        | later                |
| W3-002 | Wave 3 | Reservation scheduler skeleton   | hold, preassignment, redispatch queue shape                                              | W3-001,W2-002        | later                |
| W4-001 | Wave 4 | Complaint and SLA skeleton       | case lifecycle, SLA monitor shape, timeline contract                                     | W2-004               | later                |
| W4-002 | Wave 4 | Public info and placard skeleton | versioned disclosure and placard generation model                                        | W1-003,W1-004        | later                |
| W5-001 | Wave 5 | Billing skeleton                 | receipt, invoice, statement, reimbursement contracts                                     | W2-003,W3-001        | later                |
| W5-002 | Wave 5 | Reporting and filing skeleton    | report job, artifact, package manifest contracts                                         | W1-004,W5-001        | later                |
| W6-001 | Wave 6 | Forwarder skeleton               | mirror order, adapter callbacks, lost-race handling contracts                            | W2-002               | later                |
| W7-001 | Wave 7 | Tenant portal integration        | booking, reporting, webhook, billing UI integration                                      | W3-001,W5-002        | later                |
| W7-002 | Wave 7 | Ops console integration          | dispatch board, callcenter, complaint, reports UI integration                            | W2-004,W4-001,W5-002 | later                |
| W7-003 | Wave 7 | Platform admin integration       | regulatory, pricing, filing, public-info UI integration                                  | W1-003,W5-002        | later                |
| W7-004 | Wave 7 | Driver app integration           | task, proof, incident, shift, earnings UI integration                                    | W2-003,W4-001        | later                |

## Conversion Rules For Later Supervisor Use

- each supervisor task must map to one work package or one narrow child slice of a work package
- owner and reviewer cannot be the same
- child slices must not cross multiple source-of-truth domains without an explicit parent orchestration task
- no implementation task may introduce new product semantics unless the decision ledger is updated and human-approved first
