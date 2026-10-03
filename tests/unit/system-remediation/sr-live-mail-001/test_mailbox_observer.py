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
    def test_localized_all_folder_is_discovered_before_readonly_selection(self):
        # Modified UTF-7 wire name for a localized mailbox, not an English alias.
        mailbox = b'[Gmail]/&YkBnCZg1TvY-'
        client = Mock()
        client.list.return_value = ('OK', [
            b'(\\HasNoChildren) "/" "INBOX"',
            b'(\\HasNoChildren \\Sent) "/" "[Gmail]/Sent Mail"',
            b'(\\HasNoChildren \\All) "/" "' + mailbox + b'"',
        ])
        client.select.side_effect = lambda name, readonly: ('OK', []) if name == b'"' + mailbox + b'"' and readonly else ('NO', [b'Unknown mailbox'])
        client.response.return_value = ('UIDVALIDITY', [b'900'])
        client.uid.side_effect = [('OK', [b'45']), ('OK', [(b'data', mime())])]
        result = observer.observe(client, MESSAGE_ID, 'unit+invite@gmail.com', 'unit@gmail.com', '邀請測試', ['Business id 123'])
        self.assertTrue(result['matched_content'])
        client.list.assert_called_once_with('""', '*')
        client.select.assert_called_once_with(b'"' + mailbox + b'"', readonly=True)

    def test_placeholder_domains_are_rejected_for_both_flows(self):
        for domain in ('example.com', 'EXAMPLE.NET', 'sub.example.org', 'fixture-mail.org',
                       'demo.mail.org', 'mail.invalid', 'mail.test', 'mail.localhost'):
            for flow in ('invite', 'approve'):
                with self.subTest(domain=domain, flow=flow), self.assertRaises(ValueError):
                    observer.derive_alias_recipient('unit@' + domain, flow)

    def test_aliases_preserve_gmail_and_workspace_domains(self):
        for username in ('unit@gmail.com', 'unit@googlemail.com', 'unit@WORKSPACE-MAIL.ORG',
                         'unit@sub-domain.workspace-mail.org', 'unit@xn--bcher-kva.org', "o'neil+dev@workspace-mail.org"):
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
        client.login.return_value = ('OK', [])
        client.list.return_value = ('OK', [b'(\\All) "/" "[Gmail]/All Mail"'])
        client.select.return_value = ('OK', [])
        client.response.return_value = ('UIDVALIDITY', [b'900'])
        message = EmailMessage()
        message['From'] = 'mail.acceptance@workspace-mail.org'
        message['To'] = 'mail.acceptance+invite@workspace-mail.org'
        message['Message-ID'] = MESSAGE_ID
        message['Subject'] = 'Invitation'
        message.set_content('Business content')
        client.uid.side_effect = [('OK', [b'45']), ('OK', [(b'data', message.as_bytes())])]
        secrets = {'drts-dev-smtp-username': 'mail.acceptance@workspace-mail.org',
                   'drts-dev-smtp-password': 'private-password', 'drts-dev-smtp-from-email': 'mail.acceptance@workspace-mail.org'}
        output = io.StringIO()
        with patch.dict(observer.os.environ, {'GITHUB_ACTIONS': 'true', 'DEV_GCP_PROJECT_ID': observer.PROJECT}), \
             patch.object(observer.sys, 'stdin', io.StringIO(json.dumps(request))), \
             patch.object(observer.sys, 'stdout', output), patch.object(observer.sys, 'stderr', io.StringIO()), \
             patch.object(observer, 'secret', side_effect=secrets.__getitem__), \
             patch.object(observer.urllib.request, 'build_opener') as opener, \
             patch.object(observer.imaplib, 'IMAP4_SSL', return_value=client):
            opener.return_value.open.return_value = health
            observer.main()
        client.login.assert_called_once_with('mail.acceptance@workspace-mail.org', 'private-password')
        client.select.assert_called_once_with(b'"[Gmail]/All Mail"', readonly=True)
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
        client.login.return_value = ('OK', [])
        client.list.return_value = ('OK', [b'(\\All) "/" "[Gmail]/All Mail"'])
        client.select.return_value = ('OK', [])
        client.response.return_value = ('UIDVALIDITY', [b'900'])
        client.uid.side_effect = [('OK', [b'45']), ('OK', [(b'data', mime())])]
        result = observer.observe(client, MESSAGE_ID, 'unit+invite@gmail.com', 'unit@gmail.com', '邀請測試', ['Business id 123'])
        self.assertEqual(result['uid'], '45')
        client.select.assert_called_once_with(b'"[Gmail]/All Mail"', readonly=True)
        self.assertEqual(client.uid.call_args_list[0].args, ('search', None, 'HEADER', 'Message-ID', '"' + MESSAGE_ID + '"'))
        self.assertEqual(client.uid.call_args_list[1].args, ('fetch', b'45', '(BODY.PEEK[])'))

    def test_duplicate_message_is_not_accepted_as_unique_arrival(self):
        client = Mock()
        client.login.return_value = ('OK', [])
        client.list.return_value = ('OK', [b'(\\All) "/" "[Gmail]/All Mail"'])
        client.select.return_value = ('OK', [])
        client.response.return_value = ('UIDVALIDITY', [b'900'])
        client.uid.return_value = ('OK', [b'45 46'])
        with self.assertRaisesRegex(ValueError, '^imap_search_failed$'):
            observer.observe(client, MESSAGE_ID, 'unit+invite@gmail.com', 'unit@gmail.com', '邀請測試', ['Business id 123'])


