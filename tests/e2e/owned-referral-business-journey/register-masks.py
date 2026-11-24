#!/usr/bin/env python3
"""Pass Playwright output through and make its add-mask commands register.

GitHub Actions only honours a workflow command at the very start of a log
line. Playwright's line reporter writes cursor escapes before forwarding a
test's stdout, so `::add-mask::<secret>` arrived as `ESC[1A ESC[2K::add-mask::`
and the secret was printed instead of masked. Strip that prefix, for add-mask
only: no other workflow command in test output becomes active.
"""

from __future__ import annotations

import re
import sys
from typing import BinaryIO

PREFIXED_MASK = re.compile(rb"^(?:\x1b\[[0-?]*[ -/]*[@-~]|\r)+(?=::add-mask::)")


def normalize(line: bytes) -> bytes:
    return PREFIXED_MASK.sub(b"", line)


def run(source: BinaryIO, sink: BinaryIO) -> None:
    for line in iter(source.readline, b""):
        sink.write(normalize(line))
        sink.flush()


if __name__ == "__main__":
    run(sys.stdin.buffer, sys.stdout.buffer)
