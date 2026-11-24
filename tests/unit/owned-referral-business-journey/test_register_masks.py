import io
import runpy
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "tests/e2e/owned-referral-business-journey/register-masks.py"
WORKFLOW = ROOT / ".github/workflows/ci-integ.yml"
module = runpy.run_path(str(SCRIPT), run_name="register_masks")
normalize = module["normalize"]
run = module["run"]


class RegisterMasksTest(unittest.TestCase):
    def test_strips_the_line_reporter_prefix_from_add_mask(self):
        self.assertEqual(
            normalize(b"\x1b[1A\x1b[2K::add-mask::synthetic\n"),
            b"::add-mask::synthetic\n",
        )
        self.assertEqual(
            normalize(b"\r\x1b[2K::add-mask::synthetic\n"),
            b"::add-mask::synthetic\n",
        )

    def test_keeps_a_command_that_already_starts_the_line(self):
        self.assertEqual(
            normalize(b"::add-mask::synthetic\n"), b"::add-mask::synthetic\n"
        )

    def test_leaves_every_other_line_untouched(self):
        for line in (
            b"\x1b[1A\x1b[2K[1/1] owned-business.spec.ts\n",
            b"\x1b[1A\x1b[2K::set-env name=A::b\n",
            b"\x1b[1A\x1b[2K::error::boom\n",
            b"text ::add-mask::not-a-command\n",
            b"\xff\xfe raw bytes\n",
            b"no newline",
        ):
            self.assertEqual(normalize(line), line)

    def test_masks_are_emitted_before_the_lines_that_follow(self):
        sink = io.BytesIO()
        run(
            io.BytesIO(b"a\n\x1b[1A\x1b[2K::add-mask::s\nuses s\n"),
            sink,
        )
        self.assertEqual(sink.getvalue(), b"a\n::add-mask::s\nuses s\n")

    def test_pipefail_keeps_the_playwright_exit_code(self):
        result = subprocess.run(
            [
                "bash",
                "-c",
                'set -o pipefail; (printf "\\033[1A\\033[2K::add-mask::s\\n"; exit 7)'
                ' | "$0" "$1"',
                sys.executable,
                str(SCRIPT),
            ],
            capture_output=True,
            timeout=30,
        )
        self.assertEqual(result.returncode, 7)
        self.assertEqual(result.stdout, b"::add-mask::s\n")

    def test_workflow_runs_playwright_through_the_filter_with_pipefail(self):
        workflow = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn(
            "        run: |\n"
            "          set -o pipefail\n"
            "          pnpm exec playwright test"
            " -c playwright.owned-referral-business-journey.config.ts 2>&1 \\\n"
            "            | python3 -u tests/e2e/owned-referral-business-journey/register-masks.py\n",
            workflow,
        )
        self.assertEqual(
            workflow.count("playwright.owned-referral-business-journey.config.ts"), 1
        )


if __name__ == "__main__":
    unittest.main()
