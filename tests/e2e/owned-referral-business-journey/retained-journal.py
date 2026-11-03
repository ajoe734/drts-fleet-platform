"""Read only an immutable official artifact of one explicitly fixed recovery run.

Two fixed profiles, selected only by the existing EXPECTED_RUNTIME_SHA:
- runtime 109f: the one unknown original ACK of run 39445009990 (unchanged);
- runtime 1a3f: the seven acknowledged synthetic orders of FULL 40689200536.
Neither accepts a run, artifact, member or order selector from the caller.
"""
from __future__ import annotations

import hashlib
import io
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
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

# FULL 40689200536 (definition cb0e, runtime 1a3f): job 122819370750 failed
# after seven acknowledged own bookings; its final custody was never written.
FULL_PROFILE = "full406892-exact-seven-ack"
FULL_RUN = 40689200536
FULL_ARTIFACT = 12816544475
FULL_DEFINITION = "cb0e0cf004cf40a0bbdde797937527f59521e54c"
FULL_RUNTIME = "1a3fbf8bca9e607085eb0c2e670b46763331f1da"
FULL_BRANCH = "qa/referral-owned-lowrating-cb0-runtime-1a3-20261028T123548Z"
FULL_NAME = f"owned-referral-business-{FULL_RUNTIME}-{FULL_RUN}"
FULL_ZIP_SHA = "3821a749170b574721f6b29bcbaaf4ffa13fc7aee1eeb4577e7977cd1f0362f8"
FULL_ZIP_BYTES = 1927299
FULL_MEMBER_COUNT = 34
FULL_MEMBER_MAX_BYTES = 8 * 1024 * 1024
FULL_TOTAL_MAX_BYTES = 24 * 1024 * 1024
FULL_JSON_MAX_BYTES = 256 * 1024
FULL_NONCE = "owned-referral-40689200536-a1f1be78-03c1-455e-ab89-ff1a4b577447"
FULL_ENTRY = "yuhe-residence"
FULL_SUBJECT = "referral-demo-yuhe-residence"
# Fixed order of the seven acknowledged journals, as the original caller wrote them.
FULL_JOURNALS = {
    "booking-write-journal.json": {
        "slot": "main", "scheduled": False, "bytes": 1365,
        "sha256": "0591dbfe27f06c0e9f0838645e7d75c05e27d59ea013f83eae9b6bc5bea7d2b8",
        "orderId": "ffbf57f4-e3a3-482f-9fdf-69e69b758581",
        "quoteId": "34037bee-6ac7-43f9-9b28-a71e560caa88",
        "nonce": FULL_NONCE,
        "bodySha256": "6daa2285debe4837ccede32e66d9d256cf57313005c4d91522a078acc4948773",
        "keySha256": "0f978daebec7086c3cc2139665f2bcab6847d9b215d07edf1d96adec2dba5959"},
    "cancellations/unassigned-booking-write-journal.json": {
        "slot": "unassigned", "scheduled": False, "bytes": 1468,
        "sha256": "f4934d2229ef906ffc4eac97579196dd3546de6d149acb0ed97b7defda5d1e64",
        "orderId": "30a6d31b-c065-483c-8988-efe9d1d63954",
        "quoteId": "c91abb0f-ea87-4f03-967d-57af584a38bc",
        "nonce": f"{FULL_NONCE}-unassigned",
        "bodySha256": "bee9b4ce686debc41d34fa7713136dc9d58c0dd5363b213b58a8d16bc959af5f",
        "keySha256": "6fc42d136fd60deb5774a71ff7d0a98144880e74a0f335247ddc5ca2bfae7609"},
    "cancellations/assigned-not-arrived-booking-write-journal.json": {
        "slot": "assigned-not-arrived", "scheduled": False, "bytes": 1498,
        "sha256": "52211674d13be2c3794223b13aec44fdb42a834babbf874e5a61b1c581d85689",
        "orderId": "399db561-e7b0-4c2c-8550-12b431e5a8af",
        "quoteId": "95a57d8a-71db-4173-9927-4e40e74f05b6",
        "nonce": f"{FULL_NONCE}-assigned-not-arrived",
        "bodySha256": "a13b38e0ef791ef2aa9ba432a0bf4a3abb2928b0389ff29cef856817056cf200",
        "keySha256": "7d3201bc9bb4b7860b0edebfeb28a40808631b95b90dfb58f97acf7f6dc195e3"},
    "cancellations/arrived-not-started-booking-write-journal.json": {
        "slot": "arrived-not-started", "scheduled": False, "bytes": 1495,
        "sha256": "46765f8c1ba2f69d43f4fd5c36e1d11ad5a17198f501910dc04fea31f834a78c",
        "orderId": "fd9f1453-1d54-45a8-943b-ede32fa6eca4",
        "quoteId": "c26d1d0f-8b69-43e2-8235-350774b7ae36",
        "nonce": f"{FULL_NONCE}-arrived-not-started",
        "bodySha256": "d87841b1be1a5858e9a7419117d1a7d6a85cc88317c7d2b2a3583eb8656eebed",
        "keySha256": "f2a59169b875464a50145c84bd3a9ad4ad3c7f41f543cfa4fcbde924f707a4c5"},
    "cancellations/on-trip-booking-write-journal.json": {
        "slot": "on-trip", "scheduled": False, "bytes": 1459,
        "sha256": "ea56a3c1342209d8e5ec42738804753672f787330fd0a2be7a15015f486164de",
        "orderId": "351fafb4-a909-4fa0-baad-3815b1a28060",
        "quoteId": "0949e9e2-4baa-4295-8460-0439cd12cf84",
        "nonce": f"{FULL_NONCE}-on-trip",
        "bodySha256": "7f6d23be61d18f84d8ab323f5d1ae75667c545855e5b289739d04fa9c3455392",
        "keySha256": "7d209b52d9d8afe6abd3855e4e46d3c8a5d765e5d25bf1c54270a7a0a50ce8e3"},
    "TEN03-06/reservation-1/booking-write-journal.json": {
        "slot": "reservation-1", "scheduled": True, "bytes": 1424,
        "sha256": "c317c2acde40d058747450c5b3c2ec631ba7d8106dca78d34a203fb0ab81f45b",
        "orderId": "caf161fb-38cf-4d25-9e18-46d85f95a7ed",
        "quoteId": "f480ed48-35a6-4812-aede-232455b86b1b",
        "nonce": f"{FULL_NONCE}-reservation-1",
        "bodySha256": "60429a9a830a6dd11b96d1994306bd4ba2a047c36dc7aa858f22d5443e91e2da",
        "keySha256": "45896a5ac2e9435d5cd0408385e76a6f57074b032cd839b93ca0a36777c0b1f5"},
    "TEN03-06/reservation-2/booking-write-journal.json": {
        "slot": "reservation-2", "scheduled": True, "bytes": 1424,
        "sha256": "6d120c8373e0fba9de7eef2c3be2849d53e2e9acb98a396db898a6ce3f4c1b45",
        "orderId": "848de867-6e77-432e-acc9-5fc41580c259",
        "quoteId": "baadf7e9-5b25-4e54-bb7e-99ee87e8f654",
        "nonce": f"{FULL_NONCE}-reservation-2",
        "bodySha256": "101541c6628914ea10065b3b0e25980f5d96bb7fa8ccbb17b1d3e99674fbd3ad",
        "keySha256": "0260198793d89cf9f596b599faf059bbb6151584053a4cce0dbea35e7aca32c7"},
}
# Original C2-C4 task facts bind the first own Driver/vehicle pair.
FULL_FIRST_DRIVER = "drv_e2375f97-02fc-40cc-97b3-6ddd7b94c661"
FULL_FIRST_VEHICLE = "veh_aabf1431-6ec1-42a1-92fb-34c9bad437fd"
FULL_TASK_FACTS = {
    "cancellations/assigned-not-arrived-facts.json": "assigned-not-arrived",
    "cancellations/arrived-not-started-facts.json": "arrived-not-started",
    "cancellations/on-trip-facts.json": "on-trip",
}
# The original job's own upload allowlist, relative to its evidence directory.
_REPORT = r"daily-reports/daily-dispatch-[^/]*\.(?:csv|xlsx|pdf)"
FULL_ALLOWED_MEMBERS = tuple(re.compile(f"^(?:{pattern})$") for pattern in (
    r"runtime-before\.json", r"runtime-after\.json", r"journey-evidence\.json",
    r"booking-write-journal\.json", r"own-receipt\.txt",
    r"cancellations/[^/]*-facts\.json", r"cancellations/[^/]*-booking-write-journal\.json",
    r"cancellations/results\.json", r"cancellations/[^/]*\.png", _REPORT,
    r"TEN03-06-custody\.json",
    r"TEN03-06/(?:reservation-1|reservation-2|redispatched)/booking-write-journal\.json",
    rf"TEN03-06/(?:C1-cancelled-null|reservation-1|reservation-2|reservation-1-after-both|redispatched)/{_REPORT}",
))
FULL_SAFE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*(?:/[A-Za-z0-9][A-Za-z0-9._-]*)*$")
FULL_JOURNAL_KEYS = {"version", "state", "definitionSha", "runtimeSha", "nonce", "entrySlug",
                     "partnerUserRef", "quoteId", "body", "bodySha256", "idempotencyKey",
                     "orderId", "syntheticData", "recovery"}
