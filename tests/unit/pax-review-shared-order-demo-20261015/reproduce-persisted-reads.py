"""Same real HTTP-controller regression against immutable accepted callers.

Only relative import locations are relocated; controller logic is unchanged.
Synchronous internal service methods retain their accepted contracts. No active
tree reset, server, fake business implementation, or alternative SQL is used.
"""
import json
import os
from pathlib import Path
import re
import subprocess

root = Path(__file__).resolve().parents[3]
sha = "a8d9a55dc30c6cf9d37145e4f46ac98c12e6c8b1"
output = root / ".local/pax-review-shared-order-demo-20261015/historical-reads"
output.mkdir(parents=True, exist_ok=True)
dependency_link = output / "node_modules"
if not dependency_link.exists():
    dependency_link.symlink_to((root / "apps/api/node_modules").resolve(), target_is_directory=True)
environment = dict(os.environ)
for variable, source in {
    "PAX_REVIEW_OWNED_CONTROLLER_SOURCE": "apps/api/src/modules/owned-mobility/owned-mobility.controller.ts",
    "PAX_REVIEW_FORWARDER_CONTROLLER_SOURCE": "apps/api/src/modules/forwarder/forwarder.controller.ts",
}.items():
    target = output / Path(source).name
    original = subprocess.check_output(["git", "show", f"{sha}:{source}"], cwd=root).decode()
    relocated = re.sub(r'(from\s+["\'])(\.[^"\']+)(["\'])', lambda m: m[1] + str((root / source).parent.joinpath(m[2]).resolve()) + m[3], original)
    target.write_text(relocated)
    environment[variable] = str(target)
command = ["pnpm", "exec", "vitest", "run", "tests/unit/pax-review-shared-order-demo-20261015/persisted-role-reads.test.ts", "--reporter=verbose"]
result = subprocess.run(command, cwd=root, env=environment, capture_output=True, text=True)
log = result.stdout + result.stderr
(output / "before.log").write_text(log)
qualified = result.returncode == 1 and "2 failed" in log and "AssertionError" in log and "Failed Suites" not in log
receipt = {"source_sha": sha, "replaced_sources": ["OwnedMobilityController", "ForwarderController"], "command": command, "exit_code": result.returncode, "product_failure_reproduced": qualified, "log": str(output / "before.log")}
(output / "verification.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps(receipt, indent=2))
raise SystemExit(0 if qualified else 1)
