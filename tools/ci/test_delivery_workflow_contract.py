"""Exercise CI ownership and image-build contracts without runners or cloud access."""
from __future__ import annotations

import ast
import os
import re
import subprocess
import tempfile
import unittest
from pathlib import Path

from tools.ci.test_workflow_unit_partitioning import job_block


ROOT = Path(__file__).resolve().parents[2]
CI = (ROOT / ".github/workflows/ci.yml").read_text()
INTEG = (ROOT / ".github/workflows/ci-integ.yml").read_text()
DEPLOY = (ROOT / ".github/workflows/deploy-dev.yml").read_text()


def step_block(job: str, name: str) -> str:
    match = re.search(rf"^      - name: {re.escape(name)}\n(.*?)(?=^      - |\Z)",
                      job, re.MULTILINE | re.DOTALL)
    if not match:
        raise AssertionError(f"Missing step: {name}")
    return match.group(1)


def scalar(block: str, key: str, indent: int) -> str:
    match = re.search(rf"^{' ' * indent}{re.escape(key)}: (.+)$", block, re.MULTILINE)
    if not match:
        raise AssertionError(f"Missing {key}")
    return match.group(1)


def expression(text: str, context: dict[str, object]) -> object:
    """Evaluate only the boolean/comparison subset used by these jobs."""
    text = text.removeprefix("${{").removesuffix("}}").strip()
    text = re.sub(r"\b(?:github|needs|matrix|steps)\.[\w.-]+",
                  lambda match: repr(context[match.group()]), text)
    text = text.replace("&&", " and ").replace("||", " or ")
    tree = ast.parse(text, mode="eval")
    allowed = (ast.Expression, ast.BoolOp, ast.And, ast.Or, ast.Compare,
               ast.Eq, ast.NotEq, ast.Constant)
    for node in ast.walk(tree):
        if not isinstance(node, allowed):
            raise AssertionError(f"Unsupported expression: {text}")
    return eval(compile(tree, "<workflow expression>", "eval"), {"__builtins__": {}})


def enabled(block: str, indent: int, context: dict[str, object]) -> bool:
    if not re.search(rf"^{' ' * indent}if:", block, re.MULTILINE):
        return True
    return bool(expression(scalar(block, "if", indent), context))