# Minimal typed custody only; uploaded by the existing cancellations/*-facts.json glob.
FULL_OUTPUT = Path(".artifacts/owned-referral-business-journey/cancellations/exact-seven-ack-source-facts.json")


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


def full406892_manifest() -> dict:
    """The authoritative manifest is these fixed constants, never archive data."""
    return {
        "version": 1, "profile": FULL_PROFILE, "officialArtifactVerified": True,
        "repository": REPOSITORY, "run": FULL_RUN, "artifact": FULL_ARTIFACT,
        "definitionSha": FULL_DEFINITION, "runtimeSha": FULL_RUNTIME,
        "branch": FULL_BRANCH, "name": FULL_NAME, "digest": f"sha256:{FULL_ZIP_SHA}",
        "bytes": FULL_ZIP_BYTES, "members": FULL_MEMBER_COUNT,
        "nonce": FULL_NONCE, "entrySlug": FULL_ENTRY, "partnerUserRef": FULL_SUBJECT,
        "journals": [{"member": member, **{key: item[key] for key in (
            "slot", "scheduled", "bytes", "sha256", "orderId", "quoteId", "nonce",
            "bodySha256", "keySha256")}} for member, item in FULL_JOURNALS.items()],
        "firstSupply": {"driverId": FULL_FIRST_DRIVER, "vehicleId": FULL_FIRST_VEHICLE,
                        "deviceId": f"{FULL_NONCE}-device",
                        "taskFacts": list(FULL_TASK_FACTS)},
        "secondSupply": {"nonce": f"{FULL_NONCE}-second",
                         "deviceId": f"{FULL_NONCE}-second-device"},
    }


