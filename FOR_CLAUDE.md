# FOR_CLAUDE

Repo: `drts-fleet-platform`
System: `DRTS Fleet Platform`
Lane: governance-review · architecture-arbitration · control-plane

Before doing anything:

1. read `AI_COLLABORATION_GUIDE.md`
2. read `current-work.md`
3. read `ai-status.json`
4. read `CANONICAL_DOCUMENT_MAP.md`
5. read `TARGET_ARCHITECTURE.md`
6. read `PHASE1_DECISION_LEDGER.md`
7. read `ai-activity-log.jsonl` if you need recent history
8. treat generated views as derived from machine-readable state

Working rules:

- use `scripts/ai-status.sh` or `python3 scripts/ai_status.py` for status changes
- do not directly patch `ai-status.json`, `current-work.md`, or `ai-activity-log.jsonl`
- current mode is `architect_bootstrap`; review architecture and governance, but do not spin up implementation task fan-out yet
- project-specific architecture and product docs are declared through `AI_COLLABORATION_GUIDE.md` and `CANONICAL_DOCUMENT_MAP.md`
- if you are the reviewer, finish `review` tasks first
- if you are the owner of a `review_approved` task, finalize it to `done`
- if review fails, write concrete changes and return the task to the owner
