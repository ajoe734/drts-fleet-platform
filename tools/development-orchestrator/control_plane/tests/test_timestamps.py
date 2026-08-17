import unittest
from datetime import datetime, timezone

from control_plane.domain.timestamps import parse_utc_timestamp


class TimestampParsingTests(unittest.TestCase):
    """One parser, one behaviour."""

    def test_naive_input_is_coerced_to_utc(self):
        # The variant that returned this naive would TypeError on comparison.
        parsed = parse_utc_timestamp("2026-08-17T01:02:03")
        assert parsed is not None and parsed.tzinfo is not None
        assert parsed < datetime.now(timezone.utc) or parsed > datetime.now(timezone.utc)


    def test_zulu_and_offset_forms_agree(self):
        assert parse_utc_timestamp("2026-08-17T01:02:03Z") == parse_utc_timestamp("2026-08-17T01:02:03+00:00")


    def test_malformed_input_returns_none_rather_than_raising(self):
        # github_bus's variant raised here, which would take a bus sync down on a
        # corrupt state file instead of degrading.
        assert parse_utc_timestamp("not-a-timestamp") is None
        assert parse_utc_timestamp("") is None
        assert parse_utc_timestamp(None) is None


    def test_non_string_input_is_tolerated(self):
        assert parse_utc_timestamp(12345) is None


if __name__ == "__main__":
    unittest.main()
