# LLM Onboarding

This file is the first-stop onboarding guide for any LLM working inside `drts-fleet-platform`.

## 1. Read Order

Start with these files in order:

1. `AI_COLLABORATION_GUIDE.md`
2. `ai-status.json`
3. `current-work.md`
4. `MULTI_LLM_CONSENSUS_WORKFLOW.md`
5. `PHASE1_DISCUSSION_ASSIGNMENTS.md`
6. `CANONICAL_DOCUMENT_MAP.md`
7. `phase1_prd_detailed_v1.md`
8. `phase1_system_analysis_v1.md`
9. `phase1_service_contracts_v1.md`
10. `phase1_migration_plan_v1.md`
11. `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/00_source_of_truth_and_glossary.md`
12. `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/01_decision_tables.md`
13. `ai-activity-log.jsonl` when you need recent history

Current mode is `discussion_planning`. Until the human accepts the consensus packet, supervisor and auto workers are not used for implementation task fan-out.

This repo supports a continuous two-mode supervisor:

1. `discussion_planning`
2. `supervisor_managed_execution`

## 2. First Prompt

Print the repo-aware prompt with:

```bash
python3 scripts/ai_status.py prompt
```

Use that output as the first prompt in Claude Code, Codex CLI, Gemini CLI, Copilot, Qwen, or any other connected coding LLM.

## 3. Shared Truth Rules

- `ai-status.json` is the machine-readable source of truth for current collaboration mode, next steps, and later task state
- `ai-activity-log.jsonl` is append-only history
- `current-work.md` is generated from state and is not the write source
- `docs-site/` is a read-only dashboard mirror, not the place to edit status
- seed design docs are provisional until the consensus packet is accepted

## 4. Consensus Deliverables

Each lane must contribute these artifacts before implementation begins:

- one structured readout based on `LLM_READOUT_TEMPLATE.md`
- shared-draft work only when the baton is assigned to you
- one or more cited review comments based on `LLM_CROSS_REVIEW_TEMPLATE.md`
- updates to `docs/02-architecture/consensus/phase1/consensus-packet.md` only after discussion converges

Required readout sections:

- `non-negotiables`
- `source of truth / ownership`
- `state machine / enum constraints`
- `open questions`
- `implementation impact`

## 5. Work Order

Every LLM should follow this order:

1. read the canonical layers
2. submit your lane readout
3. if the supervisor gives you the baton, update `starter-draft.md`
4. otherwise cross-review the current draft and other lane readouts with citations
5. participate in later discussion rounds only by refining, rejecting, or confirming prior claims
6. stop before implementation unless the human explicitly accepts the consensus packet

## 6. Local Runtime

Prepare the local environment:

```bash
bash scripts/setup-llm-cli.sh
```

Run the local collaboration control plane from the repo root:

```bash
bash scripts/run-supervisor.sh --verbose
bash scripts/run-dashboard.sh
bash scripts/run-dashboard-tunnel.sh
```

You may start the runtime before consensus for dashboard visibility, but do not seed development tasks until the repo leaves `discussion_planning`.
