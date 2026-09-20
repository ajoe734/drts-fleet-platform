"""Regressions for role drift, committed outcomes and stale review writes."""
from __future__ import annotations

import json
import os
import tempfile
import unittest
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

from common import build_task_brief, _merge_task_payload
from control_plane.domain.task_records import task_is_dispatch_eligible_for_agent, validate_task_eligibility
from control_plane.domain.worker_lifecycle import worker_reported_outcome
from control_plane.usecases.task_board_commands import TaskBoardCommandExecutor, TaskBoardCommandRuntime
from control_plane.runtime import supervisor_runtime as runtime


class DispatchContractTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.task = {"id": "TEST", "owner": "Gemini", "reviewer": "Codex", "status": "in_progress",
                     "eligible_agents": {"owner": ["Gemini", "Gemini2"], "reviewer": ["Codex", "Codex2"]}}
        self.state = {"tasks": [deepcopy(self.task)]}
        self.env = {"ORCH_RUN_ID": "run-1", "ORCH_DISPATCH_TASK_ID": "TEST", "ORCH_DISPATCH_ROLE": "owner",
                    "ORCH_DISPATCH_AGENT": "Gemini", "ORCH_DISPATCH_CANDIDATE_SHA": "",
                    "ORCH_DISPATCH_CANDIDATE_GENERATION": ""}

    def executor(self, command, handler, sync=None):
        def save(state):
            self.state = deepcopy(state)
        return TaskBoardCommandExecutor(TaskBoardCommandRuntime(
            status_file=self.root / 'ai-status.json', load_state=lambda: deepcopy(self.state),
            save_state=save, sync_all=sync or save, read_only_commands={}, mutation_commands={command: handler}))

    def test_role_map_keeps_implementers_out_of_review_and_reviewers_out_of_implementation(self):
        for status in ('todo', 'in_progress', 'review'):
            task = {**self.task, 'status': status}
            self.assertTrue(task_is_dispatch_eligible_for_agent(task, 'Gemini', 'owner'))
            self.assertFalse(task_is_dispatch_eligible_for_agent(task, 'Codex', 'owner'))
            self.assertTrue(task_is_dispatch_eligible_for_agent(task, 'Codex', 'reviewer'))
            self.assertFalse(task_is_dispatch_eligible_for_agent(task, 'Gemini', 'reviewer'))
        with self.assertRaises(ValueError):
            validate_task_eligibility({**self.task, 'owner': 'Codex'})

    def test_malformed_and_empty_role_policy_fail_closed(self):
        for policy in ({'owners': ['Gemini']}, {'owner': [], 'reviewer': []},
                       {'owner': ['Gemini'], 'reviewer': 'Codex'}, 'Gemini'):
            self.assertFalse(task_is_dispatch_eligible_for_agent({**self.task, 'eligible_agents': policy}, 'Gemini'))
        for policy in (None, [], ['Gemini'], {'agents': ['Gemini']}):
            self.assertTrue(task_is_dispatch_eligible_for_agent({**self.task, 'eligible_agents': policy}, 'Gemini'))

    def test_committed_handoff_survives_ci_reopen_and_is_consumed_once(self):
        def handoff(state, args):
            state['tasks'][0].update(status='review', candidate_sha='a' * 40, candidate_generation='generation-a')
        with mock.patch.dict(os.environ, self.env):
            self.executor('handoff', handoff).execute('handoff', ['TEST', 'Codex', 'tests passed'])
        task = self.state['tasks'][0]
        task.update(status='in_progress', candidate_sha=None)  # fast CI failure
        worker = {'run_id': 'run-1', 'task_id': 'TEST', 'agent_id': 'gemini', 'status': 'running'}
        with (mock.patch.object(runtime, 'load_status', return_value=self.state),
              mock.patch.object(runtime, 'write_activity_log'),
              mock.patch.object(runtime, 'finalize_queue_event_record') as finalize,
              mock.patch.object(runtime, 'finalize_terminal_worker_outcome') as failed):
            args = dict(current_mode='execution', task_status='in_progress', expected_completion_statuses={'review'},
                        now=datetime.now(timezone.utc))
            self.assertTrue(runtime.finalize_exited_worker({}, {}, worker, **args))
            self.assertFalse(runtime.finalize_exited_worker({}, {}, worker, **args))
        failed.assert_not_called()
        finalize.assert_called_once()
        self.assertEqual(worker['status'], 'completed')
        self.assertEqual(task['status'], 'in_progress')

    def test_failed_transaction_does_not_leave_a_completion_receipt(self):
        def fail(state):
            raise OSError('projection failed')
        with mock.patch.dict(os.environ, self.env), self.assertRaises(OSError):
            self.executor('handoff', lambda state, args: state['tasks'][0].update(status='review'), fail).execute(
                'handoff', ['TEST', 'Codex', 'done'])
        self.assertNotIn('worker_outcomes', self.state['tasks'][0])
        self.assertEqual(self.state['tasks'][0]['status'], 'in_progress')

    def test_stale_review_cannot_clear_new_candidate_or_same_marker_report(self):
        for sha in ('b' * 40, 'not_applicable'):
            self.state['tasks'][0].update(status='review', candidate_sha=sha, candidate_generation='new')
            env = {**self.env, 'ORCH_DISPATCH_ROLE': 'reviewer', 'ORCH_DISPATCH_AGENT': 'Codex',
                   'ORCH_DISPATCH_CANDIDATE_SHA': sha, 'ORCH_DISPATCH_CANDIDATE_GENERATION': 'old'}
            handler = mock.Mock()
            with mock.patch.dict(os.environ, env), self.assertRaisesRegex(SystemExit, 'candidate changed'):
                self.executor('reopen', handler).execute('reopen', ['TEST', 'outdated findings'])
            handler.assert_not_called()
            self.assertEqual(self.state['tasks'][0]['candidate_generation'], 'new')

    def test_old_owner_cannot_mutate_after_reassignment(self):
        self.state['tasks'][0]['owner'] = 'Gemini2'
        with mock.patch.dict(os.environ, self.env), self.assertRaisesRegex(SystemExit, 'assignment changed'):
            self.executor('progress', mock.Mock()).execute('progress', ['TEST', 'stale'])

    def test_read_only_board_access_does_not_require_a_write_lock(self):
        executor = TaskBoardCommandExecutor(TaskBoardCommandRuntime(
            self.root / 'ai-status.json', lambda: self.state, mock.Mock(), mock.Mock(),
            {'show': lambda state, args: state['tasks'][0]}, {}))
        with mock.patch('control_plane.usecases.task_board_commands.task_board_transaction', side_effect=PermissionError):
            self.assertEqual(executor.execute_with_result('show', ['TEST'])['id'], 'TEST')

    def test_results_require_schema_and_native_success_is_not_task_success(self):
        path = self.root / 'result.json'
        path.write_text('{"outcome":"progress"}')
        self.assertIsNone(worker_reported_outcome({'result_path': str(path)}))
        path.write_text(json.dumps({'event': 'result', 'result': {'status': 'SUCCESS', 'response': 'shell failed'}}))
        worker = {'mode': 'antigravity', 'log_path': str(path)}
        self.assertIsNone(worker_reported_outcome(worker))
        result = {'outcome': 'progress', 'summary': 'Tests pending', 'task_status_written': 'in_progress',
                  'blocker': None, 'verification': []}
        path.write_text(json.dumps({'event': 'result', 'result': {'status': 'SUCCESS', 'response': json.dumps(result)}}))
        self.assertEqual(worker_reported_outcome(worker), result)

    def test_brief_preserves_full_live_feedback_and_execution_contract(self):
        task = {**self.task, 'next': 'A' * 1000 + 'critical final finding', 'task_spec_ref': 'spec.md',
                'required_acceptance': ['proof'], 'write_scopes': ['tools/'], 'mutates_canonical': False}
        merged = _merge_task_payload({}, task={'id': 'TEST', 'next': 'old feedback'}, status={'tasks': [task]})
        brief = build_task_brief({}, merged)
        for text in ('critical final finding', 'spec.md', 'proof', 'tools/', 'false'):
            self.assertIn(text, brief)


if __name__ == '__main__':
    unittest.main()
