"""Run the same server-free regressions against immutable source archives.

Never resets the active worktree or starts PG/HTTP/browser services. Only the
current regression files and complete quote fixture are overlaid on old source.
"""

import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile


ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = ROOT / ".local/pax-shared-order-flow-20261015/historical"
CASES = [
    ("353a6453255e0e35647d243c90eae57e7740b6b0", ["named-events.test.ts", "persisted-authority.test.ts"]),
    ("8fed5b8e6f97a221cca4a1810c82a7001bd102e2", ["original-quote.test.ts", "rating-eligibility.test.ts"]),
    ("7e006a1b267c81c8f90447108153a159b441ebeb", ["original-quote.test.ts", "rating-eligibility.test.ts"]),
]
MEMBERS = [
    "apps/api/src", "apps/api/package.json", "apps/passenger-app-web/lib",
    "apps/passenger-app-web/package.json", "packages", "package.json",
    "tsconfig.json", "tsconfig.base.json", "vitest.config.ts",
    "tests/unit/pax-booking-history-20261009/production-booking-fixture.ts",
    "tests/unit/pax-fare-quote-20261009/fixture.ts",
]


def main():
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    report = []
    for reference, files in CASES:
        sha = subprocess.check_output(["git", "rev-parse", reference], cwd=ROOT, text=True).strip()
        target = EVIDENCE / sha
        target.mkdir(exist_ok=True)
        archive = EVIDENCE / f"{sha}.tar"
        with archive.open("wb") as output:
            subprocess.run(["git", "archive", sha, *MEMBERS], cwd=ROOT, stdout=output, check=True)
        with tarfile.open(archive) as source:
            source.extractall(target, filter="data")
        for parent in [Path("."), *[p.relative_to(ROOT) for p in (ROOT / "apps").iterdir() if p.is_dir()], *[p.relative_to(ROOT) for p in (ROOT / "packages").iterdir() if p.is_dir()]]:
            dependency = ROOT / parent / "node_modules"
            destination = target / parent / "node_modules"
            if dependency.exists() and destination.parent.exists() and not destination.exists():
                destination.symlink_to(dependency, target_is_directory=True)
        regressions = Path("tests/unit/pax-shared-order-flow-20261015")
        for member in [regressions / file for file in files] + [Path("tests/unit/pax-booking-history-20261009/production-booking-fixture.ts")]:
            (target / member).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / member, target / member)
        command = ["pnpm", "exec", "vitest", "run", "--root", str(target), "--config", str(target / "vitest.config.ts"), *[str(regressions / file) for file in files], "--reporter=verbose"]
        result = subprocess.run(command, cwd=ROOT, env={**os.environ, "GITHUB_ACTIONS": "false"}, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=90)
        log = EVIDENCE / f"{sha}.log"
        log.write_text(result.stdout)
        if result.returncode != 1 or "AssertionError" not in result.stdout or "Failed Suites" in result.stdout:
            raise RuntimeError(f"Historical regression did not fail at product assertions: {log}")
        report.append({"source_sha": sha, "command": command, "exit_code": result.returncode, "log": str(log), "product_assertion_failure": True})
    (EVIDENCE / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
