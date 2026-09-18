"""Safety checks for the executable 71-task wave, without the live task board."""
from __future__ import annotations
import copy
from dataclasses import replace
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / 'tools/task-dispatch/dispatch-system-remediation-20260906.py'
spec = importlib.util.spec_from_file_location('sr_dispatch_tested', SCRIPT)
dispatch = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = dispatch
spec.loader.exec_module(dispatch)
sys.path.insert(0, str(REPO / 'tools/development-orchestrator'))
from control_plane.usecases.task_board_commands import TaskBoardCommandExecutor, TaskBoardCommandRuntime


class MemoryBoard:
    """Use the real transaction executor with isolated state and command stubs."""
    TaskBoardCommandExecutor = TaskBoardCommandExecutor

    def __init__(self, manifest, directory, fail=None):
        self.manifest = manifest
        self.fail = fail
        self.publications = 0
        self.state = {'execution_mode': 'supervisor_managed_execution', 'tasks': [
            {'id': tid, 'status': 'in_progress', 'owner': 'Claude', 'reviewer': 'Codex'}
            for tid in manifest['external_dependencies']], 'archived_task_ids': []}
        self.path = Path(directory) / 'isolated-board.json'
        self.path.write_text('{}')

    def command_assign(self, state, args):
        if args[0] == self.fail:
            raise ValueError('injected assign failure')
        metadata = json.loads(os.environ['TASK_METADATA_JSON'])
        state['tasks'].append({'id': args[0], 'owner': args[1], 'reviewer': args[2], **metadata})

    def command_resume_blocked(self, state, args):
        sr = [t for t in state['tasks'] if t['id'].startswith('SR-')]
        assert len(sr) == len(self.manifest['tasks']), 'partial DAG resumed'
        next(t for t in sr if t['id'] == args[0])['status'] = args[1]

    def save(self, state):
        self.state = copy.deepcopy(state)

    def sync(self, state):
        self.publications += 1
        self.save(state)

    def _command_runtime(self):
        return TaskBoardCommandRuntime(self.path, lambda: copy.deepcopy(self.state), self.save, self.sync, {}, {})


