"""Bind a hosted bureau run to three existing Cloud Run revisions, read-only."""
import argparse
import json
import os
import re
import subprocess
from pathlib import Path


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def cloud(kind, name, operation="describe"):
    result = subprocess.run(
        ["gcloud", "run", kind, operation, name,
         "--project=drts-dev-devcc-20260825", "--region=us-central1",
         "--format=json"],
        check=True, capture_output=True, text=True, timeout=60,
    )
    return json.loads(result.stdout)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", choices=("before", "after"), required=True)
    args = parser.parse_args()
    require(os.environ.get("GITHUB_ACTIONS") == "true", "Hosted execution only")
    definition = os.environ.get("EXPECTED_DEFINITION_SHA", "")
    runtime = os.environ.get("EXPECTED_RUNTIME_SHA", "")
    require(re.fullmatch(r"[0-9a-f]{40}", definition) is not None,
            "Definition must be a full immutable SHA")
    require(re.fullmatch(r"[0-9a-f]{40}", runtime) is not None,
            "Runtime must be a full immutable SHA")
    require(definition == os.environ.get("GITHUB_SHA"), "Workflow definition SHA differs")
    require(subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
            == definition, "Actual checkout differs")
    require(os.environ.get("DEV_GCP_PROJECT_ID") == "drts-dev-devcc-20260825"
            and os.environ.get("DEV_GCP_REGION") == "us-central1", "Live target differs")
    phones = json.loads(os.environ.get("PAX_BUREAU_PHONES", "{}"))
    keys = {"consent", "wrong", "resend", "expiry", "returning", "trip", "reliability", "matching"}
    require(isinstance(phones, dict) and set(phones) == keys, "Allocate all eight case identities")
    require(all(isinstance(value, str) and re.fullmatch(r"09000000\d{2}", value)
                for value in phones.values()), "Only the existing synthetic phone pool is allowed")
    require(len(set(phones.values())) == len(keys), "Case identities must be distinct")
    snapshot = {"definitionSha": definition, "runtimeSha": runtime, "phase": args.phase,
                "services": {}, "phoneAllocationKeys": sorted(phones)}
    for role, name in (("api", "drts-dev-api"), ("ops", "drts-dev-ops-console-web"),
                       ("pax", "drts-dev-passenger-app-web")):
        service = cloud("services", name)
        status = service["status"]
        revision = status["latestReadyRevisionName"]
        require(revision == status["latestCreatedRevisionName"], f"{role}: revision not ready")
        traffic = status.get("traffic", [])
        require(len(traffic) == 1 and traffic[0].get("percent") == 100
                and traffic[0].get("revisionName") == revision, f"{role}: split or stale traffic")
        origin = status["url"]
        require(re.fullmatch(r"https://" + re.escape(name) + r"-[a-z0-9-]+\.a\.run\.app", origin)
                is not None, f"{role}: unexpected canonical origin")
        deployed = cloud("revisions", revision)
        env = {row["name"]: row.get("value")
               for row in deployed["spec"]["containers"][0].get("env", [])}
        require(env.get("DRTS_CANDIDATE_SHA") == runtime, f"{role}: runtime SHA differs")
        require(env.get("PAX_REVIEW_DEMO_ENABLED") == "true", f"{role}: rehearsal not enabled")
        if role == "api":
            # Read the deployed configuration, using the original service's
            # positive safe-integer policy/default. Never change runtime env.
            try:
                configured = float(env.get("DISPATCH_MATCHING_TIMEOUT_MS", ""))
                matching_ms = int(configured) if configured.is_integer() and 0 < configured <= 2**53 - 1 else 90_000
            except (ValueError, TypeError):
                matching_ms = 90_000
            snapshot["matchingTimeoutMs"] = matching_ms
        if role == "pax":
            require(env.get("PAX_PUBLIC_PASSENGER_ONLY") == "true", "Public Passenger contract differs")
        if role == "ops":
            require(env.get("PAX_PUBLIC_PASSENGER_ONLY") == "false", "Private Ops contract differs")
            bindings = cloud("services", name, "get-iam-policy").get("bindings", [])
            require(not any(member in ("allUsers", "allAuthenticatedUsers")
                            for binding in bindings for member in binding.get("members", [])),
                    "Ops must remain private")
        snapshot["services"][role] = {"origin": origin, "revision": revision, "runtimeSha": runtime}
    output = Path(".artifacts/pax-bureau-acceptance")
    output.mkdir(parents=True, exist_ok=True)
    (output / f"shared-runtime-{args.phase}.json").write_text(
        json.dumps(snapshot, indent=2) + "\n", encoding="utf-8")
    if args.phase == "after":
        before = json.loads((output / "shared-runtime-before.json").read_text())
        require(before["services"] == snapshot["services"], "Runtime changed during the journey")
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as handle:
        handle.write(f"matching_timeout_ms={snapshot['matchingTimeoutMs']}\n")
        for role, service in snapshot["services"].items():
            handle.write(f"{role}_origin={service['origin']}\n")


if __name__ == "__main__":
    main()
