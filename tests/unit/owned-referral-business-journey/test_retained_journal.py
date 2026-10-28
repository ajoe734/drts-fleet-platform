"""Socket-free official artifact provenance and corruption tests."""
import contextlib
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import warnings
import zipfile

SOURCE = Path(__file__).resolve().parents[2] / "e2e/owned-referral-business-journey/retained-journal.py"
spec = importlib.util.spec_from_file_location("retained_journal", SOURCE)
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)


def fixture(duplicate=False):
    journal = b'{"syntheticData":true,"body":"original synthetic command"}\n'
    raw = io.BytesIO()
    with zipfile.ZipFile(raw, "w", zipfile.ZIP_DEFLATED) as archive:
        for name in sorted(reader.MEMBERS):
            archive.writestr(name, journal if name == "booking-write-journal.json" else b'{}')
        if duplicate:
            archive.writestr("unexpected.json", b'{}')
        archive.comment = b'x' * (3924 - len(raw.getvalue()) - (22 + 46 * (5 if duplicate else 4) + sum(len(i.filename) for i in archive.infolist())))
    data = raw.getvalue()
    # Set an exact sized archive using ZIP's ordinary comment field.
    if len(data) != 3924:
        with zipfile.ZipFile(raw, "a") as archive:
            archive.comment = b'x' * (len(archive.comment) + 3924 - len(data))
        data = raw.getvalue()
    metadata = {"id": reader.ARTIFACT, "expired": False,
        "name": f"owned-referral-business-{reader.SOURCE}-{reader.RUN}",
        "size_in_bytes": 3924, "digest": "sha256:" + hashlib.sha256(data).hexdigest(),
        "workflow_run": {"id": reader.RUN, "head_sha": reader.SOURCE, "head_branch": reader.BRANCH}}
    return journal, data, metadata


class OriginalJournalArtifactTests(unittest.TestCase):
    def read(self, metadata, archive, journal):
        with patch.object(reader, "ZIP_SHA", metadata["digest"].split(":")[1]), patch.object(reader, "JOURNAL_SHA", hashlib.sha256(journal).hexdigest()):
            return reader.read_official_journal(metadata, archive)

    def test_original_journal_bytes_only(self):
        journal, archive, metadata = fixture()
        self.assertEqual(len(archive), 3924)
        self.assertEqual(self.read(metadata, archive, journal), journal)

    def test_foreign_run_or_source_and_expired_rejected(self):
        journal, archive, metadata = fixture()
        for field, value in [("id", 999), ("head_sha", "c" * 40), ("head_branch", "other")]:
            changed = copy.deepcopy(metadata)
            changed["workflow_run"][field] = value
            with self.assertRaises(reader.JournalError):
                self.read(changed, archive, journal)
        metadata["expired"] = True
        with self.assertRaises(reader.JournalError):
            self.read(metadata, archive, journal)

    def test_tampered_archive_rejected_before_extract(self):
        journal, archive, metadata = fixture()
        changed = archive[:100] + bytes([archive[100] ^ 1]) + archive[101:]
        with self.assertRaisesRegex(reader.JournalError, "digest-mismatch"):
            self.read(metadata, changed, journal)

    def test_unexpected_member_rejected(self):
        journal, archive, metadata = fixture(duplicate=True)
        with self.assertRaisesRegex(reader.JournalError, "four-members"):
            self.read(metadata, archive, journal)

    def test_journal_digest_is_independently_required(self):
        journal, archive, metadata = fixture()
        with self.assertRaisesRegex(reader.JournalError, "journal-digest"):
            self.read(metadata, archive, journal + b"changed")

def sha(value):
    return hashlib.sha256(value.encode("utf-8") if isinstance(value, str) else value).hexdigest()


