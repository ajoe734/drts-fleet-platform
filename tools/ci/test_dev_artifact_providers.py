"""Offline deployment resolver, provisioning-helper and workflow-wiring
regressions. No servers/cloud: every gcloud/deploy call is mocked."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "dev_artifact_providers", ROOT / "operations/deployment/resolve-dev-artifact-providers.py"
)
resolver = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(resolver)
PREFIX = "drts-dev"

PROVISION_SPEC = importlib.util.spec_from_file_location(
    "provision_dev_artifact_backends",
    ROOT / "operations/deployment/provision-dev-artifact-backends.py",
)
provisioner = importlib.util.module_from_spec(PROVISION_SPEC)
PROVISION_SPEC.loader.exec_module(provisioner)


def s3(prefix="REMITTANCE_PROOF"):
    return {f"DEV_{prefix}_STORAGE_PROVIDER": "s3", f"DEV_{prefix}_S3_BUCKET": "private-unit-artifacts",
            f"DEV_{prefix}_S3_REGION": "us-east-1"}


class DevArtifactProvidersTest(unittest.TestCase):
    def test_absent_is_explicitly_unprovisioned(self):
        env, mounts = resolver.resolve({}, PREFIX)
        self.assertEqual(env, {"REMITTANCE_PROOF_STORAGE_PROVIDER": "unprovisioned",
                               "DOCUMENT_ARTIFACT_STORAGE_PROVIDER": "unprovisioned",
                               "REMITTANCE_PROOF_SCANNER_PROVIDER": "unprovisioned"})
        self.assertEqual(mounts, {})

    def test_both_storage_namespaces_mount_only_references(self):
        env, mounts = resolver.resolve(s3() | s3("DOCUMENT_ARTIFACT"), PREFIX)
        for prefix in ("REMITTANCE_PROOF", "DOCUMENT_ARTIFACT"):
            self.assertEqual(env[prefix + "_STORAGE_PROVIDER"], "s3")
            self.assertEqual(env[prefix + "_S3_FORCE_PATH_STYLE"], "false")
            for suffix in ("ACCESS_KEY_ID", "SECRET_ACCESS_KEY"):
                name = prefix + "_S3_" + suffix
                self.assertNotIn(name, env)
                self.assertEqual(mounts[name], "drts-dev-" + name.lower().replace("_", "-"))
        self.assertEqual(len(mounts), 4)

    def test_explicit_endpoint_and_token(self):
        env, mounts = resolver.resolve(s3() | {
            "DEV_REMITTANCE_PROOF_S3_ENDPOINT": "https://objects.example.invalid:9443/s3",
            "DEV_REMITTANCE_PROOF_S3_FORCE_PATH_STYLE": "true",
            "DEV_REMITTANCE_PROOF_S3_SESSION_TOKEN_ENABLED": "true",
        }, PREFIX)
        self.assertEqual(env["REMITTANCE_PROOF_S3_FORCE_PATH_STYLE"], "true")
        self.assertEqual(env["REMITTANCE_PROOF_S3_ENDPOINT"], "https://objects.example.invalid:9443/s3")
        self.assertIn("REMITTANCE_PROOF_S3_SESSION_TOKEN", mounts)

    def test_default_chain_requires_explicit_opt_in(self):
        env, mounts = resolver.resolve(s3() | {"DEV_REMITTANCE_PROOF_S3_AUTH_MODE": "default-chain"}, PREFIX)
        self.assertEqual(mounts, {})
        self.assertNotIn("REMITTANCE_PROOF_S3_AUTH_MODE", env)
        with self.assertRaises(resolver.ConfigurationError):
            resolver.resolve(s3() | {"DEV_REMITTANCE_PROOF_S3_AUTH_MODE": "default-chain",
                                    "DEV_REMITTANCE_PROOF_S3_SESSION_TOKEN_ENABLED": "true"}, PREFIX)

    def test_scanner_defaults_and_explicit_overrides(self):
        for values in ({}, {"PORT": "4321", "TLS": "false", "TIMEOUT_MS": "60000"}):
            with self.subTest(values=values):
                settings = s3() | {"DEV_REMITTANCE_PROOF_SCANNER_PROVIDER": "clamd",
                                   "DEV_REMITTANCE_PROOF_CLAMD_HOST": "scanner.internal"}
                settings.update({"DEV_REMITTANCE_PROOF_CLAMD_" + k: v for k, v in values.items()})
                env, _ = resolver.resolve(settings, PREFIX)
                for key, default in (("PORT", "3310"), ("TLS", "true"), ("TIMEOUT_MS", "15000")):
                    self.assertEqual(env["REMITTANCE_PROOF_CLAMD_" + key], values.get(key, default))

    def test_partial_config_and_unsupported_providers_fail(self):
        cases = [
            {"DEV_REMITTANCE_PROOF_S3_BUCKET": "unit-bucket"},
            {"DEV_DOCUMENT_ARTIFACT_S3_REGION": "us-east-1"},
            {"DEV_REMITTANCE_PROOF_CLAMD_HOST": "scanner.internal"},
            {"DEV_REMITTANCE_PROOF_STORAGE_PROVIDER": "memory"},
            {"DEV_DOCUMENT_ARTIFACT_STORAGE_PROVIDER": "memory"},
            {"DEV_DOCUMENT_ARTIFACT_STORAGE_PROVIDER": "s3"},
            {"DEV_REMITTANCE_PROOF_SCANNER_PROVIDER": "clamd"},
            s3() | {"DEV_REMITTANCE_PROOF_SCANNER_PROVIDER": "eicar"},
            s3() | {"DEV_REMITTANCE_PROOF_S3_REGION": ""},
            s3() | {"DEV_REMITTANCE_PROOF_S3_FORCE_PATH_STYLE": "yes"},
            s3() | {"DEV_REMITTANCE_PROOF_S3_AUTH_MODE": "auto"},
            s3() | {"DEV_REMITTANCE_PROOF_S3_SESSION_TOKEN_ENABLED": "yes"},
            {"DEV_DOCUMENT_ARTIFACT_STORAGE_PROVIDRE": "s3"},
        ]
        for values in cases:
            with self.subTest(values=values), self.assertRaises(resolver.ConfigurationError):
                resolver.resolve(values, PREFIX)

    def test_endpoint_and_output_injection_denied(self):
        for endpoint in ("http://objects.invalid", "https://user:pass@objects.invalid", "https://objects.invalid/?key=value",
                         "https://objects.invalid/#frag", "https://", "https://host:bad", "https://host/ white",
                         "https://host/@EVIL=true", "https://host/$(id)", "https://host/`id`", 'https://host/"',
                         "https://host/\nsecret_suffix=evil", "https://host/\\", "https://host/,evil"):
            with self.subTest(endpoint=endpoint), self.assertRaises(resolver.ConfigurationError):
                resolver.resolve(s3() | {"DEV_REMITTANCE_PROOF_S3_ENDPOINT": endpoint}, PREFIX)

    def test_invalid_bucket_region_and_scalar_types(self):
        for key, value in (("BUCKET", "bad bucket"), ("BUCKET", "$(id)"), ("REGION", "us-east-1@EVIL=true"),
                           ("REGION", "x\ny"), ("BUCKET", 123)):
            with self.subTest(key=key, value=value), self.assertRaises(resolver.ConfigurationError):
                resolver.resolve(s3() | {"DEV_REMITTANCE_PROOF_S3_" + key: value}, PREFIX)
        with self.assertRaises(resolver.ConfigurationError):
            resolver.resolve({}, "invalid,prefix")

    def test_plain_credentials_are_never_accepted(self):
        for prefix in ("REMITTANCE_PROOF", "DOCUMENT_ARTIFACT"):
            for name in ("ACCESS_KEY_ID", "SECRET_ACCESS_KEY", "SESSION_TOKEN"):
                with self.subTest(prefix=prefix, name=name), self.assertRaises(resolver.ConfigurationError) as error:
                    resolver.resolve(s3(prefix) | {f"DEV_{prefix}_S3_{name}": "never-echo-secret"}, PREFIX)
                self.assertNotIn("never-echo-secret", str(error.exception))

    def test_scanner_invalid_ranges_and_missing_host(self):
        base = s3() | {"DEV_REMITTANCE_PROOF_SCANNER_PROVIDER": "clamd", "DEV_REMITTANCE_PROOF_CLAMD_HOST": "scanner.internal"}
        for key, value in (("HOST", ""), ("HOST", "https://host"), ("PORT", "0"), ("PORT", "65536"), ("PORT", "3.3"),
                           ("PORT", "abc"), ("TIMEOUT_MS", "99"), ("TIMEOUT_MS", "60001"), ("TLS", "yes")):
            with self.subTest(key=key, value=value), self.assertRaises(resolver.ConfigurationError):
                resolver.resolve(base | {"DEV_REMITTANCE_PROOF_CLAMD_" + key: value}, PREFIX)

    def run_cli(self, variables, secret_error=None):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "output"
            output.write_text("existing=value\n")
            with patch.dict(os.environ, {"DEV_PROVIDER_CONFIG_JSON": json.dumps(variables)}), \
                 patch("sys.argv", ["resolver", "--project", "drts-dev-unit", "--secret-prefix", PREFIX,
                                    "--github-output", str(output)]), \
                 patch.object(resolver, "check_secret", side_effect=secret_error) as check, \
                 contextlib.redirect_stdout(io.StringIO()):
                code = resolver.main()
            return code, output.read_text(), check.call_args_list

    def test_cli_absent_configuration_never_contacts_cloud(self):
        code, output, calls = self.run_cli({})
        self.assertEqual(code, 0)
        self.assertEqual(calls, [])
        self.assertIn("REMITTANCE_PROOF_STORAGE_PROVIDER=unprovisioned", output)
        self.assertIn("secret_suffix=\n", output)

    def test_cli_complete_config_validates_secret_pair_and_emits_suffixes(self):
        code, output, calls = self.run_cli(s3())
        self.assertEqual(code, 0)
        self.assertEqual(len(calls), 2)
        self.assertIn("env_suffix=@REMITTANCE_PROOF_STORAGE_PROVIDER=s3", output)
        self.assertIn("secret_suffix=,REMITTANCE_PROOF_S3_ACCESS_KEY_ID=drts-dev-remittance-proof-s3-access-key-id:latest", output)
        self.assertIn(",REMITTANCE_PROOF_S3_SECRET_ACCESS_KEY=drts-dev-remittance-proof-s3-secret-access-key:latest", output)

    def test_cli_missing_secret_never_publishes_partial_outputs(self):
        for side_effect in ([None, resolver.ConfigurationError("missing pair member")], resolver.ConfigurationError("missing")):
            code, output, _ = self.run_cli(s3(), side_effect)
            self.assertEqual(code, 1)
            self.assertEqual(output, "existing=value\n")

    def test_cli_invalid_config_validates_before_any_cloud_calls(self):
        code, output, calls = self.run_cli(s3() | {"DEV_REMITTANCE_PROOF_SCANNER_PROVIDER": "clamd"})
        self.assertEqual(code, 1)
        self.assertEqual(output, "existing=value\n")
        self.assertEqual(calls, [])

    def test_cloud_boundary_describes_metadata_only_and_fails_closed(self):
        with patch.object(resolver.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, "projects/unit/secrets/name\n")) as run:
            resolver.check_secret("project", "name")
            self.assertEqual(run.call_args.args[0], ["gcloud", "secrets", "describe", "name", "--project", "project", "--format=value(name)"])
            self.assertEqual(run.call_args.kwargs["timeout"], 30)
            self.assertNotIn("shell", run.call_args.kwargs)
        for outcome in (subprocess.CompletedProcess([], 1, "", "sensitive stderr"), subprocess.CompletedProcess([], 0, "")):
            with patch.object(resolver.subprocess, "run", return_value=outcome), self.assertRaises(resolver.ConfigurationError) as error:
                resolver.check_secret("project", "name")
            self.assertNotIn("sensitive", str(error.exception))
        for exception in (OSError("absent"), subprocess.TimeoutExpired("gcloud", 30)):
            with patch.object(resolver.subprocess, "run", side_effect=exception), self.assertRaises(resolver.ConfigurationError):
                resolver.check_secret("project", "name")

    def test_gcs_storage_configuration_both_namespaces(self):
        env, mounts = resolver.resolve({
            "DEV_REMITTANCE_PROOF_STORAGE_PROVIDER": "gcs",
            "DEV_REMITTANCE_PROOF_GCS_BUCKET": "drts-dev-devcc-20260825-remittance-proofs",
            "DEV_DOCUMENT_ARTIFACT_STORAGE_PROVIDER": "gcs",
            "DEV_DOCUMENT_ARTIFACT_GCS_BUCKET": "drts-dev-devcc-20260825-document-artifacts",
        }, PREFIX)
        self.assertEqual(env["REMITTANCE_PROOF_STORAGE_PROVIDER"], "gcs")
        self.assertEqual(env["REMITTANCE_PROOF_GCS_BUCKET"], "drts-dev-devcc-20260825-remittance-proofs")
        self.assertEqual(env["DOCUMENT_ARTIFACT_STORAGE_PROVIDER"], "gcs")
        self.assertEqual(env["DOCUMENT_ARTIFACT_GCS_BUCKET"], "drts-dev-devcc-20260825-document-artifacts")
        # GCS auth is the ambient Cloud Run metadata identity: no secret mounts.
        self.assertEqual(mounts, {})

    def test_gcs_rejects_s3_fields_and_invalid_bucket(self):
        cases = [
            {"DEV_REMITTANCE_PROOF_STORAGE_PROVIDER": "gcs"},
            {"DEV_REMITTANCE_PROOF_STORAGE_PROVIDER": "gcs", "DEV_REMITTANCE_PROOF_GCS_BUCKET": "ba"},
            {"DEV_REMITTANCE_PROOF_STORAGE_PROVIDER": "gcs", "DEV_REMITTANCE_PROOF_GCS_BUCKET": "$(id)"},
            {"DEV_REMITTANCE_PROOF_STORAGE_PROVIDER": "gcs", "DEV_REMITTANCE_PROOF_GCS_BUCKET": "valid-bucket-name",
             "DEV_REMITTANCE_PROOF_S3_REGION": "us-east-1"},
            {"DEV_REMITTANCE_PROOF_GCS_BUCKET": "valid-bucket-name"},
        ]
        for values in cases:
            with self.subTest(values=values), self.assertRaises(resolver.ConfigurationError):
                resolver.resolve(values, PREFIX)

    def test_cloud_run_clamd_scanner_defaults_and_overrides(self):
        base = {
            "DEV_REMITTANCE_PROOF_STORAGE_PROVIDER": "gcs",
            "DEV_REMITTANCE_PROOF_GCS_BUCKET": "drts-dev-devcc-20260825-remittance-proofs",
            "DEV_REMITTANCE_PROOF_SCANNER_PROVIDER": "cloud-run-clamd",
            "DEV_REMITTANCE_PROOF_SCANNER_URL": "https://drts-dev-artifact-scanner-abc123-uc.a.run.app",
        }
        env, mounts = resolver.resolve(base, PREFIX)
        self.assertEqual(env["REMITTANCE_PROOF_SCANNER_PROVIDER"], "cloud-run-clamd")
        self.assertEqual(env["REMITTANCE_PROOF_SCANNER_URL"], base["DEV_REMITTANCE_PROOF_SCANNER_URL"])
        self.assertEqual(env["REMITTANCE_PROOF_SCANNER_TIMEOUT_MS"], "60000")
        self.assertEqual(mounts, {})
        env, _ = resolver.resolve(base | {"DEV_REMITTANCE_PROOF_SCANNER_TIMEOUT_MS": "30000"}, PREFIX)
        self.assertEqual(env["REMITTANCE_PROOF_SCANNER_TIMEOUT_MS"], "30000")
        # s3 proof storage also satisfies the "configured storage" requirement.
        env, _ = resolver.resolve(s3() | {
            "DEV_REMITTANCE_PROOF_SCANNER_PROVIDER": "cloud-run-clamd",
            "DEV_REMITTANCE_PROOF_SCANNER_URL": base["DEV_REMITTANCE_PROOF_SCANNER_URL"],
        }, PREFIX)
        self.assertEqual(env["REMITTANCE_PROOF_SCANNER_PROVIDER"], "cloud-run-clamd")

    def test_cloud_run_clamd_requires_storage_and_rejects_clamd_fields(self):
        cases = [
            {"DEV_REMITTANCE_PROOF_SCANNER_PROVIDER": "cloud-run-clamd",
             "DEV_REMITTANCE_PROOF_SCANNER_URL": "https://scanner.invalid"},
            {"DEV_REMITTANCE_PROOF_STORAGE_PROVIDER": "gcs", "DEV_REMITTANCE_PROOF_GCS_BUCKET": "valid-bucket-name",
             "DEV_REMITTANCE_PROOF_SCANNER_PROVIDER": "cloud-run-clamd"},
            {"DEV_REMITTANCE_PROOF_STORAGE_PROVIDER": "gcs", "DEV_REMITTANCE_PROOF_GCS_BUCKET": "valid-bucket-name",
             "DEV_REMITTANCE_PROOF_SCANNER_PROVIDER": "cloud-run-clamd",
             "DEV_REMITTANCE_PROOF_SCANNER_URL": "https://scanner.invalid",
             "DEV_REMITTANCE_PROOF_CLAMD_HOST": "scanner.internal"},
            {"DEV_REMITTANCE_PROOF_STORAGE_PROVIDER": "gcs", "DEV_REMITTANCE_PROOF_GCS_BUCKET": "valid-bucket-name",
             "DEV_REMITTANCE_PROOF_SCANNER_PROVIDER": "clamd",
             "DEV_REMITTANCE_PROOF_SCANNER_URL": "https://scanner.invalid"},
        ]
        for values in cases:
            with self.subTest(values=values), self.assertRaises(resolver.ConfigurationError):
                resolver.resolve(values, PREFIX)

    def test_cloud_run_clamd_url_must_be_exact_root_origin(self):
        base = {
            "DEV_REMITTANCE_PROOF_STORAGE_PROVIDER": "gcs",
            "DEV_REMITTANCE_PROOF_GCS_BUCKET": "valid-bucket-name",
            "DEV_REMITTANCE_PROOF_SCANNER_PROVIDER": "cloud-run-clamd",
        }
        for url in ("http://scanner.invalid", "https://user:pass@scanner.invalid",
                    "https://scanner.invalid/path", "https://scanner.invalid?x=1",
                    "https://scanner.invalid#frag", "https://", "https://scanner.invalid/\nevil=true",
                    "https://scanner invalid"):
            with self.subTest(url=url), self.assertRaises(resolver.ConfigurationError):
                resolver.resolve(base | {"DEV_REMITTANCE_PROOF_SCANNER_URL": url}, PREFIX)
        for url in ("https://scanner.invalid", "https://scanner.invalid/"):
            env, _ = resolver.resolve(base | {"DEV_REMITTANCE_PROOF_SCANNER_URL": url}, PREFIX)
            self.assertEqual(env["REMITTANCE_PROOF_SCANNER_URL"], url)

    def test_workflow_wires_outputs_into_existing_api_arguments_only(self):
        workflow = (ROOT / ".github/workflows/deploy-dev.yml").read_text()
        self.assertIn("DEV_PROVIDER_CONFIG_JSON: ${{ toJSON(vars) }}", workflow)
        self.assertIn("python3 operations/deployment/resolve-dev-artifact-providers.py", workflow)
        self.assertLess(workflow.index("id: artifact_providers"), workflow.index("id: api_secrets"))
        self.assertIn("ARTIFACT_PROVIDER_SECRET_SUFFIX: ${{ steps.artifact_providers.outputs.secret_suffix }}", workflow)
        self.assertIn('secret_args="${secret_args}${ARTIFACT_PROVIDER_SECRET_SUFFIX}"', workflow)
        self.assertIn("ARTIFACT_PROVIDER_ENV_SUFFIX: ${{ steps.artifact_providers.outputs.env_suffix }}", workflow)
        self.assertIn('env_vars="${env_vars}${ARTIFACT_PROVIDER_ENV_SUFFIX}"', workflow)
        api = workflow.split("      - name: Deploy — api\n", 1)[1].split("      - name: Resolve API URL\n", 1)[0]
        self.assertIn('--set-secrets "${{ steps.api_secrets.outputs.api }}"', api)
        self.assertIn('--set-env-vars "${{ steps.api_env.outputs.vars }}"', api)
        self.assertIn("WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS", workflow)
        self.assertIn("NOTIFICATION_OUTBOX_TYPE=postgres", workflow)
        for ci in ("ci.yml", "ci-integ.yml"):
            self.assertIn("python3 -m unittest tools/ci/test_dev_artifact_providers.py", (ROOT / ".github/workflows" / ci).read_text())


GOOD_ARGS = [
    "--project", "drts-dev-devcc-20260825",
    "--region", "us-central1",
    "--document-bucket", "drts-dev-devcc-20260825-document-artifacts",
    "--remittance-bucket", "drts-dev-devcc-20260825-remittance-proofs",
    "--runtime-service-account", "drts-dev-runtime@drts-dev-devcc-20260825.iam.gserviceaccount.com",
    "--scanner-service", "drts-dev-artifact-scanner",
    "--scanner-service-account", "drts-dev-artifact-scanner@drts-dev-devcc-20260825.iam.gserviceaccount.com",
    "--gateway-image", "us-central1-docker.pkg.dev/drts-dev-devcc-20260825/drts/artifact-scanner-gateway@sha256:" + "a" * 64,
    "--clamd-image", "us-central1-docker.pkg.dev/drts-dev-devcc-20260825/drts/artifact-scanner-clamd@sha256:" + "b" * 64,
    "--invoker-member", "drts-dev-runtime@drts-dev-devcc-20260825.iam.gserviceaccount.com",
]
GOOD_PROJECT_NUMBER = "123456789012"
GOOD_REGION = "us-central1"


def _owned_bucket_json(project_number=GOOD_PROJECT_NUMBER, region=GOOD_REGION):
    # Matches the real `gcloud storage buckets describe --raw
    # --format=json(name,location,projectNumber)` shape against the
    # installed SDK (589.0.0 / google-cloud-cli 503): camelCase
    # `projectNumber`, confirmed by a real call-through of
    # `googlecloudsdk.command_lib.storage.resources.resource_util
    # .get_display_dict_for_resource(..., display_raw_keys=True)` and
    # `resource_printer.Print` against a real `storage_v1_messages.Bucket`.
    # The non-raw/display projection used before this fix (R9 round 2) never
    # carries this field under any name.
    return json.dumps({"location": region.upper(), "name": "irrelevant-for-this-fixture",
                        "projectNumber": project_number})


def _good_provisioning_side_effect(args, **kwargs):
    """Every call succeeds and every bucket already exists under the
    correct project/location -- used by tests that only care that no
    unexpected (e.g. Secret Manager) call is ever made, not the
    create-vs-update branch."""
    if args[:3] == ["gcloud", "projects", "describe"]:
        return subprocess.CompletedProcess(args, 0, GOOD_PROJECT_NUMBER + "\n")
    if args[:4] == ["gcloud", "storage", "buckets", "describe"]:
        if "--format=value(versioning_enabled)" in args:
            return subprocess.CompletedProcess(args, 0, "True\n")
        return subprocess.CompletedProcess(args, 0, _owned_bucket_json())
    if args[:4] == ["gcloud", "run", "services", "get-iam-policy"]:
        return subprocess.CompletedProcess(args, 0, json.dumps({"bindings": []}))
    return subprocess.CompletedProcess(args, 0, "")


class DevArtifactBackendsProvisioningTest(unittest.TestCase):
    """operations/deployment/provision-dev-artifact-backends.py: every
    gcloud/deploy call is mocked at the subprocess boundary; no real
    bucket, IAM binding or Cloud Run service is ever touched."""

    @staticmethod
    def never_called(*args, **kwargs):
        raise AssertionError(f"unexpected subprocess call: {args!r}")

    def run_main(self, argv, run_side_effect):
        with patch.object(provisioner.subprocess, "run", side_effect=run_side_effect) as run, \
             patch("sys.argv", ["provision", *argv]), \
             contextlib.redirect_stdout(io.StringIO()) as out, \
             contextlib.redirect_stderr(io.StringIO()) as err:
            code = provisioner.main()
        return code, out.getvalue() + err.getvalue(), run.call_args_list

    def test_success_creates_missing_bucket_updates_existing_deploys_and_grants_invoker(self):
        def side_effect(args, **kwargs):
            if args[:3] == ["gcloud", "projects", "describe"]:
                return subprocess.CompletedProcess(args, 0, GOOD_PROJECT_NUMBER + "\n")
            if args[:4] == ["gcloud", "storage", "buckets", "describe"]:
                if "--format=value(versioning_enabled)" in args:
                    return subprocess.CompletedProcess(args, 0, "True\n")
                if "document-artifacts" in args[4]:
                    return subprocess.CompletedProcess(args, 1, "", "not found")
                return subprocess.CompletedProcess(args, 0, _owned_bucket_json())
            if args[:4] == ["gcloud", "run", "services", "get-iam-policy"]:
                return subprocess.CompletedProcess(args, 0, json.dumps({"bindings": []}))
            return subprocess.CompletedProcess(args, 0, "")

        code, _, calls = self.run_main(GOOD_ARGS, side_effect)
        self.assertEqual(code, 0)
        argvs = [call.args[0] for call in calls]

        self.assertIn(
            ["gcloud", "projects", "describe", "drts-dev-devcc-20260825",
             "--format=value(projectNumber)"],
            argvs,
        )
        self.assertIn(
            ["gcloud", "storage", "buckets", "create", "gs://drts-dev-devcc-20260825-document-artifacts",
             "--project", "drts-dev-devcc-20260825", "--location", "us-central1",
             "--uniform-bucket-level-access", "--public-access-prevention"],
            argvs,
        )
        self.assertNotIn(
            ["gcloud", "storage", "buckets", "create", "gs://drts-dev-devcc-20260825-remittance-proofs",
             "--project", "drts-dev-devcc-20260825", "--location", "us-central1",
             "--uniform-bucket-level-access", "--public-access-prevention"],
            argvs,
        )
        # R9 round 2: the ownership-check describe call must use --raw and
        # request the camelCase `projectNumber` raw API field -- the
        # non-raw display projection never carries a project number under
        # any key, which made every already-existing bucket (e.g. this
        # already-owned remittance-proofs bucket) get wrongly rejected.
        self.assertIn(
            ["gcloud", "storage", "buckets", "describe", "gs://drts-dev-devcc-20260825-remittance-proofs",
             "--project", "drts-dev-devcc-20260825", "--raw",
             "--format=json(name,location,projectNumber)"],
            argvs,
        )
        for bucket in ("drts-dev-devcc-20260825-document-artifacts", "drts-dev-devcc-20260825-remittance-proofs"):
            # --versioning is only ever on the update call -- `buckets create`
            # does not accept it (R2).
            self.assertIn(
                ["gcloud", "storage", "buckets", "update", f"gs://{bucket}",
                 "--project", "drts-dev-devcc-20260825",
                 "--uniform-bucket-level-access", "--public-access-prevention", "--versioning"],
                argvs,
            )
            self.assertIn(
                ["gcloud", "storage", "buckets", "describe", f"gs://{bucket}",
                 "--project", "drts-dev-devcc-20260825", "--format=value(versioning_enabled)"],
                argvs,
            )
            self.assertIn(
                ["gcloud", "storage", "buckets", "add-iam-policy-binding", f"gs://{bucket}",
                 "--project", "drts-dev-devcc-20260825",
                 "--member", "serviceAccount:drts-dev-runtime@drts-dev-devcc-20260825.iam.gserviceaccount.com",
                 "--role", "roles/storage.objectAdmin"],
                argvs,
            )

        deploy_calls = [a for a in argvs if a and a[0] == str(provisioner.DEPLOY_CLOUD_RUN_SERVICE)]
        self.assertEqual(len(deploy_calls), 1)
        deploy_args = deploy_calls[0]
        self.assertIn("--no-allow-unauthenticated", deploy_args)
        self.assertNotIn("--allow-unauthenticated", deploy_args)
        # Invoker IAM checks must be explicitly re-enabled on every deploy,
        # not merely assumed from a prior deployment (R5).
        self.assertIn("--invoker-iam-check", deploy_args)
        self.assertNotIn("--no-invoker-iam-check", deploy_args)
        self.assertEqual(deploy_args.count("--container"), 2)
        self.assertIn("--min-instances", deploy_args)
        self.assertEqual(deploy_args[deploy_args.index("--min-instances") + 1], "0")
        self.assertEqual(deploy_args[deploy_args.index("--max-instances") + 1], "1")
        self.assertEqual(deploy_args[deploy_args.index("--concurrency") + 1], "1")
        # A shared volume carries the readiness marker between the gateway
        # and clamd containers (R4): one volume declared, mounted in both.
        self.assertIn("--add-volume", deploy_args)
        volume_decl = deploy_args[deploy_args.index("--add-volume") + 1]
        self.assertIn("type=in-memory", volume_decl)
        volume_name = dict(part.split("=", 1) for part in volume_decl.split(","))["name"]
        mount_indices = [i for i, a in enumerate(deploy_args) if a == "--add-volume-mount"]
        self.assertEqual(len(mount_indices), 2)
        for i in mount_indices:
            mount = dict(part.split("=", 1) for part in deploy_args[i + 1].split(","))
            self.assertEqual(mount["volume"], volume_name)
            self.assertEqual(mount["mount-path"], "/var/run/clamav-ready")
        # Explicit, bounded memory on both containers -- never the Cloud Run
        # 512MiB default for the signature-loading clamd sidecar (R7).
        memory_indices = [i for i, a in enumerate(deploy_args) if a == "--memory"]
        self.assertEqual(len(memory_indices), 2)
        memory_values = {deploy_args[i + 1] for i in memory_indices}
        self.assertIn("512Mi", memory_values)
        self.assertIn("4Gi", memory_values)

        self.assertIn(
            ["gcloud", "run", "services", "get-iam-policy", "drts-dev-artifact-scanner",
             "--project", "drts-dev-devcc-20260825", "--region", "us-central1", "--format=json"],
            argvs,
        )
        self.assertIn(
            ["gcloud", "run", "services", "add-iam-policy-binding", "drts-dev-artifact-scanner",
             "--project", "drts-dev-devcc-20260825", "--region", "us-central1",
             "--member", "serviceAccount:drts-dev-runtime@drts-dev-devcc-20260825.iam.gserviceaccount.com",
             "--role", "roles/run.invoker", "--condition=None"],
            argvs,
        )
        # The scanner's own identity never appears as a storage.objectAdmin member.
        for a in argvs:
            if a[:4] == ["gcloud", "storage", "buckets", "add-iam-policy-binding"]:
                self.assertNotIn("drts-dev-artifact-scanner@drts-dev-devcc-20260825.iam.gserviceaccount.com", a)

    def test_versioning_not_confirmed_fails_closed(self):
        def side_effect(args, **kwargs):
            if args[:3] == ["gcloud", "projects", "describe"]:
                return subprocess.CompletedProcess(args, 0, GOOD_PROJECT_NUMBER + "\n")
            if args[:4] == ["gcloud", "storage", "buckets", "describe"]:
                if "--format=value(versioning_enabled)" in args:
                    return subprocess.CompletedProcess(args, 0, "False\n")
                return subprocess.CompletedProcess(args, 0, _owned_bucket_json())
            return subprocess.CompletedProcess(args, 0, "")

        code, output, calls = self.run_main(GOOD_ARGS, side_effect)
        self.assertEqual(code, 1)
        self.assertIn("Versioning not confirmed enabled", output)
        self.assertFalse(any(
            call.args[0] and call.args[0][0] == str(provisioner.DEPLOY_CLOUD_RUN_SERVICE)
            for call in calls
        ))

    def test_existing_bucket_location_mismatch_rejected_before_any_mutation(self):
        def side_effect(args, **kwargs):
            if args[:3] == ["gcloud", "projects", "describe"]:
                return subprocess.CompletedProcess(args, 0, GOOD_PROJECT_NUMBER + "\n")
            if args[:4] == ["gcloud", "storage", "buckets", "describe"]:
                return subprocess.CompletedProcess(args, 0, _owned_bucket_json(region="europe-west1"))
            raise AssertionError(f"unexpected call after ownership mismatch: {args}")

        code, output, calls = self.run_main(GOOD_ARGS, side_effect)
        self.assertEqual(code, 1)
        self.assertIn("Refusing to reuse", output)
        self.assertFalse(any(
            call.args[0][:4] in (
                ["gcloud", "storage", "buckets", "update"],
                ["gcloud", "storage", "buckets", "add-iam-policy-binding"],
            )
            for call in calls
        ))

    def test_existing_bucket_project_mismatch_rejected_before_any_mutation(self):
        def side_effect(args, **kwargs):
            if args[:3] == ["gcloud", "projects", "describe"]:
                return subprocess.CompletedProcess(args, 0, GOOD_PROJECT_NUMBER + "\n")
            if args[:4] == ["gcloud", "storage", "buckets", "describe"]:
                return subprocess.CompletedProcess(args, 0, _owned_bucket_json(project_number="999999999999"))
            raise AssertionError(f"unexpected call after ownership mismatch: {args}")

        code, output, calls = self.run_main(GOOD_ARGS, side_effect)
        self.assertEqual(code, 1)
        self.assertIn("Refusing to reuse", output)
        self.assertFalse(any(
            call.args[0][:4] in (
                ["gcloud", "storage", "buckets", "update"],
                ["gcloud", "storage", "buckets", "add-iam-policy-binding"],
            )
            for call in calls
        ))

    def test_reconcile_removes_stray_invoker_members_before_granting_desired(self):
        stray_public = "allUsers"
        stray_sa = "serviceAccount:old-caller@drts-dev-devcc-20260825.iam.gserviceaccount.com"
        # R5 round 2: an unauthorized invoker under a real IAM condition --
        # the exact shape (`expression=true`) the review reproduced against
        # the real SDK's RemoveBindingFromIamPolicyWithCondition, which
        # raises IamPolicyBindingIncompleteError in noninteractive mode
        # unless the removal call passes `--all` or `--condition`.
        stray_conditional_sa = "serviceAccount:old-conditional@drts-dev-devcc-20260825.iam.gserviceaccount.com"
        desired_sa = "serviceAccount:drts-dev-runtime@drts-dev-devcc-20260825.iam.gserviceaccount.com"

        def side_effect(args, **kwargs):
            if args[:3] == ["gcloud", "projects", "describe"]:
                return subprocess.CompletedProcess(args, 0, GOOD_PROJECT_NUMBER + "\n")
            if args[:4] == ["gcloud", "storage", "buckets", "describe"]:
                if "--format=value(versioning_enabled)" in args:
                    return subprocess.CompletedProcess(args, 0, "True\n")
                return subprocess.CompletedProcess(args, 0, _owned_bucket_json())
            if args[:4] == ["gcloud", "run", "services", "get-iam-policy"]:
                return subprocess.CompletedProcess(args, 0, json.dumps({
                    "bindings": [
                        {"role": "roles/run.invoker", "members": [stray_public, stray_sa]},
                        {"role": "roles/run.invoker", "members": [stray_conditional_sa],
                         "condition": {"expression": "true", "title": "legacy"}},
                        # An unrelated conditional binding on a different role
                        # must never be touched by invoker reconciliation.
                        {"role": "roles/storage.objectViewer", "members": [desired_sa],
                         "condition": {"expression": "true", "title": "unrelated"}},
                        {"role": "roles/run.invoker", "members": [desired_sa]},
                    ],
                }))
            return subprocess.CompletedProcess(args, 0, "")

        code, _, calls = self.run_main(GOOD_ARGS, side_effect)
        self.assertEqual(code, 0)
        argvs = [call.args[0] for call in calls]
        removals = [a for a in argvs if a[:4] == ["gcloud", "run", "services", "remove-iam-policy-binding"]]
        removed_members = {a[a.index("--member") + 1] for a in removals}
        self.assertEqual(removed_members, {stray_public, stray_sa, stray_conditional_sa})
        for a in removals:
            self.assertEqual(a[a.index("--role") + 1], "roles/run.invoker")
            # --all is required on every removal so a conditional stray
            # binding is actually removed instead of raising
            # IamPolicyBindingIncompleteError and leaving it in place (R5
            # round 2) -- it is correct here regardless of whether this
            # particular stray binding happens to carry a condition, since a
            # member outside `desired` has no legitimate invoker grant to
            # keep under any condition.
            self.assertIn("--all", a)
        # The desired member is granted, never removed; the unrelated
        # conditional binding on a different role is never touched.
        grants = [a for a in argvs if a[:4] == ["gcloud", "run", "services", "add-iam-policy-binding"]]
        self.assertEqual(len(grants), 1)
        self.assertEqual(grants[0][grants[0].index("--member") + 1], desired_sa)
        # R5 round 3: the grant must always be explicit about having no
        # condition, since this policy already has a conditional binding
        # elsewhere -- omitting it raises IamPolicyBindingIncompleteError
        # in the real SDK.
        self.assertIn("--condition=None", grants[0])
        self.assertFalse(any(
            a[:4] == ["gcloud", "run", "services", "remove-iam-policy-binding"]
            and a[a.index("--member") + 1] == desired_sa
            for a in argvs
        ))

    def test_reconcile_dedupes_a_member_duplicated_across_mixed_bindings_before_all_removal(self):
        # R5 round 3: the real SDK's `--all` removal
        # (_RemoveBindingFromIamPolicyAllConditions) clears EVERY
        # occurrence of a member/role pair across all bindings in one
        # call -- it does not stop at the first match. A second `--all`
        # call for a member already cleared by an earlier occurrence's
        # call finds nothing left and raises IamPolicyBindingNotFound.
        # This simulator reproduces that exact real-SDK semantic (verified
        # against the installed SDK in RealGcloudSdkIamConditionBehaviorTest
        # below) so the old per-occurrence loop (no dedup) fails this test
        # for the real reason, and a stray member AFTER the duplicate is
        # still proven reachable and removed.
        dup_sa = "serviceAccount:dup-caller@drts-dev-devcc-20260825.iam.gserviceaccount.com"
        trailing_stray_sa = "serviceAccount:trailing-stray@drts-dev-devcc-20260825.iam.gserviceaccount.com"
        desired_sa = "serviceAccount:drts-dev-runtime@drts-dev-devcc-20260825.iam.gserviceaccount.com"
        removed_so_far: set[str] = set()

        def side_effect(args, **kwargs):
            if args[:3] == ["gcloud", "projects", "describe"]:
                return subprocess.CompletedProcess(args, 0, GOOD_PROJECT_NUMBER + "\n")
            if args[:4] == ["gcloud", "storage", "buckets", "describe"]:
                if "--format=value(versioning_enabled)" in args:
                    return subprocess.CompletedProcess(args, 0, "True\n")
                return subprocess.CompletedProcess(args, 0, _owned_bucket_json())
            if args[:4] == ["gcloud", "run", "services", "get-iam-policy"]:
                return subprocess.CompletedProcess(args, 0, json.dumps({
                    "bindings": [
                        # dup_sa appears in BOTH an unconditional binding...
                        {"role": "roles/run.invoker", "members": [dup_sa]},
                        # ...and a conditional one -- a single real --all
                        # removal clears it from both at once.
                        {"role": "roles/run.invoker", "members": [dup_sa],
                         "condition": {"expression": "true", "title": "legacy"}},
                        # A stray listed AFTER the duplicate must still be
                        # reached and removed, proving the loop did not
                        # abort on the (fixed) duplicate.
                        {"role": "roles/run.invoker", "members": [trailing_stray_sa]},
                        {"role": "roles/run.invoker", "members": [desired_sa]},
                    ],
                }))
            if args[:4] == ["gcloud", "run", "services", "remove-iam-policy-binding"]:
                member = args[args.index("--member") + 1]
                if member in removed_so_far:
                    # Faithful to the real SDK: a second --all removal for
                    # an already-cleared member/role finds nothing and
                    # raises IamPolicyBindingNotFound.
                    return subprocess.CompletedProcess(
                        args, 1, "", "IamPolicyBindingNotFound",
                    )
                removed_so_far.add(member)
                return subprocess.CompletedProcess(args, 0, "")
            return subprocess.CompletedProcess(args, 0, "")

        code, output, calls = self.run_main(GOOD_ARGS, side_effect)
        self.assertEqual(code, 0, output)
        argvs = [call.args[0] for call in calls]
        removals = [a for a in argvs if a[:4] == ["gcloud", "run", "services", "remove-iam-policy-binding"]]
        removed_members = [a[a.index("--member") + 1] for a in removals]
        # Exactly one removal call per distinct unauthorized member -- the
        # duplicate across mixed bindings must not generate a second call.
        self.assertEqual(sorted(removed_members), sorted([dup_sa, trailing_stray_sa]))
        self.assertEqual(len(removed_members), len(set(removed_members)))
        grants = [a for a in argvs if a[:4] == ["gcloud", "run", "services", "add-iam-policy-binding"]]
        self.assertEqual(len(grants), 1)
        self.assertEqual(grants[0][grants[0].index("--member") + 1], desired_sa)

    def test_grant_invoker_always_passes_condition_none(self):
        # R5 round 3: the grant call must state --condition=None
        # unconditionally, not only when the current policy happens to
        # already contain a condition -- the real SDK requires it the
        # moment ANY condition exists anywhere in the policy, and this
        # script must never gamble on that being absent.
        def side_effect(args, **kwargs):
            if args[:3] == ["gcloud", "projects", "describe"]:
                return subprocess.CompletedProcess(args, 0, GOOD_PROJECT_NUMBER + "\n")
            if args[:4] == ["gcloud", "storage", "buckets", "describe"]:
                if "--format=value(versioning_enabled)" in args:
                    return subprocess.CompletedProcess(args, 0, "True\n")
                return subprocess.CompletedProcess(args, 0, _owned_bucket_json())
            if args[:4] == ["gcloud", "run", "services", "get-iam-policy"]:
                return subprocess.CompletedProcess(args, 0, json.dumps({"bindings": []}))
            if args[:4] == ["gcloud", "run", "services", "add-iam-policy-binding"]:
                if "--condition=None" not in args:
                    return subprocess.CompletedProcess(args, 1, "", "IamPolicyBindingIncompleteError")
                return subprocess.CompletedProcess(args, 0, "")
            return subprocess.CompletedProcess(args, 0, "")

        code, output, _ = self.run_main(GOOD_ARGS, side_effect)
        self.assertEqual(code, 0, output)

    def test_public_invoker_member_rejected_before_any_cloud_call(self):
        args = [v if v != GOOD_ARGS[GOOD_ARGS.index("--invoker-member") + 1] else "allUsers" for v in GOOD_ARGS]
        code, _, calls = self.run_main(args, self.never_called)
        self.assertEqual(code, 1)
        self.assertEqual(calls, [])

    def test_mutable_image_tag_rejected_before_any_cloud_call(self):
        for flag in ("--gateway-image", "--clamd-image"):
            with self.subTest(flag=flag):
                args = list(GOOD_ARGS)
                args[args.index(flag) + 1] = "us-central1-docker.pkg.dev/project/repo/image:latest"
                code, _, calls = self.run_main(args, self.never_called)
                self.assertEqual(code, 1)
                self.assertEqual(calls, [])

    def test_invalid_names_rejected_before_any_cloud_call(self):
        cases = {
            "--project": "Invalid_Project",
            "--document-bucket": "$(id)",
            "--runtime-service-account": "not-a-service-account",
            "--scanner-service": "Not_A_Service",
            "--invoker-member": "allAuthenticatedUsers",
        }
        for flag, bad_value in cases.items():
            with self.subTest(flag=flag):
                args = list(GOOD_ARGS)
                args[args.index(flag) + 1] = bad_value
                code, _, calls = self.run_main(args, self.never_called)
                self.assertEqual(code, 1)
                self.assertEqual(calls, [])

    def test_bucket_create_failure_stops_before_iam_and_deploy(self):
        def side_effect(args, **kwargs):
            if args[:3] == ["gcloud", "projects", "describe"]:
                return subprocess.CompletedProcess(args, 0, GOOD_PROJECT_NUMBER + "\n")
            if args[:4] == ["gcloud", "storage", "buckets", "describe"]:
                return subprocess.CompletedProcess(args, 1, "", "not found")
            if args[:4] == ["gcloud", "storage", "buckets", "create"]:
                return subprocess.CompletedProcess(args, 1, "", "quota exceeded")
            raise AssertionError(f"unexpected call after bucket create failure: {args}")

        code, output, calls = self.run_main(GOOD_ARGS, side_effect)
        self.assertEqual(code, 1)
        self.assertIn("Failed to create bucket", output)
        kinds = set()
        for call in calls:
            a = call.args[0]
            kinds.add(("gcloud", "projects", "describe") if a[:3] == ["gcloud", "projects", "describe"]
                       else tuple(a[:4]))
        self.assertEqual(
            kinds,
            {
                ("gcloud", "projects", "describe"),
                ("gcloud", "storage", "buckets", "describe"),
                ("gcloud", "storage", "buckets", "create"),
            },
        )

    def test_deploy_failure_stops_before_granting_invoker(self):
        def side_effect(args, **kwargs):
            if args[:3] == ["gcloud", "projects", "describe"]:
                return subprocess.CompletedProcess(args, 0, GOOD_PROJECT_NUMBER + "\n")
            if args[:4] == ["gcloud", "storage", "buckets", "describe"]:
                if "--format=value(versioning_enabled)" in args:
                    return subprocess.CompletedProcess(args, 0, "True\n")
                return subprocess.CompletedProcess(args, 0, _owned_bucket_json())
            if args and args[0] == str(provisioner.DEPLOY_CLOUD_RUN_SERVICE):
                return subprocess.CompletedProcess(args, 1, "", "deploy failed")
            if args[:4] == ["gcloud", "storage", "buckets", "update"] or \
               args[:4] == ["gcloud", "storage", "buckets", "add-iam-policy-binding"]:
                return subprocess.CompletedProcess(args, 0, "")
            raise AssertionError(f"unexpected call after deploy failure: {args}")

        code, output, calls = self.run_main(GOOD_ARGS, side_effect)
        self.assertEqual(code, 1)
        self.assertIn("Scanner Cloud Run deploy failed", output)
        self.assertFalse(any(
            call.args[0][:4] == ["gcloud", "run", "services", "get-iam-policy"] for call in calls
        ))
        self.assertFalse(any(
            call.args[0][:4] == ["gcloud", "run", "services", "add-iam-policy-binding"] for call in calls
        ))

    def test_no_secret_manager_call_is_ever_made(self):
        _, _, calls = self.run_main(GOOD_ARGS, _good_provisioning_side_effect)
        for call in calls:
            self.assertNotIn("secrets", call.args[0])


def _locate_gcloud_sdk_lib_dirs():
    """Best-effort, offline resolution of the installed gcloud SDK's python
    library directories -- never invokes the `gcloud` binary itself (this
    VM's worker sandbox refuses that call outright). Snap installs resolve
    `gcloud` to the snap dispatcher rather than the real binary, so the
    `/snap/google-cloud-cli/current` symlink is checked directly first.
    Returns [] when no local install is found, e.g. a CI runner without one."""
    candidates = []
    snap_current = Path("/snap/google-cloud-cli/current")
    if snap_current.exists():
        candidates.append(snap_current.resolve())
    gcloud_path = shutil.which("gcloud")
    if gcloud_path:
        sdk_root = Path(os.path.realpath(gcloud_path)).parent
        if sdk_root.name == "bin":
            sdk_root = sdk_root.parent
        candidates.append(sdk_root)
    lib_dirs = []
    for root in candidates:
        for sub in ("lib", "lib/third_party"):
            lib_dir = root / sub
            if lib_dir.is_dir() and str(lib_dir) not in lib_dirs:
                lib_dirs.append(str(lib_dir))
    return lib_dirs


class RealGcloudSdkIamConditionBehaviorTest(unittest.TestCase):
    """R5 round 2: proves -- against the real installed gcloud SDK's own
    `googlecloudsdk.command_lib.iam.iam_util
    .RemoveBindingFromIamPolicyWithCondition` (the exact function the round-2
    review traced this defect to, reading real surface/run/services
    /remove_iam_policy_binding.yaml + iam_util.py) -- that removing a
    conditional roles/run.invoker binding without `--all` or `--condition`
    raises IamPolicyBindingIncompleteError in noninteractive mode, and that
    the `--all` fix in `reconcile_invoker_policy`
    (operations/deployment/provision-dev-artifact-backends.py) removes it
    cleanly while leaving the desired unconditional member untouched. Only
    the SDK's installed python library is imported; no `gcloud` process,
    network call or real IAM policy is ever touched. Skips (does not fail)
    when no local SDK install is found, rather than fabricate its behavior."""

    @classmethod
    def setUpClass(cls):
        lib_dirs = _locate_gcloud_sdk_lib_dirs()
        if not lib_dirs:
            raise unittest.SkipTest(
                "No local gcloud SDK install found; skipping real-SDK IAM condition probe"
            )
        for lib_dir in lib_dirs:
            if lib_dir not in sys.path:
                sys.path.insert(0, lib_dir)
        try:
            from googlecloudsdk.command_lib.iam import iam_util
            from googlecloudsdk.generated_clients.apis.run.v1 import run_v1_messages
        except ImportError as error:
            raise unittest.SkipTest(f"gcloud SDK python modules not importable: {error}")
        cls.iam_util = iam_util
        cls.run_v1_messages = run_v1_messages

    def _policy_with_conditional_stray(self):
        rm = self.run_v1_messages
        return rm.Policy(bindings=[
            rm.Binding(
                role="roles/run.invoker",
                members=["serviceAccount:old@example.iam.gserviceaccount.com"],
                condition=rm.Expr(expression="true", title="legacy"),
            ),
            rm.Binding(
                role="roles/run.invoker",
                members=["serviceAccount:good@example.iam.gserviceaccount.com"],
            ),
        ])

    def test_removal_without_all_raises_on_a_conditional_policy(self):
        policy = self._policy_with_conditional_stray()
        with self.assertRaises(self.iam_util.IamPolicyBindingIncompleteError):
            self.iam_util.RemoveBindingFromIamPolicyWithCondition(
                policy,
                "serviceAccount:old@example.iam.gserviceaccount.com",
                "roles/run.invoker",
                condition=None,
                all_conditions=False,
            )

    def test_removal_with_all_succeeds_and_keeps_desired_member(self):
        policy = self._policy_with_conditional_stray()
        self.iam_util.RemoveBindingFromIamPolicyWithCondition(
            policy,
            "serviceAccount:old@example.iam.gserviceaccount.com",
            "roles/run.invoker",
            condition=None,
            all_conditions=True,
        )
        remaining = {
            member
            for binding in policy.bindings
            for member in binding.members
            if binding.role == "roles/run.invoker"
        }
        self.assertEqual(remaining, {"serviceAccount:good@example.iam.gserviceaccount.com"})

    def _policy_with_member_duplicated_across_conditions(self):
        rm = self.run_v1_messages
        member = "serviceAccount:dup@example.iam.gserviceaccount.com"
        return rm.Policy(bindings=[
            rm.Binding(role="roles/run.invoker", members=[member]),
            rm.Binding(
                role="roles/run.invoker",
                members=[member],
                condition=rm.Expr(expression="true", title="legacy"),
            ),
        ])

    def test_removing_a_member_duplicated_across_conditions_clears_every_occurrence_at_once(self):
        # R5 round 3: `_RemoveBindingFromIamPolicyAllConditions` has no
        # `break` -- it loops every binding and removes the member from
        # each one that matches the role, so ONE --all call clears a
        # member that appears in both an unconditional and a conditional
        # roles/run.invoker binding. This is exactly why the production
        # per-binding-occurrence loop must dedupe members before issuing a
        # second --all call for the same member.
        policy = self._policy_with_member_duplicated_across_conditions()
        self.iam_util.RemoveBindingFromIamPolicyWithCondition(
            policy,
            "serviceAccount:dup@example.iam.gserviceaccount.com",
            "roles/run.invoker",
            condition=None,
            all_conditions=True,
        )
        remaining = {
            member
            for binding in policy.bindings
            for member in binding.members
            if binding.role == "roles/run.invoker"
        }
        self.assertEqual(remaining, set())

    def test_removing_the_same_member_a_second_time_raises_not_found(self):
        # The production bug (R5 round 3): calling --all removal AGAIN for
        # a member already cleared by an earlier occurrence's call raises
        # IamPolicyBindingNotFound, aborting reconciliation before later
        # unauthorized members are reached.
        policy = self._policy_with_member_duplicated_across_conditions()
        self.iam_util.RemoveBindingFromIamPolicyWithCondition(
            policy,
            "serviceAccount:dup@example.iam.gserviceaccount.com",
            "roles/run.invoker",
            condition=None,
            all_conditions=True,
        )
        with self.assertRaises(self.iam_util.IamPolicyBindingNotFound):
            self.iam_util.RemoveBindingFromIamPolicyWithCondition(
                policy,
                "serviceAccount:dup@example.iam.gserviceaccount.com",
                "roles/run.invoker",
                condition=None,
                all_conditions=True,
            )

    def test_add_binding_without_condition_raises_once_policy_has_any_condition(self):
        # R5 round 3: `AddBindingToIamPolicyWithCondition` raises
        # IamPolicyBindingIncompleteError in noninteractive mode the
        # moment the policy contains ANY condition anywhere -- even on an
        # unrelated role -- unless the caller explicitly specifies
        # `condition="None"` (the literal string gcloud's `--condition=None`
        # flag passes through, not Python's `None`, which means "not
        # specified").
        rm = self.run_v1_messages
        policy = rm.Policy(bindings=[
            rm.Binding(
                role="roles/storage.objectViewer",
                members=["serviceAccount:unrelated@example.iam.gserviceaccount.com"],
                condition=rm.Expr(expression="true", title="unrelated"),
            ),
        ])
        with self.assertRaises(self.iam_util.IamPolicyBindingIncompleteError):
            self.iam_util.AddBindingToIamPolicyWithCondition(
                rm.Binding, rm.Expr, policy,
                "serviceAccount:good@example.iam.gserviceaccount.com",
                "roles/run.invoker",
                condition=None,
            )
        self.iam_util.AddBindingToIamPolicyWithCondition(
            rm.Binding, rm.Expr, policy,
            "serviceAccount:good@example.iam.gserviceaccount.com",
            "roles/run.invoker",
            condition="None",
        )
        added = [b for b in policy.bindings if b.role == "roles/run.invoker"]
        self.assertEqual(len(added), 1)
        self.assertEqual(
            added[0].members, ["serviceAccount:good@example.iam.gserviceaccount.com"]
        )
        self.assertIsNone(added[0].condition)


if __name__ == "__main__":
    unittest.main()
