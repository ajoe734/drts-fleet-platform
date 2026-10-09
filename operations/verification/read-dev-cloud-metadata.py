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


def read_json(service, verb, revision=None):
    require(service in SERVICES and verb in ("describe", "get-iam-policy"),
            "Read command is outside fixed inventory")
    if revision is not None:
        require(verb == "describe" and isinstance(revision, str) and
                re.fullmatch(re.escape(service) + r"-[0-9]{5}-[a-z0-9]{3}", revision),
                "Revision read is outside fixed service namespace")
    command = ["gcloud", "run", "revisions" if revision is not None else "services",
               verb, revision if revision is not None else service, "--project", PROJECT,
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
    require(isinstance(revision, str) and
            re.fullmatch(re.escape(name) + r"-[0-9]{5}-[a-z0-9]{3}", revision)
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
    names = [c.get("name", str(i)) for i, c in enumerate(containers)]
    require(len(containers) == (2 if name == "drts-dev-scanner" else 1) and
            len(set(names)) == len(names) and
            all("name" not in c or isinstance(c["name"], str) and
                re.fullmatch(r"[a-z][a-z0-9-]{0,62}", c["name"]) for c in containers),
            "Service container inventory mismatch")
    require(containers and all(isinstance(c.get("image"), str) and
            re.fullmatch(r"us-central1-docker\.pkg\.dev/" + PROJECT +
                         r"/drts/[a-z0-9-]+(?:@sha256:[0-9a-f]{64}|:[a-zA-Z0-9_.-]+)", c["image"])
            for c in containers), "Requested image is outside current project")
    return {"service": name, "ready_revision": revision, "identity": expected_identity,
            "implicit_single_container": len(containers) == 1 and "name" not in containers[0],
            "requested_images": {c.get("name", str(i)): c["image"] for i, c in enumerate(containers)}}


def revision_images(view, value):
    metadata = value.get("metadata", {})
    require(metadata.get("name") == view["ready_revision"] and
            metadata.get("labels", {}).get("serving.knative.dev/service") == view["service"],
            "Revision service linkage mismatch")
    status = value.get("status", {})
    require(any(c.get("type") == "Ready" and c.get("status") == "True"
                for c in status.get("conditions", [])), "Revision is not Ready")
    spec = value.get("spec", {})
    require(spec.get("serviceAccountName") == view["identity"], "Revision identity mismatch")
    containers = spec.get("containers", [])
    names = [c.get("name", str(i)) for i, c in enumerate(containers)]
    implicit = view["implicit_single_container"]
    require(len(names) == len(set(names)) and
            all("name" not in c or isinstance(c["name"], str) and
                re.fullmatch(r"[a-z][a-z0-9-]{0,62}", c["name"]) for c in containers) and
            ((implicit and len(names) == 1 and set(view["requested_images"]) == {"0"}) or
             (not implicit and set(names) == set(view["requested_images"]))),
            "Revision container inventory mismatch")
    # Cloud Run synthesizes a revision name for an unnamed singleton service.
    # Only that unambiguous positional case maps to service index0; named/multi
    # inventories and status digest names remain exact, never fuzzy aliases.
    service_names = ["0"] if implicit else names
    statuses = status.get("containerStatuses")
    resolved = {}
    if statuses is not None:
        require(isinstance(statuses, list) and len(statuses) == len(names) and
                len({c.get("name") for c in statuses}) == len(names) and
                {c.get("name") for c in statuses} == set(names), "Partial revision container digest inventory")
        resolved = {c["name"]: c.get("imageDigest") for c in statuses}
    images = {}
    for i, container in enumerate(containers):
        name = service_names[i]
        requested = view["requested_images"][name]
        repository = re.split(r"[@:]", requested, maxsplit=1)[0]
        revision_reference = container.get("image")
        require(isinstance(revision_reference, str) and
                re.split(r"[@:]", revision_reference, maxsplit=1)[0] == repository and
                (revision_reference == requested or
                 re.fullmatch(re.escape(repository) + r"@sha256:[0-9a-f]{64}", revision_reference)),
                "Revision requested image mismatch")
        # Multi-container revisions may expose digests in the actual revision's
        # immutable container references instead of the legacy primary status field.
        fallback = status.get("imageDigest") if i == 0 else revision_reference
        if i == 0 and fallback is None and len(containers) > 1:
            fallback = revision_reference
        digest = resolved.get(names[i], fallback)
        if i == 0 and resolved and status.get("imageDigest") is not None:
            require(digest == status["imageDigest"], "Conflicting revision digests")
        require(isinstance(digest, str) and
                re.fullmatch(re.escape(repository) + r"@sha256:[0-9a-f]{64}", digest),
                "Revision image is not a current-project immutable digest")
        if "@sha256:" in revision_reference:
            require(digest == revision_reference, "Revision resolved digest mismatch")
        if "@sha256:" in requested:
            require(digest == requested, "Service requested digest differs from ready revision")
        images[name] = digest
    return images


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
        view["images"] = revision_images(view, read_json(name, "describe", view["ready_revision"]))
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
            "read_commands": len(SERVICES) * 3, "product_http_invocations": 0,
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
    print("Fixed inventory metadata collected: 27 reads, 0 mutations, 0 product HTTP; not product acceptance.")


if __name__ == "__main__":
    main()
