# SR-PUSH-001 planning decision routing

Date: 2026-09-08. Helper owner: Codex2; reviewer: Codex.
Disposition: explicit follow-up routed; product implementation remains blocked.
Canonical question: `PHASE1_OPEN_QUESTIONS.md` Q-SR-PUSH-001.

## Evidence and authority

- Inspected base `e97653b7ffb962a6c4d688e8706711d860fa3604`, after fetch/rebase onto origin/dev.
- Canonical task slices: parent SR-PUSH-001 is blocked; UV-EXEC-006 is done,
  merged through PR #1822 at the inspected base. SR-CONTRACT-001 is todo,
  owned by Codex with reviewer Codex2. It has no push allocation yet.
- Parent reproduction anchor `268087ce709765da51b4569c75df995fdb219623`,
  [draft PR #1823](https://github.com/ajoe734/drts-fleet-platform/pull/1823),
  records four passes and two expected failures. These are historical parent
  results, not tests rerun by this planning helper or completed acceptance.
- `docs/03-runbooks/system-remediation-20260906/SR-PUSH-001.md`, Execution
  prompt / acceptance: injectable real transport, reliable receipt, unavailable
  remains undelivered, controlled receiver and separate real-device gate.
- `docs/03-runbooks/system-remediation-execution-tasks-20260906.md`, Parallel
  and shared-file rules 3–8: supervisor grants scopes/dependencies;
  SR-CONTRACT owns shared contracts and allocates dedicated migration names.
- `phase1_service_contracts_v1.md` §3.1 assigns session/device binding and
  register_device_token to Identity; it does not specify the passenger push
  provider or passengerSubjectRef-to-device resolution protocol. L1/L2 keyword
  inspection supplies no authority to equate a driver session with a passenger.
- Current `passenger-push.port.ts` requires a pseudonymous subject and a receipt
  with providerName/providerMessageRef. `MultiTaxiService.deliverPassengerNotification`
  drops the message reference; its persistence helper catches write failure.
  `MultiTaxiRepository.updateConsumerNotificationOutboxDelivery` updates by ID
  without a claim/fence or receipt columns. These observations support the
  parent's scope request; they do not authorize edits by this helper.
- `docs/04-uat/system-remediation-20260906/schema-allocation.json` does not
  exist at this base. No migration number is reserved by this packet.

## Recorded decision

Retain all C023/N10 acceptance. No invented gateway protocol, token mapping,
in-memory deduplication acceptance, or waiver of durable receipt is approved.
The helper resolves the routing ambiguity, not the missing product choice.
Existing driver/Identity contracts alone cannot choose the passenger topology.
Record any unresolved product choice as human_required through the supervisor
under AI_COLLABORATION_GUIDE.md §2/§4; do not silently choose FCM/APNs.

Provider acknowledgement and a controlled receiver are not proof of delivery
to a real passenger device. Preserve SR-LIVE-PUSH-001's existing dependencies
and required evidence. Do not add a reverse dependency from SR-PUSH-001 to
completed live-device acceptance, which would create a cycle.

## Routed follow-up and resume gate

| Responsible role / existing task | Required recorded action | Parent resume condition |
| --- | --- | --- |
| Supervisor/Chairman | Review and grant `apps/api/src/modules/multi-taxi/multi-taxi.service.ts` and `multi-taxi.repository.ts` to SR-PUSH-001; inspect current overlapping writers and add actual dependencies using canonical commands. Retain completed UV-EXEC-006 evidence. | Machine truth contains authorized scopes and satisfied writer sequencing before code changes. |
| Supervisor/Chairman with product/contract owner | Record provider/protocol, transport configuration source, credential readiness ownership, tenant-safe passengerSubjectRef/device resolution owner, device expiry/revocation behavior, and acknowledgement meaning. Escalate unresolvable product choice to human_required. | A cited approved contract exists; no credentials or real device tokens belong in this document. |
| Supervisor then Codex / SR-CONTRACT-001 | Explicitly extend the existing task's scope/acceptance for push shared types and claim/receipt allocation, or register a separate scoped contract child if needed. Review ack-to-persistence failure recovery, dedupe identity, claim/fencing and retry semantics; allocate a collision-free migration path after checking current UV schema writers. | Approved leaf contract/allocation is merged, with producer dependency on the parent recorded where needed. This packet does not itself expand SR-CONTRACT scope. |
| Codex2 / SR-PUSH-001, reviewer Codex | After the preceding gates, fetch/rebase parent branch, preserve PR #1823 regressions, implement authorized service/repository fixes and real injectable transport, and convert expected-failure cases to passing assertions. | Test ack/failure/duplicate/expired-device, durable persistence failure and concurrent/restarted worker behavior; demonstrate actual send against a controlled receiver under the selected protocol. |
| Supervisor and existing SR-LIVE-PUSH-001 owner | Coordinate real provider account, authorized device, retrievable device evidence and live candidate SHA via existing readiness/UAT tasks. | Real-device gate remains open until evidence is recorded; unit tests and this helper cannot clear it. |

These are follow-ups on registered tasks, not new untracked implementation
assignments. The immediate next step is supervisor scope/contract routing;
parent owner may inspect and prepare within current scopes but must not resume
blocked shared writes. Keep the parent blocked and update its canonical next
field with this packet and the routing request.

## Verification and delivery

- `git fetch origin` and `git rebase origin/dev`: exit 0; base unchanged.
- Read-only code inspection confirms the persistence and receipt boundary above.
- `gh pr view 1823 --json url,headRefOid,state`: exit 0; OPEN at the parent
  anchor quoted above. No parent branch edits or candidate handoff occurred.
- Planning-only change: no runtime/typecheck/live-device test result is claimed.
- `git diff origin/dev --check`: exit 0. Python pathlib assertions verified a
  unique Q-SR-PUSH-001 entry, its existing packet target, and all named producer,
  live-gate, escalation and shared-writer references: exit 0.
- Recoverability anchor `e7d40a5ad` committed and ordinary branch push exited 0.
- Helper commit/push/PR and final validation are recorded in the exact-SHA
  handoff and PR. Helper review does not complete parent implementation.
