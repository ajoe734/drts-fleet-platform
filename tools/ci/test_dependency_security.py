import unittest
from unittest.mock import patch, MagicMock, mock_open
import json
import sys
import dependency_security

class TestDependencySecurity(unittest.TestCase):
    @patch('dependency_security.subprocess.run')
    def test_no_vulnerabilities(self, mock_run):
        mock_result = MagicMock()
        mock_result.stdout = json.dumps({"advisories": {}})
        mock_run.return_value = mock_result
        
        with patch('sys.exit') as mock_exit:
            dependency_security.main()
            mock_exit.assert_not_called()

    @patch('dependency_security.subprocess.run')
    def test_ignored_mobile_vulnerabilities(self, mock_run):
        mock_result = MagicMock()
        mock_result.stdout = json.dumps({
            "advisories": {
                "123": {
                    "module_name": "expo",
                    "severity": "high",
                    "title": "Some expo vulnerability",
                    "findings": [
                        {"paths": ["apps__driver-app>expo"]}
                    ]
                }
            }
        })
        mock_run.return_value = mock_result
        
        with patch('sys.exit') as mock_exit:
            dependency_security.main()
            mock_exit.assert_not_called()
            
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
                        {"paths": ["apps__api>some-server-lib"]}
                    ]
                }
            }
        })
        mock_run.return_value = mock_result
        
        mock_file = MagicMock()
        mock_file.exists.return_value = True
        mock_path.return_value.parent.__truediv__.return_value = mock_file
        
        with patch('sys.exit') as mock_exit:
            with patch('builtins.open', mock_open(read_data="[]")):
                dependency_security.main()
                mock_exit.assert_called_with(1)

if __name__ == '__main__':
    unittest.main()