FULL_PAD = "cancellations/unassigned-before.png"
FULL_OTHER = [
    "runtime-before.json", "runtime-after.json", "own-receipt.txt",
    "cancellations/results.json", "cancellations/unassigned-facts.json",
    "cancellations/run-finalization-facts.json",
    "cancellations/assigned-not-arrived-low-rating-facts.json",
    "cancellations/arrived-not-started-low-rating-facts.json",
    "cancellations/on-trip-low-rating-facts.json",
    "cancellations/unassigned-after.png",
    "cancellations/assigned-not-arrived-before.png", "cancellations/assigned-not-arrived-after.png",
    "cancellations/arrived-not-started-before.png", "cancellations/arrived-not-started-after.png",
    "cancellations/on-trip-before.png", "cancellations/on-trip-after.png",
    "daily-reports/daily-dispatch-2026-10-28.csv", "daily-reports/daily-dispatch-2026-10-28.xlsx",
    "daily-reports/daily-dispatch-2026-10-28.pdf",
    "TEN03-06/C1-cancelled-null/daily-reports/daily-dispatch-2026-10-28.csv",
    "TEN03-06/C1-cancelled-null/daily-reports/daily-dispatch-2026-10-28.xlsx",
    "TEN03-06/C1-cancelled-null/daily-reports/daily-dispatch-2026-10-28.pdf",
    "TEN03-06/reservation-1/daily-reports/daily-dispatch-2026-10-30.csv",
]


def full_journal(item, mutate=None):
    key = f"{item['nonce']}-booking"
    command = {"entrySlug": reader.FULL_ENTRY, "quoteId": item["quoteId"],
               "pickupAddress": "synthetic pickup", "dropoffAddress": "synthetic dropoff",
               "passengerName": "synthetic passenger", "passengerPhone": "0900000000",
               "partnerUserRef": reader.FULL_SUBJECT, "idempotencyKey": key}
    if item["scheduled"]:
        command["scheduledAt"] = "2026-10-30T15:55:00.000Z"
    body = json.dumps(command, separators=(",", ":"))
    journal = {"version": 1, "state": "acknowledged", "definitionSha": reader.FULL_DEFINITION,
               "runtimeSha": reader.FULL_RUNTIME, "nonce": item["nonce"],
               "entrySlug": reader.FULL_ENTRY, "partnerUserRef": reader.FULL_SUBJECT,
               "quoteId": item["quoteId"], "body": body, "bodySha256": sha(body),
               "idempotencyKey": key, "orderId": item["orderId"], "syntheticData": True,
               "recovery": "Possible own write."}
    expected = {**item, "bodySha256": sha(body), "keySha256": sha(key)}
    if mutate:
        mutate(journal)
    raw = f"{json.dumps(journal, indent=2)}\n".encode("utf-8")
    expected.update(bytes=len(raw), sha256=sha(raw))
    return raw, expected


def task_facts(stage, order_id, driver=None):
    task = {"orderId": order_id, "taskId": f"task-{stage}",
            "driverId": driver or reader.FULL_FIRST_DRIVER, "vehicleId": reader.FULL_FIRST_VEHICLE}
    return json.dumps({"definitionSha": reader.FULL_DEFINITION, "runtimeSha": reader.FULL_RUNTIME,
                       "stage": stage, "result": {"stage": stage, "orderId": order_id,
                                                  "taskId": f"task-{stage}"},
                       "before": {"order": {"orderId": order_id}, "task": task},
                       "after": {"order": {"orderId": order_id}, "task": task}}).encode("utf-8")


def full_fixture(mutations=None, rename=None, facts_driver=None, directory=None, drop=()):
    """34 members at the official byte size; journals carry synthetic bodies/keys."""
    mutations = mutations or {}
    rename = rename or {}
    journals, members = {}, []
    for member, item in reader.FULL_JOURNALS.items():
        raw, expected = full_journal(item, mutations.get(member))
        journals[member] = expected
        members.append((member, raw))
    orders = {item["slot"]: item["orderId"] for item in reader.FULL_JOURNALS.values()}
    for member, stage in reader.FULL_TASK_FACTS.items():
        members.append((member, task_facts(stage, orders[stage], facts_driver)))
    members += [(name, b'{"synthetic":true}') for name in FULL_OTHER]

    def build(pad):
        raw = io.BytesIO()
        with zipfile.ZipFile(raw, "w", zipfile.ZIP_DEFLATED) as archive:
            for name, data in members:
                if name in drop:
                    continue
                archive.writestr(rename.get(name, name), data)
            archive.writestr(rename.get(FULL_PAD, FULL_PAD),
                             b"PADMARK" + bytes(i % 251 for i in range(pad)),
                             compress_type=zipfile.ZIP_STORED)
            if directory:
                archive.writestr(zipfile.ZipInfo(directory), b"")
        return raw.getvalue()

    data = build(0)
    data = build(reader.FULL_ZIP_BYTES - len(data))
    assert len(data) == reader.FULL_ZIP_BYTES
    metadata = {"id": reader.FULL_ARTIFACT, "expired": False, "name": reader.FULL_NAME,
                "size_in_bytes": reader.FULL_ZIP_BYTES, "digest": "sha256:" + sha(data),
                "workflow_run": {"id": reader.FULL_RUN, "head_sha": reader.FULL_DEFINITION,
                                 "head_branch": reader.FULL_BRANCH}}
    return data, metadata, journals