def _full_json(zipped: zipfile.ZipFile, info: zipfile.ZipInfo, code: str):
    require(info.file_size <= FULL_JSON_MAX_BYTES, f"{code}-bounds")
    raw = zipped.read(info)
    require(len(raw) == info.file_size, f"{code}-bounds")
    try:
        return raw, json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        raise JournalError(f"{code}-json-required") from None


def _verify_full_journal(raw: bytes, journal, expected: dict):
    require(len(raw) == expected["bytes"]
            and hashlib.sha256(raw).hexdigest() == expected["sha256"],
            "full406892-journal-member-digest-mismatch")
    require(isinstance(journal, dict) and set(journal) == FULL_JOURNAL_KEYS,
            "full406892-journal-shape-required")
    require(journal["version"] == 1 and journal["state"] == "acknowledged"
            and journal["syntheticData"] is True
            and journal["definitionSha"] == FULL_DEFINITION
            and journal["runtimeSha"] == FULL_RUNTIME
            and journal["nonce"] == expected["nonce"]
            and journal["entrySlug"] == FULL_ENTRY
            and journal["partnerUserRef"] == FULL_SUBJECT
            and journal["quoteId"] == expected["quoteId"]
            and journal["orderId"] == expected["orderId"]
            and journal["bodySha256"] == expected["bodySha256"],
            "full406892-journal-binding-required")
    body, key = journal["body"], journal["idempotencyKey"]
    require(isinstance(body, str) and isinstance(key, str)
            and len(body.encode("utf-8")) <= 16384
            and hashlib.sha256(body.encode("utf-8")).hexdigest() == expected["bodySha256"]
            and hashlib.sha256(key.encode("utf-8")).hexdigest() == expected["keySha256"],
            "full406892-journal-exact-body-and-key-required")
    try:
        command = json.loads(body)
    except ValueError:
        raise JournalError("full406892-journal-command-required") from None
    require(isinstance(command, dict) and command.get("entrySlug") == FULL_ENTRY
            and command.get("quoteId") == expected["quoteId"]
            and command.get("idempotencyKey") == key
            and command.get("partnerUserRef") in (None, FULL_SUBJECT)
            and ("scheduledAt" in command) is expected["scheduled"],
            "full406892-journal-command-binding-required")
    # The verified body and key stay in this function; nothing returns them.