class StaticCheckOwnershipTests(unittest.TestCase):
    def owners(self, event: str, base: str, draft: bool, product: bool) -> dict[str, int]:
        context = {
            "github.event_name": event,
            "github.base_ref": base,
            "github.event.pull_request.draft": draft,
            "needs.scope.outputs.product": str(product).lower(),
            "needs.changes.outputs.product": str(product).lower(),
            "needs.candidate.outputs.run_full_ci": str(not draft).lower(),
        }
        checks = ("lint", "typecheck", "i18n-guard", "dependency-security", "repo-classification")
        result = {}
        for check in checks:
            if check in ("lint", "typecheck"):
                fast = job_block(CI, "product_fast_checks")
                ci_enabled = enabled(fast, 4, context) and enabled(
                    step_block(fast, check.capitalize()), 8, context)
            else:
                ci_enabled = enabled(job_block(CI, check), 4, context)
            # Only dev PRs automatically trigger both workflows. A dispatch of
            # CI is independent of an explicit dispatch of ci-integ.
            integ_triggered = event == "pull_request" and base == "dev"
            integ_enabled = integ_triggered and enabled(job_block(INTEG, check), 4, context)
            result[check] = int(ci_enabled) + int(integ_enabled)
        return result

    def test_ready_and_draft_dev_product_prs_execute_each_static_check_once(self) -> None:
        for draft in (False, True):
            with self.subTest(draft=draft):
                self.assertEqual(set(self.owners("pull_request", "dev", draft, True).values()), {1})

    def test_tool_only_dev_prs_keep_unscoped_security_and_classification(self) -> None:
        for draft in (False, True):
            with self.subTest(draft=draft):
                self.assertEqual(self.owners("pull_request", "dev", draft, False), {
                    "lint": 0, "typecheck": 0, "i18n-guard": 0,
                    "dependency-security": 1, "repo-classification": 1,
                })

    def test_main_and_manual_ci_keep_their_own_checks(self) -> None:
        for event, base in (("pull_request", "main"), ("push", ""), ("workflow_dispatch", "")):
            with self.subTest(event=event):
                self.assertEqual(set(self.owners(event, base, False, True).values()), {1})

    def test_integration_runs_for_every_dev_pr_candidate_event(self) -> None:
        trigger = re.search(r"^  pull_request:\n(.*?)(?=^  \w|\Z)", INTEG,
                            re.MULTILINE | re.DOTALL).group(1)
        self.assertIn('- "dev"', trigger)
        for event in ("opened", "synchronize", "reopened", "ready_for_review"):
            self.assertIn(event, trigger)
        self.assertNotIn("paths", trigger)

    def test_integration_owner_runs_the_same_static_commands(self) -> None:
        for job, command in {
            "lint": "pnpm run lint", "typecheck": "pnpm run typecheck",
            "i18n-guard": "pnpm run i18n:guard",
            "dependency-security": "python3 tools/ci/dependency_security.py",
            "repo-classification": "node tools/ci/check-repo-classification.mjs",
        }.items():
            with self.subTest(job=job):
                self.assertIn(f"run: {command}", job_block(INTEG, job))
                self.assertNotIn("continue-on-error", job_block(INTEG, job))

    def test_required_integration_aggregate_rejects_each_failed_static_check(self) -> None:
        block = job_block(INTEG, "ci-integ")
        script = step_block(block, "Aggregate").split("        run: |\n", 1)[1]
        # Exercise the actual aggregate shell, including its handling of a
        # failed static job, instead of merely checking that needs lists it.
        for failed in (None, "lint", "typecheck", "i18n-guard", "dependency-security", "repo-classification"):
            values = {key: "success" for key in re.findall(r"\$\{\{ (needs\.[\w.-]+) \}\}", script)}
            values.update({
                "needs.candidate.outputs.run_full_ci": "true",
                "needs.changes.outputs.product": "true",
                "needs.changes.outputs.orchestrator": "false",
                "needs.changes.outputs.scope": "product",
            })
            if failed:
                values[f"needs.{failed}.result"] = "failure"
            rendered = re.sub(r"\$\{\{ (needs\.[\w.-]+) \}\}", lambda m: values[m.group(1)], script)
            with self.subTest(failed=failed):
                result = subprocess.run(["bash", "-e", "-c", rendered], capture_output=True, text=True)
                self.assertEqual(result.returncode == 0, failed is None, result.stdout + result.stderr)

    def test_required_names_and_environment_distinct_suites_remain(self) -> None:
        for job, name in (("commit-trailers", "Commit trailers"),
                          ("runtime-mirror-guard", "Runtime mirror guard"),
                          ("smoke-acceptance", "Smoke acceptance")):
            self.assertEqual(scalar(job_block(CI, job), "name", 4), name)
        for workflow, jobs in ((CI, ("product_root_unit", "product_api_unit", "product_smoke_acceptance")),
                               (INTEG, ("unit-image", "unit-shard", "unit", "integration", "iam-negative-matrix", "ci-integ"))):
            for job in jobs:
                self.assertTrue(job_block(workflow, job))