@contextlib.contextmanager
def full_profile(archive, journals):
    with patch.object(reader, "FULL_ZIP_SHA", sha(archive)), \
            patch.object(reader, "FULL_JOURNALS", journals):
        yield


class FullExactSevenAckArtifactTests(unittest.TestCase):
    def read(self, archive, metadata, journals):
        with full_profile(archive, journals):
            return reader.read_full406892_manifest(metadata, archive)

    def test_fixed_profile_constants_match_root_official_manifest(self):
        manifest = reader.full406892_manifest()
        self.assertEqual((manifest["run"], manifest["artifact"], manifest["bytes"],
                          manifest["members"], manifest["digest"]),
                         (40689200536, 12816544475, 1927299, 34,
                          "sha256:3821a749170b574721f6b29bcbaaf4ffa13fc7aee1eeb4577e7977cd1f0362f8"))
        self.assertEqual([j["slot"] for j in manifest["journals"]],
                         ["main", "unassigned", "assigned-not-arrived", "arrived-not-started",
                          "on-trip", "reservation-1", "reservation-2"])
        self.assertEqual(len({j["orderId"] for j in manifest["journals"]}), 7)
        self.assertEqual(manifest["firstSupply"]["deviceId"],
                         "owned-referral-40689200536-a1f1be78-03c1-455e-ab89-ff1a4b577447-device")
        # The original single-unknown profile stays separately fixed.
        self.assertEqual((reader.RUN, reader.ARTIFACT, reader.SOURCE[:4]),
                         (39445009990, 12276885694, "109f"))

    def test_exact_official_archive_yields_only_fixed_typed_manifest(self):
        archive, metadata, journals = full_fixture()
        with full_profile(archive, journals):
            manifest = reader.read_full406892_manifest(metadata, archive)
            self.assertEqual(manifest, reader.full406892_manifest())
        rendered = json.dumps(manifest)
        for secret in ("synthetic pickup", "0900000000", "-booking\"", "PADMARK"):
            self.assertNotIn(secret, rendered)
        self.assertTrue(all("body" not in j and "idempotencyKey" not in j
                            for j in manifest["journals"]))

    def test_foreign_or_expired_metadata_rejected(self):
        archive, metadata, journals = full_fixture()
        for path, value in [("id", 999), ("expired", True), ("name", "other"),
                            ("size_in_bytes", 1927298), ("digest", "sha256:" + "0" * 64),
                            ("workflow_run.id", 39445009990),
                            ("workflow_run.head_sha", reader.FULL_RUNTIME),
                            ("workflow_run.head_branch", "dev")]:
            changed = copy.deepcopy(metadata)
            target, _, field = path.rpartition(".")
            (changed[target] if target else changed)[field] = value
            with self.subTest(path=path), self.assertRaisesRegex(
                    reader.JournalError, "metadata-mismatch"):
                self.read(archive, changed, journals)

    def test_tampered_or_oversize_archive_rejected_before_extract(self):
        archive, metadata, journals = full_fixture()
        with full_profile(archive, journals):
            for changed in (archive[:-1] + bytes([archive[-1] ^ 1]), archive + b"x"):
                with self.assertRaisesRegex(reader.JournalError, "archive-digest-mismatch"):
                    reader.read_full406892_manifest(metadata, changed)

    def test_crc_corruption_rejected(self):
        archive, metadata, journals = full_fixture()
        index = archive.index(b"PADMARK") + 100
        corrupt = archive[:index] + bytes([archive[index] ^ 1]) + archive[index + 1:]
        metadata["digest"] = "sha256:" + sha(corrupt)
        with self.assertRaisesRegex(reader.JournalError, "CRC-mismatch"):
            self.read(corrupt, metadata, journals)

    def test_extra_missing_traversal_duplicate_and_unlisted_members_rejected(self):
        cases = {
            "extra redispatch journal": ({"runtime-after.json":
                                          "TEN03-06/redispatched/booking-write-journal.json"},
                                         "exact-seven-journals"),
            "missing journal": ({"TEN03-06/reservation-2/booking-write-journal.json":
                                 "TEN03-06/reservation-2/cancellation.json"},
                                "not-allowlisted"),
            "absent allowlisted journal": ({"TEN03-06/reservation-2/booking-write-journal.json":
                                            "cancellations/reservation-2-facts.json"},
                                           "exact-seven-journals"),
            "traversal": ({"runtime-after.json": "../runtime-after.json"}, "not-allowlisted"),
            "absolute": ({"runtime-after.json": "/tmp/runtime-after.json"}, "not-allowlisted"),
            "dot segment": ({"runtime-after.json": "cancellations/../x-facts.json"},
                            "not-allowlisted"),
            "backslash": ({"runtime-after.json": "cancellations\\x-facts.json"},
                          "not-allowlisted"),
            "unlisted": ({"runtime-after.json": "retained-original-journal.json"},
                         "not-allowlisted"),
            "duplicate": ({"runtime-after.json": "runtime-before.json"}, "exact-members"),
        }
        for label, (rename, code) in cases.items():
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", UserWarning)
                archive, metadata, journals = full_fixture(rename=rename)
            with self.subTest(label), self.assertRaisesRegex(reader.JournalError, code):
                self.read(archive, metadata, journals)

    def test_directory_entry_and_member_bounds_rejected(self):
        archive, metadata, journals = full_fixture(drop={"runtime-after.json"},
                                                   directory="cancellations/")
        with self.assertRaisesRegex(reader.JournalError, "not-allowlisted|archive-bounds"):
            self.read(archive, metadata, journals)
        archive, metadata, journals = full_fixture()
        with patch.object(reader, "FULL_MEMBER_MAX_BYTES", 1024 * 1024), \
                self.assertRaisesRegex(reader.JournalError, "archive-bounds"):
            self.read(archive, metadata, journals)
        with patch.object(reader, "FULL_TOTAL_MAX_BYTES", 1024 * 1024), \
                self.assertRaisesRegex(reader.JournalError, "archive-bounds"):
            self.read(archive, metadata, journals)

    def test_each_journal_member_hash_is_independently_required(self):
        archive, metadata, journals = full_fixture()
        for member in reader.FULL_JOURNALS:
            changed = copy.deepcopy(journals)
            changed[member]["sha256"] = "0" * 64
            with self.subTest(member), self.assertRaisesRegex(
                    reader.JournalError, "journal-member-digest-mismatch"):
                self.read(archive, metadata, changed)

    def test_journal_binding_body_key_and_state_controls(self):
        main = "booking-write-journal.json"
        reservation = "TEN03-06/reservation-1/booking-write-journal.json"
        cases = [
            (main, lambda j: j.update(state="ack_unknown"), "journal-binding"),
            (main, lambda j: j.update(orderId="foreign-order"), "journal-binding"),
            (main, lambda j: j.update(quoteId="foreign-quote"), "journal-binding"),
            (main, lambda j: j.update(nonce=f"{reader.FULL_NONCE}-other"), "journal-binding"),
            (main, lambda j: j.update(runtimeSha=reader.SOURCE), "journal-binding"),
            (main, lambda j: j.update(syntheticData=False), "journal-binding"),
            (main, lambda j: j.update(body=j["body"].replace("synthetic pickup", "changed")),
             "exact-body-and-key"),
            (main, lambda j: j.update(idempotencyKey="replacement-key"), "exact-body-and-key"),
            (main, lambda j: j.update(cookie="session"), "journal-shape"),
            (main, lambda j: j.pop("recovery"), "journal-shape"),
        ]
        for member, mutate, code in cases:
            archive, metadata, journals = full_fixture({member: mutate})
            with self.subTest(code=code), self.assertRaisesRegex(reader.JournalError, code):
                self.read(archive, metadata, journals)

        def unscheduled(journal):
            command = json.loads(journal["body"])
            command.pop("scheduledAt")
            journal["body"] = json.dumps(command, separators=(",", ":"))
            journal["bodySha256"] = sha(journal["body"])

        archive, metadata, journals = full_fixture({reservation: unscheduled})
        with self.assertRaisesRegex(reader.JournalError, "journal-binding"):
            self.read(archive, metadata, journals)

    def test_first_supply_task_facts_bind_exact_driver_vehicle(self):
        archive, metadata, journals = full_fixture(facts_driver="drv_foreign")
        with self.assertRaisesRegex(reader.JournalError, "task-facts-own-supply"):
            self.read(archive, metadata, journals)