def _verify_full_task_facts(facts, stage: str, order_id: str):
    require(isinstance(facts, dict) and facts.get("stage") == stage
            and facts.get("definitionSha") == FULL_DEFINITION
            and facts.get("runtimeSha") == FULL_RUNTIME,
            "full406892-task-facts-binding-required")
    result = facts.get("result")
    before = facts.get("before")
    task = before.get("task") if isinstance(before, dict) else None
    require(isinstance(result, dict) and result.get("stage") == stage
            and result.get("orderId") == order_id
            and isinstance(task, dict) and task.get("orderId") == order_id
            and task.get("taskId") == result.get("taskId")
            and task.get("driverId") == FULL_FIRST_DRIVER
            and task.get("vehicleId") == FULL_FIRST_VEHICLE,
            "full406892-task-facts-own-supply-required")
    after = facts.get("after")
    later = after.get("task") if isinstance(after, dict) else None
    require(later is None or (isinstance(later, dict)
                              and later.get("driverId") == FULL_FIRST_DRIVER
                              and later.get("vehicleId") == FULL_FIRST_VEHICLE),
            "full406892-task-facts-own-supply-required")


def verify_full406892_metadata(metadata: dict):
    run = metadata.get("workflow_run") if isinstance(metadata, dict) else None
    require(isinstance(run, dict) and metadata.get("id") == FULL_ARTIFACT
            and metadata.get("expired") is False
            and metadata.get("name") == FULL_NAME
            and metadata.get("size_in_bytes") == FULL_ZIP_BYTES
            and metadata.get("digest") == f"sha256:{FULL_ZIP_SHA}"
            and run.get("id") == FULL_RUN and run.get("head_sha") == FULL_DEFINITION
            and run.get("head_branch") == FULL_BRANCH,
            "full406892-artifact-metadata-mismatch")


def verify_full406892_archive(archive: bytes):
    require(len(archive) == FULL_ZIP_BYTES
            and hashlib.sha256(archive).hexdigest() == FULL_ZIP_SHA,
            "full406892-official-archive-digest-mismatch")
    try:
        zipped = zipfile.ZipFile(io.BytesIO(archive))
    except zipfile.BadZipFile:
        raise JournalError("full406892-archive-required") from None
    with zipped:
        entries = zipped.infolist()
        names = [i.filename for i in entries]
        require(len(entries) == FULL_MEMBER_COUNT and len(set(names)) == len(names),
                "full406892-exact-members-required")
        require(all(FULL_SAFE_NAME.match(name) and ".." not in name.split("/")
                    and any(pattern.match(name) for pattern in FULL_ALLOWED_MEMBERS)
                    for name in names),
                "full406892-member-path-not-allowlisted")
        require(all(not i.is_dir() and not i.flag_bits & 0x1
                    and i.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)
                    and stat.S_IFMT(i.external_attr >> 16) in (0, stat.S_IFREG)
                    and i.file_size <= FULL_MEMBER_MAX_BYTES for i in entries)
                and sum(i.file_size for i in entries) <= FULL_TOTAL_MAX_BYTES,
                "full406892-archive-bounds-required")
        journals = {name for name in names if name.endswith("booking-write-journal.json")}
        require(journals == set(FULL_JOURNALS), "full406892-exact-seven-journals-required")
        require(set(FULL_TASK_FACTS) <= set(names), "full406892-task-facts-required")
        try:
            require(zipped.testzip() is None, "full406892-archive-CRC-mismatch")
        except zipfile.BadZipFile:
            raise JournalError("full406892-archive-CRC-mismatch") from None
        by_name = {i.filename: i for i in entries}
        for member, expected in FULL_JOURNALS.items():
            raw, journal = _full_json(zipped, by_name[member], "full406892-journal")
            _verify_full_journal(raw, journal, expected)
        orders = {item["slot"]: item["orderId"] for item in FULL_JOURNALS.values()}
        for member, stage in FULL_TASK_FACTS.items():
            _, facts = _full_json(zipped, by_name[member], "full406892-task-facts")
            _verify_full_task_facts(facts, stage, orders[stage])


