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
        self.env.update(
            DRTS_LIVE_INVOICE_MAIL_TEST_INVOICE_ID='20000000-0000-0000-0000-000000000456',
            DRTS_LIVE_INVOICE_MAIL_NON_ALLOWLISTED_INVOICE_ID='20000000-0000-0000-0000-000000000789',
            DRTS_LIVE_INVOICE_MAIL_READ_ONLY_INVOICE_ID='20000000-0000-0000-0000-000000000abc',
            DRTS_LIVE_INVOICE_MAIL_TEST_TENANT_ID='10000000-0000-0000-0000-000000000123',
            DRTS_LIVE_INVOICE_MAIL_NON_ALLOWLISTED_TENANT_ID='10000000-0000-0000-0000-000000000789',
            DRTS_LIVE_INVOICE_MAIL_READ_ONLY_TENANT_ID='10000000-0000-0000-0000-000000000abc',
            DRTS_LIVE_INVOICE_MAIL_TENANT_ACTOR_ID='a1',
            DRTS_LIVE_INVOICE_MAIL_READ_ONLY_ACTOR_ID='a2',
            DRTS_LIVE_INVOICE_MAIL_NON_ALLOWLISTED_ACTOR_ID='a3',
            DRTS_LIVE_INVOICE_MAIL_PORTAL_ORIGIN='http://portal.invalid'
        )
        self.evidence = {'candidateSha': SHA, 'headSha': SHA, 'status': 'passed', 'exitCode': 0,
                         'unimplementedLiveSurfaces': [], 'errors': [],
                         'tenantId': '10000000-0000-0000-0000-000000000123', 'invoiceId': '20000000-0000-0000-0000-000000000456', 'identityEmail': 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                         'nonAllowlistInvoiceId': '20000000-0000-0000-0000-000000000789', 'readOnlyInvoiceId': '20000000-0000-0000-0000-000000000abc',
                         'invoiceData': {'data': {'tenantId': '10000000-0000-0000-0000-000000000123', 'invoiceId': '20000000-0000-0000-0000-000000000456', 'artifactDownloadMetadata': {'manifestHash': 'a' * 64}}},
                             'roInvoiceData': {'data': {'tenantId': '10000000-0000-0000-0000-000000000abc', 'invoiceId': '20000000-0000-0000-0000-000000000abc', 'artifactDownloadMetadata': {'manifestHash': 'a' * 64}}},
                         'resendMailboxEvidence': {'matched_content': True, 'candidate_sha': SHA, 'delivery_id': 'd2', 'rfc_message_id': '<d2@notification.drts.invalid>', 'body_sha256': 'a' * 64},
                         'mailboxEvidence': {'matched_content': True, 'candidate_sha': SHA, 'delivery_id': 'd1', 'rfc_message_id': '<d1@notification.drts.invalid>', 'body_sha256': 'a' * 64},
                         'downloadProof': {'matched': True, 'manifestHash': 'a' * 64, 'downloadedHash': 'a' * 64, 'downloadedBytes': 12345, 'contentType': 'application/pdf', 'origin': 'http://portal.invalid', 'path': '/downloads/tenant-invoice/20000000-0000-0000-0000-000000000456', 'query': f"?signed_at=2026-10-07T19:00:00.000Z&expires_at=2026-10-07T19:15:00.000Z&key_id=k1&manifest_hash={'a'*64}&sig=REDACTED&sig_v=1", 'status': 200, 'candidateSha': SHA, 'invoiceId': '20000000-0000-0000-0000-000000000456', 'tenantId': '10000000-0000-0000-0000-000000000123', 'browserObserved': True},
                         'durableDeliveries': [
                             {'scenario': 'first_send', 'deliveryId': 'd1', 'idempotencyKey': 'key1', 'acceptedAt': '2026-10-07T00:00:00Z', 'attemptsCount': 1, 'status': 'sent', 'attemptOutcome': 'sent'},
                             {'scenario': 'intentional_resend', 'deliveryId': 'd2', 'idempotencyKey': 'key2', 'acceptedAt': '2026-10-07T00:01:00Z', 'attemptsCount': 1, 'status': 'sent', 'attemptOutcome': 'sent'},
                             {'scenario': 'idempotent_retry', 'deliveryId': 'd1', 'idempotencyKey': 'key1', 'initialAttemptsCount': 1, 'afterRetryAttemptsCount': 1, 'status': 'sent'},
                             {'scenario': 'non_allowlisted', 'deliveryId': 'd3', 'status': 'failed', 'errorCode': 'SMTP_RECIPIENT_NOT_ALLOWLISTED', 'outcome': 'failed', 'acceptedAt': None, 'retryable': False}
                         ],
                         'durableHistoryCount': 2,
                         'httpCalls': [
                             {'path': 'tenant/billing/profile', 'method': 'GET', 'status': 200},
                             {'path': '/api/tenant/invoices/20000000-0000-0000-0000-000000000456', 'method': 'GET', 'status': 200},
                             {'path': 'artifactUrl', 'method': 'GET', 'status': 200},
                             {'path': 'wrong_tenant_portal', 'method': 'GET', 'status': 404, 'ui_isolated': True, 'selected_identity': '20000000-0000-0000-0000-000000000789', 'forbidden_resource': '20000000-0000-0000-0000-000000000456', 'mutation_count': 0, 'forbidden_download_observed': False},
                             {'path': 'read_only_portal', 'method': 'GET', 'status': 200, 'ui_readonly': True, 'selected_identity': '20000000-0000-0000-0000-000000000abc', 'mutation_count': 0, 'send_disabled': True, 'forbidden_download_observed': False, 'download_proof': {'matched': True, 'manifestHash': 'a' * 64, 'downloadedHash': 'a' * 64, 'downloadedBytes': 12345, 'contentType': 'application/pdf', 'origin': 'http://portal.invalid', 'path': '/downloads/tenant-invoice/20000000-0000-0000-0000-000000000abc', 'query': f"?signed_at=2026-10-07T19:00:00.000Z&expires_at=2026-10-07T19:15:00.000Z&key_id=k1&manifest_hash={'a'*64}&sig=REDACTED&sig_v=1", 'status': 200, 'candidateSha': SHA, 'invoiceId': '20000000-0000-0000-0000-000000000abc', 'tenantId': '10000000-0000-0000-0000-000000000abc', 'browserObserved': True}},
                             {'path': 'bad_sig_api', 'method': 'GET', 'status': 403},
                             {'path': '/api/tenant/invoices/20000000-0000-0000-0000-000000000456/mail', 'method': 'POST', 'scenario': 'normal_send', 'status': 201, 'delivery_id': 'd1'},
                             {'path': '/api/tenant/invoices/20000000-0000-0000-0000-000000000456/mail', 'method': 'POST', 'scenario': 'idempotent_retry', 'status': 201, 'delivery_id': 'd1'},
                             {'path': '/api/tenant/invoices/20000000-0000-0000-0000-000000000456/mail', 'method': 'POST', 'scenario': 'intentional_resend', 'status': 201, 'delivery_id': 'd2'},
                             {'path': '/api/tenant/invoices/20000000-0000-0000-0000-000000000456/mail', 'scenario': 'durable_get', 'method': 'GET', 'status': 200},
                             {'scenario': 'wrong_tenant', 'method': 'POST', 'status': 403},
                             {'scenario': 'wrong_invoice', 'method': 'POST', 'status': 403},
                             {'scenario': 'read_only', 'method': 'POST', 'status': 403},
                             {'scenario': 'non_allowlisted', 'method': 'POST', 'status': 201, 'delivery_id': 'd3'},
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

        # missing or incorrect new download proof properties
        ev5 = copy.deepcopy(self.evidence)
        ev5['downloadProof']['origin'] = 'wrong'
        self.assertEqual(gate.evaluate(self.env, ev5, self.provider)['status'], 'failed')

        ev6 = copy.deepcopy(self.evidence)
        ev6['downloadProof']['path'] = '/wrong'
        self.assertEqual(gate.evaluate(self.env, ev6, self.provider)['status'], 'failed')

        ev7 = copy.deepcopy(self.evidence)
        ev7['downloadProof']['status'] = 404
        self.assertEqual(gate.evaluate(self.env, ev7, self.provider)['status'], 'failed')

        ev8 = copy.deepcopy(self.evidence)
        ev8['downloadProof']['candidateSha'] = 'wrong'
        self.assertEqual(gate.evaluate(self.env, ev8, self.provider)['status'], 'failed')


    def test_f5_durable_binding_regressions(self):
        import copy

        # change ONLY durable_get path
        ev = copy.deepcopy(self.evidence)
        for c in ev['httpCalls']:
            if c.get('scenario') == 'durable_get':
                c['path'] = '/api/tenant/invoices/unrelated/mail'
        self.assertEqual(gate.evaluate(self.env, ev, self.provider)['status'], 'failed')

        # change ONLY idempotent_retry durable deliveryId
        ev = copy.deepcopy(self.evidence)
        for d in ev['durableDeliveries']:
            if d.get('scenario') == 'idempotent_retry':
                d['deliveryId'] = 'unrelated'
        self.assertEqual(gate.evaluate(self.env, ev, self.provider)['status'], 'failed')

        # remove negative durable deliveryId and HTTP delivery_id
        ev = copy.deepcopy(self.evidence)
        for d in ev['durableDeliveries']:
            if d.get('scenario') == 'non_allowlisted':
                del d['deliveryId']
        for c in ev['httpCalls']:
            if c.get('scenario') == 'non_allowlisted':
                del c['delivery_id']
        self.assertEqual(gate.evaluate(self.env, ev, self.provider)['status'], 'failed')

        # empty negative deliveryId
        ev_empty = copy.deepcopy(self.evidence)
        for d in ev_empty['durableDeliveries']:
            if d.get('scenario') == 'non_allowlisted':
                d['deliveryId'] = ''
        for c in ev_empty['httpCalls']:
            if c.get('scenario') == 'non_allowlisted':
                c['delivery_id'] = ''
        self.assertEqual(gate.evaluate(self.env, ev_empty, self.provider)['status'], 'failed')

        # change negative POST status to 500
        ev = copy.deepcopy(self.evidence)
        for c in ev['httpCalls']:
            if c.get('scenario') == 'non_allowlisted':
                c['status'] = 500
        self.assertEqual(gate.evaluate(self.env, ev, self.provider)['status'], 'failed')

    def test_f3_f5_role_evidence_regressions(self):
        import copy
        # Baseline passes
        self.assertEqual(gate.evaluate(self.env, self.evidence, self.provider)["status"], "passed")

        # Both pairs missing
        ev_missing = copy.deepcopy(self.evidence)
        del ev_missing["nonAllowlistInvoiceId"]
        del ev_missing["readOnlyInvoiceId"]
        next(c for c in ev_missing["httpCalls"] if c.get("path") == "wrong_tenant_portal")["selected_identity"] = ""
        next(c for c in ev_missing["httpCalls"] if c.get("path") == "read_only_portal")["selected_identity"] = ""
        self.assertEqual(gate.evaluate(self.env, ev_missing, self.provider)["status"], "failed")

        # Both pairs empty string
        ev_empty = copy.deepcopy(self.evidence)
        ev_empty["nonAllowlistInvoiceId"] = ""
        ev_empty["readOnlyInvoiceId"] = ""
        next(c for c in ev_empty["httpCalls"] if c.get("path") == "wrong_tenant_portal")["selected_identity"] = ""
        next(c for c in ev_empty["httpCalls"] if c.get("path") == "read_only_portal")["selected_identity"] = ""
        self.assertEqual(gate.evaluate(self.env, ev_empty, self.provider)["status"], "failed")

        # Both pairs unrelated
        ev_unrelated = copy.deepcopy(self.evidence)
        ev_unrelated["nonAllowlistInvoiceId"] = "unrelated"
        ev_unrelated["readOnlyInvoiceId"] = "unrelated"
        next(c for c in ev_unrelated["httpCalls"] if c.get("path") == "wrong_tenant_portal")["selected_identity"] = "unrelated"
        next(c for c in ev_unrelated["httpCalls"] if c.get("path") == "read_only_portal")["selected_identity"] = "unrelated"
        self.assertEqual(gate.evaluate(self.env, ev_unrelated, self.provider)["status"], "failed")

        # Missing wrong_tenant selected_identity
        ev2 = copy.deepcopy(self.evidence)
        next(c for c in ev2["httpCalls"] if c.get("path") == "wrong_tenant_portal")["selected_identity"] = "bad"
        self.assertEqual(gate.evaluate(self.env, ev2, self.provider)["status"], "failed")

        # Missing read_only send_disabled
        ev3 = copy.deepcopy(self.evidence)
        next(c for c in ev3["httpCalls"] if c.get("path") == "read_only_portal")["send_disabled"] = False
        self.assertEqual(gate.evaluate(self.env, ev3, self.provider)["status"], "failed")

        # Mutation count > 0
        ev4 = copy.deepcopy(self.evidence)
        next(c for c in ev4["httpCalls"] if c.get("path") == "read_only_portal")["mutation_count"] = 1
        self.assertEqual(gate.evaluate(self.env, ev4, self.provider)["status"], "failed")

        # Missing forbidden_resource
        ev5 = copy.deepcopy(self.evidence)
        next(c for c in ev5["httpCalls"] if c.get("path") == "wrong_tenant_portal")["forbidden_resource"] = "bad"
        self.assertEqual(gate.evaluate(self.env, ev5, self.provider)["status"], "failed")

        # Read-only download proof regressions
        ev_ro_proof_missing = copy.deepcopy(self.evidence)
        del next(c for c in ev_ro_proof_missing["httpCalls"] if c.get("path") == "read_only_portal")["download_proof"]
        self.assertEqual(gate.evaluate(self.env, ev_ro_proof_missing, self.provider)["status"], "failed")

        ev_ro_proof_mismatch = copy.deepcopy(self.evidence)
        ro_proof = next(c for c in ev_ro_proof_mismatch["httpCalls"] if c.get("path") == "read_only_portal")["download_proof"]
        ro_proof["manifestHash"] = 'b' * 64
        self.assertEqual(gate.evaluate(self.env, ev_ro_proof_mismatch, self.provider)["status"], "failed")

        ev_ro_proof_bad_bytes = copy.deepcopy(self.evidence)
        ro_proof_bb = next(c for c in ev_ro_proof_bad_bytes["httpCalls"] if c.get("path") == "read_only_portal")["download_proof"]
        ro_proof_bb["downloadedBytes"] = 0
        self.assertEqual(gate.evaluate(self.env, ev_ro_proof_bad_bytes, self.provider)["status"], "failed")

        ev_ro_proof_unmatched = copy.deepcopy(self.evidence)
        ro_proof_un = next(c for c in ev_ro_proof_unmatched["httpCalls"] if c.get("path") == "read_only_portal")["download_proof"]
        ro_proof_un["matched"] = False
        self.assertEqual(gate.evaluate(self.env, ev_ro_proof_unmatched, self.provider)["status"], "failed")

    def test_f3_f5_claim_and_signature_regressions(self):
        import copy
        # Baseline passes
        self.assertEqual(gate.evaluate(self.env, self.evidence, self.provider)["status"], "passed")

        # 1. invoiceData tenantId mismatch
        ev1 = copy.deepcopy(self.evidence)
        ev1["invoiceData"]["data"]["tenantId"] = "wrong"
        self.assertEqual(gate.evaluate(self.env, ev1, self.provider)["status"], "failed")

        # 2. invoiceData invoiceId mismatch
        ev2 = copy.deepcopy(self.evidence)
        ev2["invoiceData"]["data"]["invoiceId"] = "wrong"
        self.assertEqual(gate.evaluate(self.env, ev2, self.provider)["status"], "failed")

        # 3. roInvoiceData tenantId missing
        ev3 = copy.deepcopy(self.evidence)
        del ev3["roInvoiceData"]["data"]["tenantId"]
        self.assertEqual(gate.evaluate(self.env, ev3, self.provider)["status"], "failed")

        # 4. roInvoiceData invoiceId mismatch
        ev4 = copy.deepcopy(self.evidence)
        ev4["roInvoiceData"]["data"]["invoiceId"] = "wrong"
        self.assertEqual(gate.evaluate(self.env, ev4, self.provider)["status"], "failed")

        # 5. Primary query missing sig=REDACTED entirely
        ev5 = copy.deepcopy(self.evidence)
        ev5["downloadProof"]["query"] = f"?signed_at=1&expires_at=2&key_id=3&manifest_hash={'a'*64}&sig_v=1"
        self.assertEqual(gate.evaluate(self.env, ev5, self.provider)["status"], "failed")

        # 6. Primary query substring only (notsig)
        ev6 = copy.deepcopy(self.evidence)
        ev6["downloadProof"]["query"] = f"?signed_at=1&expires_at=2&key_id=3&manifest_hash={'a'*64}&notsig=REDACTED&sig_v=1"
        self.assertEqual(gate.evaluate(self.env, ev6, self.provider)["status"], "failed")

        # 7. Primary query empty sig parameter
        ev7 = copy.deepcopy(self.evidence)
        ev7["downloadProof"]["query"] = f"?signed_at=1&expires_at=2&key_id=3&manifest_hash={'a'*64}&sig=&sig_v=1"
        self.assertEqual(gate.evaluate(self.env, ev7, self.provider)["status"], "failed")

        # 8. Read-only query missing sig=REDACTED entirely
        ev8 = copy.deepcopy(self.evidence)
        ro_proof = next(c for c in ev8["httpCalls"] if c.get("path") == "read_only_portal")["download_proof"]
        ro_proof["query"] = f"?signed_at=1&expires_at=2&key_id=3&manifest_hash={'a'*64}&sig_v=1"
        self.assertEqual(gate.evaluate(self.env, ev8, self.provider)["status"], "failed")

        # 9. Read-only query substring only
        ev9 = copy.deepcopy(self.evidence)
        ro_proof9 = next(c for c in ev9["httpCalls"] if c.get("path") == "read_only_portal")["download_proof"]
        ro_proof9["query"] = f"?signed_at=1&expires_at=2&key_id=3&manifest_hash={'a'*64}&notsig=REDACTED&sig_v=1"
        self.assertEqual(gate.evaluate(self.env, ev9, self.provider)["status"], "failed")

    def test_f4_f6_actual_helper_output(self):
        import subprocess
        import json
        import copy
        
        node_script = r'''
        const { stripTypeScriptTypes } = require('module');
        const fs = require('fs');
        const crypto = require('crypto');
        
        const spec = fs.readFileSync('tests/e2e/system-remediation/sr-live-invoice-mail-20261007/live-invoice-mail.spec.ts', 'utf8');
        const funcStr = spec.substring(spec.indexOf('export async function observeAndEvaluateDownload'));
        const jsCode = stripTypeScriptTypes(funcStr.replace(/export async function/g, 'async function').replace(/export function/g, 'function'));
        
        eval(jsCode);
        
        async function run() {
            const input = JSON.parse(fs.readFileSync(0, 'utf8'));
            const searchParams = new URLSearchParams();
            searchParams.append('manifest_hash', input.manifest_hash);
            searchParams.append('signed_at', input.signed_at);
            searchParams.append('expires_at', input.expires_at);
            searchParams.append('key_id', input.key_id);
            searchParams.append('sig_v', input.sig_v);
            searchParams.append('sig', input.sig);
            
            if (input.duplicate_sig) {
                searchParams.append('sig', input.sig);
            }
            if (input.duplicate_hash) {
                searchParams.append('manifest_hash', input.manifest_hash);
            }
            
            const url = `http://portal.invalid/downloads/tenant-invoice/${input.invoiceId}?${searchParams.toString()}`;
            
            const popupResponse = {
                headers: () => ({'content-type': 'application/pdf', 'x-drts-candidate-sha': input.candidateSha}),
                body: async () => Buffer.from('%PDF-test'),
                url: () => url,
                status: () => 200
            };
            
            try {
                const proof = await evaluateDownloadResponse(popupResponse, input.candidateSha, input.manifest_hash, input.invoiceId, input.tenantId);
                console.log(JSON.stringify({ success: true, proof }));
            } catch (e) {
                console.log(JSON.stringify({ success: false, error: e.message }));
            }
        }
        
        run();
        '''
        
        def get_proof(manifest_hash, signed_at, expires_at, key_id, sig_v, sig, candidate_sha, invoice_id, tenant_id, duplicate_sig=False, duplicate_hash=False):
            input_data = json.dumps({
                'manifest_hash': manifest_hash,
                'signed_at': signed_at,
                'expires_at': expires_at,
                'key_id': key_id,
                'sig_v': sig_v,
                'sig': sig,
                'candidateSha': candidate_sha,
                'invoiceId': invoice_id,
                'tenantId': tenant_id,
                'duplicate_sig': duplicate_sig,
                'duplicate_hash': duplicate_hash
            })
            res = subprocess.run(['node', '-e', node_script], input=input_data, text=True, capture_output=True, check=True)
            return json.loads(res.stdout.splitlines()[-1])

        # Base inputs
        manifest_hash = '3c87d37f1dbea6909f917ce437c390fb8e655a774387d9e69301c0b2283d5b63'
        candidate_sha = SHA
        
        # Positive case (Primary and Read-Only)
        res_primary = get_proof(manifest_hash, '2026-10-07T19:00:00.000Z', '2026-10-07T19:15:00.000Z', 'k1', '1', 'valid', candidate_sha, '20000000-0000-0000-0000-000000000456', '10000000-0000-0000-0000-000000000123')
        self.assertTrue(res_primary['success'])
        
        res_ro = get_proof(manifest_hash, '2026-10-07T19:00:00.000Z', '2026-10-07T19:15:00.000Z', 'k1', '1', 'valid', candidate_sha, '20000000-0000-0000-0000-000000000abc', '10000000-0000-0000-0000-000000000abc')
        self.assertTrue(res_ro['success'])
        
        ev = copy.deepcopy(self.evidence)
        ev['invoiceData']['data']['artifactDownloadMetadata']['manifestHash'] = manifest_hash
        ev['roInvoiceData']['data']['artifactDownloadMetadata']['manifestHash'] = manifest_hash
        ev['downloadProof'] = res_primary['proof']
        for c in ev['httpCalls']:
            if c.get('path') == 'read_only_portal':
                c['download_proof'] = res_ro['proof']
                
        self.assertEqual(gate.evaluate(self.env, ev, self.provider)['status'], 'passed')
        
        # Negative cases
        negatives = [
            # whitespace sig
            {'sig': '   '},
            {'sig': ''},
            {'duplicate_sig': True},
            {'duplicate_hash': True},
            {'signed_at': '2026-02-30T19:00:00.000Z'},
            {'expires_at': 'invalid'},
            {'key_id': '   '},
            {'sig_v': 'not_int'}
        ]
        
        for neg in negatives:
            with self.subTest(neg=neg):
                kwargs = {
                    'manifest_hash': manifest_hash, 'signed_at': '2026-10-07T19:00:00.000Z',
                    'expires_at': '2026-10-07T19:15:00.000Z', 'key_id': 'k1', 'sig_v': '1',
                    'sig': 'valid', 'candidate_sha': candidate_sha,
                    'invoice_id': '20000000-0000-0000-0000-000000000456', 'tenant_id': '10000000-0000-0000-0000-000000000123'
                }
                kwargs.update(neg)
                res = get_proof(**kwargs)
                self.assertFalse(res['success'], f"Expected failure for {neg}")

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

    @patch.object(gate, 'Path')
    def test_f1_cleanup_validation(self, mock_path):
        import json
        import os

        class DummyPath:
            _files = {}
            def __init__(self, name=""): self.name = name
            def mkdir(self, **kwargs): pass
            def __truediv__(self, other): return DummyPath(other)
            def write_text(self, data):
                if self.name == "run-status.json":
                    DummyPath._files["run-status.json"] = json.loads(data)
            def read_text(self):
                if self.name == "evidence-mail.json": return json.dumps(DummyPath.evidence)
                if self.name == "evidence-provider.json": return json.dumps({'candidate_sha': SHA, 'alias_revision_fresh': True})
                if self.name == "evidence-bootstrap.json": return json.dumps(DummyPath.bootstrap_ev)
                if self.name == "evidence-teardown.json": return json.dumps(DummyPath.teardown_ev)
                return "{}"

        valid_keys = [
            "DRTS_LIVE_INVOICE_MAIL_ROLE_SESSION_TOKEN",
            "DRTS_LIVE_INVOICE_MAIL_READ_ONLY_TOKEN",
            "DRTS_LIVE_INVOICE_MAIL_NON_ALLOWLISTED_TOKEN"
        ]
        valid_objects = [
            {"exportKey": "DRTS_LIVE_INVOICE_MAIL_ROLE_SESSION_TOKEN", "observed_role": "tenant_admin", "observed_scopes": ["tenant:billing:read", "tenant:billing:write"], "observed_actor_id": "a1", "observed_tenant_id": "10000000-0000-0000-0000-000000000123"},
            {"exportKey": "DRTS_LIVE_INVOICE_MAIL_READ_ONLY_TOKEN", "observed_role": "tenant_viewer", "observed_scopes": ["tenant:billing:read"], "observed_actor_id": "a2", "observed_tenant_id": "10000000-0000-0000-0000-000000000abc"},
            {"exportKey": "DRTS_LIVE_INVOICE_MAIL_NON_ALLOWLISTED_TOKEN", "observed_role": "tenant_admin", "observed_scopes": ["tenant:billing:read", "tenant:billing:write"], "observed_actor_id": "a3", "observed_tenant_id": "10000000-0000-0000-0000-000000000789"}
        ]
        base_bootstrap = {"runId": "run1", "candidateSha": SHA, "issued_sessions_count": 3, "issued_sessions": valid_objects.copy()}
        base_teardown = {"runId": "run1", "candidateSha": SHA, "success": True, "attempted": 3, "failures": 0, "sessions": [{"key": k, "status": "success"} for k in valid_keys]}

        def run_main(b_ev, t_ev):
            DummyPath._files.clear()
            DummyPath.evidence = self.evidence
            DummyPath.bootstrap_ev = b_ev
            DummyPath.teardown_ev = t_ev
            mock_path.return_value = DummyPath()
            with patch.dict(os.environ, {**self.env, "GITHUB_RUN_ID": "run1", "CANDIDATE_SHA": SHA}, clear=True):
                try:
                    gate.main()
                except SystemExit as e:
                    return e.code, DummyPath._files.get("run-status.json", {})
            return -1, {}

        # 1. Valid
        code, data = run_main(base_bootstrap, base_teardown)
        self.assertEqual(code, 0)
        self.assertEqual(data["status"], "passed")

        # 2. Null issued lists (TypeError before)
        b2 = {**base_bootstrap, "issued_sessions": None}
        code, data = run_main(b2, base_teardown)
        self.assertEqual(code, 1)
        self.assertEqual(data["status"], "failed")

        # 3. Mismatched identity but equal count
        b3 = {**base_bootstrap, "issued_sessions": [valid_objects[0], valid_objects[1], valid_objects[0]]}
        code, data = run_main(b3, base_teardown)
        self.assertEqual(code, 1)
        self.assertEqual(data["status"], "failed")

        # 4. Partial issuance
        b4 = {**base_bootstrap, "issued_sessions_count": 4, "issued_sessions": valid_objects.copy()}
        code, data = run_main(b4, base_teardown)
        self.assertEqual(code, 1)

        # 5. Malformed teardown sessions (AttributeError before)
        t5 = {**base_teardown, "sessions": [None, {"key": valid_keys[1], "status": "success"}, {"key": valid_keys[2], "status": "success"}]}
        code, data = run_main(base_bootstrap, t5)
        self.assertEqual(code, 1)
        self.assertEqual(data["status"], "failed")

        # 6. Unknown key in manifests
        b6 = {**base_bootstrap, "issued_sessions": [{"exportKey": "UNKNOWN_KEY", "observed_role": "tenant_admin", "observed_scopes": ["tenant:billing:read", "tenant:billing:write"], "observed_actor_id": "a1", "observed_tenant_id": "10000000-0000-0000-0000-000000000123"}, valid_objects[1], valid_objects[2]]}
        code, data = run_main(b6, base_teardown)
        self.assertEqual(code, 1)
        t6 = {**base_teardown, "sessions": [{"key": "UNKNOWN_KEY", "status": "success"}, {"key": valid_keys[1], "status": "success"}, {"key": valid_keys[2], "status": "success"}]}
        code, data = run_main(base_bootstrap, t6)
        self.assertEqual(code, 1)

        # 7. Contradiction: issued + not_issued
        t7 = {**base_teardown, "sessions": [{"key": valid_keys[0], "status": "not_issued"}, {"key": valid_keys[1], "status": "success"}, {"key": valid_keys[2], "status": "success"}]}
        code, data = run_main(base_bootstrap, t7)
        self.assertEqual(code, 1)

        # 8. Valid partial cleanup, but missing mandatory role evidence means it fails
        b8 = {**base_bootstrap, "issued_sessions_count": 2, "issued_sessions": [valid_objects[0], valid_objects[1]]}
        t8 = {**base_teardown, "attempted": 2, "sessions": [{"key": valid_keys[0], "status": "success"}, {"key": valid_keys[1], "status": "success"}, {"key": valid_keys[2], "status": "not_issued"}]}
        code, data = run_main(b8, t8)
        self.assertEqual(code, 1)
        self.assertEqual(data["status"], "failed")

        b8_2 = {**base_bootstrap, "issued_sessions_count": 2, "issued_sessions": [valid_objects[1], valid_objects[2]]}
        t8_2 = {**base_teardown, "attempted": 2, "sessions": [{"key": valid_keys[0], "status": "not_issued"}, {"key": valid_keys[1], "status": "success"}, {"key": valid_keys[2], "status": "success"}]}
        code, data = run_main(b8_2, t8_2)
        self.assertEqual(code, 1)
        self.assertEqual(data["status"], "failed")

        b8_3 = {**base_bootstrap, "issued_sessions_count": 2, "issued_sessions": [valid_objects[0], valid_objects[2]]}
        t8_3 = {**base_teardown, "attempted": 2, "sessions": [{"key": valid_keys[0], "status": "success"}, {"key": valid_keys[1], "status": "not_issued"}, {"key": valid_keys[2], "status": "success"}]}
        code, data = run_main(b8_3, t8_3)
        self.assertEqual(code, 1)
        self.assertEqual(data["status"], "failed")

        # 9. Attempted count mismatch
        t9 = {**base_teardown, "attempted": 2} # issued is 3
        code, data = run_main(base_bootstrap, t9)
        self.assertEqual(code, 1)

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
