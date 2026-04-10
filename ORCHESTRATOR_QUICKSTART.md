# Orchestrator Quickstart

This repo has been bootstrapped with the reusable supervisor + auto-worker + dashboard bundle.

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

## 3. Seed the first task

```bash
AI_NAME=Codex ./scripts/ai-status.sh assign DEMO-001 Codex Claude "First migrated task"
AI_NAME=Codex TASK_PHASE="Foundation" TASK_SUMMARY_ZH="把新 repo 的第一個協作任務建立起來。" ./scripts/ai-status.sh assign DEMO-001 Codex Claude "First migrated task"
AI_NAME=Codex ./scripts/ai-status.sh start DEMO-001 "Started the first migrated task"
./scripts/sync-state.sh
```

## 4. Print the current first prompt

The repo-aware prompt is generated from `ai-status.json`:

```bash
python3 scripts/ai_status.py prompt
```

If you add project-specific docs later, update `AI_COLLABORATION_GUIDE.md`, `FOR_*.md`, and `ai-status.json` canonical layers so the prompt stays aligned with the new repo.

## 5. Optional GitHub bus

The bootstrap leaves GitHub bus disabled by default. When you are ready, update `.orchestrator/config.local.json` with your repo details and enable `github_bus.enabled`.
