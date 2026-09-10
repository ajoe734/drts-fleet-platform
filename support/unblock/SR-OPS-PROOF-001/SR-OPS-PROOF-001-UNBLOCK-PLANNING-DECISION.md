# SR-OPS-PROOF-001-UNBLOCK-PLANNING-DECISION

- Date: 2026-09-08
- Owner / reviewer: Codex / Codex2
- Inspected origin/dev base: `fa0fd8257950764526a522d091be9d97effa82b9`
- Disposition: explicit planning follow-up routed; parent remains blocked.

## Evidence and retained requirements

The parent machine slice at 2026-09-08T16:40:28Z reports a published anchor
`02522d8051f0805d02eebb25636065ed5d4d74a0`, 35 local tests and missing isolated
resources. Its UAT document at that SHA, section “16:39 UTC dispatch — resource
blocker”, explicitly requests a preparation handoff/live acceptance boundary.
Those are historical parent observations, not checks rerun by this helper.

`docs/03-runbooks/system-remediation-20260906/SR-OPS-PROOF-001.md`, Execution
prompt, assigns read-only inventory and isolated restore/load tooling, while
requiring LIVE-OPS authorization/resources for real cloud restore/load. Its
acceptance still requires same-snapshot business readback and representative
booking/dispatch/report measurements. Local tool regression cannot satisfy that.

`docs/03-runbooks/system-remediation-20260906/SR-LIVE-OPS-001.md`, prerequisites
and external gate, and the current machine slice agree: LIVE-OPS depends on
OPS-PROOF and is blocked for authorized_isolated_ops_target,
backup_restore_readback, rpo_rto_capacity_baseline, scheduled_job_restart_proof
and live_candidate_sha. Requiring LIVE-OPS completion before OPS-PROOF creates
an operational wait cycle, even though the recorded dependency graph is acyclic.

The accepted `docs/02-architecture/phase1-operational-workload-sla-degradation-baseline-20260430.md`,
Workload Assumptions and SLA and Latency Targets, supplies capacity and latency
targets. Preserve its workload, concurrency/backlog and durable-write semantics;
HTTP success or a latency summary alone is insufficient. This helper chooses no
new RPO/RTO values and grants no cloud authorization.

## Explicit follow-up on the existing parent

Supervisor/Chairman owns the pending sequencing decision in Q-SR-OPS-PROOF-001.
Codex owns parent implementation; Codex2 reviews it. Gemini, the current
LIVE-OPS owner, is the resource coordination contact, not an inferred authorizer.

1. Preferred route: arrange authorized isolated preparation inputs independently
   of LIVE-OPS completion. Record who grants authorization, permitted operations,
   target IDs and evidence references. Retain existing task dependencies and
   acceptance. Codex can then perform the parent's allowed isolated proof work;
   LIVE-OPS performs its cloud/live acceptance after prerequisites are satisfied.
2. If preparation-only parent handoff is intended instead, Supervisor must first
   record a reviewed allocation in both canonical task specifications and machine
   acceptance metadata: exactly which parent proofs remain local, which move to
   LIVE-OPS, their same-candidate evidence linkage, and how final closure remains
   gated. Route any actual acceptance reduction to the human product owner.
   This option is a request, not an approved scope cut.
3. Do not add a parent dependency on LIVE-OPS. Do not weaken or populate external
   acceptance with readiness reports. If a separate resource producer is needed,
   register it through canonical task commands with owner, scope and acyclic
   dependencies before treating it as official backlog. Until then this follow-up
   remains on the existing parent, not an invented child task.

## Input receipt and parent resume gate

Supervisor must record the chosen boundary plus retrievable inputs covering:

- Trusted snapshot identity/hash and an independently exported manifest from that
  same snapshot for trip/order, billing and audit reconciliation.
- Authorized disposable DB and API resource IDs, isolation verification and
  credential references; no secrets in planning artifacts. Supply PostgreSQL
  tooling or an approved isolated runner (parent last observed missing host tools).
- Authenticated booking/dispatch/report workload plan and pre-provisioned business
  resources matching current contracts and the accepted baseline, including the
  source/owner for recovery objectives; no invented thresholds.
- Cloud project, region, service and permitted observation operations; any restore,
  load, restart or rollback needs the applicable explicit resource authorization.

Parent next step: keep blocked while Supervisor selects/records the route and
coordinates these inputs with Gemini. After the recorded gate is satisfied,
Supervisor dispatches Codex in the existing parent worktree to fetch/rebase,
inspect current implementation, rerun task-local tests and inventory, and execute
only authorized isolated checks. Retain raw results, resource IDs, base/candidate
SHA and unperformed live checks; commit, ordinary push, PR and exact-SHA handoff
to Codex2. This helper's merge alone does not resume or accept the parent.

## Helper verification and delivery

This change contains planning documents only. Parent test results and live
operations are not revalidated. Check the task diff, commit trailers and canonical
consistency before handoff. The task-scoped PR and candidate SHA are recorded in
canonical helper status after normal non-force push. Parent status receives this
route and concrete next step through the current-release ai-status.sh command.
