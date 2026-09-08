"""Offline failure-path tests; fixtures are not live acceptance evidence."""
import importlib.util
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[4]
spec = importlib.util.spec_from_file_location('endpoints', ROOT / 'tools/system-remediation/public-entry/system-remediation-endpoints.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class DiagnosticsTests(unittest.TestCase):
    def test_active_inventory_excludes_retired_and_paused(self):
        self.assertEqual(set(m.SERVICES), {'fleets', 'ops', 'partners', 'dispatch', 'bank', 'channel', 'tenant', 'refer', 'api'})
        workflow = (ROOT / '.github/workflows/deploy-dev.yml').read_text()
        for service in m.SERVICES.values():
            self.assertIn(service, workflow)

    def test_auth_failure_does_not_invent_cloud_urls(self):
        error = {'exit_code': 1, 'stdout': '', 'stderr': 'reauthentication required'}
        with patch.object(m, 'run', return_value=error), patch.object(m, 'probe', return_value={}) as probe:
            report = m.collect('test-project', 'us-central1', 'base')
        self.assertEqual(probe.call_count, 9)
        self.assertTrue(all(e['cloud_run'] is None and e['service'] is None for e in report['entries'].values()))
        self.assertFalse(m.complete(report))

    def test_failed_discovery_with_json_stdout_is_still_unknown(self):
        with patch.object(m, 'run', return_value={'exit_code': 1, 'stdout': '[]'}):
            _, services, _ = m.cloud_inventory('test', 'us-central1')
        self.assertEqual(services, {})

    def test_http_error_is_not_success_and_tls_cannot_be_disabled(self):
        with patch.object(m, 'run', return_value={'exit_code': 0, 'stdout': '{"status":403}'}) as run:
            self.assertFalse(m.http('https://example.test/', direct=True)['reachable'])
        cmd = run.call_args.args[0]
        self.assertIn('--noproxy', cmd)
        self.assertNotIn('--insecure', cmd)
        self.assertIn('--proto-redir', cmd)
        with patch.object(m, 'run', return_value={'exit_code': 35, 'stdout': '{"status":"000","final_url":"https://example.test/"}'}):
            result = m.http('https://example.test/')
            self.assertFalse(result['reachable'])
            self.assertEqual(result['response']['final_url'], 'https://example.test/')
            self.assertEqual(result['response']['status'], 0)

    def test_timeout_and_missing_binary_produce_explicit_exit_codes(self):
        with patch.object(subprocess, 'run', side_effect=subprocess.TimeoutExpired('openssl', 1)):
            self.assertEqual(m.run(['openssl'])['exit_code'], 124)
        with patch.object(subprocess, 'run', side_effect=FileNotFoundError('missing')):
            self.assertEqual(m.run(['missing'])['exit_code'], 127)

    def test_broken_tls_cannot_pass_even_with_http_200(self):
        probe = {'tls_direct': {'exit_code': 1}, 'http_direct': {'reachable': True}, 'http_environment': {'reachable': True}}
        ok = {'exit_code': 0, 'stdout': '[]'}
        report = {'cloud_discovery': ok, 'domain_mappings': ok, 'entries': {'api': {'public': probe, 'cloud_run': probe}}}
        self.assertFalse(m.complete(report))


if __name__ == '__main__':
    unittest.main()
