"""Offline deployment resolver and workflow-wiring regressions. No servers/cloud."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
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


if __name__ == "__main__":
    unittest.main()
