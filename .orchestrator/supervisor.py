#!/usr/bin/env python3
"""Stable CLI/import facade for the rewritten supervisor control plane."""

from __future__ import annotations

import sys
from pathlib import Path


ORCHESTRATOR_DIR = Path(__file__).resolve().parent
if str(ORCHESTRATOR_DIR) not in sys.path:
    sys.path.insert(0, str(ORCHESTRATOR_DIR))

from control_plane.runtime import supervisor_runtime as _runtime


if __name__ == "__main__":
    raise SystemExit(_runtime.main())

# Existing adapters and characterization tests import ``supervisor`` and patch
# attributes on that module. Alias the module object instead of copying symbols,
# so those patches still affect the runtime's real globals during migration.
sys.modules[__name__] = _runtime
