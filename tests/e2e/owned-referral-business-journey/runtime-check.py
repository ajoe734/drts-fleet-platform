"""Hosted-only, read-only fixed inventory binding. No product server is started."""
import argparse
import json
import os
import pathlib
import re
import subprocess
import urllib.parse

SERVICES = {
    "api": "drts-dev-api",
    "admin": "drts-dev-platform-admin-web",
    "ops": "drts-dev-ops-console-web",
    "fleet": "drts-dev-fleet-partner-portal-web",
    "referral": "drts-dev-referral-embed-web",
}


def validate_service(role, service, value, expected):
    status = value["status"]
    revision = status["latestReadyRevisionName"]
    if not revision or revision != status["latestCreatedRevisionName"]:
        raise RuntimeError(f"{role}: rollout is not stable")
    source = {item["name"]: item.get("value") for item in value["spec"]["template"]["spec"]["containers"][0].get("env", [])}.get("DRTS_CANDIDATE_SHA")
    if source != expected:
        raise RuntimeError(f"{role}: runtime source differs")
    traffic = status.get("traffic")
    if not isinstance(traffic, list) or not traffic:
        raise RuntimeError(f"{role}: canonical traffic allocation missing")
    active_traffic = []
    total = 0
    for target in traffic:
        if not isinstance(target, dict):
            raise RuntimeError(f"{role}: invalid traffic target")
        percent = target.get("percent", 0)
        if type(percent) is not int or not 0 <= percent <= 100:
            raise RuntimeError(f"{role}: invalid traffic percentage")
        if percent == 0:
            # An inactive tagged revision does not serve the canonical URL.
            continue
        if target.get("revisionName") != revision:
            raise RuntimeError(f"{role}: positive traffic targets another revision")
        total += percent
        active_traffic.append({"revision": revision, "percent": percent})
    if total != 100:
        raise RuntimeError(f"{role}: canonical traffic must total 100 percent")
    url = urllib.parse.urlsplit(status["url"])
    if url.scheme != "https" or not url.hostname or not url.hostname.endswith(".run.app") or url.username or url.password or url.query or url.fragment or url.path not in ("", "/"):
        raise RuntimeError(f"{role}: invalid managed runtime origin")
    return {"service": service, "revision": revision, "sha": source, "origin": f"https://{url.netloc}",
            "activeTraffic": sorted(active_traffic, key=lambda item: item["percent"])}


def collect():
    expected = os.environ["EXPECTED_RUNTIME_SHA"]
    if not re.fullmatch(r"[a-f0-9]{40}", expected):
        raise RuntimeError("full expected runtime SHA required")
    if (os.environ["DEV_GCP_PROJECT_ID"], os.environ["DEV_GCP_REGION"]) != (
        "drts-dev-devcc-20260825", "us-central1"
    ):
        raise RuntimeError("fixed dev target required")
    rows = {}
    for role, service in SERVICES.items():
        result = subprocess.run(
            ["gcloud", "run", "services", "describe", service,
             "--project=drts-dev-devcc-20260825", "--region=us-central1", "--format=json"],
            capture_output=True, timeout=45, check=False,
        )
        if result.returncode:
            raise RuntimeError(f"{role}: runtime metadata unavailable")
        value = json.loads(result.stdout)
        rows[role] = validate_service(role, service, value, expected)
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", choices=["before", "after"], required=True)
    args = parser.parse_args()
    directory = pathlib.Path(".artifacts/owned-referral-business-journey")
    directory.mkdir(parents=True, exist_ok=True)
    rows = collect()
    if args.phase == "after":
        before = json.loads((directory / "runtime-before.json").read_text())
        if before != rows:
            raise RuntimeError("runtime revisions changed during this journey")
    target = directory / f"runtime-{args.phase}.json"
    target.write_text(json.dumps(rows, indent=2) + "\n")
    if args.phase == "before" and os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as output:
            for role, row in rows.items():
                output.write(f"{role}_origin={row['origin']}\n")


if __name__ == "__main__":
    main()
