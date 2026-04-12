# Orchestrator Quickstart

This repo contains the reusable supervisor + auto-worker + dashboard bundle, and DRTS Phase 1 currently starts in `discussion_planning` mode.

## 1. Prepare local LLM and IDE integration

```bash
bash scripts/setup-llm-cli.sh
```

That will:

- sync provider permission settings
- regenerate local dashboard mirrors
- create repo-local Claude settings if needed

## 2. Start the local runtime

Supervisor:

```bash
bash scripts/run-supervisor.sh --verbose
```

Dashboard:

```bash
bash scripts/run-dashboard.sh
```

Temporary public dashboard URL:

```bash
bash scripts/run-dashboard-tunnel.sh
```

Public dashboard on a VM:

```bash
HOST=0.0.0.0 bash scripts/run-dashboard.sh
```

## 3. Use the runtime in discussion mode

Before consensus:

- use the dashboard and status mirrors for visibility only
- use `python3 scripts/ai_status.py prompt` to generate the shared first prompt
- let the supervisor pick a starter lane to update `starter-draft.md`
- write lane readouts and cited review rounds under `docs/02-architecture/consensus/phase1/`
- track baton ownership in `baton-log.md` and `supervisor-queue.md`
- do not seed implementation tasks into the supervisor

## 4. Use the same runtime in implementation mode

After the consensus packet is accepted:

- switch the active mode to `supervisor_managed_execution`
- start seeding implementation tasks from the accepted work arrangement
- keep the same supervisor process running
- if execution finds unresolved semantics, route the affected slice back to discussion mode

## 5. Switch to supervisor-managed execution after consensus

Only after the consensus packet is explicitly accepted should you seed the first implementation task:

```bash
AI_NAME=Codex TASK_PHASE="Wave 1" TASK_SUMMARY_ZH="從共識封包切出第一個實作任務。" ./scripts/ai-status.sh assign DEMO-001 Codex Claude "First supervisor-managed task"
AI_NAME=Codex ./scripts/ai-status.sh start DEMO-001 "Started the first supervisor-managed task"
./scripts/sync-state.sh
```

## 6. Keep the prompt and workflow aligned

The repo-aware prompt is generated from `ai-status.json`:

```bash
python3 scripts/ai_status.py prompt
```

If the canonical document layers or discussion workflow change, update these files together:

- `AI_COLLABORATION_GUIDE.md`
- `CANONICAL_DOCUMENT_MAP.md`
- `ai-status.json`
- `MULTI_LLM_CONSENSUS_WORKFLOW.md`
- `PHASE1_DISCUSSION_ASSIGNMENTS.md`
