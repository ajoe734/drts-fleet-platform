import unittest
from unittest.mock import patch, MagicMock, mock_open
import json
import sys
import copy
import tempfile
from pathlib import Path

# Add the directory containing this file to sys.path so we can import dependency_security
sys.path.insert(0, str(Path(__file__).resolve().parent))
import dependency_security


class TestVerifiedDeepmergeMitigation(unittest.TestCase):
    def setUp(self):
        self.root = Path(__file__).resolve().parents[2]
        self.exception = next(exc for exc in json.loads(
            (self.root / 'tools/ci/dependency-security-exceptions.json').read_text()
        ) if exc['advisory_id'] == '1243505')
        self.audit = {'advisories': {'1243505': {
            'module_name': 'deepmerge', 'severity': 'low', 'title': 'prototype poisoning',
            'findings': [{'version': '4.3.1', 'paths': self.exception['paths']}],
        }}}

    def run_main(self, exception=None, audit=None, verification_error=None):
        # Only the audit transport and Node verification boundary are mocked.
        # Real installed Node verification has separate dependency-security TS tests.
        with patch.object(dependency_security, 'run_audit', return_value=audit or self.audit), \
                patch('builtins.open', mock_open(read_data=json.dumps([
                    self.exception if exception is None else exception]))), \
                patch.object(dependency_security, 'verify_deepmerge_patch',
                             side_effect=verification_error) as verify:
            with self.assertRaises(SystemExit) as result:
                dependency_security.main()
            return result.exception.code, verify.call_count

    def test_verified_patch_required_and_invoked(self):
        self.assertEqual(self.run_main(), (0, 1))
        for value in [None, 'unknown-patch']:
            exc = dict(self.exception, verified_patch=value)
            self.assertEqual(self.run_main(exc), (1, 0))
        exc = dict(self.exception)
        del exc['verified_patch']
        self.assertEqual(self.run_main(exc), (1, 0))

    def test_verification_errors_fail_closed(self):
        for error in [ValueError('tampered'), FileNotFoundError('missing'),
                      dependency_security.subprocess.TimeoutExpired('node', 30)]:
            with self.subTest(error=error):
                self.assertEqual(self.run_main(verification_error=error), (1, 1))

    def test_changed_audit_version_path_and_module_rejected(self):
        for field, value in [('version', '4.3.2'), ('paths', ['new>deepmerge'])]:
            report = copy.deepcopy(self.audit)
            report['advisories']['1243505']['findings'][0][field] = value
            self.assertEqual(self.run_main(audit=report), (1, 1))
        report = copy.deepcopy(self.audit)
        report['advisories']['1243505']['module_name'] = 'another-module'
        self.assertEqual(self.run_main(audit=report), (1, 1))

    def test_expiry_and_unsupported_patch_condition_rejected(self):
        self.assertEqual(self.run_main(dict(self.exception, expires_at='2020-01-01T00:00:00Z')), (1, 0))
        self.assertEqual(self.run_main(dict(self.exception, advisory_id='other')), (1, 0))

    def test_reviewed_manifest_and_lock_binding(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            paths = ['package.json', 'pnpm-lock.yaml', dependency_security.DEEPMERGE_PATCH]
            originals = {name: (self.root / name).read_bytes() for name in paths}

            def restore():
                for name, data in originals.items():
                    (root / name).parent.mkdir(parents=True, exist_ok=True)
                    (root / name).write_bytes(data)

            restore()
            with patch.object(dependency_security.subprocess, 'run') as node:
                node.return_value = MagicMock(returncode=0, stdout='verified')
                dependency_security.verify_deepmerge_patch(root)
                self.assertEqual(node.call_args.args[0][:2], ['node', '-e'])
                node.reset_mock()
                mutations = [
                    (dependency_security.DEEPMERGE_PATCH, lambda text: text + '\n'),
                    ('package.json', lambda text: text.replace('"deepmerge@4.3.1"', '"deepmerge@4.3.2"')),
                    ('package.json', lambda text: text.replace(dependency_security.DEEPMERGE_PATCH, 'wrong.patch')),
                    ('pnpm-lock.yaml', lambda text: text.replace(dependency_security.DEEPMERGE_PATCH_SHA256, '0' * 64)),
                    ('pnpm-lock.yaml', lambda text: text.replace(dependency_security.DEEPMERGE_PATCH, 'wrong.patch')),
                    ('pnpm-lock.yaml', lambda text: text.replace('deepmerge: 4.3.1(patch_hash=', 'deepmerge: 4.3.2(patch_hash=')),
                    ('pnpm-lock.yaml', lambda text: text + '\n      deepmerge: 4.3.1\n'),
                    ('pnpm-lock.yaml', lambda text: text + '\n      "deepmerge": 4.3.1\n'),
                    ('pnpm-lock.yaml', lambda text: text + '\npatchedDependencies:\n'),
                ]
                for name, mutate in mutations:
                    with self.subTest(name=name, mutation=mutate):
                        restore()
                        target = root / name
                        target.write_text(mutate(target.read_text()))
                        with self.assertRaises(ValueError):
                            dependency_security.verify_deepmerge_patch(root)
                        node.assert_not_called()
                restore()
                (root / dependency_security.DEEPMERGE_PATCH).unlink()
                with self.assertRaises(FileNotFoundError):
                    dependency_security.verify_deepmerge_patch(root)
                node.assert_not_called()

class TestDependencySecurity(unittest.TestCase):
    @patch('dependency_security.subprocess.run')
    @patch('dependency_security.Path')
    def test_no_vulnerabilities(self, mock_path, mock_run):
        mock_result = MagicMock()
        mock_result.stdout = json.dumps({"advisories": {}, "metadata": {"vulnerabilities": {"info": 0, "low": 0, "moderate": 0, "high": 0, "critical": 0}}})
        mock_result.returncode = 0
        mock_run.return_value = mock_result
        
        mock_file = MagicMock()
        mock_file.exists.return_value = True
        mock_path.return_value.parent.__truediv__.return_value = mock_file
        
        with patch('sys.exit', side_effect=SystemExit) as mock_exit:
            with patch('builtins.open', mock_open(read_data="[]")):
                try:
                    dependency_security.main()
                except SystemExit:
                    pass
                mock_exit.assert_called_with(0)

    @patch('dependency_security.subprocess.run')
    @patch('dependency_security.Path')
    def test_ignored_mobile_vulnerabilities(self, mock_path, mock_run):
        mock_result = MagicMock()
        mock_result.stdout = json.dumps({"metadata": {"vulnerabilities": {"info": 0, "low": 0, "moderate": 0, "high": 1, "critical": 0}}, 
            "advisories": {
                "123": {
                    "module_name": "expo",
                    "severity": "high",
                    "title": "Some expo vulnerability",
                    "findings": [
                        {"version": "1.0.0", "paths": ["apps__driver-app>expo"]}
                    ]
                }
            }
        })
        mock_result.returncode = 1
        mock_run.return_value = mock_result
        
        mock_file = MagicMock()
        mock_file.exists.return_value = True
        mock_path.return_value.parent.__truediv__.return_value = mock_file
        
        exceptions = [
            {
                "advisory_id": "123",
                "module_name": "expo",
                "expires_at": "2099-01-01T00:00:00Z",
                "versions": ["1.0.0"],
                "paths": ["apps__driver-app>expo"]
            }
        ]
        
        with patch('sys.exit', side_effect=SystemExit) as mock_exit:
            with patch('builtins.open', mock_open(read_data=json.dumps(exceptions))):
                try:
                    dependency_security.main()
                except SystemExit:
                    pass
                mock_exit.assert_called_with(0)
            
    @patch('dependency_security.subprocess.run')
    @patch('dependency_security.Path')
    def test_unexcepted_vulnerability(self, mock_path, mock_run):
        mock_result = MagicMock()
        mock_result.stdout = json.dumps({"metadata": {"vulnerabilities": {"info": 0, "low": 0, "moderate": 0, "high": 1, "critical": 0}}, 
            "advisories": {
                "456": {
                    "module_name": "some-server-lib",
                    "severity": "critical",
                    "title": "Remote code execution",
                    "findings": [
                        {"version": "2.0.0", "paths": ["apps__api>some-server-lib"]}
                    ]
                }
            }
        })
        mock_result.returncode = 1
        mock_run.return_value = mock_result
        
        mock_file = MagicMock()
        mock_file.exists.return_value = True
        mock_path.return_value.parent.__truediv__.return_value = mock_file
        
        with patch('sys.exit', side_effect=SystemExit) as mock_exit:
            with patch('builtins.open', mock_open(read_data="[]")):
                try:
                    dependency_security.main()
                except SystemExit:
                    pass
                mock_exit.assert_called_with(1)

    @patch('dependency_security.subprocess.run')
    def test_error_json(self, mock_run):
        mock_result = MagicMock()
        mock_result.stdout = json.dumps({
            "error": {
                "code": "ERR_PNPM_AUDIT_BAD_RESPONSE",
                "message": "registry unavailable"
            }
        })
        mock_result.returncode = 1
        mock_run.return_value = mock_result
        
        with patch('sys.exit', side_effect=SystemExit) as mock_exit:
            try:
                dependency_security.main()
            except SystemExit:
                pass
            mock_exit.assert_called_with(1)

    @patch('dependency_security.subprocess.run')
    def test_malformed_report(self, mock_run):
        mock_result = MagicMock()
        mock_result.stdout = json.dumps({"unexpected": "format"})
        mock_result.returncode = 1
        mock_run.return_value = mock_result
        
        with patch('sys.exit', side_effect=SystemExit) as mock_exit:
            try:
                dependency_security.main()
            except SystemExit:
                pass
            mock_exit.assert_called_with(1)

    @patch('dependency_security.subprocess.run')
    def test_unexpected_exit_status_json_decode_error(self, mock_run):
        mock_result = MagicMock()
        mock_result.stdout = "Not JSON"
        mock_result.returncode = 2
        mock_run.return_value = mock_result
        
        with patch('sys.exit', side_effect=SystemExit) as mock_exit:
            try:
                dependency_security.main()
            except SystemExit:
                pass
            mock_exit.assert_called_with(1)
            
    @patch('dependency_security.subprocess.run')
    @patch('dependency_security.Path')
    def test_changed_version_reject(self, mock_path, mock_run):
        mock_result = MagicMock()
        mock_result.stdout = json.dumps({"metadata": {"vulnerabilities": {"info": 0, "low": 0, "moderate": 0, "high": 1, "critical": 0}}, 
            "advisories": {
                "123": {
                    "module_name": "expo",
                    "severity": "high",
                    "title": "Some expo vulnerability",
                    "findings": [
                        {"version": "2.0.0", "paths": ["apps__driver-app>expo"]}
                    ]
                }
            }
        })
        mock_result.returncode = 1
        mock_run.return_value = mock_result
        
        mock_file = MagicMock()
        mock_file.exists.return_value = True
        mock_path.return_value.parent.__truediv__.return_value = mock_file
        
        # Exception is for version 1.0.0 only
        exceptions = [
            {
                "advisory_id": "123",
                "module_name": "expo",
                "expires_at": "2099-01-01T00:00:00Z",
                "versions": ["1.0.0"],
                "paths": ["apps__driver-app>expo"]
            }
        ]
        
        with patch('sys.exit', side_effect=SystemExit) as mock_exit:
            with patch('builtins.open', mock_open(read_data=json.dumps(exceptions))):
                try:
                    dependency_security.main()
                except SystemExit:
                    pass
                mock_exit.assert_called_with(1)

    @patch('dependency_security.subprocess.run')
    @patch('dependency_security.Path')
    def test_expired_exception(self, mock_path, mock_run):
        mock_result = MagicMock()
        mock_result.stdout = json.dumps({"metadata": {"vulnerabilities": {"info": 0, "low": 0, "moderate": 0, "high": 1, "critical": 0}}, "advisories": {
            "123": {
                "module_name": "expo",
                "severity": "high",
                "title": "Some expo vulnerability",
                "findings": [
                    {"version": "1.0.0", "paths": ["apps__driver-app>expo"]}
                ]
            }
        }})
        mock_result.returncode = 1
        mock_run.return_value = mock_result
        
        mock_file = MagicMock()
        mock_file.exists.return_value = True
        mock_path.return_value.parent.__truediv__.return_value = mock_file
        
        exceptions = [
            {
                "advisory_id": "123",
                "module_name": "expo",
                "expires_at": "2020-01-01T00:00:00Z",
                "versions": ["1.0.0"],
                "paths": ["apps__driver-app>expo"]
            }
        ]
        
        with patch('sys.exit', side_effect=SystemExit) as mock_exit:
            with patch('builtins.open', mock_open(read_data=json.dumps(exceptions))):
                try:
                    dependency_security.main()
                except SystemExit:
                    pass
                mock_exit.assert_called_with(1)


    @patch('dependency_security.subprocess.run')
    def test_rc0_metadata_empty(self, mock_run):
        mock_result = MagicMock()
        mock_result.stdout = json.dumps({"metadata":{}})
        mock_result.returncode = 0
        mock_run.return_value = mock_result
        
        with patch('sys.exit', side_effect=SystemExit) as mock_exit:
            try:
                dependency_security.main()
            except SystemExit:
                pass
            mock_exit.assert_called_with(1)

    @patch('dependency_security.subprocess.run')
    def test_rc0_metadata_vulnerabilities(self, mock_run):
        mock_result = MagicMock()
        mock_result.stdout = json.dumps({"metadata":{"vulnerabilities":{"info":0,"low":0,"moderate":0,"high":1,"critical":0}}})
        mock_result.returncode = 0
        mock_run.return_value = mock_result
        
        with patch('sys.exit', side_effect=SystemExit) as mock_exit:
            try:
                dependency_security.main()
            except SystemExit:
                pass
            mock_exit.assert_called_with(1)

    @patch('dependency_security.subprocess.run')
    def test_rc0_advisories_empty_vulnerabilities(self, mock_run):
        mock_result = MagicMock()
        mock_result.stdout = json.dumps({"advisories":{},"metadata":{"vulnerabilities":{"info":0,"low":0,"moderate":0,"high":1,"critical":0}}})
        mock_result.returncode = 0
        mock_run.return_value = mock_result
        
        with patch('sys.exit', side_effect=SystemExit) as mock_exit:
            try:
                dependency_security.main()
            except SystemExit:
                pass
            mock_exit.assert_called_with(1)

    @patch('dependency_security.subprocess.run')
    @patch('dependency_security.Path')
    def test_rc1_known_advisory_empty_findings(self, mock_path, mock_run):
        mock_result = MagicMock()
        mock_result.stdout = json.dumps({
            "advisories": {
                "1119441": {
                    "module_name": "uuid",
                    "severity": "critical",
                    "title": "review probe",
                    "findings": []
                }
            },
            "metadata": {"vulnerabilities": {"info": 0, "low": 0, "moderate": 0, "high": 0, "critical": 1}}
        })
        mock_result.returncode = 1
        mock_run.return_value = mock_result
        
        mock_file = MagicMock()
        mock_file.exists.return_value = True
        mock_path.return_value.parent.__truediv__.return_value = mock_file
        
        exceptions = [{
            "advisory_id": "1119441",
            "module_name": "uuid",
            "expires_at": "2099-01-01T00:00:00Z",
            "versions": ["8.3.2"],
            "paths": ["apps__api>uuid"]
        }]
        
        with patch('sys.exit', side_effect=SystemExit) as mock_exit:
            with patch('builtins.open', mock_open(read_data=json.dumps(exceptions))):
                try:
                    dependency_security.main()
                except SystemExit:
                    pass
                mock_exit.assert_called_with(1)

    @patch('dependency_security.subprocess.run')
    @patch('dependency_security.Path')
    def test_rc1_known_advisory_empty_paths(self, mock_path, mock_run):
        mock_result = MagicMock()
        mock_result.stdout = json.dumps({
            "advisories": {
                "1119441": {
                    "module_name": "uuid",
                    "severity": "critical",
                    "title": "review probe",
                    "findings": [{"version": "8.3.2", "paths": []}]
                }
            },
            "metadata": {"vulnerabilities": {"info": 0, "low": 0, "moderate": 0, "high": 0, "critical": 1}}
        })
        mock_result.returncode = 1
        mock_run.return_value = mock_result
        
        mock_file = MagicMock()
        mock_file.exists.return_value = True
        mock_path.return_value.parent.__truediv__.return_value = mock_file
        
        exceptions = [{
            "advisory_id": "1119441",
            "module_name": "uuid",
            "expires_at": "2099-01-01T00:00:00Z",
            "versions": ["8.3.2"],
            "paths": ["apps__api>uuid"]
        }]
        
        with patch('sys.exit', side_effect=SystemExit) as mock_exit:
            with patch('builtins.open', mock_open(read_data=json.dumps(exceptions))):
                try:
                    dependency_security.main()
                except SystemExit:
                    pass
                mock_exit.assert_called_with(1)

    @patch('dependency_security.subprocess.run')
    @patch('dependency_security.Path')
    def test_rc1_known_advisory_string_paths(self, mock_path, mock_run):
        mock_result = MagicMock()
        mock_result.stdout = json.dumps({
            "advisories": {
                "1119441": {
                    "module_name": "uuid",
                    "severity": "critical",
                    "title": "review probe",
                    "findings": [{"version": "8.3.2", "paths": ""}]
                }
            },
            "metadata": {"vulnerabilities": {"info": 0, "low": 0, "moderate": 0, "high": 0, "critical": 1}}
        })
        mock_result.returncode = 1
        mock_run.return_value = mock_result
        
        mock_file = MagicMock()
        mock_file.exists.return_value = True
        mock_path.return_value.parent.__truediv__.return_value = mock_file
        
        exceptions = [{
            "advisory_id": "1119441",
            "module_name": "uuid",
            "expires_at": "2099-01-01T00:00:00Z",
            "versions": ["8.3.2"],
            "paths": ["apps__api>uuid"]
        }]
        
        with patch('sys.exit', side_effect=SystemExit) as mock_exit:
            with patch('builtins.open', mock_open(read_data=json.dumps(exceptions))):
                try:
                    dependency_security.main()
                except SystemExit:
                    pass
                mock_exit.assert_called_with(1)


    @patch('dependency_security.subprocess.run')
    def test_rc0_metadata_vulnerabilities_empty(self, mock_run):
        mock_result = MagicMock()
        mock_result.stdout = json.dumps({"metadata": {"vulnerabilities": {}}})
        mock_result.returncode = 0
        mock_run.return_value = mock_result
        
        with patch('sys.exit', side_effect=SystemExit) as mock_exit:
            try:
                dependency_security.main()
            except SystemExit:
                pass
            mock_exit.assert_called_with(1)

    @patch('dependency_security.subprocess.run')
    def test_rc0_metadata_vulnerabilities_missing_counter(self, mock_run):
        mock_result = MagicMock()
        mock_result.stdout = json.dumps({"metadata": {"vulnerabilities": {"info": 0, "low": 0, "moderate": 0, "high": 0}}})
        mock_result.returncode = 0
        mock_run.return_value = mock_result
        
        with patch('sys.exit', side_effect=SystemExit) as mock_exit:
            try:
                dependency_security.main()
            except SystemExit:
                pass
            mock_exit.assert_called_with(1)

    @patch('dependency_security.subprocess.run')
    def test_rc0_metadata_vulnerabilities_invalid_numeric(self, mock_run):
        invalid_counts = [
            {"info": 0, "low": 0, "moderate": 0, "high": -1, "critical": 0},
            {"info": 0, "low": 0, "moderate": 0, "high": 1.5, "critical": 0},
            {"info": 0, "low": 0, "moderate": 0, "high": True, "critical": 0},
            {"info": 0, "low": 0, "moderate": 0, "high": "0", "critical": 0}
        ]
        
        for counts in invalid_counts:
            mock_result = MagicMock()
            mock_result.stdout = json.dumps({"metadata": {"vulnerabilities": counts}})
            mock_result.returncode = 0
            mock_run.return_value = mock_result
            
            with patch('sys.exit', side_effect=SystemExit) as mock_exit:
                try:
                    dependency_security.main()
                except SystemExit:
                    pass
                mock_exit.assert_called_with(1)

if __name__ == '__main__':
    unittest.main()
