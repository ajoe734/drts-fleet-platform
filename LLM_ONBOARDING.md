# LLM Onboarding

This file is the first-stop onboarding guide for any LLM working inside `drts-fleet-platform`.

## 1. Read Order

Start with these files in order:

1. `AI_COLLABORATION_GUIDE.md`
2. `current-work.md`
3. `ai-status.json`
4. `CANONICAL_DOCUMENT_MAP.md`
5. `TARGET_ARCHITECTURE.md`
6. `ROADMAP.md`
7. `DEVELOPMENT_WORKBREAKDOWN.md`
8. `phase1_prd_detailed_v1.md`
9. `phase1_service_contracts_v1.md`
10. `ai-activity-log.jsonl` when you need recent history

Current mode is `architect_bootstrap`. Until a human approves the work breakdown, supervisor and auto workers are not used for development task fan-out.

## 2. First Prompt

Print the repo-aware prompt with:

```bash
python3 scripts/ai_status.py prompt
```

Use that output as the first prompt in Claude Code, Codex CLI, Gemini CLI, Copilot, or any other connected coding LLM.

## 3. Shared Truth Rules

- `ai-status.json` is the machine-readable source of truth for tasks, ownership, blockers, and handoffs
- `ai-activity-log.jsonl` is append-only history
- `current-work.md` is generated from state and is not the write source
- `docs-site/` is a read-only dashboard mirror, not the place to edit status

## 4. Status Commands

Use the status script instead of editing collaboration files manually:

```bash
AI_NAME=Codex ./scripts/ai-status.sh assign <task-id> <owner> <reviewer> "Optional title"
AI_NAME=Codex ./scripts/ai-status.sh start <task-id> "Started implementation"
AI_NAME=Codex ./scripts/ai-status.sh progress <task-id> "Updated progress"
AI_NAME=Codex ./scripts/ai-status.sh handoff <task-id> Claude "Ready for review"
AI_NAME=Claude REVIEW_NOTES_ZH="審查通過||回到 owner 收尾" ./scripts/ai-status.sh approve <task-id> "Review approved and returned to the owner for finalization"
AI_NAME=Codex ./scripts/ai-status.sh done <task-id> "Owner finalized approved task and closed it"
./scripts/sync-state.sh
```

Lifecycle:

- `todo -> in_progress -> review -> review_approved -> done`

Guardrails:

- `reviewer` cannot equal `owner`
- only the reviewer may move a task to `review_approved`
- only the owner may close a `review_approved` task to `done`

## 5. Work Order

Every LLM should follow this order:

1. Review tasks assigned to you as reviewer
2. Finalize your own `review_approved` tasks
3. Continue your `in_progress` tasks
4. Pick unblocked `todo` tasks assigned to you

## 6. Local Runtime

Prepare the local environment:

```bash
bash scripts/setup-llm-cli.sh
```

Run the local collaboration control plane from the repo root:

```bash
bash scripts/run-supervisor.sh --verbose
bash scripts/run-dashboard.sh
```

You may start the runtime before consensus for dashboard visibility, but do not seed development tasks until the repo leaves `architect_bootstrap`.

## 7. First Smoke Test After Consensus

```bash
AI_NAME=Codex TASK_PHASE="Wave 0" TASK_SUMMARY_ZH="建立第一個共識後任務。" ./scripts/ai-status.sh assign DEMO-001 Codex Claude "First supervisor-managed task"
AI_NAME=Codex ./scripts/ai-status.sh start DEMO-001 "Started the first supervisor-managed task"
./scripts/sync-state.sh
```

Then verify:

- `ai-status.json` contains `DEMO-001`
- `current-work.md` refreshed
- dashboard shows the task
- supervisor shows heartbeat or queue activity
