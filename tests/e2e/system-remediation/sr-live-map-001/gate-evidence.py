"""Fail closed on missing/partial/foreign-SHA evidence, even if a step exits 0."""
import json
import os
from pathlib import Path


def verify(root, sha, outcomes):
    if not all(value == "success" for value in outcomes.values()):
        raise ValueError("All map steps must finish successfully; skip is not pass")
    provider = json.loads((root / "evidence-map.json").read_text())
    coverage = json.loads((root / "evidence-coverage.json").read_text())
    browser = json.loads((root / "evidence-browser.json").read_text())
    for evidence, key in [(provider, "candidateSha"), (coverage, "candidate_sha"), (browser, "candidate_sha")]:
        if evidence.get(key) != sha or evidence.get("status") != "passed":
            raise ValueError("Evidence must pass on exactly the candidate SHA")
    if {item["case"] for item in coverage["service_area"]} != {
        "taipei-core", "airport", "outside-taipei", "outside-airport", "pickup-policy"
    }:
        raise ValueError("Missing service-area case evidence")
    for item in coverage["service_area"]:
        if not all(item.get(key) for key in ["address", "point", "basis", "expected", "actual"]):
            raise ValueError("Missing address/coordinate/decision evidence")
    if [item["case"] for item in coverage["location"]] != ["fresh", "stale", "low_accuracy", "fresh"]:
        raise ValueError("Missing location states or accurate-location restoration")
    for item in coverage["location"]:
        if item["actual"]["locationFreshness"] != item["case"]:
            raise ValueError("Unexpected live location state")
        if item["case"] == "stale" and item["waited_ms"] <= 90_000:
            raise ValueError("Stale sample requires a recorded real wait over 90 seconds")
    if browser.get("browser") != "chromium" or browser.get("failures") != []:
        raise ValueError("Chromium must have no Google or target errors")
    if [item["path"] for item in browser["pages"]] != ["/dispatch", "/callcenter"]:
        raise ValueError("Missing browser page evidence")
    for item in browser["pages"]:
        screenshot = root / f"map-{item['path'][1:]}.png"
        if item.get("ready") is not True or item.get("imagery_decoded") is not True or not screenshot.is_file() or screenshot.stat().st_size == 0:
            raise ValueError("Browser must render decoded map imagery and record screenshots")


def main():
    root = Path(".artifacts/live-map-acceptance")
    root.mkdir(parents=True, exist_ok=True)
    sha = os.environ.get("CANDIDATE_SHA", "")
    outcomes = {name: os.environ.get(name, "unknown") for name in [
        "INSTALL_OUTCOME", "RUNNER_OUTCOME", "COVERAGE_OUTCOME", "BROWSER_OUTCOME"
    ]}
    status = {"candidate_sha": sha, "workflow_sha": os.environ.get("WORKFLOW_SHA"), "status": "failed", "outcomes": outcomes}
    try:
        if len(sha) != 40 or any(c not in "0123456789abcdef" for c in sha) or status["workflow_sha"] != sha:
            raise ValueError("Workflow and candidate SHA must match")
        verify(root, sha, outcomes)
        status["status"] = "passed"
    except (ValueError, KeyError, TypeError, OSError) as error:
        status["reason"] = str(error)
    finally:
        (root / "run-status.json").write_text(json.dumps(status, indent=2) + "\n")
    print(f"Map acceptance: {status['status']}")
    raise SystemExit(0 if status["status"] == "passed" else 1)


if __name__ == "__main__":
    main()
