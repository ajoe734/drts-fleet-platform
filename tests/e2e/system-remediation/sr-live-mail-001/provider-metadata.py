"""Read metadata only, never secret values or unrelated environment variables."""
import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path

PROJECT = "drts-dev-devcc-20260825"


def gcloud(*args):
    return json.loads(subprocess.run(["gcloud", *args, "--project=" + PROJECT, "--format=json"],
                                    capture_output=True, text=True, check=True, timeout=30).stdout)


def main():
    if os.environ.get("GITHUB_ACTIONS") != "true" or os.environ.get("DEV_GCP_PROJECT_ID") != PROJECT:
        raise ValueError("Unauthorized runner or project")
    service = gcloud("run", "services", "describe", "drts-dev-api", "--region=us-central1")
    traffic = service["status"]["traffic"]
    if len(traffic) != 1 or traffic[0].get("percent") != 100:
        raise ValueError("Ambiguous live revision")
    revision = gcloud("run", "revisions", "describe", traffic[0]["revisionName"], "--region=us-central1")
    entries = {item["name"]: item for item in revision["spec"]["containers"][0]["env"]}
    sha = os.environ["CANDIDATE_SHA"]
    if entries.get("DRTS_CANDIDATE_SHA", {}).get("value") != sha:
        raise ValueError("Provider revision is not the requested candidate")
    if entries.get("NOTIFICATION_OUTBOX_TYPE", {}).get("value") != "postgres":
        raise ValueError("Durable mail outbox is not configured")
    refs = {}
    for key, suffix in {"REMOTE_SMTP_HOST": "host", "REMOTE_SMTP_PORT": "port",
                        "REMOTE_SMTP_USERNAME": "username", "REMOTE_SMTP_PASSWORD": "password",
                        "REMOTE_SMTP_FROM_EMAIL": "from-email", "NOTIFICATION_FROM_EMAIL": "from-email",
                        "REMOTE_SMTP_RECIPIENT_ALLOWLIST": "recipient-allowlist"}.items():
        ref = entries[key]["valueFrom"]["secretKeyRef"]
        if ref["name"] != "drts-dev-smtp-" + suffix:
            raise ValueError("Unexpected provider secret reference")
        version = gcloud("secrets", "versions", "describe", ref["key"], "--secret=" + ref["name"])
        if version["state"] != "ENABLED":
            raise ValueError("Provider secret version disabled")
        refs[key] = {"secret": ref["name"], "mounted_version": ref["key"],
                     "resolved_version": version["name"], "created_at": version["createTime"]}
    alias_update = gcloud("secrets", "versions", "describe", "2", "--secret=drts-dev-smtp-recipient-allowlist")
    created = revision["metadata"]["creationTimestamp"]
    def timestamp(value):
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    if timestamp(created) <= timestamp(alias_update["createTime"]):
        raise ValueError("Revision predates the authorized alias update")
    allowlist = refs["REMOTE_SMTP_RECIPIENT_ALLOWLIST"]
    if int(allowlist["resolved_version"].rsplit("/", 1)[1]) < 2:
        raise ValueError("Revision mounts the pre-alias allowlist")
    evidence = {"candidate_sha": sha, "project": PROJECT, "region": "us-central1",
                "revision": revision["metadata"]["name"], "revision_created_at": created,
                "alias_revision_fresh": True, "secret_references": refs,
                "observed_at": datetime.now(timezone.utc).isoformat()}
    path = Path(".artifacts/live-mail-acceptance/evidence-provider.json")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(evidence, indent=2) + "\n")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        raise SystemExit("Provider metadata verification failed; details withheld")
