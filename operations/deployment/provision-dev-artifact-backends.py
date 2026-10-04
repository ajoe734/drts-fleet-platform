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


def ensure_private_bucket(project: str, bucket: str, region: str) -> None:
    require_match("bucket name", BUCKET_RE, bucket)
    require_match("region", REGION_RE, region)
    uri = f"gs://{bucket}"
    describe = run(
        ["gcloud", "storage", "buckets", "describe", uri, "--project", project,
         "--format=value(name)"]
    )
    if describe.returncode == 0 and describe.stdout.strip():
        print(f"bucket {uri} already exists")
    else:
        create = run(
            [
                "gcloud", "storage", "buckets", "create", uri,
                "--project", project,
                "--location", region,
                "--uniform-bucket-level-access",
                "--public-access-prevention",
                "--versioning",
            ],
            timeout=120,
        )
        if create.returncode != 0:
            raise ProvisioningError(f"Failed to create bucket {uri}")
        print(f"created bucket {uri}")
    # Re-assert privacy on every run, including a bucket this script did not
    # create, so this is never a one-time guarantee.
    update = run(
        [
            "gcloud", "storage", "buckets", "update", uri,
            "--project", project,
            "--uniform-bucket-level-access",
            "--public-access-prevention",
        ],
        timeout=60,
    )
    if update.returncode != 0:
        raise ProvisioningError(f"Failed to enforce private access on {uri}")


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
            # IAM-only: no public ingress flag is ever passed here.
            "--no-allow-unauthenticated",
            "--concurrency", "1",
            "--min-instances", "0",
            "--max-instances", "1",
            "--container", "gateway",
            "--image", gateway_image,
            "--port", "8080",
            "--set-env-vars",
            "CLAMD_HOST=127.0.0.1,CLAMD_PORT=3310,"
            "CLAMAV_READY_MARKER=/var/run/clamav-ready/ready",
            "--container", "clamd",
            "--image", clamd_image,
        ],
        timeout=600,
    )
    if deploy.returncode != 0:
        raise ProvisioningError(f"Scanner Cloud Run deploy failed for {service}")


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

        ensure_private_bucket(args.project, args.document_bucket, args.region)
        ensure_private_bucket(args.project, args.remittance_bucket, args.region)
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
