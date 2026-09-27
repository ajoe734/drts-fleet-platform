"""Bind a fresh hosted check report to the checked-out candidate SHA.

Removes stale output before execution and preserves command failures. This
attests provenance, not coverage or acceptance; PY_GATE checks those separately.
"""
import json
import os
from pathlib import Path
import re
import subprocess
import sys


def main():
    report_path = Path(sys.argv[1])
    command = sys.argv[2:]
    expected = os.environ["CANDIDATE_SHA"]
    resolved = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    if not command or not re.fullmatch(r"[0-9a-f]{40}", expected) or resolved != expected:
        raise SystemExit("Report runner requires a command and the exact candidate checkout")
    report_path.unlink(missing_ok=True)
    result = subprocess.run(command, check=False)
    if report_path.exists():
        report = json.loads(report_path.read_text())
        identities = [report.get("candidate_sha")]
        for metadata in (report.get("metadata", {}), report.get("config", {}).get("metadata", {})):
            identities.extend([metadata.get("candidate_sha"), metadata.get("candidateSha")])
        if any(value is not None and value != resolved for value in identities):
            raise SystemExit("Report contains a conflicting candidate identity")
        report["candidate_sha"] = resolved
        report["execution"] = {
            "candidate_sha": resolved,
            "workflow_sha": os.environ["WORKFLOW_SHA"],
            "exit_code": result.returncode,
        }
        report_path.write_text(json.dumps(report, indent=2) + "\n")
    raise SystemExit(result.returncode if report_path.exists() else result.returncode or 1)


if __name__ == "__main__":
    main()
