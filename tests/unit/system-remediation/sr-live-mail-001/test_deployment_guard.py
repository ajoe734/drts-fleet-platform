import importlib.util
import io
import json
import subprocess
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

path = Path(__file__).resolve().parents[3] / 'e2e/system-remediation/sr-live-mail-001/deployment-guard.py'
spec = importlib.util.spec_from_file_location('deployment_guard', path)
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


def response(pages):
    return Mock(stdout=json.dumps(pages))


class DeploymentGuardTest(unittest.TestCase):
    def test_idle_checks_all_nonterminal_states_with_pagination(self):
        run = Mock(return_value=response([{'workflow_runs': []}]))
        guard.check_deployment_idle('owner/repo', run)
        self.assertEqual(run.call_count, 5)
        for call, status in zip(run.call_args_list, guard.ACTIVE_STATUSES):
            self.assertEqual(call.args[0], ['gh', 'api', '--paginate', '--slurp',
                f'repos/owner/repo/actions/workflows/deploy-dev.yml/runs?status={status}&per_page=100'])
            self.assertTrue(call.kwargs['check'])
            self.assertEqual(call.kwargs['timeout'], 30)

    def test_each_active_state_refuses_and_stops_checking(self):
        for index, status in enumerate(guard.ACTIVE_STATUSES):
            run = Mock(side_effect=[response([{'workflow_runs': []}])] * index + [
                response([{'workflow_runs': [{'id': 123, 'status': status}]}])])
            with self.subTest(status=status), self.assertRaises(guard.DeploymentBusyError):
                guard.check_deployment_idle('owner/repo', run)
            self.assertEqual(run.call_count, index + 1)

    def test_later_page_is_not_silently_ignored(self):
        run = Mock(return_value=response([{'workflow_runs': []}, {'workflow_runs': [{'id': 123}]}]))
        with self.assertRaises(guard.DeploymentBusyError):
            guard.check_deployment_idle('owner/repo', run)

    def test_invalid_listing_fails_closed(self):
        for pages in ([], {}, [None], [{}], [{'workflow_runs': None}]):
            with self.subTest(pages=pages), self.assertRaises(ValueError):
                guard.check_deployment_idle('owner/repo', Mock(return_value=response(pages)))

    def test_cli_failure_redacts_gh_stderr_and_authentication_details(self):
        output = io.StringIO()
        error = subprocess.CalledProcessError(1, ['gh', 'private-token'], stderr='private-secret')
        with patch.dict(guard.os.environ, {'GITHUB_REPOSITORY': 'owner/repo'}), \
             patch.object(guard.subprocess, 'run', side_effect=error), patch.object(guard.sys, 'stderr', output):
            self.assertEqual(guard.main(), 1)
        self.assertIn('issuance refused', output.getvalue())
        self.assertNotIn('private', output.getvalue())

    def test_invalid_repository_never_calls_gh(self):
        run = Mock()
        with self.assertRaises(ValueError):
            guard.check_deployment_idle('owner/repo?token=secret', run)
        run.assert_not_called()


if __name__ == '__main__':
    unittest.main()
