import unittest
from unittest.mock import patch, MagicMock, mock_open
import json
import sys
from pathlib import Path

# Add the directory containing this file to sys.path so we can import dependency_security
sys.path.insert(0, str(Path(__file__).resolve().parent))
import dependency_security

class TestDependencySecurity(unittest.TestCase):
    @patch('dependency_security.subprocess.run')
    @patch('dependency_security.Path')
    def test_no_vulnerabilities(self, mock_path, mock_run):
        mock_result = MagicMock()
        mock_result.stdout = json.dumps({"advisories": {}})
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
        mock_result.stdout = json.dumps({
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
        mock_result.stdout = json.dumps({
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
        mock_result.stdout = json.dumps({
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
        mock_result.stdout = json.dumps({"advisories": {
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

if __name__ == '__main__':
    unittest.main()
