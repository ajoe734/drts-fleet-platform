# Local Development Overlay

This file is the template for machine-specific development notes that should not
be committed to Git.

Copy this file to:

- `docs/03-runbooks/local-development.local.md`

The real `.local.md` file is gitignored on purpose.

## Current Review Endpoints

Record per-VM review container names, published ports, and any temporary access
details here.

| Surface                 | Container | VM port | Notes |
| ----------------------- | --------- | ------- | ----- |
| API                     |           |         |       |
| Platform Admin Web      |           |         |       |
| Ops Console Web         |           |         |       |
| Tenant Portal reference |           |         |       |

## External Access Checks

Use this section for machine-specific troubleshooting commands and reminders.

Example checks:

1. Confirm a service is listening on the VM.
   Use `ss -ltnp | rg ':(3000|3001|3002|3003|4300|4301|4302|4303)\b'`.
2. Confirm the VM can reach the service locally.
   Use `curl http://127.0.0.1:<port>/health` for API checks.
3. Confirm Docker published ports if using review containers.
   Use `docker ps --format '{{.Names}} {{.Ports}}'`.
4. Confirm upstream firewall rules match the currently published review ports.

## Operator Notes

- Add machine-specific commands here.
- Add temporary firewall examples here.
- Add current reviewer URLs here.