class WaveTests(unittest.TestCase):
    def setUp(self):
        self.m = json.loads((REPO / dispatch.MANIFEST_REF).read_text())
        self.source = 'a' * 40

    def test_complete_coverage_and_parallel_roots(self):
        ordered = dispatch.validate_manifest(self.m, REPO)
        self.assertEqual(len(ordered), 71)
        self.assertEqual(sum(not x['depends_on'] for x in ordered), 25)
        self.assertEqual(sum(x['initial_status'] == 'blocked' for x in ordered), 9)

    def test_cycle_rejected(self):
        self.m['tasks'][0]['depends_on'].append('SR-MAIL-002')
        with self.assertRaisesRegex(ValueError, 'Cycle'):
            dispatch.validate_manifest(self.m, REPO)

    def test_unknown_dependency_rejected(self):
        self.m['tasks'][0]['depends_on'].append('NOT-A-TASK')
        with self.assertRaisesRegex(ValueError, 'Missing dependency'):
            dispatch.validate_manifest(self.m, REPO)

    def test_unordered_shared_file_rejected(self):
        for t in self.m['tasks'][:2]:
            t['write_scopes'].append('apps/api/src/shared-danger.ts')
        with self.assertRaisesRegex(ValueError, 'Unordered shared writes'):
            dispatch.validate_manifest(self.m, REPO)

    def test_external_evidence_cannot_be_ready(self):
        t = next(t for t in self.m['tasks'] if t['external_gate'])
        t['initial_status'] = 'backlog'
        with self.assertRaisesRegex(ValueError, 'external gate must initially'):
            dispatch.validate_manifest(self.m, REPO)

    def test_path_escape_rejected(self):
        self.m['tasks'][0]['write_scopes'].append('../ai-status.json')
        with self.assertRaisesRegex(ValueError, 'escaping'):
            dispatch.validate_manifest(self.m, REPO)

    def test_path_aliases_cannot_bypass_scope_checks(self):
        for path in ['./ai-status.json', 'apps/api/src/./shared-danger.ts', 'apps//api/src/shared-danger.ts', 'apps/api/src/shared-danger.ts/', 'apps\\api\\src\\shared-danger.ts']:
            with self.subTest(path=path):
                manifest = copy.deepcopy(self.m)
                manifest['tasks'][0]['write_scopes'].append('apps/api/src/shared-danger.ts')
                manifest['tasks'][1]['write_scopes'].append(path)
                with self.assertRaisesRegex(ValueError, 'non-canonical|Unordered shared writes'):
                    dispatch.validate_manifest(manifest, REPO)

    def test_dependency_writer_cannot_edit_runtime_board(self):
        for path in ['ai-status.json', 'ai-status.json/', 'current-work.md', 'current-work.md/']:
            with self.subTest(path=path):
                manifest = copy.deepcopy(self.m)
                task = next(t for t in manifest['tasks'] if t['id'] == 'SR-DEPS-001')
                task['write_scopes'].append(path)
                with self.assertRaisesRegex(ValueError, 'forbidden shared write'):
                    dispatch.validate_manifest(manifest, REPO)

    def test_cross_wave_client_writer_must_be_ordered(self):
        task = next(t for t in self.m['tasks'] if t['id'] == 'SR-CONTRACT-001')
        task['depends_on'].remove('UV-EXEC-019')
        with self.assertRaisesRegex(ValueError, 'Unordered external writer'):
            dispatch.validate_manifest(self.m, REPO)

    def test_verification_cannot_run_before_covered_producers(self):
        task = next(t for t in self.m['tasks'] if t['id'] == 'SR-QA-DISPATCH-001')
        task['depends_on'] = ['SR-UAT-HARNESS-001']
        with self.assertRaisesRegex(ValueError, 'verification before producers'):
            dispatch.validate_manifest(self.m, REPO)

    def test_release_candidate_contains_all_implementation(self):
        task = next(t for t in self.m['tasks'] if t['id'] == 'SR-RELEASE-001')
        task['depends_on'] = []
        with self.assertRaisesRegex(ValueError, 'Release candidate omits'):
            dispatch.validate_manifest(self.m, REPO)

    def test_missing_dependency_is_not_treated_as_done(self):
        with self.assertRaisesRegex(ValueError, 'missing/archived'):
            dispatch.verify_external_dependencies(self.m, {'tasks': []})

    def test_atomic_publish_and_live_holds(self):
        with tempfile.TemporaryDirectory() as directory:
            board = MemoryBoard(self.m, directory)
            before = copy.deepcopy(board.state['tasks'])
            ordered = dispatch.validate_manifest(self.m, REPO)
            result = dispatch.apply_wave(board, self.m, ordered, self.source)
            self.assertEqual(len(result['created']), 71)
            self.assertEqual(board.publications, 1)
            self.assertEqual(board.state['tasks'][:len(before)], before)
            sr = [t for t in board.state['tasks'] if t['id'].startswith('SR-')]
            self.assertEqual(sum(t['status'] == 'blocked' for t in sr), 9)
            self.assertEqual(sum(t['status'] == 'backlog' for t in sr), 62)
            self.assertFalse(any(t.get('materialization_hold') for t in sr))

    def test_mid_transaction_failure_leaves_live_state_unchanged(self):
        with tempfile.TemporaryDirectory() as directory:
            board = MemoryBoard(self.m, directory, fail='SR-BANK-001')
            before = copy.deepcopy(board.state)
            with self.assertRaisesRegex(ValueError, 'injected'):
                dispatch.apply_wave(board, self.m, dispatch.validate_manifest(self.m, REPO), self.source)
            self.assertEqual(board.state, before)
            self.assertEqual(board.publications, 0)

    def test_retry_preserves_lifecycle_and_supervisor_assignment(self):
        with tempfile.TemporaryDirectory() as directory:
            board = MemoryBoard(self.m, directory)
            ordered = dispatch.validate_manifest(self.m, REPO)
            dispatch.apply_wave(board, self.m, ordered, self.source)
            t = next(t for t in board.state['tasks'] if t['id'] == 'SR-NOTIFY-001')
            t.update(status='review', owner='Claude', reviewer='Gemini', candidate_sha='b'*40, ci_status='success')
            before = copy.deepcopy(board.state)
            result = dispatch.apply_wave(board, self.m, ordered, self.source)
            self.assertEqual(result['created'], [])
            self.assertEqual(board.state, before)

    def test_conflicting_spec_never_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            board = MemoryBoard(self.m, directory)
            ordered = dispatch.validate_manifest(self.m, REPO)
            dispatch.apply_wave(board, self.m, ordered, self.source)
            t = next(t for t in board.state['tasks'] if t['id'] == 'SR-NOTIFY-001')
            t['acceptance'] = ['unsafe drift']
            before = copy.deepcopy(board.state)
            with self.assertRaisesRegex(ValueError, 'conflicting acceptance'):
                dispatch.apply_wave(board, self.m, ordered, self.source)
            self.assertEqual(board.state, before)


if __name__ == '__main__':
    unittest.main()
