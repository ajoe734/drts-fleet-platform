"""Actual collector tests; only the external gcloud subprocess boundary is mocked."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "readonly_metadata", ROOT / "operations/verification/read-dev-cloud-metadata.py")
collector = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(collector)
SHA = "8d7e14eaa8debbe967d6cf6f05359ce70e30b3c7"
DEFINITION = "03a1c98af9bddfacf3feb2b0b9b8bd00283717bf"
SECRET = "secret-must-never-enter-metadata-evidence"


def external_fixture():
    documents = {}
    policies = {}
    revisions = {}
    for name in collector.SERVICES:
        scanner = name == "drts-dev-scanner"
        revision = name + ("-00045-xcv" if scanner else "-00063-unt")
        containers = [{"name": "gateway" if scanner else "app",
                       "image": f"us-central1-docker.pkg.dev/{collector.PROJECT}/drts/"
                                + ("artifact-scanner-gateway" if scanner else "api")
                                + "@sha256:" + "a" * 64}]
        if scanner:
            containers[0]["env"] = [{"name": k, "value": v} for k, v in collector.SCANNER_ENV.items()]
            containers.append({"name": "clamd", "image": f"us-central1-docker.pkg.dev/{collector.PROJECT}"
                               + "/drts/artifact-scanner-clamd@sha256:" + "b" * 64})
        else:
            env = dict(collector.PROVIDERS, DRTS_CANDIDATE_SHA=SHA,
                       REMITTANCE_PROOF_SCANNER_URL="https://drts-dev-scanner-r6ykdme3wa-uc.a.run.app",
                       PRIVATE_SIGNING_SECRET=SECRET)
            containers[0]["env"] = [{"name": k, "value": v} for k, v in env.items()]
        documents[name] = {
            "metadata": {"name": name},
            "spec": {"template": {"metadata": {"annotations": {
                "autoscaling.knative.dev/maxScale": "1"}}, "spec": {
                    "serviceAccountName": collector.SCANNER_IDENTITY if scanner else collector.RUNTIME,
                    "containerConcurrency": 1, "containers": containers}}},
            "status": {"latestReadyRevisionName": revision, "latestCreatedRevisionName": revision,
                       "conditions": [{"type": "Ready", "status": "True"}],
                       "traffic": [{"revisionName": revision, "percent": 100}],
                       "url": "https://drts-dev-scanner-r6ykdme3wa-uc.a.run.app"},
        }
        rows = []
        if name == "drts-dev-api":
            rows = [{"role": "roles/run.invoker", "members": ["allUsers"]}]
        elif scanner:
            rows = [{"role": "roles/run.invoker", "members": [
                "serviceAccount:" + collector.RUNTIME, "serviceAccount:" + collector.DEPLOYER]}]
        policies[name] = {"bindings": rows}
        revision_spec = copy.deepcopy(documents[name]["spec"]["template"]["spec"])
        digest = revision_spec["containers"][0]["image"]
        if not scanner:
            requested = digest.split("@")[0] + ":" + SHA[:12]
            documents[name]["spec"]["template"]["spec"]["containers"][0]["image"] = requested
            revision_spec["containers"][0]["image"] = requested
        revisions[revision] = {"metadata": {"name": revision, "labels": {"serving.knative.dev/service": name}},
                               "spec": revision_spec, "status": {"imageDigest": digest,
                               "conditions": [{"type": "Ready", "status": "True"}]}}
    return documents, policies, revisions


class ReadonlyMetadataTests(unittest.TestCase):
    def setUp(self):
        self.documents, self.policies, self.revisions = external_fixture()
        self.calls = []
        self.env = patch.dict(os.environ, {"DEV_GCP_PROJECT_ID": collector.PROJECT,
                                          "DEV_GCP_REGION": collector.REGION})
        self.env.start()
        self.addCleanup(self.env.stop)

    def external_run(self, command, **kwargs):
        self.calls.append(command)
        self.assertEqual(command[:2], ["gcloud", "run"])
        self.assertIn(command[2], ("services", "revisions"))
        self.assertIn(command[3], ("describe", "get-iam-policy"))
        if command[2] == "revisions":
            self.assertEqual(command[3], "describe")
            self.assertIn(command[4], self.revisions)
        else:
            self.assertIn(command[4], collector.SERVICES)
        self.assertEqual(command[5:], ["--project", collector.PROJECT, "--region", collector.REGION,
                                      "--format=json", "--quiet"])
        self.assertEqual(kwargs, {"capture_output": True, "text": True, "timeout": 30, "check": True})
        source = self.revisions if command[2] == "revisions" else (
            self.documents if command[3] == "describe" else self.policies)
        return subprocess.CompletedProcess(command, 0, stdout=json.dumps(source[command[4]]), stderr=SECRET)

    def run_collector(self):
        with patch.object(collector.subprocess, "run", self.external_run):
            return collector.collect(SHA, DEFINITION)

    def rejection(self, message):
        with self.assertRaisesRegex(ValueError, message) as caught:
            self.run_collector()
        self.assertNotIn(SECRET, str(caught.exception))

    def test_actual_collector_reads_exact_inventory_and_redacts_secrets(self):
        result = self.run_collector()
        self.assertEqual(len(self.calls), 27)
        self.assertEqual([(c[2], c[3], c[4]) for c in self.calls],
                         [entry for n in collector.SERVICES for entry in (
                             ("services", "describe", n), ("services", "get-iam-policy", n),
                             ("revisions", "describe", self.documents[n]["status"]["latestReadyRevisionName"]))])
        self.assertEqual(result["read_commands"], 27)
        api = result["services"]["drts-dev-api"]
        self.assertEqual(api["requested_images"]["app"],
                         f"us-central1-docker.pkg.dev/{collector.PROJECT}/drts/api:" + SHA[:12])
        self.assertEqual(api["images"]["app"],
                         f"us-central1-docker.pkg.dev/{collector.PROJECT}/drts/api@sha256:" + "a" * 64)
        self.assertEqual(set(result["services"]), set(collector.SERVICES))
        self.assertEqual(result["services"]["drts-dev-api"]["runtime_sha"], SHA)
        self.assertEqual(result["definition_sha"], DEFINITION)
        self.assertEqual(result["product_http_invocations"], 0)
        self.assertEqual(result["mutations"], 0)
        self.assertFalse(result["product_acceptance"])
        self.assertNotIn(SECRET, json.dumps(result))
        self.assertNotIn("PRIVATE_SIGNING_SECRET", json.dumps(result))
        self.assertEqual(len(result["services"]["drts-dev-scanner"]["spec_sha256"]), 64)

    def test_target_rejected_before_any_external_read(self):
        with patch.dict(os.environ, {"DEV_GCP_PROJECT_ID": "nodal-alloy-503700-s3"}):
            self.rejection("Unexpected live target")
        self.assertEqual(self.calls, [])

    def test_bad_runtime_sha_rejected_before_read(self):
        with patch.object(collector.subprocess, "run") as external:
            for value in ("dev", "main", "0" * 39, "0" * 40 + ";echo bad", None):
                with self.subTest(value=value), self.assertRaisesRegex(ValueError, "full SHA"):
                    collector.collect(value, DEFINITION)
            external.assert_not_called()

    def test_bad_definition_sha_rejected_before_read(self):
        with patch.object(collector.subprocess, "run") as external:
            with self.assertRaisesRegex(ValueError, "full SHA"):
                collector.collect(SHA, "main")
            external.assert_not_called()

    def test_invalid_service_or_verb_cannot_escape_whitelist(self):
        with patch.object(collector.subprocess, "run") as external:
            for name, verb in (("other", "describe"), ("drts-dev-api", "deploy"),
                               ("drts-dev-api", "add-iam-policy-binding")):
                with self.subTest(name=name, verb=verb), self.assertRaisesRegex(ValueError, "fixed inventory"):
                    collector.read_json(name, verb)
            external.assert_not_called()

    def test_external_failure_does_not_leak_stderr_or_fake_readiness(self):
        with patch.object(collector.subprocess, "run", side_effect=subprocess.CalledProcessError(
                1, ["gcloud"], stderr=SECRET)):
            with self.assertRaisesRegex(ValueError, "Control-plane read failed") as caught:
                collector.collect(SHA, DEFINITION)
        self.assertNotIn(SECRET, str(caught.exception))

    def test_timeout_does_not_become_valid_snapshot(self):
        with patch.object(collector.subprocess, "run", side_effect=subprocess.TimeoutExpired("gcloud", 30)):
            with self.assertRaisesRegex(ValueError, "Control-plane read failed"):
                collector.collect(SHA, DEFINITION)

    def test_malformed_json_is_not_a_metadata_snapshot(self):
        with patch.object(collector.subprocess, "run", return_value=subprocess.CompletedProcess(
                "gcloud", 0, stdout="not JSON " + SECRET)):
            with self.assertRaisesRegex(ValueError, "Control-plane read failed") as caught:
                collector.collect(SHA, DEFINITION)
        self.assertNotIn(SECRET, str(caught.exception))

    def test_array_response_is_rejected(self):
        with patch.object(collector.subprocess, "run", return_value=subprocess.CompletedProcess(
                "gcloud", 0, stdout="[]")):
            with self.assertRaisesRegex(ValueError, "must be an object"):
                collector.collect(SHA, DEFINITION)

    def test_wrong_service_response(self):
        self.documents["drts-dev-api"]["metadata"]["name"] = "different"
        self.rejection("Wrong service")

    def test_not_ready(self):
        self.documents["drts-dev-api"]["status"]["conditions"][0]["status"] = "False"
        self.rejection("not Ready")

    def test_latest_revision_not_ready(self):
        self.documents["drts-dev-api"]["status"]["latestCreatedRevisionName"] = "new-revision"
        self.rejection("Revision is not fully ready")

    def test_split_traffic_rejected(self):
        self.documents["drts-dev-api"]["status"]["traffic"][0]["percent"] = 99
        self.rejection("Traffic is not fully")

    def test_identity_mismatch(self):
        self.documents["drts-dev-scanner"]["spec"]["template"]["spec"]["serviceAccountName"] = collector.RUNTIME
        self.rejection("Unexpected service identity")

    def test_mutable_image_rejected(self):
        self.documents["drts-dev-api"]["spec"]["template"]["spec"]["containers"][0]["image"] = "api:latest"
        self.rejection("Requested image is outside current project")

    def test_all_seven_console_public_members_rejected(self):
        for name in collector.PRIVATE_SERVICES:
            for principal in ("allUsers", "allAuthenticatedUsers"):
                with self.subTest(service=name, principal=principal):
                    self.policies[name] = {"bindings": [{"role": "roles/run.invoker", "members": [principal]}]}
                    self.rejection("Public private-console")
                    self.policies[name] = {"bindings": []}

    def test_api_binding_change_rejected(self):
        self.policies["drts-dev-api"]["bindings"] = []
        self.rejection("API public binding changed")

    def test_scanner_invokers_change_rejected(self):
        self.policies["drts-dev-scanner"]["bindings"][0]["members"].append("allUsers")
        self.rejection("Scanner invokers changed")

    def test_runtime_source_mismatch(self):
        self.documents["drts-dev-api"]["spec"]["template"]["spec"]["containers"][0]["env"][6]["value"] = "0" * 40
        self.rejection("Runtime source differs")

    def test_each_provider_change_rejected(self):
        env = self.documents["drts-dev-api"]["spec"]["template"]["spec"]["containers"][0]["env"]
        for entry in env[:6]:
            original = entry["value"]
            entry["value"] = "incorrect"
            with self.subTest(name=entry["name"]):
                self.rejection("Artifact providers differ")
            entry["value"] = original

    def test_scanner_url_binding(self):
        self.documents["drts-dev-scanner"]["status"]["url"] = "https://foreign.example"
        self.rejection("Scanner URL mismatch")

    def test_scanner_scale_and_concurrency(self):
        template = self.documents["drts-dev-scanner"]["spec"]["template"]
        for mutate in (lambda: template["metadata"]["annotations"].update({"autoscaling.knative.dev/minScale": "1"}),
                       lambda: template["metadata"]["annotations"].update({"autoscaling.knative.dev/maxScale": "2"}),
                       lambda: template["spec"].update({"containerConcurrency": 2})):
            original = copy.deepcopy(template)
            mutate()
            self.rejection("scale/concurrency changed")
            template.clear()
            template.update(original)

    def test_unknown_scanner_environment_cannot_leak(self):
        env = self.documents["drts-dev-scanner"]["spec"]["template"]["spec"]["containers"][0]["env"]
        for name in ("SCANNER_LIFECYCLE_NONCE", "SIGNATURE_MAX_AGE_MS", "FAULT_MODE", "PRIVATE_KEY"):
            env.append({"name": name, "value": SECRET})
            with self.subTest(name=name):
                self.rejection("environment override")
            env.pop()

    def test_secret_reference_in_scanner_rejected(self):
        self.documents["drts-dev-scanner"]["spec"]["template"]["spec"]["containers"][0]["env"].append(
            {"name": "PRIVATE_KEY", "valueFrom": {"secretKeyRef": {"name": SECRET}}})
        self.rejection("secret or unexpected")

    def test_scanner_command_override_rejected(self):
        self.documents["drts-dev-scanner"]["spec"]["template"]["spec"]["containers"][0]["args"] = [SECRET]
        self.rejection("command override")

    def api_revision(self):
        return self.revisions[self.documents["drts-dev-api"]["status"]["latestReadyRevisionName"]]

    def test_actual_old_helper_fails_same_legitimate_tag_revision_scenario(self):
        # Original immutable source, not a copied or parallel implementation.
        source = subprocess.check_output(["git", "show",
            "9c41ee0e7bab05a7c854b473596a8ff8c69afbe6:operations/verification/read-dev-cloud-metadata.py"],
            cwd=ROOT, text=True)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "old_actual_helper.py"
            path.write_text(source)
            spec = importlib.util.spec_from_file_location("old_actual_helper", path)
            old = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(old)
            with patch.object(old.subprocess, "run", self.external_run):
                with self.assertRaisesRegex(ValueError, "Image is not a current-project immutable digest"):
                    old.collect(SHA, DEFINITION)
        self.assertEqual(len(self.calls), 2)
        self.calls.clear()
        result = self.run_collector()
        self.assertEqual(len(self.calls), 27)
        self.assertEqual(result["services"]["drts-dev-api"]["runtime_sha"], SHA)

    def test_revision_escape_and_forbidden_verb_fail_before_read(self):
        with patch.object(collector.subprocess, "run") as external:
            for revision, verb in (("other-00063-unt", "describe"),
                                   ("drts-dev-api-00063-unt;echo bad", "describe"),
                                   ("drts-dev-api-00063-unt", "get-iam-policy"),
                                   ("drts-dev-api-00063-unt", "delete")):
                with self.subTest(revision=revision, verb=verb), self.assertRaises(ValueError):
                    collector.read_json("drts-dev-api", verb, revision)
            external.assert_not_called()

    def test_untrusted_service_ready_revision_rejected_before_revision_read(self):
        status = self.documents["drts-dev-api"]["status"]
        status["latestReadyRevisionName"] = status["latestCreatedRevisionName"] = "drts-dev-api-00063-unt;echo bad"
        status["traffic"][0]["revisionName"] = status["latestReadyRevisionName"]
        self.rejection("Revision is not fully ready")
        self.assertEqual(len(self.calls), 2)

    def test_wrong_revision_name(self):
        self.api_revision()["metadata"]["name"] = "other-00063-unt"
        self.rejection("Revision service linkage mismatch")

    def test_wrong_revision_service_label(self):
        self.api_revision()["metadata"]["labels"]["serving.knative.dev/service"] = "other"
        self.rejection("Revision service linkage mismatch")

    def test_revision_not_ready(self):
        self.api_revision()["status"]["conditions"][0]["status"] = "False"
        self.rejection("Revision is not Ready")

    def test_revision_identity_mismatch(self):
        self.api_revision()["spec"]["serviceAccountName"] = collector.SCANNER_IDENTITY
        self.rejection("Revision identity mismatch")

    def test_bad_revision_digest_never_borrows_requested_tag(self):
        for digest in (None, "sha256:" + "a" * 64, "api:latest", SECRET,
                       f"us-central1-docker.pkg.dev/foreign/drts/api@sha256:" + "a" * 64,
                       f"us-central1-docker.pkg.dev/{collector.PROJECT}/drts/foreign@sha256:" + "a" * 64,
                       f"us-central1-docker.pkg.dev/{collector.PROJECT}/drts/api@sha256:" + "a" * 63):
            self.api_revision()["status"]["imageDigest"] = digest
            with self.subTest(digest=digest):
                self.rejection("Revision image is not a current-project immutable digest")

    def test_revision_requested_reference_mismatch(self):
        self.api_revision()["spec"]["containers"][0]["image"] = (
            f"us-central1-docker.pkg.dev/{collector.PROJECT}/drts/api:different")
        self.rejection("Revision requested image mismatch")

    def test_revision_container_inventory_mismatch(self):
        for action in (lambda spec: spec["containers"].clear(),
                       lambda spec: spec["containers"].append(copy.deepcopy(spec["containers"][0]))):
            original = copy.deepcopy(self.api_revision()["spec"])
            action(self.api_revision()["spec"])
            self.rejection("Revision container inventory mismatch")
            self.api_revision()["spec"] = original

    def test_explicit_resolved_revision_reference_must_match_status_digest(self):
        container = self.api_revision()["spec"]["containers"][0]
        container["image"] = self.api_revision()["status"]["imageDigest"]
        self.run_collector()
        self.api_revision()["status"]["imageDigest"] = container["image"][:-64] + "c" * 64
        self.rejection("Revision resolved digest mismatch")

    def test_scanner_two_container_resolved_digest_inventory(self):
        revision = self.revisions[self.documents["drts-dev-scanner"]["status"]["latestReadyRevisionName"]]
        revision["status"]["containerStatuses"] = [
            {"name": c["name"], "imageDigest": c["image"]} for c in revision["spec"]["containers"]]
        result = self.run_collector()
        self.assertEqual(set(result["services"]["drts-dev-scanner"]["images"]), {"gateway", "clamd"})
        revision["status"]["containerStatuses"].pop()
        self.rejection("Partial revision container digest inventory")

    def test_duplicate_service_container_does_not_collapse_inventory(self):
        containers = self.documents["drts-dev-api"]["spec"]["template"]["spec"]["containers"]
        containers.append(copy.deepcopy(containers[0]))
        self.rejection("Service container inventory mismatch")

    def test_service_requested_digest_bound_to_actual_revision_digest(self):
        original = self.api_revision()["status"]["imageDigest"]
        self.documents["drts-dev-api"]["spec"]["template"]["spec"]["containers"][0]["image"] = original
        self.api_revision()["spec"]["containers"][0]["image"] = original[:-64] + "d" * 64
        self.api_revision()["status"]["imageDigest"] = original[:-64] + "d" * 64
        self.rejection("Service requested digest differs from ready revision")

    def test_actual_unnamed_single_container_inventory_shape(self):
        self.documents["drts-dev-api"]["spec"]["template"]["spec"]["containers"][0].pop("name")
        self.api_revision()["spec"]["containers"][0].pop("name")
        result = self.run_collector()
        self.assertEqual(set(result["services"]["drts-dev-api"]["images"]), {"0"})

    def test_multi_scanner_immutable_revision_refs_without_legacy_primary_status(self):
        revision = self.revisions[self.documents["drts-dev-scanner"]["status"]["latestReadyRevisionName"]]
        revision["status"].pop("imageDigest")
        result = self.run_collector()
        self.assertEqual(result["services"]["drts-dev-scanner"]["images"],
                         {c["name"]: c["image"] for c in revision["spec"]["containers"]})
        revision["spec"]["containers"][0]["image"] = "gateway:latest"
        self.rejection("Revision requested image mismatch")

    def test_scanner_secondary_mutable_image_not_accepted(self):
        revision = self.revisions[self.documents["drts-dev-scanner"]["status"]["latestReadyRevisionName"]]
        revision["spec"]["containers"][1]["image"] = "clamd:latest"
        self.rejection("Revision requested image mismatch")

    def test_conflicting_primary_digests_rejected(self):
        revision = self.api_revision()
        revision["status"]["containerStatuses"] = [{"name": "app", "imageDigest":
            revision["status"]["imageDigest"][:-64] + "b" * 64}]
        self.rejection("Conflicting revision digests")

    def test_partial_revision_read_does_not_create_complete_snapshot(self):
        original_run = self.external_run
        def fail(command, **kwargs):
            if command[2] == "revisions":
                raise subprocess.CalledProcessError(1, command, stderr=SECRET)
            return original_run(command, **kwargs)
        with patch.object(collector.subprocess, "run", fail):
            with self.assertRaisesRegex(ValueError, "Control-plane read failed") as caught:
                collector.collect(SHA, DEFINITION)
        self.assertNotIn(SECRET, str(caught.exception))
        self.assertEqual(len(self.calls), 2)

    def test_workflow_manual_immutable_existing_wif_and_full_ci_contract(self):
        text = (ROOT / ".github/workflows/ci-integ.yml").read_text()
        metadata = text.split("  readonly-dev-metadata:", 1)[1].split("  # Owner checkpoints", 1)[0]
        self.assertIn("if: github.event_name == 'workflow_dispatch' && inputs.readonly_dev_metadata == true", metadata)
        self.assertIn('[[ "$EXPECTED_DEFINITION_SHA" == "$GITHUB_SHA" ]]', metadata)
        self.assertLess(metadata.index("Validate immutable"), metadata.index("google-github-actions/auth@v2"))
        self.assertLess(metadata.index("Verify actual checkout"), metadata.index("google-github-actions/auth@v2"))
        self.assertIn("secrets.DEV_WIF_PROVIDER", metadata)
        self.assertIn("secrets.DEV_WIF_SERVICE_ACCOUNT", metadata)
        self.assertNotIn("add-iam", metadata)
        self.assertNotIn("gcloud auth login", metadata)
        candidate = text.split("  candidate:", 1)[1].split("  # One fail-safe", 1)[0]
        self.assertNotIn("readonly_dev_metadata", candidate)
        self.assertIn('echo "run_full_ci=true"', candidate)
        self.assertIn("python3 -m unittest tools/ci/test_dev_cloud_metadata_preflight.py", text)


if __name__ == "__main__":
    unittest.main()
