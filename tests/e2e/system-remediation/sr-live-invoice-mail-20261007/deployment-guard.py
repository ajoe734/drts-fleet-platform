"""Refuse mail session issuance during a scheduled/running shared-dev deploy.

Read-only GitHub check, used before cloud auth and immediately before minting.
This is a point-in-time guard, not a lock: operators must also refrain from
starting deploy-dev until the mail run has finished its session teardown.
"""
import json
import os
import re
import subprocess
import sys

ACTIVE_STATUSES = ("in_progress", "queued", "waiting", "pending", "requested")


class DeploymentBusyError(RuntimeError):
    pass


def check_deployment_idle(repository, run=None):
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository):
        raise ValueError("Invalid workflow repository")
    run = run or subprocess.run
    for status in ACTIVE_STATUSES:
        endpoint = f"repos/{repository}/actions/workflows/deploy-dev.yml/runs?status={status}&per_page=100"
        result = run(["gh", "api", "--paginate", "--slurp", endpoint],
                     capture_output=True, text=True, check=True, timeout=30)
        pages = json.loads(result.stdout)
        if not isinstance(pages, list) or not pages:
            raise ValueError("Invalid deployment run listing")
        for page in pages:
            if not isinstance(page, dict) or not isinstance(page.get("workflow_runs"), list):
                raise ValueError("Invalid deployment run listing")
            runs = page["workflow_runs"]
            # Even a run that completed after listing must be rechecked on a
            # later dispatch. Never turn an unexpected response into permission.
            if runs:
                raise DeploymentBusyError("deploy-dev has active or scheduled runs; wait for completion before mail acceptance")


def main():
    try:
        check_deployment_idle(os.environ.get("GITHUB_REPOSITORY", ""))
    except DeploymentBusyError as error:
        print(str(error), file=sys.stderr)
        return 1
    except Exception:
        # gh/HTTP errors may contain authentication details; do not echo them.
        print("Cannot verify deploy-dev is idle; mail session issuance refused", file=sys.stderr)
        return 1
    print("deploy-dev is idle at this check; keep deployment paused until mail teardown completes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