class ParallelImageBuildTests(unittest.TestCase):
    def setUp(self) -> None:
        self.build = job_block(DEPLOY, "build-push")

    def test_every_active_image_keeps_its_dockerfile_candidate_arg_tag_and_cache(self) -> None:
        match = re.search(r"image:\s*\[([^]]+)\]", self.build)
        self.assertIsNotNone(match)
        images = [item.strip() for item in match.group(1).split(",") if item.strip()]
        expected = {"api", "migrate", "platform-admin-web", "ops-console-web",
                    "fleet-partner-portal-web", "tenant-console-web", "bank-console-web",
                    "referral-embed-web", "enterprise-dispatch-web", "channel-partner-portal-web",
                    "passenger-app-web"}
        self.assertEqual(set(images), expected)
        self.assertEqual(len(images), len(expected))
        for image in images:
            action = step_block(self.build, f"Build & push — {image}")
            with self.subTest(image=image):
                self.assertEqual(scalar(action, "file", 10),
                                 "Dockerfile.migrate" if image == "migrate" else f"apps/{image}/Dockerfile")
                if image in ("api", "migrate"):
                    self.assertNotIn("build-args:", action)
                else:
                    self.assertEqual(scalar(action, "build-args", 10),
                                     "DRTS_CANDIDATE_SHA=${{ steps.tag.outputs.candidate_sha }}")
                self.assertIn("${{ needs.prepare.outputs.registry }}/" + image + ":${{ steps.tag.outputs.tag }}", action)
                self.assertEqual(scalar(action, "cache-from", 10), f"type=gha,scope={image}")
                self.assertEqual(scalar(action, "cache-to", 10), f"type=gha,scope={image},mode=min")
                self.assertEqual(scalar(action, "push", 10), "true")
                context = {"matrix.image": image, **{f"steps.existing.outputs.{item}": "false" for item in images}}
                self.assertEqual(sum(enabled(step_block(self.build, f"Build & push — {item}"), 8, context)
                                     for item in images), 1)
                context[f"steps.existing.outputs.{image}"] = "true"
                self.assertFalse(any(enabled(step_block(self.build, f"Build & push — {item}"), 8, context)
                                     for item in images))

    def test_existing_image_is_skipped_and_missing_image_is_built(self) -> None:
        step = step_block(self.build, "Check whether the registry already has this image")
        script = step.split("        run: |\n", 1)[1]
        action = step_block(self.build, "Build & push — api")
        for exists in (True, False):
            with self.subTest(exists=exists), tempfile.TemporaryDirectory() as tmp:
                output = Path(tmp) / "output"
                # Stub the sole registry read; no network or container is used.
                stub = ('gcloud() { test "$*" = "container images describe registry/api:abcdef123456" || exit 9; '
                        f'return {0 if exists else 1}; }}\n')
                result = subprocess.run(["bash", "-e", "-c", stub + script], capture_output=True, text=True,
                                        env={**os.environ, "IMAGE": "api", "REGISTRY": "registry",
                                             "IMAGE_TAG": "abcdef123456", "GITHUB_OUTPUT": str(output)})
                self.assertEqual(result.returncode, 0, result.stderr)
                present = output.read_text().strip().split("=", 1)[1]
                self.assertEqual(present, str(exists).lower())
                self.assertEqual(enabled(action, 8, {"matrix.image": "api", "steps.existing.outputs.api": present}), not exists)

    def test_parallelism_is_bounded_and_migration_waits_for_all_images(self) -> None:
        images = self.build.split("matrix:", 1)[1].split("]", 1)[0]
        image_count = len([line for line in images.splitlines() if line.strip().rstrip(",") and line.strip() != "["
                           and not line.strip().startswith("image:")])
        # Bounded by the matrix itself: every image builds in a single wave.
        self.assertEqual(scalar(self.build, "max-parallel", 6), str(image_count))
        self.assertEqual(scalar(self.build, "fail-fast", 6), "false")
        self.assertNotIn("continue-on-error", self.build)
        self.assertEqual(scalar(job_block(DEPLOY, "migrate"), "needs", 4), "[prepare, build-push]")
        self.assertEqual(scalar(job_block(DEPLOY, "deploy"), "needs", 4), "[prepare, build-push, migrate]")
        self.assertIn("ref: ${{ needs.prepare.outputs.source_ref }}", self.build)
        self.assertIn('git rev-parse --short=12 HEAD', self.build)
        self.assertIn('candidate_sha=$(git rev-parse HEAD)', self.build)
        self.assertEqual(scalar(self.build, "image_tag", 6), "${{ steps.tag.outputs.tag }}")
        self.assertEqual(scalar(self.build, "candidate_sha", 6), "${{ steps.tag.outputs.candidate_sha }}")


if __name__ == "__main__":
    unittest.main()
