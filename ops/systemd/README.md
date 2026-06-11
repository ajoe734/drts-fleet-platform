# Auto-integrator

`scripts/auto-integrate.py` rebases review-approved task branches onto `origin/dev`,
gates on required CI, and merges the clean+green ones — the step the orchestrator
never automated (it only auto-reconciles task *status* after a merge via
`apply_git_merge_reconciliation`). Pairs with the enforce integration gate: the
gate makes branch-only completions visible (held at `review_approved`); this lands
them automatically.

**Conservative:** clean rebase + green CI only. Conflicts / cross-task CI ripples
become `<TASK>-INTEGRATE-UNBLOCK` tasks for a lane/human — never force-resolved.

## Install (systemd --user)
```
cp ops/systemd/drts-auto-integrate.{service,timer} ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now drts-auto-integrate.timer
```

## Run on demand
```
python3 scripts/auto-integrate.py --all --dry-run        # preview
python3 scripts/auto-integrate.py --tasks ID1,ID2        # specific
python3 scripts/auto-integrate.py --all --open-unblock   # what the timer runs
```
