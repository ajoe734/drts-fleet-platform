import importlib.util
from pathlib import Path
import unittest
import io
import json
from datetime import datetime, timezone, timedelta
from email.message import EmailMessage
from unittest.mock import Mock, MagicMock, patch

path = Path(__file__).resolve().parents[3] / 'e2e/system-remediation/sr-live-mail-001/mailbox_observer.py'
spec = importlib.util.spec_from_file_location('mailbox_observer', path)
observer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(observer)
MESSAGE_ID = '<11111111-1111-1111-1111-111111111111@notification.drts.invalid>'


def mime(recipient='unit+invite@gmail.com', body='Invitation code: ti_SUPER_SECRET\nBusiness id 123'):
    message = EmailMessage()
    message['From'] = 'unit@gmail.com'
    message['To'] = recipient
    message['Message-ID'] = MESSAGE_ID
    message['Subject'] = '邀請測試'
    message.set_content(body)
    return message.as_bytes()


class MailboxObservationTest(unittest.TestCase):
    def test_aliases_preserve_gmail_and_workspace_domains(self):
        for username in ('unit@gmail.com', 'unit@googlemail.com', 'unit@EXAMPLE.COM',
                         'unit@sub-domain.example.org', 'unit@xn--bcher-kva.example', "o'neil+dev@example.com"):
            for flow in ('invite', 'approve'):
                with self.subTest(username=username, flow=flow):
                    local, domain = username.split('@')
                    self.assertEqual(observer.derive_alias_recipient(username, flow), local + '+' + flow + '@' + domain)

    def test_aliases_reject_injection_malformed_addresses_and_unsupported_tags(self):
        for username in ('unit@', '@example.com', 'unit@@example.com', 'unit@example.com\n',
                         'unit\n@example.com', 'unit@example.com\r\nEVIL=value', 'Name <unit@example.com>',
                         'unit@example.com,other@example.com', 'unit@-example.com', 'unit@example-.com',
                         'unit@exam_ple.com', 'unit@example..com', '.unit@example.com', 'unit.@example.com',
                         'unit..test@example.com', 'a' * 58 + '@example.com', 'unit@' + 'a' * 64 + '.com'):
            with self.subTest(username=username), self.assertRaisesRegex(ValueError, '^Invalid dedicated mailbox$'):
                observer.derive_alias_recipient(username, 'invite')
        for flow in ('', 'other', 'invite\nPRIVATE=value', 'approve@elsewhere.example'):
            with self.subTest(flow=flow), self.assertRaisesRegex(ValueError, '^Unauthorized alias$'):
                observer.derive_alias_recipient('unit@example.com', flow)

    def test_workspace_sender_reaches_readonly_imap_and_real_mime_inspection(self):
        request = {'candidate_sha': 'a' * 40, 'api_origin': 'https://drts-dev-api-r6ykdme3wa-uc.a.run.app',
                   'delivery_id': '11111111-1111-1111-1111-111111111111', 'flow': 'invite',
                   'subject': 'Invitation', 'required_text': ['Business content']}
        health = MagicMock()
        health.__enter__.return_value = health
        health.status = 200
        health.headers = {'x-drts-candidate-sha': 'a' * 40}
        client = MagicMock()
        client.__enter__.return_value = client
        client.select.return_value = ('OK', [])
        client.response.return_value = ('UIDVALIDITY', [b'900'])
        message = EmailMessage()
        message['From'] = 'mail.acceptance@example.com'
        message['To'] = 'mail.acceptance+invite@example.com'
        message['Message-ID'] = MESSAGE_ID
        message['Subject'] = 'Invitation'
        message.set_content('Business content')
        client.uid.side_effect = [('OK', [b'45']), ('OK', [(b'data', message.as_bytes())])]
        secrets = {'drts-dev-smtp-username': 'mail.acceptance@example.com',
                   'drts-dev-smtp-password': 'private-password', 'drts-dev-smtp-from-email': 'mail.acceptance@example.com'}
        output = io.StringIO()
        with patch.dict(observer.os.environ, {'GITHUB_ACTIONS': 'true', 'DEV_GCP_PROJECT_ID': observer.PROJECT}), \
             patch.object(observer.sys, 'stdin', io.StringIO(json.dumps(request))), \
             patch.object(observer.sys, 'stdout', output), patch.object(observer.sys, 'stderr', io.StringIO()), \
             patch.object(observer, 'secret', side_effect=secrets.__getitem__), \
             patch.object(observer.urllib.request, 'build_opener') as opener, \
             patch.object(observer.imaplib, 'IMAP4_SSL', return_value=client):
            opener.return_value.open.return_value = health
            observer.main()
        client.login.assert_called_once_with('mail.acceptance@example.com', 'private-password')
        client.select.assert_called_once_with('"[Gmail]/All Mail"', readonly=True)
        self.assertTrue(json.loads(output.getvalue())['matched_content'])
        self.assertNotIn('private-password', output.getvalue())
        self.assertNotIn('mail.acceptance', output.getvalue())

    def inspect(self, raw):
        return observer.inspect_message(raw, MESSAGE_ID, 'unit+invite@gmail.com', 'unit@gmail.com', '邀請測試', ['Business id 123'])

    def test_real_mime_content_is_hashed_without_token_or_address(self):
        result = self.inspect(mime())
        self.assertTrue(result['matched_content'])
        self.assertEqual(len(result['body_sha256']), 64)
        self.assertNotIn('SUPER_SECRET', str(result))
        self.assertNotIn('unit@gmail.com', str(result))

    def test_wrong_alias_cannot_satisfy_receipt(self):
        with self.assertRaisesRegex(ValueError, 'recipient'):
            self.inspect(mime('unit+approve@gmail.com'))

    def test_subject_and_message_id_do_not_substitute_for_content(self):
        with self.assertRaisesRegex(ValueError, 'business content'):
            self.inspect(mime(body='Some unrelated message'))

    def test_readonly_lookup_is_scoped_to_exact_task_message(self):
        client = Mock()
        client.select.return_value = ('OK', [])
        client.response.return_value = ('UIDVALIDITY', [b'900'])
        client.uid.side_effect = [('OK', [b'45']), ('OK', [(b'data', mime())])]
        result = observer.observe(client, MESSAGE_ID, 'unit+invite@gmail.com', 'unit@gmail.com', '邀請測試', ['Business id 123'])
        self.assertEqual(result['uid'], '45')
        client.select.assert_called_once_with('"[Gmail]/All Mail"', readonly=True)
        self.assertEqual(client.uid.call_args_list[0].args, ('search', None, 'HEADER', 'Message-ID', '"' + MESSAGE_ID + '"'))
        self.assertEqual(client.uid.call_args_list[1].args, ('fetch', b'45', '(BODY.PEEK[])'))

    def test_duplicate_message_is_not_accepted_as_unique_arrival(self):
        client = Mock()
        client.select.return_value = ('OK', [])
        client.response.return_value = ('UIDVALIDITY', [b'900'])
        client.uid.return_value = ('OK', [b'45 46'])
        with self.assertRaisesRegex(ValueError, 'duplicate'):
            observer.observe(client, MESSAGE_ID, 'unit+invite@gmail.com', 'unit@gmail.com', '邀請測試', ['Business id 123'])


