import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3] / 'e2e/system-remediation/sr-live-invoice-mail-20261007'

def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

gate = load('gate-evidence')
metadata = load('provider-metadata')
mailbox = load('mailbox_observer')
SHA = 'a' * 40

class HostedGateTest(unittest.TestCase):
    def setUp(self):
        self.env = {key: 'success' for key in ('DEPLOYMENT_GUARD_OUTCOME', 'SESSION_GUARD_OUTCOME', 'INSTALL_OUTCOME', 'PREFLIGHT_OUTCOME', 'RESOURCES_OUTCOME', 'SESSIONS_OUTCOME', 'RUNNER_OUTCOME', 'TEARDOWN_OUTCOME')}
        self.env.update(CANDIDATE_SHA=SHA, WORKFLOW_SHA=SHA, BASE_SHA='b' * 40)
        self.evidence = {'candidateSha': SHA, 'headSha': SHA, 'status': 'passed', 'exitCode': 0,
                         'unimplementedLiveSurfaces': [], 'errors': [], 
                         'tenantId': '10000000-0000-0000-0000-000000000123', 'invoiceId': '20000000-0000-0000-0000-000000000456', 'identityEmail': 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                         'resendMailboxEvidence': {'matched_content': True, 'candidate_sha': SHA, 'delivery_id': 'd2', 'rfc_message_id': 'valid@message.id', 'body_sha256': 'a' * 64},
                         'mailboxEvidence': {'matched_content': True, 'candidate_sha': SHA, 'delivery_id': 'd1', 'rfc_message_id': 'valid@message.id', 'body_sha256': 'a' * 64},
                         'downloadProof': True,
                         'durableHistoryCount': 1,
                         'httpCalls': [
                             {'path': 'tenant/billing/profile', 'method': 'GET', 'status': 200},
                             {'path': '/api/tenant/invoices/20000000-0000-0000-0000-000000000456', 'method': 'GET', 'status': 200},
                             {'path': 'artifactUrl', 'method': 'GET', 'status': 200},
                             {'path': '/api/tenant/invoices/20000000-0000-0000-0000-000000000456/mail', 'method': 'POST', 'scenario': 'normal_send', 'status': 201, 'delivery_id': 'd1'},
                             {'path': '/api/tenant/invoices/20000000-0000-0000-0000-000000000456/mail', 'method': 'POST', 'scenario': 'idempotent_retry', 'status': 201, 'delivery_id': 'd1'},
                             {'path': '/api/tenant/invoices/20000000-0000-0000-0000-000000000456/mail', 'method': 'POST', 'scenario': 'intentional_resend', 'status': 201, 'delivery_id': 'd2'},
                             {'path': '/api/tenant/invoices/20000000-0000-0000-0000-000000000456/mail', 'scenario': 'durable_get', 'method': 'GET', 'status': 200},
                             {'scenario': 'wrong_tenant', 'method': 'POST', 'status': 403},
                         ],
                         'trackedResources': [{'type': 'provider_receipt', 'id': 'test'}]}
        self.provider = {'candidate_sha': SHA, 'alias_revision_fresh': True}

    def test_complete_shape_with_all_successful_steps_can_pass(self):
        self.assertEqual(gate.evaluate(self.env, self.evidence, self.provider)['status'], 'passed')

    def test_f4_false_positive_regressions(self):
        import copy
        # (a) downloadProof string, invalid rfc_message_id, invalid sha256
        ev1 = copy.deepcopy(self.evidence)
        ev1['downloadProof'] = 'no-download'
        ev1['mailboxEvidence']['rfc_message_id'] = 'unrelated'
        ev1['mailboxEvidence']['body_sha256'] = 'not-a-hash'
        self.assertEqual(gate.evaluate(self.env, ev1, self.provider)['status'], 'failed')

        # (b) idempotent_retry / durable_get path wrong
        ev2 = copy.deepcopy(self.evidence)
        for c in ev2['httpCalls']:
            if c.get('scenario') in ('idempotent_retry', 'durable_get'):
                c['path'] = '/api/tenant/invoices/unrelated/mail'
        self.assertEqual(gate.evaluate(self.env, ev2, self.provider)['status'], 'failed')

        # (c) deleted unimplementedLiveSurfaces
        ev3 = copy.deepcopy(self.evidence)
        del ev3['unimplementedLiveSurfaces']
        self.assertEqual(gate.evaluate(self.env, ev3, self.provider)['status'], 'failed')

        # missing authority fields
        ev4 = copy.deepcopy(self.evidence)
        del ev4['tenantId']
        self.assertEqual(gate.evaluate(self.env, ev4, self.provider)['status'], 'failed')

    def test_green_runner_cannot_hide_missing_stale_or_partial_artifacts(self):
        for override in ({'status': 'failed'}, {'candidateSha': 'b' * 40}, {'headSha': 'b' * 40},
                         {'unimplementedLiveSurfaces': [{'surface': 'expiry'}]}, {'errors': ['failed']},
                         {'exitCode': 1}, {'trackedResources': []}, {'httpCalls': []}):
            with self.subTest(override=override):
                self.assertEqual(gate.evaluate(self.env, {**self.evidence, **override}, self.provider)['status'], 'failed')
        self.assertEqual(gate.evaluate(self.env, {}, self.provider)['status'], 'failed')
        self.assertEqual(gate.evaluate(self.env, self.evidence, {})['status'], 'failed')

    def test_failed_or_skipped_cleanup_and_bootstrap_block_success(self):
        for key in self.env:
            if key.endswith('_OUTCOME'):
                for result in ('failure', 'skipped', ''):
                    self.assertEqual(gate.evaluate({**self.env, key: result}, self.evidence, self.provider)['status'], 'failed')

    def test_revocation_gate_requires_live_provider_freshness(self):
        self.assertEqual(gate.evaluate(self.env, self.evidence, {'candidate_sha': SHA, 'alias_revision_fresh': False})['status'], 'failed')

class ProviderMetadataTest(unittest.TestCase):
    def test_old_revision_and_split_traffic_fail_before_secret_payload_access(self):
        def gcloud(*args):
            if args[:3] == ('run', 'services', 'describe'):
                return {'status': {'traffic': [{'revisionName': 'old', 'percent': 50}, {'revisionName': 'new', 'percent': 50}]}}
            self.fail('No further metadata or secret access should occur')
        with patch.dict(metadata.os.environ, {'GITHUB_ACTIONS': 'true', 'DEV_GCP_PROJECT_ID': metadata.PROJECT}), patch.object(metadata, 'gcloud', gcloud):
            with self.assertRaisesRegex(ValueError, 'Ambiguous'):
                metadata.main()

class MailboxObserverTest(unittest.TestCase):
    def test_derive_alias_recipient_only_allows_invoice(self):
        recipient = mailbox.derive_alias_recipient('test@mycompany.org', 'invoice')
        self.assertEqual(recipient, 'test+invoice@mycompany.org')
        with self.assertRaisesRegex(ValueError, 'Unauthorized alias'):
            mailbox.derive_alias_recipient('test@mycompany.org', 'invite')
        with self.assertRaisesRegex(ValueError, 'Unauthorized alias'):
            mailbox.derive_alias_recipient('test@mycompany.org', 'approve')
        with self.assertRaisesRegex(ValueError, 'Invalid dedicated mailbox'):
            mailbox.derive_alias_recipient('test.mycompany.org', 'invoice')
        with self.assertRaisesRegex(ValueError, 'Invalid dedicated mailbox'):
            mailbox.derive_alias_recipient('test@fixture.mycompany.org', 'invoice')

if __name__ == '__main__':
    unittest.main()
