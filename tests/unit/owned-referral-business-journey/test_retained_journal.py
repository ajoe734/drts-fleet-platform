"""Socket-free official artifact provenance and corruption tests."""
import copy
import hashlib
import importlib.util
import io
from pathlib import Path
import unittest
from unittest.mock import patch
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


if __name__ == "__main__":
    unittest.main()