class InvitationConsumptionTest(unittest.TestCase):
    token = 'tenant_invitation_PRIVATE_1234567890'
    request = {'api_origin': 'https://drts-dev-api-r6ykdme3wa-uc.a.run.app', 'candidate_sha': 'a' * 40,
               'user_id': 'tenant_user_expected', 'acceptance': 'expired'}

    def body(self, expires):
        return 'Invitation code: ' + self.token + '\nThis invitation expires at ' + expires.isoformat() + '.\n'

    def response(self, status, payload, sha='a' * 40):
        result = io.BytesIO(json.dumps(payload).encode())
        result.status = status
        result.headers = {'x-drts-candidate-sha': sha}
        return result

    def test_no_fake_fast_forward_or_http_before_real_expiry(self):
        opener = Mock()
        with self.assertRaisesRegex(ValueError, 'not elapsed'):
            observer.accept_invitation(self.body(datetime.now(timezone.utc) + timedelta(hours=24)), self.request, opener)
        opener.open.assert_not_called()

    def test_actual_expired_denial_records_only_safe_metadata(self):
        opener = Mock()
        opener.open.return_value = self.response(403, {'error': {'code': 'TENANT_INVITATION_ACCEPTANCE_DENIED'}})
        result = observer.accept_invitation(self.body(datetime.now(timezone.utc) - timedelta(hours=1)), self.request, opener)
        self.assertEqual(result['acceptance_status'], 403)
        self.assertNotIn(self.token, str(result))
        call = opener.open.call_args.args[0]
        self.assertEqual(call.full_url, self.request['api_origin'] + '/api/tenant/invitations/accept')
        self.assertEqual(json.loads(call.data), {'invitationToken': self.token})

    def test_link_token_is_parsed_but_link_is_never_followed(self):
        body = 'Accept your invitation: https://untrusted.invalid/accept?token=' + self.token + '\nThis invitation expires at 2026-10-01T01:00:00Z.'
        token, _ = observer.invitation_from_body(body)
        self.assertEqual(token, self.token)

    def test_unrelated_403_or_wrong_candidate_does_not_prove_expiry(self):
        for code, sha in [('SCOPE_DENIED', 'a' * 40), ('TENANT_INVITATION_ACCEPTANCE_DENIED', 'b' * 40)]:
            opener = Mock()
            opener.open.return_value = self.response(403, {'error': {'code': code}}, sha)
            with self.assertRaises(ValueError):
                observer.accept_invitation(self.body(datetime.now(timezone.utc) - timedelta(hours=1)), self.request, opener)

    def test_success_must_activate_the_expected_user_in_the_expected_tenant(self):
        opener = Mock()
        opener.open.return_value = self.response(201, {'data': {'accepted': True, 'user': {'user_id': 'other-user', 'tenant_id': '10000000-0000-0000-0000-000000000201', 'status': 'active'}}})
        with self.assertRaisesRegex(ValueError, 'expected user'):
            observer.accept_invitation(self.body(datetime.now(timezone.utc) + timedelta(hours=1)), {**self.request, 'acceptance': 'accepted'}, opener)


if __name__ == '__main__':
    unittest.main()
