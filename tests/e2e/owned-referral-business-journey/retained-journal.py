"""Read only the immutable official journal for the one unknown original ACK."""
from __future__ import annotations

import hashlib
import io
import json
import os
from pathlib import Path
import stat
import subprocess
import zipfile

REPOSITORY = "ajoe734/drts-fleet-platform"
RUN = 39445009990
ARTIFACT = 12276885694
SOURCE = "109f0f8ee19f2811897843a0420f4f92f2a03882"
BRANCH = "qa/referral109-full-owned-20261020T150406Z"
ZIP_SHA = "ba904639797df696f7e66603920bdc43d86efdb7fd45b0ed0c71131c4bbf5ad9"
JOURNAL_SHA = "63675a8d12e61d1eccdea6ff2410077d6ede02d84ed8efd9fc7340ca41652b4f"
MEMBERS = {"runtime-before.json", "runtime-after.json", "journey-evidence.json", "booking-write-journal.json"}
OUTPUT = Path(".artifacts/owned-referral-business-journey/retained-original-journal.json")


class JournalError(Exception):
    pass


def require(value, code):
    if not value:
        raise JournalError(code)


def read_official_journal(metadata: dict, archive: bytes) -> bytes:
    run = metadata.get("workflow_run", {})
    require(metadata.get("id") == ARTIFACT and metadata.get("expired") is False
            and metadata.get("name") == f"owned-referral-business-{SOURCE}-{RUN}"
            and metadata.get("size_in_bytes") == 3924
            and metadata.get("digest") == f"sha256:{ZIP_SHA}"
            and run.get("id") == RUN and run.get("head_sha") == SOURCE
            and run.get("head_branch") == BRANCH,
            "original-artifact-metadata-mismatch")
    require(len(archive) == 3924 and hashlib.sha256(archive).hexdigest() == ZIP_SHA,
            "original-official-archive-digest-mismatch")
    with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
        entries = zipped.infolist()
        require(len(entries) == 4 and {i.filename for i in entries} == MEMBERS,
                "original-four-members-required")
        require(all(i.file_size <= 16384 and not i.is_dir()
                    and stat.S_IFMT(i.external_attr >> 16) in (0, stat.S_IFREG)
                    for i in entries) and sum(i.file_size for i in entries) <= 32768,
                "original-archive-bounds-required")
        require(zipped.testzip() is None, "original-archive-CRC-mismatch")
        journal = zipped.read("booking-write-journal.json")
    require(hashlib.sha256(journal).hexdigest() == JOURNAL_SHA,
            "original-journal-digest-mismatch")
    return journal


def gh_read(path: str) -> bytes:
    result = subprocess.run(["gh", "api", path], capture_output=True, timeout=60, check=False)
    # Provider stderr and bodies can contain authority or URLs. Never echo them.
    require(result.returncode == 0, "original-artifact-read-unavailable")
    require(len(result.stdout) <= 32768, "original-artifact-read-bounds")
    return result.stdout


def main():
    require(os.environ.get("GITHUB_ACTIONS") == "true"
            and os.environ.get("OWNED_REFERRAL_HOSTED_OPT_IN") == "true"
            and os.environ.get("OWNED_REFERRAL_RECOVERY_ONLY") == "true"
            and os.environ.get("GITHUB_REPOSITORY") == REPOSITORY
            and os.environ.get("EXPECTED_RUNTIME_SHA") == SOURCE,
            "original-hosted-recovery-only-required")
    metadata = json.loads(gh_read(f"repos/{REPOSITORY}/actions/artifacts/{ARTIFACT}"))
    journal = read_official_journal(metadata,
        gh_read(f"repos/{REPOSITORY}/actions/artifacts/{ARTIFACT}/zip"))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor = os.open(OUTPUT, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "wb") as target:
        target.write(journal)
        target.flush()
        os.fsync(target.fileno())
    print(json.dumps({"originalJournalVerified": True, "run": RUN,
                      "bytes": len(journal), "sha256": JOURNAL_SHA}))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        code = str(error) if isinstance(error, JournalError) else "original-journal-read-failed"
        print(json.dumps({"originalJournalVerified": False, "code": code}))
        raise SystemExit(1)
