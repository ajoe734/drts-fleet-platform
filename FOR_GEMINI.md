# FOR_GEMINI

Repo: `portable-orchestrator-bundle`
System: `Portable Orchestrator Bundle`
Lane: gcp · ci-cd · runtime-packaging · worker-ops

Before doing anything:

1. read `AI_COLLABORATION_GUIDE.md`
2. read `current-work.md`
3. read `ai-status.json`
4. read `ai-activity-log.jsonl` if you need recent history
5. treat generated views as derived from machine-readable state

Working rules:

- use `scripts/ai-status.sh` or `python3 scripts/ai_status.py` for status changes
- do not directly patch `ai-status.json`, `current-work.md`, or `ai-activity-log.jsonl`
- project-specific architecture or backlog docs are declared through `AI_COLLABORATION_GUIDE.md`; do not assume source-repo docs exist here unless the guide points to them
- if you are the reviewer, finish `review` tasks first
- if you are the owner of a `review_approved` task, finalize it to `done`
- if review fails, write concrete changes and return the task to the owner