class FullExactSevenAckMainTests(unittest.TestCase):
    def environment(self, runtime):
        return {"GITHUB_ACTIONS": "true", "OWNED_REFERRAL_HOSTED_OPT_IN": "true",
                "OWNED_REFERRAL_RECOVERY_ONLY": "true", "GITHUB_REPOSITORY": reader.REPOSITORY,
                "EXPECTED_RUNTIME_SHA": runtime}

    def run_main(self, runtime, responses, output):
        calls = []

        def gh_read(path, limit=32768):
            calls.append((path, limit))
            return responses[path]

        with patch.dict(os.environ, self.environment(runtime), clear=True), \
                patch.object(reader, "gh_read", gh_read), \
                patch.object(reader, "FULL_OUTPUT", output), \
                patch.object(reader, "OUTPUT", output), \
                contextlib.redirect_stdout(io.StringIO()):
            reader.main()
        return calls

    def test_runtime_1a3_selects_only_the_fixed_full_artifact(self):
        archive, metadata, journals = full_fixture()
        base = f"repos/{reader.REPOSITORY}/actions/artifacts/{reader.FULL_ARTIFACT}"
        with tempfile.TemporaryDirectory() as folder, full_profile(archive, journals):
            output = Path(folder) / "cancellations/exact-seven-ack-source-facts.json"
            calls = self.run_main(reader.FULL_RUNTIME, {
                base: json.dumps(metadata).encode(), f"{base}/zip": archive}, output)
            self.assertEqual(calls, [(base, 65536), (f"{base}/zip", reader.FULL_ZIP_BYTES)])
            written = output.read_text("utf-8")
            self.assertEqual(json.loads(written), reader.full406892_manifest())
            self.assertEqual(output.stat().st_mode & 0o777, 0o600)
            self.assertNotIn("synthetic pickup", written)

    def test_metadata_failure_fetches_no_archive_and_writes_nothing(self):
        archive, metadata, journals = full_fixture()
        metadata["expired"] = True
        base = f"repos/{reader.REPOSITORY}/actions/artifacts/{reader.FULL_ARTIFACT}"
        with tempfile.TemporaryDirectory() as folder, full_profile(archive, journals):
            output = Path(folder) / "facts.json"
            with self.assertRaisesRegex(reader.JournalError, "metadata-mismatch"):
                self.run_main(reader.FULL_RUNTIME, {base: json.dumps(metadata).encode()}, output)
            self.assertFalse(output.exists())

    def test_unknown_runtime_reads_nothing(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "facts.json"
            with self.assertRaisesRegex(reader.JournalError, "hosted-recovery-only-required"):
                self.run_main("c" * 40, {}, output)
            self.assertFalse(output.exists())

    def test_runtime_109f_keeps_the_original_single_journal_path(self):
        journal, archive, metadata = fixture()
        base = f"repos/{reader.REPOSITORY}/actions/artifacts/{reader.ARTIFACT}"
        with tempfile.TemporaryDirectory() as folder, \
                patch.object(reader, "ZIP_SHA", metadata["digest"].split(":")[1]), \
                patch.object(reader, "JOURNAL_SHA", hashlib.sha256(journal).hexdigest()):
            output = Path(folder) / "retained-original-journal.json"
            calls = self.run_main(reader.SOURCE, {
                base: json.dumps(metadata).encode(), f"{base}/zip": archive}, output)
            self.assertEqual(calls, [(base, 32768), (f"{base}/zip", 32768)])
            self.assertEqual(output.read_bytes(), journal)

    def test_offline_operator_check_writes_nothing(self):
        archive, _, journals = full_fixture()
        with tempfile.TemporaryDirectory() as folder, full_profile(archive, journals):
            path = Path(folder) / "official.zip"
            path.write_bytes(archive)
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                reader.offline_archive_check(str(path))
            self.assertEqual(json.loads(stdout.getvalue())["full406892ArchiveVerified"], True)
            self.assertEqual(sorted(p.name for p in Path(folder).iterdir()), ["official.zip"])


if __name__ == "__main__":
    unittest.main()