class MailboxDiscoveryAndDiagnosticsTest(unittest.TestCase):
    def client(self):
        client = MagicMock()
        client.__enter__.return_value = client
        client.login.return_value = ('OK', [])
        client.list.return_value = ('OK', [b'(\\All) "/" "[Gmail]/All Mail"'])
        client.select.return_value = ('OK', [])
        client.response.return_value = ('UIDVALIDITY', [b'900'])
        client.uid.side_effect = [('OK', [b'45']), ('OK', [(b'data', mime())])]
        return client

    def observe(self, client, **kwargs):
        return observer.observe(client, MESSAGE_ID, 'unit+invite@gmail.com', 'unit@gmail.com', '邀請測試', ['Business id 123'], **kwargs)

    def cli(self, client, *, health_sha='a' * 40, secret_error=None, connect_error=None):
        request = {'candidate_sha': 'a' * 40, 'api_origin': 'https://drts-dev-api-r6ykdme3wa-uc.a.run.app',
                   'delivery_id': '11111111-1111-1111-1111-111111111111', 'flow': 'invite',
                   'subject': '邀請測試', 'required_text': ['Business id 123']}
        health = MagicMock()
        health.__enter__.return_value = health
        health.status = 200
        health.headers = {'x-drts-candidate-sha': health_sha}
        secrets = {'drts-dev-smtp-username': 'unit@gmail.com',
                   'drts-dev-smtp-password': 'private-password', 'drts-dev-smtp-from-email': 'unit@gmail.com'}
        output, errors = io.StringIO(), io.StringIO()
        with patch.dict(observer.os.environ, {'GITHUB_ACTIONS': 'true', 'DEV_GCP_PROJECT_ID': observer.PROJECT}), \
             patch.object(observer.sys, 'stdin', io.StringIO(json.dumps(request))), \
             patch.object(observer.sys, 'stdout', output), patch.object(observer.sys, 'stderr', errors), \
             patch.object(observer, 'secret', side_effect=secret_error or secrets.__getitem__) as get_secret, \
             patch.object(observer.urllib.request, 'build_opener') as opener, \
             patch.object(observer.imaplib, 'IMAP4_SSL', return_value=client, side_effect=connect_error) as connect:
            opener.return_value.open.return_value = health
            code = observer.run_cli()
        # The existing Actions mask command is intentional; diagnostics cannot
        # contain any additional mailbox value, raw exception, body or token.
        diagnostic = '\n'.join(line for line in errors.getvalue().splitlines() if line != '::add-mask::unit+invite@gmail.com')
        for forbidden in ('private', 'unit@gmail.com', 'SUPER_SECRET', 'Business id', 'Traceback'):
            self.assertNotIn(forbidden, output.getvalue() + diagnostic)
        return code, json.loads(output.getvalue()), diagnostic, get_secret, connect

    def test_atoms_literals_escaped_quoted_and_case_insensitive_all_flags(self):
        cases = [
            ([b'(\\aLl \\HasNoChildren) NIL Archiv'], b'Archiv', b'"Archiv"'),
            ([b'(\\All) "/" "[Gmail]/Tous les messages"'], b'[Gmail]/Tous les messages', b'"[Gmail]/Tous les messages"'),
            ([b'(\\All) "/" "private\\"quote\\\\slash"'], b'private"quote\\slash', b'"private\\"quote\\\\slash"'),
            ([(b'(\\All) "/" {18}', b'private All Folder'), b''], b'private All Folder', b'"private All Folder"'),
        ]
        for rows, name, quoted in cases:
            with self.subTest(rows=rows):
                client = self.client()
                client.list.return_value = ('OK', rows)
                result = self.observe(client)
                client.select.assert_called_once_with(quoted, readonly=True)
                self.assertEqual(result['mailbox'], '\\All')
                self.assertEqual(result['mailbox_sha256'], observer.hashlib.sha256(name).hexdigest())
                self.assertNotIn('private', json.dumps(result))

    def test_missing_noselect_false_all_and_ambiguous_flags_fail_before_select(self):
        for rows, stage in [
            ([None], 'imap_all_folder_not_found'),
            ([b'(\\Sent) "/" "[Gmail]/All Mail"', b'() "/" "INBOX"'], 'imap_all_folder_not_found'),
            ([b'(\\AllMail) "/" Archive'], 'imap_all_folder_not_found'),
            ([b'(\\All \\Noselect) "/" Archive'], 'imap_all_folder_not_found'),
            ([b'(\\All) "/" Archive', b'(\\All) "/" Other'], 'imap_all_folder_ambiguous'),
        ]:
            with self.subTest(rows=rows):
                client = self.client()
                client.list.return_value = ('OK', rows)
                code, payload, _, _, _ = self.cli(client)
                self.assertEqual((code, payload), (1, {'error': {'stage': stage}}))
                client.select.assert_not_called()
                client.uid.assert_not_called()

    def test_malformed_names_cannot_inject_a_select_command(self):
        for rows in [
            [b'(\\All) "/" "private\r\nLOGOUT"'],
            [b'(\\All) "/" "private" INBOX'],
            [b'(\\All) "/" "bad\\escape"'],
            [(b'(\\All) "/" {999}', b'private')],
            [(b'(\\All) "/" {8}', b'private\x00')],
        ]:
            with self.subTest(rows=rows):
                client = self.client()
                client.list.return_value = ('OK', rows)
                code, payload, _, _, _ = self.cli(client)
                self.assertEqual((code, payload), (1, {'error': {'stage': 'imap_list_failed'}}))
                client.select.assert_not_called()

    def test_login_list_select_failures_have_safe_distinct_stages(self):
        for method, stage in [('login', 'imap_login_failed'), ('list', 'imap_list_failed'), ('select', 'imap_select_failed')]:
            for raises in (False, True):
                with self.subTest(method=method, raises=raises):
                    client = self.client()
                    operation = getattr(client, method)
                    if raises:
                        operation.side_effect = observer.imaplib.IMAP4.error('private-password unit@gmail.com SUPER_SECRET')
                    else:
                        operation.return_value = ('NO', [b'private server detail'])
                    code, payload, diagnostic, _, _ = self.cli(client)
                    self.assertEqual((code, payload), (1, {'error': {'stage': stage}}))
                    self.assertIn('stage=' + stage, diagnostic)
                    client.uid.assert_not_called()
                    if method == 'login':
                        client.list.assert_not_called()

    def test_preflight_credentials_and_connection_do_not_appear_as_login_failures(self):
        for kwargs, stage in [
            ({'health_sha': 'b' * 40}, 'mailbox_preflight_failed'),
            ({'secret_error': RuntimeError('private-secret')}, 'mailbox_credentials_failed'),
            ({'connect_error': OSError('private-connection')}, 'imap_connection_failed'),
        ]:
            with self.subTest(stage=stage):
                client = self.client()
                code, payload, _, get_secret, connect = self.cli(client, **kwargs)
                self.assertEqual((code, payload), (1, {'error': {'stage': stage}}))
                client.login.assert_not_called()
                if stage == 'mailbox_preflight_failed':
                    get_secret.assert_not_called()
                if stage != 'imap_connection_failed':
                    connect.assert_not_called()

    def test_search_fetch_and_uidvalidity_fail_closed(self):
        for case, stage in [('validity', 'imap_select_failed'), ('search', 'imap_search_failed'),
                            ('duplicate', 'imap_search_failed'), ('uid', 'imap_search_failed'), ('fetch', 'imap_fetch_failed')]:
            with self.subTest(case=case):
                client = self.client()
                if case == 'validity':
                    client.response.return_value = ('UIDVALIDITY', [None])
                elif case == 'search':
                    client.uid.side_effect = observer.imaplib.IMAP4.error('private-search')
                elif case == 'duplicate':
                    client.uid.side_effect = [('OK', [b'45 46'])]
                elif case == 'uid':
                    client.uid.side_effect = [('OK', [b'private-uid'])]
                else:
                    client.uid.side_effect = [('OK', [b'45']), ('NO', [b'private-fetch'])]
                code, payload, _, _, _ = self.cli(client)
                self.assertEqual((code, payload), (1, {'error': {'stage': stage}}))

    def test_deadline_is_distinct_from_content_mismatch(self):
        client = self.client()
        client.uid.side_effect = [('OK', [b''])]
        with patch.object(observer.time, 'monotonic', side_effect=[0, 0, 0, 61]), patch.object(observer.time, 'sleep'):
            code, payload, _, _, _ = self.cli(client)
        self.assertEqual((code, payload), (1, {'error': {'stage': 'message_not_found_before_deadline'}}))
        self.assertEqual(client.uid.call_count, 1)

    def test_delayed_message_is_polled_and_read_without_marking_seen(self):
        client = self.client()
        client.uid.side_effect = [('OK', [b'']), ('OK', [b'45']), ('OK', [(b'data', mime())])]
        with patch.object(observer.time, 'sleep'):
            result = self.observe(client)
        self.assertTrue(result['matched_content'])
        self.assertEqual([call.args[0] for call in client.uid.call_args_list], ['search', 'search', 'fetch'])
        self.assertEqual(client.uid.call_args_list[-1].args, ('fetch', b'45', '(BODY.PEEK[])'))

    def test_real_mime_mismatches_have_safe_stage_for_both_aliases(self):
        for flow in ('invite', 'approve'):
            for field in ('Message-ID', 'To', 'From', 'Subject', 'body'):
                with self.subTest(flow=flow, field=field):
                    message = observer.email.message_from_bytes(mime('unit+' + flow + '@gmail.com'), policy=observer.email.policy.default)
                    if field == 'body':
                        message.set_content('private wrong business content')
                    else:
                        message.replace_header(field, 'private@other.invalid')
                    client = self.client()
                    client.uid.side_effect = [('OK', [b'45']), ('OK', [(b'data', message.as_bytes())])]
                    consume = Mock()
                    with self.assertRaisesRegex(observer.MailboxObservationError, '^content_mismatch$'):
                        observer.observe(client, MESSAGE_ID, 'unit+' + flow + '@gmail.com', 'unit@gmail.com', '邀請測試', ['Business id 123'], consume=consume)
                    consume.assert_not_called()

    def test_acceptance_failure_does_not_claim_a_content_or_login_failure(self):
        consume = Mock(side_effect=ValueError('private invitation token'))
        with self.assertRaisesRegex(observer.MailboxObservationError, '^invitation_acceptance_failed$'):
            self.observe(self.client(), consume=consume)


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
