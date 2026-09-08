"""Validate coverage completeness and prevent false acceptance from local reports."""
import importlib.util
import json
from pathlib import Path
import unittest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('collector', HERE / 'collect.py')
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class InventoryTests(unittest.TestCase):
    def test_failed_skipped_empty_and_absent_are_not_pass(self):
        for status, assertions in [('failed', ['passed']), ('passed', ['failed']),
                                   ('passed', ['pending']), ('passed', []), ('pending', ['passed'])]:
            suite = {'path': 'test.ts', 'status': status,
                     'assertions': [{'status': a} for a in assertions]}
            self.assertNotEqual(collector.regression_state(['test.ts'], [suite]),
                                'local_regression_passed_live_missing')
        self.assertEqual(collector.regression_state([], []), 'current_version_indexed_reproduction_missing')

    def test_pass_does_not_release_live(self):
        suite = {'path': 'test.ts', 'status': 'passed', 'assertions': [{'status': 'passed'}]}
        self.assertEqual(collector.regression_state(['test.ts'], [suite]), 'local_regression_passed_live_missing')

    def test_inventory_matches_authoritative_coverage(self):
        data = collector.read(collector.DOC / 'readiness.json')
        coverage = collector.read(collector.DOC / 'coverage.json')
        self.assertEqual({c['id'] for c in data['capabilities']}, {k for k in coverage if k.startswith('C')})
        self.assertEqual({i['id'] for i in data['issues']},
                         {f'R{i:02}' for i in range(1, 31)} | {f'N{i:02}' for i in range(1, 15)})
        for issue in data['issues']:
            self.assertTrue(issue['current_source_locators'], issue['id'])
            self.assertEqual(issue['base_sha'], data['base_sha'])
            self.assertEqual(issue['live_status'], 'missing')
        for capability in data['capabilities']:
            self.assertTrue(capability['role'])
            self.assertTrue(capability['data_requirements'])
            self.assertTrue(capability['scenario_requirement'])
            self.assertTrue(capability['provisioning_owner'])
            self.assertEqual(capability['resource_ids'], [])
        self.assertEqual(len(data['live_gates']), 9)
        for gate in data['live_gates']:
            for key in ('missing', 'provider_owner', 'readback', 'requirements'):
                self.assertTrue(gate[key])
            self.assertEqual(gate['status'], 'missing')
            for requirement in gate['requirements']:
                self.assertEqual(requirement['status'], 'missing')
                self.assertIsNone(requirement['resource_id'])
    def test_historical_blobs_and_merge_ancestry(self):
        if collector.git('rev-parse', '--is-shallow-repository') == 'true':
            self.skipTest('Historical evidence requires a full clone; CI still validates inventory semantics')
        data = collector.read(collector.DOC / 'readiness.json')
        for issue in data['issues']:
            for locator in issue['current_source_locators']:
                self.assertEqual(locator['git_blob'], collector.git('rev-parse', f"{data['base_sha']}:{locator['path']}"))
        for evidence in data['task_evidence'].values():
            for merge in evidence['merged_prs']:
                self.assertEqual(collector.git('merge-base', merge['sha'], data['base_sha']), merge['sha'])


if __name__ == '__main__':
    unittest.main()
