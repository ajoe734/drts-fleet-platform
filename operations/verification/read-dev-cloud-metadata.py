#!/usr/bin/env python3
"""Read-only, fixed-inventory shared-dev metadata. Never invoke product endpoints."""
import argparse
import datetime
import hashlib
import json
import os
import re
import subprocess
from pathlib import Path

PROJECT = "drts-dev-devcc-20260825"
REGION = "us-central1"
RUNTIME = f"drts-dev-runtime@{PROJECT}.iam.gserviceaccount.com"
SCANNER_IDENTITY = f"drts-dev-artifact-scanner@{PROJECT}.iam.gserviceaccount.com"
DEPLOYER = f"github-actions-deployer@{PROJECT}.iam.gserviceaccount.com"
PRIVATE_SERVICES = (
    "drts-dev-platform-admin-web", "drts-dev-ops-console-web",
    "drts-dev-fleet-partner-portal-web", "drts-dev-tenant-console-web",
    "drts-dev-bank-console-web", "drts-dev-enterprise-dispatch-web",
    "drts-channel-partner-portal-web",
)
SERVICES = ("drts-dev-api", *PRIVATE_SERVICES, "drts-dev-scanner")
PROVIDERS = {
    "DOCUMENT_ARTIFACT_STORAGE_PROVIDER": "gcs",
    "DOCUMENT_ARTIFACT_GCS_BUCKET": PROJECT + "-document-artifacts",
    "REMITTANCE_PROOF_STORAGE_PROVIDER": "gcs",
    "REMITTANCE_PROOF_GCS_BUCKET": PROJECT + "-remittance-proofs",
    "REMITTANCE_PROOF_SCANNER_PROVIDER": "cloud-run-clamd",
    "REMITTANCE_PROOF_SCANNER_TIMEOUT_MS": "60000",
}
SCANNER_ENV = {
    "CLAMD_HOST": "127.0.0.1", "CLAMD_PORT": "3310",
    "CLAMAV_READY_MARKER": "/var/run/clamav-ready/ready",
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def full_sha(value):
    require(isinstance(value, str) and re.fullmatch(r"[0-9a-f]{40}", value),
            "Expected immutable full SHA")
    return value


def read_json(service, verb):
    require(service in SERVICES and verb in ("describe", "get-iam-policy"),
            "Read command is outside fixed inventory")
    command = ["gcloud", "run", "services", verb, service, "--project", PROJECT,
               "--region", REGION, "--format=json", "--quiet"]
    try:
        result = subprocess.run(command, capture_output=True, text=True,
                                timeout=30, check=True)
        value = json.loads(result.stdout)
    except (subprocess.SubprocessError, OSError, ValueError):
        # Never persist raw stderr, command credentials or untrusted output.
        raise ValueError(f"Control-plane read failed: {service} {verb}") from None
    require(isinstance(value, dict), "Control-plane response must be an object")
    return value


def bindings(policy):
    rows = policy.get("bindings", [])
    require(isinstance(rows, list), "Invalid IAM bindings")
    result = []
    for row in rows:
        require(isinstance(row, dict) and isinstance(row.get("role"), str)
                and isinstance(row.get("members"), list)
                and all(isinstance(m, str) for m in row["members"]), "Invalid IAM binding")
        require(not row.get("condition"), "Unexpected conditional binding")
        result.append({"role": row["role"], "members": sorted(row["members"])})
    return sorted(result, key=lambda x: (x["role"], x["members"]))


def service_view(name, value):
    require(value.get("metadata", {}).get("name") == name, "Wrong service response")
    status = value.get("status", {})
    require(any(c.get("type") == "Ready" and c.get("status") == "True"
                for c in status.get("conditions", [])), "Service is not Ready")
    revision = status.get("latestReadyRevisionName")
    require(isinstance(revision, str) and revision.startswith(name + "-")
            and revision == status.get("latestCreatedRevisionName"), "Revision is not fully ready")
    traffic = status.get("traffic", [])
    require(traffic and all(t.get("revisionName") == revision for t in traffic)
            and all(type(t.get("percent")) is int for t in traffic)
            and sum(t["percent"] for t in traffic) == 100, "Traffic is not fully on ready revision")
    template = value.get("spec", {}).get("template", {})
    spec = template.get("spec", {})
    expected_identity = SCANNER_IDENTITY if name == "drts-dev-scanner" else RUNTIME
    require(spec.get("serviceAccountName") == expected_identity, "Unexpected service identity")
    containers = spec.get("containers", [])
    require(containers and all(isinstance(c.get("image"), str) and
            re.fullmatch(r"us-central1-docker\.pkg\.dev/" + PROJECT +
                         r"/drts/[a-z0-9-]+@sha256:[0-9a-f]{64}", c["image"])
            for c in containers), "Image is not a current-project immutable digest")
    return {"service": name, "ready_revision": revision, "identity": expected_identity,
            "images": {c.get("name", str(i)): c["image"] for i, c in enumerate(containers)}}


def collect(expected_runtime_sha, definition_sha):
    full_sha(expected_runtime_sha)
    full_sha(definition_sha)
    require(os.environ.get("DEV_GCP_PROJECT_ID") == PROJECT and
            os.environ.get("DEV_GCP_REGION") == REGION, "Unexpected live target variables")
    snapshots = {}
    raw = {}
    for name in SERVICES:
        value = read_json(name, "describe")
        policy = bindings(read_json(name, "get-iam-policy"))
        view = service_view(name, value)
        if name in PRIVATE_SERVICES:
            require(not any(m in ("allUsers", "allAuthenticatedUsers")
                            for row in policy for m in row["members"]), "Public private-console IAM")
        elif name == "drts-dev-api":
            require(policy == [{"role": "roles/run.invoker", "members": ["allUsers"]}],
                    "Existing API public binding changed")
        else:
            require(policy == [{"role": "roles/run.invoker", "members": sorted([
                "serviceAccount:" + RUNTIME, "serviceAccount:" + DEPLOYER])}],
                    "Scanner invokers changed")
        view["bindings"] = policy
        snapshots[name] = view
        raw[name] = value
    api_spec = raw["drts-dev-api"]["spec"]["template"]["spec"]
    env = {e["name"]: e.get("value") for e in api_spec["containers"][0].get("env", [])}
    require(env.get("DRTS_CANDIDATE_SHA") == expected_runtime_sha, "Runtime source differs from expected prior source")
    require(all(env.get(k) == v for k, v in PROVIDERS.items()), "Artifact providers differ from approved settings")
    scanner = raw["drts-dev-scanner"]
    require(env.get("REMITTANCE_PROOF_SCANNER_URL") == scanner["status"].get("url")
            and re.fullmatch(r"https://drts-dev-scanner-[a-z0-9-]+\.a\.run\.app",
                             env.get("REMITTANCE_PROOF_SCANNER_URL", "")), "Scanner URL mismatch")
    template = scanner["spec"]["template"]
    spec = template["spec"]
    annotations = template.get("metadata", {}).get("annotations", {})
    require(annotations.get("autoscaling.knative.dev/minScale", "0") == "0" and
            annotations.get("autoscaling.knative.dev/maxScale") == "1" and
            spec.get("containerConcurrency") == 1, "Scanner scale/concurrency changed")
    allowed_annotations = {"autoscaling.knative.dev/minScale", "autoscaling.knative.dev/maxScale",
                           "run.googleapis.com/client-name", "run.googleapis.com/client-version",
                           "run.googleapis.com/cpu-throttling", "run.googleapis.com/startup-cpu-boost"}
    require(set(annotations) <= allowed_annotations, "Unknown scanner annotations")
    containers = {c.get("name"): c for c in spec["containers"]}
    require(set(containers) == {"gateway", "clamd"}, "Scanner container inventory changed")
    for name, container in containers.items():
        require(not container.get("command") and not container.get("args"), "Scanner command override")
        entries = container.get("env", [])
        require(all(set(e) == {"name", "value"} for e in entries), "Scanner secret or unexpected environment shape")
        actual = {e["name"]: e["value"] for e in entries}
        require(len(actual) == len(entries) and actual == (SCANNER_ENV if name == "gateway" else {}),
                "Scanner fault, nonce, freshness or unknown environment override")
    safe_spec = scanner["spec"]
    snapshots["drts-dev-api"]["providers"] = {k: env[k] for k in PROVIDERS}
    snapshots["drts-dev-api"]["runtime_sha"] = expected_runtime_sha
    snapshots["drts-dev-api"]["scanner_url"] = env["REMITTANCE_PROOF_SCANNER_URL"]
    # Full spec hash permits exact comparison without publishing arbitrary raw fields.
    snapshots["drts-dev-scanner"]["spec_sha256"] = hashlib.sha256(
        json.dumps(safe_spec, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    snapshots["drts-dev-scanner"]["default_environment"] = SCANNER_ENV
    return {"schema": "dev-readonly-cloud-metadata-v1", "observed_at": datetime.datetime.now(
                datetime.timezone.utc).isoformat(), "definition_sha": definition_sha,
            "project": PROJECT, "region": REGION, "services": snapshots,
            "read_commands": len(SERVICES) * 2, "product_http_invocations": 0,
            "mutations": 0, "product_acceptance": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expected-runtime-sha", required=True)
    parser.add_argument("--definition-sha", required=True)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    try:
        result = collect(args.expected_runtime_sha, args.definition_sha)
    except ValueError as error:
        print(str(error))
        raise SystemExit(1) from None
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print("Fixed inventory metadata collected: 18 reads, 0 mutations, 0 product HTTP; not product acceptance.")


if __name__ == "__main__":
    main()
