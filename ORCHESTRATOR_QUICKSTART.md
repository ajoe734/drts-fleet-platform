# Orchestrator Quickstart

This repo contains the reusable supervisor + auto-worker + dashboard bundle, but Phase 1 development work should remain in `architect_bootstrap` mode until the work breakdown has human-approved consensus.

## 1. Prepare local LLM/IDE integration

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

## 3. Use the runtime before consensus

- Use the dashboard and status mirrors for visibility only.
- Do not seed development tasks into the supervisor yet.
- Build or revise `CANONICAL_DOCUMENT_MAP.md`, `TARGET_ARCHITECTURE.md`, `ROADMAP.md`, and `DEVELOPMENT_WORKBREAKDOWN.md` first.

## 4. Switch to supervisor-managed execution after consensus

Only after the work breakdown is explicitly approved should you seed the first task:

```bash
AI_NAME=Codex TASK_PHASE="Wave 0" TASK_SUMMARY_ZH="建立第一個共識後任務。" ./scripts/ai-status.sh assign DEMO-001 Codex Claude "First supervisor-managed task"
AI_NAME=Codex ./scripts/ai-status.sh start DEMO-001 "Started the first supervisor-managed task"
./scripts/sync-state.sh
```

## 5. Print the current first prompt

The repo-aware prompt is generated from `ai-status.json`:

```bash
python3 scripts/ai_status.py prompt
```

If the canonical document layers change, update `AI_COLLABORATION_GUIDE.md`, `FOR_*.md`, and `ai-status.json` together so the prompt stays aligned with the repo.

## 6. Optional GitHub bus

The bootstrap leaves GitHub bus disabled by default. When you are ready, update `.orchestrator/config.local.json` with your repo details and enable `github_bus.enabled`.
