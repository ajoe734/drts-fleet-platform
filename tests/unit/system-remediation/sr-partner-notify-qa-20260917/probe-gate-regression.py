"""Compare actual old/new workflow gates against the same synthetic reports.

No product code, socket, DB or browser is executed. The only substitutions are
report files/environment. Both gates' validation code executes unmodified.
"""
import json
from pathlib import Path
import runpy
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[4]
module = runpy.run_path(str(ROOT / "tools/ci/test_tenant_uat_acceptance_workflow.py"))
case = module["FullMatrixGateBehaviorTests"]()
case.setUp()
current = case.script
old_sha = sys.argv[1] if len(sys.argv) > 1 else "62962c9eb4bc10652c9e8314cc145064fa3c56ff"
old = module["_extract_step_run_block"](
    subprocess.check_output(["git", "show", f"{old_sha}:.github/workflows/tenant-uat-acceptance.yml"], cwd=ROOT, text=True),
    "Gate on zero skips", "PY_GATE",
)
pn = module["PARTNER_E2E"]
wh = module["WEBHOOK_E2E"]
unit = module["TENANT_UNIT"]


def compatible(reports):
    # The old workflow combined partner + webhook in this report. Keep that
    # positive-control shape for BOTH gates, then mutate one condition only.
    reports[wh]["suites"][0]["specs"].extend(reports[pn]["suites"][0]["specs"][:2])


def only_c201(reports):
    reports[pn]["suites"][0]["specs"] = reports[pn]["suites"][0]["specs"][:1]


def unnamed(reports):
    only_c201(reports)
    reports[pn]["suites"][0]["specs"][0]["title"] = "unnamed passing case"


def no_webhook(reports):
    reports[wh]["suites"][0]["specs"] = reports[pn]["suites"][0]["specs"][:2]


def no_ui_pg(reports):
    reports[unit]["testResults"] = [suite for suite in reports[unit]["testResults"]
                                   if not suite["name"].endswith("notification-ui.postgres.test.ts")]


mutations = {
    "complete_synthetic_positive_control": None,
    "single_unnamed_partner": unnamed,
    "partner_wrong_sha": lambda reports: reports[pn].update(candidate_sha="d" * 40),
    "partner_wrong_metadata_sha": lambda reports: reports[pn].update(config={"metadata": {"candidate_sha": "d" * 40}}),
    "two_partner_cases_replace_webhook": no_webhook,
    "only_C201": only_c201,
    "UI_PG_missing_but_aggregate_green": no_ui_pg,
}
results = {}
for name, mutate in mutations.items():
    def fixture(reports):
        compatible(reports)
        if mutate:
            mutate(reports)
    case.script = old
    before = case.run_gate(fixture)
    case.script = current
    after = case.run_gate(fixture)
    results[name] = {"before_exit": before.returncode, "after_exit": after.returncode,
                     "after_reason": after.stderr.strip()[:500]}
    if before.returncode != 0 or (after.returncode == 0) != (mutate is None):
        print(json.dumps(results, indent=2))
        raise SystemExit(f"Unexpected differential for {name}: old={before.stderr}, new={after.stderr}")
print(json.dumps({"before_sha": old_sha, "boundary": "synthetic reports only; no runtime acceptance", "cases": results}, indent=2))
