# Supervisor Services

The retired integration timer is intentionally absent. The running supervisor
polls the GitHub bus, reconciles PR head/CI/merge evidence against the locked
candidate SHA, and requests auto-merge only after same-SHA review and CI pass.
Use `drts-supervisor.service` and the canonical-root watcher services; do not
install a second merge loop.
