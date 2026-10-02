import importlib.util
from pathlib import Path
import unittest
from email.message import EmailMessage
from unittest.mock import Mock

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


if __name__ == '__main__':
    unittest.main()
