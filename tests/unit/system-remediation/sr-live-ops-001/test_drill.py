"""Execute real runner against fake external CLIs. No live service is started."""
import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

REPO = Path(__file__).resolve().parents[4]
INFRA = REPO / "infra/gcp/dev/ops-drill"
sys.path.insert(0, str(INFRA))
spec = importlib.util.spec_from_file_location("restore_drill", INFRA / "restore_drill.py")
drill = importlib.util.module_from_spec(spec)
spec.loader.exec_module(drill)
sys.modules["restore_drill"] = drill
import provision_drill_sa as provision  # noqa: E402
import sweep_drill as sweep  # noqa: E402
import check_readiness as readiness  # noqa: E402
import validate_live_evidence as live_evidence  # noqa: E402


class Clock:
    def __init__(self):
        self.value = 0

    def monotonic(self):
        self.value += 0.01
        return self.value

    def sleep(self, seconds):
        self.value += seconds


class RestoreDrillTest(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory(prefix="ops-drill-unit-")
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name)
        fixture = Path(__file__).with_name("fake_cli.py")
        for binary, kind in (("gcloud", "gcloud"), ("psql", "psql"), ("cloud-sql-proxy", "proxy"), ("gh", "gh")):
            wrapper = self.root / binary
            wrapper.write_text(f'#!/bin/sh\nexec "{sys.executable}" "{fixture}" "{kind}" "$@"\n')
            wrapper.chmod(0o755)
        sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip()
        self.env = {"PATH": str(self.root) + ":" + os.environ["PATH"], "DRILL_FAKE_DIR": str(self.root),
                    "GITHUB_ACTIONS": "true", "RUNNER_ENVIRONMENT": "github-hosted", "GITHUB_REPOSITORY": "ajoe734/drts-fleet-platform",
                    "GITHUB_REF": "refs/heads/main", "GITHUB_RUN_ID": "123", "GITHUB_RUN_ATTEMPT": "1",
                    "DEV_GCP_PROJECT_ID": drill.PROJECT, "DEV_GCP_REGION": drill.REGION,
                    "DEV_GCP_CLOUDSQL_INSTANCE": f"{drill.PROJECT}:{drill.REGION}:{drill.SOURCE}",
                    "CANDIDATE_SHA": sha, "BASE_SHA": sha}
        self.target = "drts-dev-db-drill-123-1"
        self.output = self.root / "evidence.json"
        self.clock = Clock()
        for mock in (patch.dict(os.environ, self.env), patch.object(drill.time, "monotonic", self.clock.monotonic), patch.object(drill.time, "sleep", self.clock.sleep)):
            mock.start()
            self.addCleanup(mock.stop)

    def calls(self):
        path = self.root / "commands.jsonl"
        return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []

    def execute(self, scenario="success", success=False):
        with patch.dict(os.environ, {"DRILL_FAKE_SCENARIO": scenario}):
            if success:
                drill.run(self.target, self.output)
            else:
                with self.assertRaises(drill.DrillError):
                    drill.run(self.target, self.output)
        raw = self.output.read_text()
        self.assertNotIn("TOP-SECRET", raw + json.dumps(self.calls()))
        return json.loads(raw)

    def deleted(self):
        return any(call[1:4] == ["sql", "instances", "delete"] for call in self.calls())

    def test_success_reads_both_source_and_clone_then_confirms_deletion(self):
        result = self.execute(success=True)
        self.assertEqual(result["status"], "restore_readback_passed")
        self.assertEqual(result["cleanup"]["status"], "deleted")
        self.assertEqual(len(result["clone_readback"]["tables"]), 4)
        self.assertGreater(result["rto_readable_seconds"], result["rto_runnable_seconds"])
        self.assertIn("not a proven data-loss bound", result["rpo_observation"]["meaning"])
        self.assertEqual(result["capacity_acceptance"], "pending_representative_workload_and_SLO")
        self.assertTrue(self.deleted())
        self.assertFalse((self.root / "created").exists())
        self.assertEqual(sum(call[0] == "psql" for call in self.calls()), 3)

    def test_name_guards_before_any_cli_or_cleanup(self):
        for target in ("drts-dev-db", "drts-dev-primary-db", "drts-dev-db-drill-../../x", "other-db", "drts-dev-db-drill-123-2"):
            with self.subTest(target=target), self.assertRaises(drill.DrillError):
                drill.run(target, self.output)
        self.assertEqual(self.calls(), [])

    def test_vm_guard(self):
        with patch.dict(os.environ, {"RUNNER_ENVIRONMENT": "self-hosted"}), self.assertRaises(drill.DrillError):
            drill.run(self.target, self.output)
        self.assertEqual(self.calls(), [])

    def test_candidate_checkout_mismatch(self):
        with patch.dict(os.environ, {"CANDIDATE_SHA": "0" * 40}), self.assertRaises(drill.DrillError):
            drill.run(self.target, self.output)
        self.assertEqual(self.calls(), [])

    def test_preexisting_target_is_never_deleted(self):
        result = self.execute("preexisting")
        self.assertEqual(result["failure_code"], "target_already_exists_do_not_delete")
        self.assertFalse(self.deleted())

    def test_permission_error_is_not_treated_as_absence(self):
        self.execute("describe_denied")
        self.assertFalse(self.deleted())
        self.assertFalse(any(call[1:4] == ["sql", "instances", "clone"] for call in self.calls()))

    def test_disabled_pitr_blocks_before_clone(self):
        self.execute("no_pitr")
        self.assertFalse(self.deleted())

    def test_stale_recovery_window_blocks_before_secret_or_clone(self):
        self.execute("stale_point")
        self.assertFalse(any(call[1:3] == ["secrets", "versions"] for call in self.calls()))

    def test_secret_errors_are_not_printed_and_do_not_create_resources(self):
        result = self.execute("secret_failure")
        self.assertEqual(result["failure_code"], "child_command_failed")
        self.assertFalse(self.deleted())

    def test_readback_uses_raw_secret_and_pg_credentials_for_socket_and_tcp_urls(self):
        cases = [
            ("postgresql://drill-user:TOP-SECRET-PASSWORD@/drts?host=/cloudsql/private-db", "drill-user", "TOP-SECRET-PASSWORD", "drts"),
            ("postgres://drill-user:TOP-SECRET:p@ss+[]@/drts?host=/cloudsql/private-db", "drill-user", "TOP-SECRET:p@ss+[]", "drts"),
            ("postgresql://drill%40user:TOP-SECRET%40%3A%2F%3F%23%25%5B%5D%5C@/drts?host=/cloudsql/private-db", "drill@user", "TOP-SECRET@:/?#%[]\\", "drts"),
            ("postgresql://drill-user:TOP-SECRET-PASSWORD@private-db/drts%20db", "drill-user", "TOP-SECRET-PASSWORD", "drts db"),
            ("postgresql://ignored:ignored@/drts?host=/cloudsql/private-db&user=drill-user&password=TOP-SECRET%2Bpass", "drill-user", "TOP-SECRET+pass", "drts"),
        ]
        for index, (url, user, password, database) in enumerate(cases):
            with self.subTest(case=index), patch.dict(os.environ, {"DRILL_FAKE_DB_URL": url, "PGPASSWORD": "must-not-inherit"}):
                reader = drill.Readback(self.root)
                self.assertEqual(reader.env["PGUSER"], user)
                self.assertEqual(reader.env["PGDATABASE"], database)
                self.assertEqual(reader.env["PGHOST"], "127.0.0.1")
                self.assertNotIn("PGPASSWORD", reader.env)
                escape = lambda value: value.replace("\\", "\\\\").replace(":", "\\:")
                self.assertEqual((self.root / "pgpass").read_text(), f"127.0.0.1:*:{escape(database)}:{escape(user)}:{escape(password)}\n")
                self.assertEqual((self.root / "pgpass").stat().st_mode & 0o777, 0o600)
        self.assertNotIn("TOP-SECRET", json.dumps(self.calls()))

    def test_invalid_db_secret_is_sanitized_before_clone(self):
        for secret in ("not-a-url-TOP-SECRET", "postgresql://user@/drts", "postgresql://user:TOP-SECRET@/", "postgresql://user:TOP-SECRET%0A@/drts"):
            with self.subTest(kind=secret.split(":", 1)[0]), patch.dict(os.environ, {"DRILL_FAKE_DB_URL": secret}):
                result = self.execute()
                self.assertEqual(result["failure_code"], "invalid_db_secret")
                self.assertFalse(self.deleted())
        self.assertFalse(any(call[1:4] == ["sql", "instances", "clone"] for call in self.calls()))

    def test_clone_api_failure_still_deletes_possible_resource(self):
        result = self.execute("clone_failure")
        self.assertTrue(self.deleted())
        self.assertEqual(result["cleanup"]["status"], "deleted")

    def test_sigterm_after_clone_still_cleans_up(self):
        original = drill.gc
        def interrupted(*args, **kwargs):
            response = original(*args, **kwargs)
            if args[:3] == ("sql", "instances", "clone"):
                signal.raise_signal(signal.SIGTERM)
            return response
        with patch.object(drill, "gc", interrupted):
            result = self.execute()
        self.assertEqual(result["failure_code"], "interrupted")
        self.assertEqual(result["cleanup"]["status"], "deleted")

    def test_shell_entrypoint_nonzero_and_no_secret_in_stdout_stderr(self):
        with patch.dict(os.environ, {"DRILL_FAKE_SCENARIO": "clone_failure"}):
            result = subprocess.run(["bash", str(INFRA / "run-restore-drill.sh"),
                                     "--target", self.target, "--evidence", str(self.output)],
                                    capture_output=True, text=True, timeout=15)
        self.assertEqual(result.returncode, 1)
        self.assertNotIn("TOP-SECRET-PASSWORD", result.stdout + result.stderr)
        self.assertNotIn("postgresql://", result.stdout + result.stderr)
        self.assertEqual(json.loads(self.output.read_text())["cleanup"]["status"], "deleted")

    def test_missing_operation_is_failure_with_cleanup(self):
        result = self.execute("missing_operation")
        self.assertEqual(result["failure_code"], "clone_operation_missing")
        self.assertTrue(self.deleted())

    def test_operation_error_is_failure_with_cleanup(self):
        result = self.execute("operation_error")
        self.assertEqual(result["failure_code"], "clone_operation_failed")
        self.assertTrue(self.deleted())

    def test_readback_failure_cleans_clone(self):
        self.execute("readback_failure")
        self.assertTrue(self.deleted())

    def test_missing_table_is_nonzero(self):
        self.execute("missing_table")
        self.assertFalse(self.deleted())  # Source preflight fails before clone.

    def test_counts_mismatch_never_claims_success_and_still_deletes(self):
        result = self.execute("mismatch")
        self.assertEqual(result["failure_code"], "readback_mismatch_or_concurrent_source_change")
        self.assertEqual(result["status"], "failed")
        self.assertTrue(self.deleted())

    def test_future_write_is_rejected(self):
        self.execute("post_point")
        self.assertTrue(self.deleted())

    def test_cleanup_failure_overrides_success(self):
        result = self.execute("cleanup_failure")
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["cleanup"]["status"], "unconfirmed")

    def test_plan_checks_actual_provider_trust(self):
        result = provision.plan()
        self.assertEqual(result["status"], "plan_only")
        self.assertIn("NOT IAM-enforceable", result["residual_risk"])
        with patch.dict(os.environ, {"DRILL_FAKE_SCENARIO": "bad_trust"}), self.assertRaises(drill.DrillError):
            provision.plan()

    def test_plan_includes_only_project_sql_create_with_exact_condition(self):
        design = provision.plan()
        create = next(s for s in design["roles"] if s["id"] == "drtsOpsDrillCloneCreate")
        self.assertEqual(create["permissions"], ["cloudsql.instances.create"])
        expected = {
            "role": f"projects/{drill.PROJECT}/roles/drtsOpsDrillCloneCreate",
            "members": [provision.MEMBER],
            "condition": {
                "title": "drtsOpsDrillCloneCreate",
                "expression": f"resource.service == 'sqladmin.googleapis.com' && resource.name == 'projects/{drill.PROJECT}'",
            },
        }
        self.assertIn(expected, design["project_bindings"])
        provision.audit_policy({"bindings": [expected]}, design["project_bindings"])
        self.assertFalse(self.iam_writes())  # The default plan stays read-only.

    def test_noninteractive_apply_fails_before_any_iam_write(self):
        result = subprocess.run(["bash", str(INFRA / "provision-drill-sa.sh"), "--apply"], capture_output=True, text=True)
        self.assertEqual(result.returncode, 2)
        self.assertFalse(self.iam_writes())

    def iam_writes(self):
        return [c for c in self.calls() if "create" in c or "add-iam-policy-binding" in c or c[1:3] == ["variable", "set"]]

    def test_apply_real_orchestrator_is_additive_idempotent_and_readiness_is_separate(self):
        design = provision.plan()
        provision.apply(design, provision.inventory(design))
        state = provision.inventory(design, complete=True)
        writes = self.iam_writes()
        self.assertEqual(len(writes), 13)  # SA, five roles/bindings, secret, WIF
        provision.apply(design, state)
        self.assertEqual(self.iam_writes(), writes)
        self.assertFalse((self.root / "ready.json").exists())
        iam = json.loads((self.root / "iam.json").read_text())
        for item in iam["project"]["bindings"]:
            permissions = iam["roles"][item["role"].split("/")[-1]]["includedPermissions"]
            if "cloudsql.instances.delete" in permissions:
                self.assertIn("resource.name.startsWith('projects/drts-dev-devcc-20260825/instances/drts-dev-db-drill-')", item["condition"]["expression"])
            if "cloudsql.instances.clone" in permissions:
                self.assertEqual(permissions, ["cloudsql.instances.clone"])
                self.assertIn("resource.name == 'projects/drts-dev-devcc-20260825/instances/drts-dev-db'", item["condition"]["expression"])
            if "cloudsql.instances.create" in permissions:
                self.assertEqual(permissions, ["cloudsql.instances.create"])
                self.assertEqual(item["condition"], {"title": "drtsOpsDrillCloneCreate", "expression": f"resource.service == 'sqladmin.googleapis.com' && resource.name == 'projects/{drill.PROJECT}'"})
        self.assertFalse(any(p in json.dumps(iam["roles"]) for p in ("restoreBackup", "instances.update", "users.update")))

    def test_existing_provisioning_adds_only_create_role_and_binding(self):
        design = provision.plan()
        previous = dict(design, roles=[s for s in design["roles"] if s["id"] != "drtsOpsDrillCloneCreate"],
                        project_bindings=[b for b in design["project_bindings"] if not b["role"].endswith("/drtsOpsDrillCloneCreate")])
        provision.apply(previous, provision.inventory(previous))
        before = json.loads((self.root / "iam.json").read_text())
        writes = self.iam_writes()
        with self.assertRaisesRegex(drill.DrillError, "provisioning_incomplete"):
            provision.inventory(design, complete=True)
        provision.apply(design, provision.inventory(design))
        provision.inventory(design, complete=True)
        added = self.iam_writes()[len(writes):]
        self.assertEqual(len(added), 2)
        self.assertEqual(added[0][1:5], ["iam", "roles", "create", "drtsOpsDrillCloneCreate"])
        self.assertEqual(added[1][1:4], ["projects", "add-iam-policy-binding", drill.PROJECT])
        after = json.loads((self.root / "iam.json").read_text())
        after["roles"].pop("drtsOpsDrillCloneCreate")
        after["project"]["bindings"] = [b for b in after["project"]["bindings"] if not b["role"].endswith("/drtsOpsDrillCloneCreate")]
        self.assertEqual(after, before)  # Preserve all previously provisioned IAM.

    def test_create_grant_drift_blocks_apply_inventory_and_readiness_without_writes(self):
        design = provision.plan()
        provision.apply(design, provision.inventory(design))
        statefile = self.root / "iam.json"
        original = statefile.read_text()
        writes = self.iam_writes()
        conditions = [None, "true", "resource.service == 'sqladmin.googleapis.com'",
                      f"resource.name == 'projects/{drill.PROJECT}'",
                      f"resource.service == 'sqladmin.googleapis.com' && resource.name.startsWith('projects/{drill.PROJECT}')",
                      "resource.service == 'sqladmin.googleapis.com' && resource.name == 'projects/other-project'"]
        for change in [*conditions, "extra_permission", "extra_grant", "missing_binding", "inherited"]:
            iam = json.loads(original)
            create = next(b for b in iam["project"]["bindings"] if b["role"].endswith("/drtsOpsDrillCloneCreate"))
            error = "unexpected_sa_grant"
            if change == "extra_permission":
                iam["roles"]["drtsOpsDrillCloneCreate"]["includedPermissions"].append("cloudsql.instances.update")
                error = "existing_custom_role_drift"
            elif change == "extra_grant":
                iam["project"]["bindings"].append(dict(create, role="roles/cloudsql.admin"))
            elif change == "missing_binding":
                iam["project"]["bindings"].remove(create)
                error = "project_binding_missing"
            elif change == "inherited":
                with self.assertRaisesRegex(drill.DrillError, error):
                    provision.audit_policy({"bindings": [create]}, design["project_bindings"], inherited=True)
                continue
            elif change is None:
                create.pop("condition")
            else:
                create["condition"]["expression"] = change
            statefile.write_text(json.dumps(iam))
            with self.subTest(change=change), self.assertRaisesRegex(drill.DrillError, error):
                provision.inventory(design, complete=True)
            # Production --check-ready must reject the bad policy before prompting
            # or publishing; isolate only git's local dirty-tree boundary.
            original_command = provision.command
            def boundary(args, **kwargs):
                return "" if args[:2] == ["git", "status"] else original_command(args, **kwargs)
            with patch.object(provision, "command", boundary), patch.object(provision, "confirm") as confirm, patch.object(sys, "argv", ["provision", "--check-ready", "--output", str(self.root / "plan.json")]):
                self.assertEqual(provision.main(), 2)
                confirm.assert_not_called()
            if change != "missing_binding":
                with self.assertRaisesRegex(drill.DrillError, error):
                    provision.inventory(design)  # Apply's pre-write audit too.
            self.assertEqual(self.iam_writes(), writes)
            self.assertFalse((self.root / "ready.json").exists())

    def test_inherited_owner_or_failed_ancestor_read_blocks_before_writes(self):
        design = provision.plan()
        for scenario in ("inherited_owner", "ancestor_denied", "other_secret_access", "other_sa_access"):
            with self.subTest(scenario=scenario), patch.dict(os.environ, {"DRILL_FAKE_SCENARIO": scenario}), self.assertRaises(drill.DrillError):
                provision.inventory(design)
        self.assertFalse(self.iam_writes())

    def test_role_drift_and_extra_sa_grant_are_not_silently_repaired(self):
        design = provision.plan()
        provision.apply(design, provision.inventory(design))
        statefile = self.root / "iam.json"
        original = statefile.read_text()
        for change in ("role", "grant", "impersonation", "unconditioned_delete"):
            iam = json.loads(original)
            if change == "role":
                iam["roles"]["drtsOpsDrillTemporary"]["includedPermissions"].append("cloudsql.instances.update")
            elif change == "grant":
                iam["project"]["bindings"].append({"role": "roles/owner", "members": [provision.MEMBER]})
            elif change == "impersonation":
                iam["sa"]["bindings"][0]["members"].append("allAuthenticatedUsers")
            else:
                iam["project"]["bindings"][1].pop("condition")
            statefile.write_text(json.dumps(iam))
            with self.subTest(change=change), self.assertRaises(drill.DrillError):
                provision.inventory(design, complete=True)

    def test_partial_apply_failure_can_be_retried_without_widening_or_readiness(self):
        design = provision.plan()
        original = provision.gc
        def denied(*args, **kwargs):
            if args[:2] == ("secrets", "add-iam-policy-binding"):
                raise drill.DrillError("simulated_iam_failure")
            return original(*args, **kwargs)
        with patch.object(provision, "gc", denied), self.assertRaises(drill.DrillError):
            provision.apply(design, provision.inventory(design))
        with self.assertRaises(drill.DrillError):
            provision.inventory(design, complete=True)
        provision.apply(design, provision.inventory(design))
        provision.inventory(design, complete=True)
        self.assertEqual(len(self.iam_writes()), 13)
        self.assertFalse((self.root / "ready.json").exists())

    def test_public_or_group_grant_is_not_assumed_to_exclude_drill_sa(self):
        for member in ("allAuthenticatedUsers", "group:operators@example.test"):
            with self.subTest(member=member), self.assertRaises(drill.DrillError):
                provision.audit_policy({"bindings": [{"role": "roles/owner", "members": [member]}]}, [])

    def test_confirmation_requires_exact_candidate_and_interactive_operator(self):
        sha = self.env["CANDIDATE_SHA"]
        with patch.dict(os.environ, {"GITHUB_ACTIONS": ""}), patch.object(sys.stdin, "isatty", return_value=True):
            with patch("builtins.input", return_value="yes"), self.assertRaises(drill.DrillError):
                provision.confirm("APPLY", sha)
            with patch("builtins.input", return_value=f"APPLY {provision.SA} {sha}"):
                provision.confirm("APPLY", sha)
        with patch.object(sys.stdin, "isatty", return_value=True), self.assertRaises(drill.DrillError):
            provision.confirm("APPLY", sha)  # GITHUB_ACTIONS blocks even a TTY

    def test_readiness_rejects_absent_wrong_candidate_provider_and_stale_receipts(self):
        receipt = {"candidate_sha": self.env["CANDIDATE_SHA"], "service_account": provision.SA,
                   "provider": "reviewed-provider", "checked_at": drill.iso(drill.utcnow()), "audit_sha256": "a" * 64}
        readiness.check(json.dumps(receipt), self.env["CANDIDATE_SHA"], "reviewed-provider")
        for key, value in (("candidate_sha", "0" * 40), ("provider", "other"), ("checked_at", "2020-01-01T00:00:00Z"), ("audit_sha256", "")):
            with self.subTest(key=key), self.assertRaises(drill.DrillError):
                readiness.check(json.dumps(dict(receipt, **{key: value})), self.env["CANDIDATE_SHA"], "reviewed-provider")
        with self.assertRaises(drill.DrillError):
            readiness.check("", self.env["CANDIDATE_SHA"], "reviewed-provider")

    def test_ready_publication_requires_complete_audit_and_confirmation(self):
        design = provision.plan()
        provision.apply(design, provision.inventory(design))
        original = provision.command
        def boundary(args, **kwargs):
            # Only the local git dirty check is isolated from in-progress edits.
            if args[:2] == ["git", "status"]:
                return ""
            return original(args, **kwargs)
        with patch.dict(os.environ, {"GITHUB_ACTIONS": ""}), patch.object(sys.stdin, "isatty", return_value=True), patch.object(provision, "command", boundary), patch.object(sys, "argv", ["provision", "--check-ready", "--output", str(self.root / "plan.json")]):
            with patch("builtins.input", return_value="yes"):
                self.assertEqual(provision.main(), 2)
                self.assertFalse((self.root / "ready.json").exists())
            with patch("builtins.input", return_value=f"READY {provision.SA} {self.env['CANDIDATE_SHA']}"):
                self.assertEqual(provision.main(), 0)
        receipt = json.loads((self.root / "ready.json").read_text())
        readiness.check(json.dumps(receipt), self.env["CANDIDATE_SHA"], design["provider"])

    def test_sweep_clean_inventory_and_audit_pass_without_any_delete(self):
        prior = drill.context(self.target)
        prior["clone_operation_id"] = "op1"
        drill.write(self.output, prior)
        output = self.root / "sweep.json"
        with patch.dict(os.environ, {"DRILL_FAKE_SCENARIO": "audit_lro"}):
            sweep.sweep(self.target, self.output, output)
        self.assertEqual(json.loads(output.read_text())["status"], "sweep_passed")
        self.assertFalse(self.deleted())

    def test_sweep_audits_create_destinations_with_existing_safety_boundary(self):
        prior = drill.context(self.target)
        prior["clone_operation_id"] = "op1"
        drill.write(self.output, prior)
        output = self.root / "sweep.json"
        with patch.dict(os.environ, {"DRILL_FAKE_SCENARIO": "audit_create"}):
            sweep.sweep(self.target, self.output, output)
        result = json.loads(output.read_text())
        self.assertEqual(result["status"], "sweep_passed")
        self.assertEqual(result["create_audit_records"][0]["method"], "cloudsql.instances.create")
        with patch.dict(os.environ, {"DRILL_FAKE_SCENARIO": "audit_create_foreign"}), self.assertRaises(drill.DrillError):
            sweep.sweep(self.target, self.output, output)
        self.assertEqual(json.loads(output.read_text())["unexpected_destinations"], ["unexpected-extra-instance"])
        self.assertFalse(self.deleted())

    def test_sweep_window_covers_restore_run_with_fifteen_minute_margin(self):
        prior = drill.context(self.target)
        prior["started_at"] = drill.iso(drill.utcnow() - sweep.dt.timedelta(minutes=50))
        drill.write(self.output, prior)
        output = self.root / "sweep.json"
        sweep.sweep(self.target, self.output, output)
        result = json.loads(output.read_text())
        expected = drill.timestamp(prior["started_at"]) - sweep.dt.timedelta(minutes=15)
        self.assertEqual(drill.timestamp(result["audit_window_start"]), expected)
        query = next(call[3] for call in self.calls() if call[1:3] == ["logging", "read"])
        self.assertIn(f'timestamp>="{drill.iso(expected)}"', query)
        self.assertIn(f'timestamp<="{result["audit_window_end"]}"', query)

    def test_sweep_without_restore_receipt_uses_bounded_preflight_window(self):
        output = self.root / "sweep.json"
        sweep.sweep(self.target, self.output, output)
        result = json.loads(output.read_text())
        self.assertEqual(drill.timestamp(result["audit_window_start"]), drill.timestamp(result["started_at"]) - sweep.dt.timedelta(minutes=15))

    def test_sweep_rejects_invalid_restore_start_before_query(self):
        prior = drill.context(self.target)
        for value in (None, "bad", drill.iso(drill.utcnow() + sweep.dt.timedelta(hours=1))):
            drill.write(self.output, dict(prior, started_at=value))
            with self.subTest(value=value), self.assertRaises(drill.DrillError):
                sweep.sweep(self.target, self.output, self.root / "sweep.json")
        self.assertFalse(any(call[1:3] == ["logging", "read"] for call in self.calls()))

    def test_sweep_logging_timeout_is_bounded_sanitized_and_fails_closed(self):
        prior = drill.context(self.target)
        drill.write(self.output, prior)
        output = self.root / "sweep.json"
        original = drill.subprocess.run
        timeouts = []
        def boundary(args, **kwargs):
            if args[:3] == ["gcloud", "logging", "read"]:
                timeouts.append(kwargs["timeout"])
                raise subprocess.TimeoutExpired(args, kwargs["timeout"], output="TOP-SECRET", stderr="TOP-SECRET")
            return original(args, **kwargs)
        with patch.object(drill.subprocess, "run", boundary), self.assertRaises(drill.DrillError):
            sweep.sweep(self.target, self.output, output)
        result = json.loads(output.read_text())
        self.assertEqual(result["failure_code"], "audit_read_timeout")
        self.assertEqual(result["status"], "sweep_failed")
        self.assertEqual(result["remaining_drill_instances"], [])
        self.assertLessEqual(sum(timeouts) + 3 * 20 + 90, 260)
        self.assertNotIn("TOP-SECRET", output.read_text())
        self.assertFalse(self.deleted())

    def test_sweep_retries_transient_logging_timeout(self):
        prior = drill.context(self.target)
        prior["clone_operation_id"] = "op1"
        drill.write(self.output, prior)
        original = drill.subprocess.run
        attempts = []
        def boundary(args, **kwargs):
            if args[:3] == ["gcloud", "logging", "read"]:
                attempts.append(1)
                if len(attempts) == 1:
                    raise subprocess.TimeoutExpired(args, kwargs["timeout"])
            return original(args, **kwargs)
        output = self.root / "sweep.json"
        with patch.object(drill.subprocess, "run", boundary):
            sweep.sweep(self.target, self.output, output)
        self.assertEqual(json.loads(output.read_text())["status"], "sweep_passed")
        self.assertEqual(len(attempts), 2)

    def test_sweep_rejects_leftovers_foreign_creates_missing_and_truncated_audit(self):
        prior = drill.context(self.target)
        prior["clone_operation_id"] = "op1"
        drill.write(self.output, prior)
        output = self.root / "sweep.json"
        for scenario in ("leftover", "audit_foreign", "audit_unknown", "audit_empty", "audit_denied", "audit_truncated", "audit_lro_unknown"):
            with self.subTest(scenario=scenario), patch.dict(os.environ, {"DRILL_FAKE_SCENARIO": scenario}), self.assertRaises(drill.DrillError):
                sweep.sweep(self.target, self.output, output)
            result = json.loads(output.read_text())
            self.assertEqual(result["status"], "sweep_failed")
            if scenario == "leftover":
                self.assertEqual(result["remaining_drill_instances"], ["drts-dev-db-drill-999-1"])
            if scenario == "audit_foreign":
                self.assertEqual(result["unexpected_destinations"], ["unexpected-extra-clone"])
            self.assertNotIn("TOP-SECRET", output.read_text())
        self.assertFalse(self.deleted())

    def test_live_artifact_validator_recomputes_readback_and_never_claims_capacity(self):
        self.output = self.root / "restore.json"
        ready = {"candidate_sha": self.env["CANDIDATE_SHA"], "service_account": provision.SA,
                 "checked_at": drill.iso(drill.utcnow()), "audit_sha256": "a" * 64}
        drill.write(self.root / "readiness.json", ready)
        restore = self.execute(success=True)
        sweep.sweep(self.target, self.output, self.root / "sweep.json")
        result = live_evidence.validate(self.root, self.env["CANDIDATE_SHA"], "123", "1")
        self.assertEqual(result["capacity"], "not_evaluated")
        self.assertEqual(result["scheduled_restart"], "not_evaluated")
        restore["clone_readback"]["tables"][0]["row_count"] += 1
        drill.write(self.output, restore)
        with self.assertRaises(drill.DrillError):
            live_evidence.validate(self.root, self.env["CANDIDATE_SHA"], "123", "1")
        self.output.unlink()
        with self.assertRaises(OSError):
            live_evidence.validate(self.root, self.env["CANDIDATE_SHA"], "123", "1")


if __name__ == "__main__":
    unittest.main()
