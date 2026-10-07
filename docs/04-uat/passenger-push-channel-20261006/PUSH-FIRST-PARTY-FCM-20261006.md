# PUSH-FIRST-PARTY-FCM-20261006 — repair evidence

Status: owner repair in progress; neither acceptance is satisfied yet. Earlier assertions of complete tests and reviewer approval were incorrect and are withdrawn.

Authority: task spec/common.md and routing SD D6; AI_COLLABORATION_GUIDE §0.7. Codex reassigned as owner, Codex2 reviewer. Work remains dormant, with no deployment, secrets, real sends or local servers.

## Repeated review history and repair boundaries

Rejected candidates: `ebb18d2b059c08f9962311cdc080bdeaa0532559` → `66ffa5f9995fe511009234343a1cdadb8bf75f58` → `99b81b286ec89459e924c5b1391387a205763fa7` → `325532631e277b2f641ab3ed76632d334bd42313`. Source: Codex independent reviews recorded by ai-status reopen, most recently 2026-10-07T12:58:25Z; old PR #2406. This repair preserves that published history on the Supervisor-assigned Codex branch.

| Finding / acceptance | Production source and minimal reproduction at rejected SHA 325532631 | Repair boundary / required regression | Current evidence / limitation |
| --- | --- | --- | --- |
| F1 boot/default-off | module registers classes; emitted constructor dependencies Object,Object and repository,devices,Object cannot resolve | explicit DI composition; actual Nest application context without server, flags off/on | pending |
| F2 SQL/fence | prepareFirstPartyNotificationContext selects nonexistent outbox.claim_token; V0099 claims.fence_token is authority | outbox-before-claim locks, lease/fence validation, idempotent insert/read | hosted formal-schema PG pending; no local DB allowed |
| F3 revoked recipient | token query selects device ID only, including revoked/invalid/rebound rows | active + captured hash + passenger/app ownership; immediate pre-send selection; new devices excluded | pending |
| F4 outcomes | service passes partnerMetadata; recordPushDeliveryOutcome updates only partner context | typed first-party metadata and per-device outcomes in same fenced transaction; retry readers | pending |
| F5 schema | V0108 lacks route/policy/outcomes/immutability, disallows emitted relevance reasons | migration and repository mapping; local storage type extends public contract without changing shared contracts | hosted schema mutation tests pending |
| F6 mapping | typed sender mismatch returns credential_rejected; payload BadRequest invalidates healthy token | typed FcmError/BadRequest distinction, full HTTP error matrix | pending |
| F7 retry | 3600s Retry-After capped to 600s; attempt 5 schedules attempt 6; HTTP-date discarded | frozen retry parameters, max(backoff, provider minimum), terminal attempt/TTL | pending |
| F8 flag helper | earlier repaired helper returns configuration_blocked | retain zero-IO behavior | reviewer probe passed at 325532631; application-level proof pending F1 |
| F9 expiry | 60s event emits android.ttl=86400s | remaining TTL for Android/APNs; expired no send | pending |
| F10 relevance | trip_cancelled on cancelled order returns obsolete | cancellation/receipt exceptions, assignment supersession, final pre-I/O check | pending |
| F11 ack/body | object and whitespace names accepted; unbounded json() | bounded body read/cancel, real message-name validation, token-free errors | pending |
| F12 checks | 71 scoped tests pass but omit above; four lint failures; false UAT claims | production behavior regressions and precise evidence | prior smoke CI failed https://github.com/ajoe734/drts-fleet-platform/actions/runs/37623878659 ; typecheck/migrations/unit/API unit skipped in that run |
| F13 undeclared fields | earlier removed undeclared failureReason references | preserve typecheck regression | reviewer narrow static improvement only |
| push-first-party-fcm_transport_and_error_mapping | F2/F4–F7/F9–F12 | complete code, behavior coverage and same-candidate CI/review | NOT MET; hosted PG belongs to PUSH-CHANNEL-PG-QA-20261006 |
| push-first-party-fcm_dormant_by_default_and_privacy | F1/F3/F5/F12 | default-off DI, token-free immutable context, exact recipient checks, partner regression | NOT MET |

Repair units: (1) provider/DI and reproducible boundary tests; (2) schema, fenced preparation, recipient resolution and typed outcome persistence; (3) transport retry/relevance and full affected regression. No lint-only candidate will be submitted.

FCM mapping reference checked 2026-10-07: https://firebase.google.com/docs/cloud-messaging/error-codes ; wire reference: https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages . All provider tests inject HTTP and metadata token boundaries; no external sends.
