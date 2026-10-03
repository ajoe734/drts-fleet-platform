#!/usr/bin/env python3
"""Resolve opt-in dev artifact provider settings, never credential values.

DEV_PROVIDER_CONFIG_JSON contains GitHub repository *variables*. Credentials
must be pre-provisioned Secret Manager entries; only metadata is inspected.
Outputs are suffixes for the existing complete --set-env-vars/--set-secrets
arguments. No provisioning, service deployment, secret access or provider call.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
from pathlib import Path
from urllib.parse import urlsplit


class ConfigurationError(ValueError):
    pass


def resolve(variables: dict[str, str], secret_prefix: str) -> tuple[dict[str, str], dict[str, str]]:
    if not re.fullmatch(r"[a-z][a-z0-9-]{0,62}", secret_prefix):
        raise ConfigurationError("Invalid Secret Manager prefix")
    settings: dict[str, str] = {}
    mounts: dict[str, str] = {}
    recognized: set[str] = set()

    def value(name: str, default: str = "") -> str:
        recognized.add("DEV_" + name)
        raw = variables.get("DEV_" + name, "")
        if not isinstance(raw, str):
            raise ConfigurationError(f"DEV_{name} must be a string")
        # Neither a gcloud list separator nor a shell/GITHUB_OUTPUT payload
        # may be smuggled into values. Do not echo a rejected value.
        if any(c in raw for c in "@,\r\n\x00\"'`$\\"):
            raise ConfigurationError(f"DEV_{name} contains forbidden characters")
        return raw.strip() or default

    def required(name: str) -> str:
        result = value(name)
        if not result:
            raise ConfigurationError(f"DEV_{name} is required")
        return result

    def boolean(name: str, default: str) -> str:
        result = value(name, default)
        if result not in ("true", "false"):
            raise ConfigurationError(f"DEV_{name} must be true or false")
        return result

    def absent(names: list[str]) -> None:
        for name in names:
            if value(name):
                raise ConfigurationError(f"DEV_{name} supplied without an enabled provider")

    for prefix in ("REMITTANCE_PROOF", "DOCUMENT_ARTIFACT"):
        provider_key = prefix + "_STORAGE_PROVIDER"
        provider = value(provider_key, "unprovisioned")
        fields = [prefix + "_S3_" + suffix for suffix in (
            "BUCKET", "REGION", "ENDPOINT", "FORCE_PATH_STYLE", "AUTH_MODE", "SESSION_TOKEN_ENABLED",
        )]
        # Credentials in ordinary GitHub variables are not an accepted input.
        for suffix in ("ACCESS_KEY_ID", "SECRET_ACCESS_KEY", "SESSION_TOKEN"):
            if value(prefix + "_S3_" + suffix):
                raise ConfigurationError(f"{prefix} credentials must use managed secret references")
        if provider == "unprovisioned":
            absent(fields)
            settings[provider_key] = provider
            continue
        if provider != "s3":
            raise ConfigurationError(f"DEV_{provider_key} must be s3 or unprovisioned")
        settings[provider_key] = provider
        bucket = required(prefix + "_S3_BUCKET")
        if not re.fullmatch(r"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]", bucket):
            raise ConfigurationError(f"Invalid {prefix} bucket name")
        region = required(prefix + "_S3_REGION")
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,62}", region):
            raise ConfigurationError(f"Invalid {prefix} S3 region")
        settings[prefix + "_S3_BUCKET"] = bucket
        settings[prefix + "_S3_REGION"] = region
        settings[prefix + "_S3_FORCE_PATH_STYLE"] = boolean(prefix + "_S3_FORCE_PATH_STYLE", "false")
        endpoint = value(prefix + "_S3_ENDPOINT")
        if endpoint:
            try:
                url = urlsplit(endpoint)
                valid = (url.scheme == "https" and url.hostname and not url.username and
                         not url.password and not url.query and not url.fragment and
                         not any(c.isspace() for c in endpoint))
                _ = url.port
            except ValueError:
                valid = False
            if not valid:
                raise ConfigurationError(f"Invalid {prefix} HTTPS endpoint")
            settings[prefix + "_S3_ENDPOINT"] = endpoint
        # Cloud Run does not acquire AWS credentials just by having a Google
        # service account. Default to explicit managed credentials. A verified
        # SDK chain is an operator opt-in, not assumed GCS/S3 compatibility.
        auth_mode = value(prefix + "_S3_AUTH_MODE", "secret")
        token = boolean(prefix + "_S3_SESSION_TOKEN_ENABLED", "false")
        if auth_mode not in ("secret", "default-chain"):
            raise ConfigurationError(f"Invalid {prefix} S3 auth mode")
        if auth_mode == "default-chain" and token == "true":
            raise ConfigurationError("Session token requires managed secret credentials")
        if auth_mode == "secret":
            for suffix in ("ACCESS_KEY_ID", "SECRET_ACCESS_KEY") + (("SESSION_TOKEN",) if token == "true" else ()):
                name = prefix + "_S3_" + suffix
                mounts[name] = secret_prefix + "-" + name.lower().replace("_", "-")

    scanner_key = "REMITTANCE_PROOF_SCANNER_PROVIDER"
    scanner = value(scanner_key, "unprovisioned")
    fields = ["REMITTANCE_PROOF_CLAMD_" + suffix for suffix in ("HOST", "PORT", "TLS", "TIMEOUT_MS")]
    if scanner == "unprovisioned":
        absent(fields)
    elif scanner == "clamd":
        if settings["REMITTANCE_PROOF_STORAGE_PROVIDER"] != "s3":
            raise ConfigurationError("clamd requires configured proof storage")
        host = required(fields[0])
        if not re.fullmatch(r"[a-zA-Z0-9.:-]+", host):
            raise ConfigurationError("Invalid clamd host")
        settings[fields[0]] = host
        for name, default, lower, upper in ((fields[1], "3310", 1, 65535), (fields[3], "15000", 100, 60000)):
            result = value(name, default)
            if not result.isascii() or not result.isdigit() or not lower <= int(result) <= upper:
                raise ConfigurationError(f"Invalid DEV_{name}")
            settings[name] = result
        settings[fields[2]] = boolean(fields[2], "true")
    else:
        raise ConfigurationError("Proof scanner must be clamd or unprovisioned")
    settings[scanner_key] = scanner
    if any(key.startswith(("DEV_REMITTANCE_PROOF_", "DEV_DOCUMENT_ARTIFACT_")) and key not in recognized for key in variables):
        raise ConfigurationError("Unknown dev artifact provider variable; check configuration spelling")
    return settings, mounts


def check_secret(project: str, name: str) -> None:
    try:
        result = subprocess.run(
            ["gcloud", "secrets", "describe", name, "--project", project, "--format=value(name)"],
            capture_output=True, text=True, timeout=30, check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ConfigurationError(f"Cannot inspect required secret metadata: {name}") from error
    if result.returncode or not result.stdout.strip():
        raise ConfigurationError(f"Required secret missing or inaccessible: {name}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True)
    parser.add_argument("--secret-prefix", required=True)
    parser.add_argument("--github-output", required=True, type=Path)
    args = parser.parse_args()
    try:
        if not re.fullmatch(r"[a-z][a-z0-9-]{4,61}[a-z0-9]", args.project):
            raise ConfigurationError("Invalid GCP project ID")
        variables = json.loads(os.environ["DEV_PROVIDER_CONFIG_JSON"])
        if not isinstance(variables, dict):
            raise ConfigurationError("DEV_PROVIDER_CONFIG_JSON must be an object")
        settings, mounts = resolve(variables, args.secret_prefix)
        for name in mounts.values():
            check_secret(args.project, name)
        # Publish nothing on partial validation or secret-metadata failure.
        env_suffix = "".join(f"@{key}={value}" for key, value in settings.items())
        secret_suffix = "".join(f",{key}={name}:latest" for key, name in mounts.items())
        with args.github_output.open("a", encoding="utf-8") as output:
            output.write(f"env_suffix={env_suffix}\nsecret_suffix={secret_suffix}\n")
        print("Dev artifact provider configuration resolved; no provider health or live acceptance claimed.")
        return 0
    except (ConfigurationError, KeyError, json.JSONDecodeError) as error:
        print(f"::error::{error}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
