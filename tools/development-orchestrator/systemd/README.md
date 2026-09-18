# Development Orchestrator Services

The canonical user service is `drts-supervisor.service`. Health, canonical-root
watching, and Claude credential keepalive are independent observer timers; none
of them writes task-board state or dispatches work.

Install or refresh the services through their canonical installers:

```bash
tools/development-orchestrator/bin/install-supervisor-systemd.sh
tools/development-orchestrator/bin/install-health-systemd.sh
tools/development-orchestrator/bin/install-canonical-root-watch-systemd.sh
tools/development-orchestrator/bin/install-claude-keepalive-systemd.sh
```

The installers render repository paths into `~/.config/systemd/user`, reload the
user manager, and enable the corresponding units. The Supervisor remains the
only dispatch authority; observer timers must stay read-only.
