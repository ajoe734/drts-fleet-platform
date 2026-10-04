#!/usr/bin/env python3
"""Provision the two private dev GCS artifact buckets and the private
ClamAV Cloud Run scanner gateway described in
.local/project-fixes-20261002/GCP-PROVIDERS-20261004.md.

What this does NOT do, on purpose:
  - does not grant any project-level IAM role; every binding here is
    scoped to one bucket or one Cloud Run service, never the project.
  - does not create, read or rotate any secret. GCS and Cloud Run auth for
    the API runtime is the ambient Cloud Run metadata identity, never a
    key file or Secret Manager entry.
  - does not accept a mutable image tag for either scanner container:
    --gateway-image and --clamd-image must each already be a fully
    qualified name@sha256:<digest> reference, so a later mutable-tag push
    can never silently change what this run deploys.
  - does not grant allUsers/allAuthenticatedUsers invoker on the scanner
    service; every --invoker-member must be a real service account.
  - does not select, request or fall back to a different gcloud identity.
    It assumes the ambient credentials it is invoked with (the existing
    authorized GitHub Actions WIF deploy rail) are already sufficient, and
    fails closed if any gcloud call denies a required action.
  - does not touch deploy-dev.yml, ci.yml or any other workflow. Wiring
    this script and the resolver's new gcs/cloud-run-clamd output suffixes
    into the deploy pipeline is a separate, explicitly scoped follow-up --
    see the split-ownership note in GCP-PROVIDERS-20261004.md.
  - does not run anywhere but the authorized hosted pipeline; it is never
    invoked by this repository's own CI merge gate just because this file
    exists on a reviewed branch.

Idempotent: every bucket and the Cloud Run service are described before
being created, and privacy/IAM settings are re-asserted on every run so an
already-existing resource this script did not create still ends up
correctly bounded, not merely one that happened to be configured right
once.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Sequence

DEPLOY_CLOUD_RUN_SERVICE = (
    Path(__file__).resolve().parent / "deploy-cloud-run-service.sh"
)

PROJECT_RE = re.compile(r"[a-z][a-z0-9-]{4,61}[a-z0-9]")
BUCKET_RE = re.compile(r"[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]")
SERVICE_ACCOUNT_RE = re.compile(
    r"[a-zA-Z0-9.+-]{1,61}@[a-zA-Z0-9.-]+\.iam\.gserviceaccount\.com"
)
SERVICE_NAME_RE = re.compile(r"[a-z][a-z0-9-]{0,61}[a-z0-9]")
REGION_RE = re.compile(r"[a-z0-9][a-z0-9-]{0,62}")
DIGEST_IMAGE_RE = re.compile(
    r"[a-z0-9.-]+(?:/[a-zA-Z0-9._-]+)+@sha256:[0-9a-f]{64}"
)
PUBLIC_MEMBERS = {"allUsers", "allAuthenticatedUsers"}


class ProvisioningError(RuntimeError):
    pass


def run(args: Sequence[str], *, timeout: int = 60) -> "subprocess.CompletedProcess[str]":
    try:
        return subprocess.run(
            list(args), capture_output=True, text=True, timeout=timeout, check=False
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ProvisioningError(f"Command failed to execute: {args[0]}") from error


def require_match(label: str, pattern: re.Pattern[str], value: str) -> str:
    if not pattern.fullmatch(value):
        raise ProvisioningError(f"Invalid {label}: {value!r}")
    return value


def require_digest_image(label: str, image: str) -> str:
    if not DIGEST_IMAGE_RE.fullmatch(image):
        raise ProvisioningError(
            f"{label} must be an exact name@sha256:<digest> reference, not a mutable tag"
        )
    return image


def resolve_project_number(project: str) -> str:
    result = run(
        ["gcloud", "projects", "describe", project, "--format=value(projectNumber)"]
    )
    number = result.stdout.strip()
    if result.returncode != 0 or not number:
        raise ProvisioningError(f"Failed to resolve project number for {project}")
    return number


def ensure_private_bucket(project: str, project_number: str, bucket: str, region: str) -> None:
    require_match("bucket name", BUCKET_RE, bucket)
    require_match("region", REGION_RE, region)
    uri = f"gs://{bucket}"
    # Describe is scoped by --project for request billing only -- it does
    # NOT prove this globally-named bucket is actually owned by that
    # project, so ownership/location must be checked from the returned
    # metadata before any mutation ever touches a bucket this script did
    # not itself just create (R9).
    #
    # `--format=json(...)` without `--raw` goes through gcloud's display
    # projection (resource_util.get_display_dict_for_resource against
    # BucketDisplayTitlesAndDefaults), whose field list includes `location`
    # but never `project_number` -- every already-existing bucket would come
    # back with an empty project number and get wrongly rejected as
    # cross-project, even when it is correctly owned (R9 round 2). `--raw`
    # bypasses that projection and returns the actual GCS JSON API bucket
    # resource, whose field is the camelCase `projectNumber`.
    describe = run(
        ["gcloud", "storage", "buckets", "describe", uri, "--project", project, "--raw",
         "--format=json(name,location,projectNumber)"]
    )
    if describe.returncode == 0 and describe.stdout.strip():
        try:
            metadata = json.loads(describe.stdout)
        except json.JSONDecodeError as error:
            raise ProvisioningError(f"Unparseable bucket metadata for {uri}") from error
        existing_location = str(metadata.get("location") or "").lower()
        existing_project_number = str(metadata.get("projectNumber") or "")
        if existing_location != region.lower() or existing_project_number != project_number:
            raise ProvisioningError(
                f"Refusing to reuse {uri}: owned by project_number="
                f"{existing_project_number!r} location={existing_location!r}, expected "
                f"project_number={project_number!r} location={region!r}"
            )
        print(f"bucket {uri} already exists in {project} ({existing_location}); reusing")
    else:
        create = run(
            [
                "gcloud", "storage", "buckets", "create", uri,
                "--project", project,
                "--location", region,
                "--uniform-bucket-level-access",
                "--public-access-prevention",
            ],
            timeout=120,
        )
        if create.returncode != 0:
            raise ProvisioningError(f"Failed to create bucket {uri}")
        print(f"created bucket {uri}")
    # Re-assert privacy AND versioning on every run, including a bucket this
    # script did not create, so this is never a one-time guarantee.
    # `--versioning` is only accepted by `buckets update`, never `buckets
    # create` (R2) -- it must live here, not in the create call above.
    update = run(
        [
            "gcloud", "storage", "buckets", "update", uri,
            "--project", project,
            "--uniform-bucket-level-access",
            "--public-access-prevention",
            "--versioning",
        ],
        timeout=60,
    )
    if update.returncode != 0:
        raise ProvisioningError(f"Failed to enforce private access on {uri}")
    verify = run(
        ["gcloud", "storage", "buckets", "describe", uri, "--project", project,
         "--format=value(versioning_enabled)"]
    )
    if verify.returncode != 0 or verify.stdout.strip().lower() != "true":
        raise ProvisioningError(f"Versioning not confirmed enabled on {uri}")


def grant_bucket_object_access(project: str, bucket: str, member: str) -> None:
    require_match("bucket name", BUCKET_RE, bucket)
    require_match("runtime service account", SERVICE_ACCOUNT_RE, member)
    result = run(
        [
            "gcloud", "storage", "buckets", "add-iam-policy-binding", f"gs://{bucket}",
            "--project", project,
            "--member", f"serviceAccount:{member}",
            # Object-level access only, scoped to this one bucket -- never
            # roles/storage.admin and never a project-level binding.
            "--role", "roles/storage.objectAdmin",
        ],
        timeout=60,
    )
    if result.returncode != 0:
        raise ProvisioningError(f"Failed to grant object access on gs://{bucket}")


READY_VOLUME_NAME = "clamav-ready"
READY_VOLUME_MOUNT_PATH = "/var/run/clamav-ready"
GATEWAY_MEMORY = "512Mi"
# ClamAV documents >1.2GiB just to load its engine and recommends 3-4GiB;
# Cloud Run's 512MiB default is nowhere near enough for a fresh signature
# set (R7).
CLAMD_MEMORY = "4Gi"


def deploy_scanner_service(
    *,
    project: str,
    region: str,
    service: str,
    service_account: str,
    gateway_image: str,
    clamd_image: str,
) -> None:
    if not DEPLOY_CLOUD_RUN_SERVICE.exists():
        raise ProvisioningError(
            f"Missing deploy helper: {DEPLOY_CLOUD_RUN_SERVICE}"
        )
    deploy = run(
        [
            str(DEPLOY_CLOUD_RUN_SERVICE), service,
            "--project", project,
            "--region", region,
            "--service-account", service_account,
            # IAM-only: no public ingress flag is ever passed here, and
            # invoker IAM checks are explicitly re-enabled on every run so a
            # service previously deployed with checks disabled can never
            # stay publicly invocable (R5).
            "--no-allow-unauthenticated",
            "--invoker-iam-check",
            "--concurrency", "1",
            "--min-instances", "0",
            "--max-instances", "1",
            # An in-memory volume shared by both containers in this same
            # instance -- the readiness marker clamd writes must actually
            # be visible to the gateway's filesystem checks (R4).
            "--add-volume", f"name={READY_VOLUME_NAME},type=in-memory,size-limit=1Mi",
            "--container", "gateway",
            "--image", gateway_image,
            "--port", "8080",
            "--memory", GATEWAY_MEMORY,
            "--add-volume-mount",
            f"volume={READY_VOLUME_NAME},mount-path={READY_VOLUME_MOUNT_PATH}",
            "--set-env-vars",
            "CLAMD_HOST=127.0.0.1,CLAMD_PORT=3310,"
            "CLAMAV_READY_MARKER=/var/run/clamav-ready/ready",
            "--container", "clamd",
            "--image", clamd_image,
            "--memory", CLAMD_MEMORY,
            "--add-volume-mount",
            f"volume={READY_VOLUME_NAME},mount-path={READY_VOLUME_MOUNT_PATH}",
        ],
        timeout=600,
    )
    if deploy.returncode != 0:
        raise ProvisioningError(f"Scanner Cloud Run deploy failed for {service}")


def reconcile_invoker_policy(
    project: str, region: str, service: str, desired_members: Sequence[str]
) -> None:
    """Remove any roles/run.invoker member not in desired_members -- a
    stray allUsers/allAuthenticatedUsers grant, or a service account that
    is no longer authorized, must never survive re-provisioning just
    because this script only ever added bindings before (R5)."""
    require_match("service name", SERVICE_NAME_RE, service)
    desired = {f"serviceAccount:{member}" for member in desired_members}
    policy = run(
        [
            "gcloud", "run", "services", "get-iam-policy", service,
            "--project", project,
            "--region", region,
            "--format=json",
        ],
        timeout=60,
    )
    if policy.returncode != 0:
        raise ProvisioningError(f"Failed to read IAM policy for {service}")
    try:
        parsed = json.loads(policy.stdout or "{}")
    except json.JSONDecodeError as error:
        raise ProvisioningError(f"Unparseable IAM policy for {service}") from error
    for binding in parsed.get("bindings", []):
        if binding.get("role") != "roles/run.invoker":
            continue
        for member in binding.get("members", []):
            if member in desired:
                continue
            # Cloud Run's IAM policy supports conditional bindings
            # (policy_version 3). Removing a role/member pair without
            # `--condition` or `--all` makes the real SDK's
            # `RemoveBindingFromIamPolicyWithCondition` raise
            # `IamPolicyBindingIncompleteError` in noninteractive mode the
            # moment the policy contains ANY condition anywhere, leaving an
            # unauthorized member (conditional or not) in place (R5 round
            # 2). `--all` removes every binding for this exact role/member
            # regardless of condition, which is always correct here: a
            # member excluded from `desired` has no legitimate reason to
            # keep any roles/run.invoker grant, conditional or not.
            removal = run(
                [
                    "gcloud", "run", "services", "remove-iam-policy-binding", service,
                    "--project", project,
                    "--region", region,
                    "--member", member,
                    "--role", "roles/run.invoker",
                    "--all",
                ],
                timeout=60,
            )
            if removal.returncode != 0:
                raise ProvisioningError(
                    f"Failed to remove stray invoker member {member} on {service}"
                )


def grant_invoker(project: str, region: str, service: str, member: str) -> None:
    require_match("service name", SERVICE_NAME_RE, service)
    require_match("invoker member", SERVICE_ACCOUNT_RE, member)
    result = run(
        [
            "gcloud", "run", "services", "add-iam-policy-binding", service,
            "--project", project,
            "--region", region,
            "--member", f"serviceAccount:{member}",
            "--role", "roles/run.invoker",
        ],
        timeout=60,
    )
    if result.returncode != 0:
        raise ProvisioningError(f"Failed to grant run.invoker to {member} on {service}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True)
    parser.add_argument("--region", required=True)
    parser.add_argument("--document-bucket", required=True)
    parser.add_argument("--remittance-bucket", required=True)
    parser.add_argument("--runtime-service-account", required=True,
                         help="API runtime SA; granted object access on both buckets.")
    parser.add_argument("--scanner-service", required=True)
    parser.add_argument("--scanner-service-account", required=True,
                         help="Dedicated scanner identity; never granted storage/data access.")
    parser.add_argument("--gateway-image", required=True,
                         help="name@sha256:<digest> for the gateway container.")
    parser.add_argument("--clamd-image", required=True,
                         help="name@sha256:<digest> for the clamd sidecar container.")
    parser.add_argument("--invoker-member", action="append", required=True,
                         dest="invoker_members",
                         help="Service account granted roles/run.invoker; repeatable.")
    args = parser.parse_args()
    try:
        # Validate every input before any gcloud call: an invalid digest,
        # name or public invoker member must never leave a half-provisioned
        # bucket/service behind.
        require_match("GCP project ID", PROJECT_RE, args.project)
        require_match("region", REGION_RE, args.region)
        require_match("document bucket name", BUCKET_RE, args.document_bucket)
        require_match("remittance bucket name", BUCKET_RE, args.remittance_bucket)
        require_match("runtime service account", SERVICE_ACCOUNT_RE, args.runtime_service_account)
        require_match("scanner service name", SERVICE_NAME_RE, args.scanner_service)
        require_match("scanner service account", SERVICE_ACCOUNT_RE, args.scanner_service_account)
        require_digest_image("--gateway-image", args.gateway_image)
        require_digest_image("--clamd-image", args.clamd_image)
        for member in args.invoker_members:
            if member in PUBLIC_MEMBERS:
                raise ProvisioningError(
                    "Public invoker grants are forbidden for the scanner service"
                )
            require_match("invoker member", SERVICE_ACCOUNT_RE, member)

        project_number = resolve_project_number(args.project)
        ensure_private_bucket(args.project, project_number, args.document_bucket, args.region)
        ensure_private_bucket(args.project, project_number, args.remittance_bucket, args.region)
        for bucket in (args.document_bucket, args.remittance_bucket):
            grant_bucket_object_access(args.project, bucket, args.runtime_service_account)

        deploy_scanner_service(
            project=args.project,
            region=args.region,
            service=args.scanner_service,
            service_account=args.scanner_service_account,
            gateway_image=args.gateway_image,
            clamd_image=args.clamd_image,
        )
        reconcile_invoker_policy(args.project, args.region, args.scanner_service, args.invoker_members)
        for member in args.invoker_members:
            grant_invoker(args.project, args.region, args.scanner_service, member)

        print(
            "Dev artifact backends provisioned against "
            f"{args.project}; no scan/health acceptance was performed by this script."
        )
        return 0
    except ProvisioningError as error:
        print(f"::error::{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
