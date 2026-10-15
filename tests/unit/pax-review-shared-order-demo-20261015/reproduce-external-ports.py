"""Run the same real-function scenarios against immutable accepted sources.

No reset of an active tree, servers, dependency mutations, or copied business SQL.
Only the two external adapters are replaced with their locked source versions.
"""
import json
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[3]
sha = "a8d9a55dc30c6cf9d37145e4f46ac98c12e6c8b1"
output = root / ".local/pax-review-shared-order-demo-20261015/historical"
output.mkdir(parents=True, exist_ok=True)
environment = dict(os.environ)
for variable, source in {
    "PAX_REVIEW_FAKE_SOURCE": "apps/api/src/modules/passenger-app/payment/fake-payment-provider.ts",
    "PAX_REVIEW_FIELDS_SOURCE": "apps/passenger-app-web/lib/payment/synthetic-fields.ts",
}.items():
    target = output / Path(source).name
    target.write_bytes(subprocess.check_output(["git", "show", f"{sha}:{source}"], cwd=root))
    environment[variable] = str(target)
command = ["pnpm", "exec", "vitest", "run", "tests/unit/pax-review-shared-order-demo-20261015/external-ports.test.ts", "-t", "production-build review fields|a retry scenario", "--reporter=verbose"]
result = subprocess.run(command, cwd=root, env=environment, capture_output=True, text=True)
log = result.stdout + result.stderr
(output / "before.log").write_text(log)
qualified = result.returncode == 1 and "2 failed" in log and "AssertionError" in log and "Failed Suites" not in log
receipt = {"source_sha": sha, "command": command, "exit_code": result.returncode, "product_failure_reproduced": qualified, "log": str(output / "before.log")}
(output / "verification.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps(receipt, indent=2))
raise SystemExit(0 if qualified else 1)
