from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from control_plane.infra.queue_repo import QueueRepository


class QueueRepositoryTests(unittest.TestCase):
    def test_enqueue_is_append_only_and_deduplicates_event_identity(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            repository = QueueRepository(Path(temp) / "events.jsonl")
            event = {"event_id": "evt-1", "task_id": "TASK-1"}

            first = repository.enqueue(event)
            duplicate = repository.enqueue(dict(event))

            self.assertTrue(first)
            self.assertFalse(duplicate)
            self.assertEqual(repository.load(), [event])

    def test_update_holds_one_transaction_for_load_and_replace(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            repository = QueueRepository(Path(temp) / "events.jsonl")
            repository.enqueue({"event_id": "keep"})
            repository.enqueue({"event_id": "drop"})

            changed = repository.update(
                lambda events: (
                    [event for event in events if event["event_id"] != "drop"],
                    True,
                )
            )

            self.assertTrue(changed)
            self.assertEqual(repository.load(), [{"event_id": "keep"}])


if __name__ == "__main__":
    unittest.main()
