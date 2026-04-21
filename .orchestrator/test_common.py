import json
import tempfile
import unittest
from pathlib import Path

from common import load_json


class LoadJsonTest(unittest.TestCase):
    def test_load_json_recovers_first_payload_when_duplicate_json_is_appended(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "status.json"
            first = {"tasks": [{"id": "A-1", "status": "backlog"}]}
            second = {"tasks": [{"id": "B-1", "status": "done"}]}
            path.write_text(
                json.dumps(first, ensure_ascii=False) + "\n" + json.dumps(second, ensure_ascii=False),
                encoding="utf-8",
            )

            loaded = load_json(path, default={})

        self.assertEqual(loaded, first)


if __name__ == "__main__":
    unittest.main()