def read_full406892_manifest(metadata: dict, archive: bytes) -> dict:
    verify_full406892_metadata(metadata)
    verify_full406892_archive(archive)
    return full406892_manifest()


def gh_read(path: str, limit: int = 32768) -> bytes:
    result = subprocess.run(["gh", "api", path], capture_output=True, timeout=60, check=False)
    # Provider stderr and bodies can contain authority or URLs. Never echo them.
    require(result.returncode == 0, "original-artifact-read-unavailable")
    require(len(result.stdout) <= limit, "original-artifact-read-bounds")
    return result.stdout


def write_private(path: Path, value: bytes):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "wb") as target:
        target.write(value)
        target.flush()
        os.fsync(target.fileno())


def main():
    runtime = os.environ.get("EXPECTED_RUNTIME_SHA")
    require(os.environ.get("GITHUB_ACTIONS") == "true"
            and os.environ.get("OWNED_REFERRAL_HOSTED_OPT_IN") == "true"
            and os.environ.get("OWNED_REFERRAL_RECOVERY_ONLY") == "true"
            and os.environ.get("GITHUB_REPOSITORY") == REPOSITORY
            and runtime in (SOURCE, FULL_RUNTIME),
            "original-hosted-recovery-only-required")
    if runtime == FULL_RUNTIME:
        metadata = json.loads(gh_read(
            f"repos/{REPOSITORY}/actions/artifacts/{FULL_ARTIFACT}", 65536))
        verify_full406892_metadata(metadata)
        manifest = read_full406892_manifest(metadata, gh_read(
            f"repos/{REPOSITORY}/actions/artifacts/{FULL_ARTIFACT}/zip", FULL_ZIP_BYTES))
        write_private(FULL_OUTPUT, f"{json.dumps(manifest, indent=2)}\n".encode("utf-8"))
        print(json.dumps({"exactSevenAckManifestVerified": True, "run": FULL_RUN,
                          "artifact": FULL_ARTIFACT, "journals": len(FULL_JOURNALS)}))
        return
    metadata = json.loads(gh_read(f"repos/{REPOSITORY}/actions/artifacts/{ARTIFACT}"))
    journal = read_official_journal(metadata,
        gh_read(f"repos/{REPOSITORY}/actions/artifacts/{ARTIFACT}/zip"))
    write_private(OUTPUT, journal)
    print(json.dumps({"originalJournalVerified": True, "run": RUN,
                      "bytes": len(journal), "sha256": JOURNAL_SHA}))


def offline_archive_check(path: str):
    """Operator check of a local official ZIP copy; no network and no output file."""
    with open(path, "rb") as source:
        archive = source.read(FULL_ZIP_BYTES + 1)
    verify_full406892_archive(archive)
    print(json.dumps({"full406892ArchiveVerified": True, "metadataVerified": False,
                      "journals": len(FULL_JOURNALS)}))


if __name__ == "__main__":
    try:
        if len(sys.argv) == 3 and sys.argv[1] == "--offline-full406892-archive":
            offline_archive_check(sys.argv[2])
        else:
            require(len(sys.argv) == 1, "original-journal-arguments-refused")
            main()
    except Exception as error:
        code = str(error) if isinstance(error, JournalError) else "original-journal-read-failed"
        print(json.dumps({"originalJournalVerified": False, "code": code}))
        raise SystemExit(1)
