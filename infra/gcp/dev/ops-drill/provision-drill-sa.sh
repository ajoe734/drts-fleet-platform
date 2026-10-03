#!/usr/bin/env bash
# Operator only. Current default is a READ-ONLY IAM plan, not provisioning success.
set -euo pipefail
set +x
exec python3 "$(dirname "$0")/provision_drill_sa.py" "$@"
