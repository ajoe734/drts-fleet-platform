# Project Overview

`drts-fleet-platform` is the core monorepo for the DRTS multi-surface fleet and
operations platform.

Current in-repo primary product surfaces:

1. platform admin web
2. ops console web
3. driver mobile app
4. backend API

Additional topology notes:

- `apps/tenant-portal-web` still exists in the repo, but it is a frozen
  reference shell and is not the production tenant UI.
- the production tenant UI is `tenant-commute-hub` (external repo)
- this repo is the BFF / authority for tenant-facing workflows

The API, docs, infra, and scripts layers support those surfaces so the repo can
act as both implementation host and operational control plane.

Current posture:

- the master closeout wave is complete except for `GAP-P2S3-001`
- rollout evidence, tenant boundary, finance/reporting completeness, and
  integration hardening have been closed
- Passenger App / Web, Call Point / Concierge Portal, and AV / live-board scope
  remain explicit deferred or future-gated families rather than hidden gaps
