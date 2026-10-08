"""Unit subprocess boundary adapter; no HTTP, Secret Manager or IMAP traffic."""
import importlib.util
import io
import json
import os
import runpy
import sys
from types import SimpleNamespace
from email.message import EmailMessage
from unittest.mock import MagicMock, patch

spec = importlib.util.spec_from_file_location("pipeline_observer", sys.argv[1])
observer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(observer)
request = json.load(sys.stdin)
username = os.environ["PIPELINE_MAILBOX"]
recipient = os.environ["PIPELINE_INVITE_RECIPIENT"]
if request["flow"] == "approve":
    recipient = recipient.replace("+invite@", "+approve@")
message = EmailMessage()
message["From"] = username
message["To"] = recipient
message["Message-ID"] = "<" + request["delivery_id"] + "@notification.drts.invalid>"
message["Subject"] = request["subject"]
message.set_content("\n".join(request["required_text"]))
client = MagicMock()
client.__enter__.return_value = client
client.login.return_value = ("OK", [])
# Chinese folder name stays in modified UTF-7 on the IMAP wire.
mailbox = b'[Gmail]/&YkBnCZg1TvY-'
client.list.return_value = ("OK", [b'(\\All \\HasNoChildren) "/" "' + mailbox + b'"'])
client.select.return_value = ("OK", [])
client.response.return_value = ("UIDVALIDITY", [b"900"])
client.uid.side_effect = [("OK", [b"45"]), ("OK", [(b"data", message.as_bytes())])]
health = MagicMock()
health.__enter__.return_value = health
health.status = 200
health.headers = {"x-drts-candidate-sha": request["candidate_sha"]}
secrets = {"drts-dev-smtp-username": username, "drts-dev-smtp-password": "private-unit-password",
           "drts-dev-smtp-from-email": username}
failure = os.environ.get("PIPELINE_FAILURE", "")
if failure == "login":
    client.login.side_effect = observer.imaplib.IMAP4.error("private-password private-token private-server-content")
elif failure == "folder":
    client.list.return_value = ("OK", [b'(\\Sent) "/" "private mailbox"'])
elif failure == "select":
    client.select.return_value = ("NO", [b"private server content"])
elif failure == "content":
    message.set_content("private wrong content")
    client.uid.side_effect = [("OK", [b"45"]), ("OK", [(b"data", message.as_bytes())])]
elif failure == "deadline":
    client.uid.side_effect = [("OK", [b""])]
elif failure == "unsafe_error":
    print(json.dumps({"error": {"stage": "private-stage", "message": "private-body"}}))
    sys.exit(1)
elif failure == "malformed_error":
    print("private malformed response")
    sys.exit(1)
with patch.dict(os.environ, {"GITHUB_ACTIONS": "true", "DEV_GCP_PROJECT_ID": observer.PROJECT}), \
     patch.object(sys, "stdin", io.StringIO(json.dumps(request))), \
     patch.object(sys, "stderr", io.StringIO()), \
     patch.object(observer.subprocess, "run", side_effect=lambda args, **kwargs: SimpleNamespace(stdout=secrets[args[5].removeprefix("--secret=")])), \
     patch.object(observer.urllib.request, "build_opener") as opener, \
     patch.object(observer.imaplib, "IMAP4_SSL", return_value=client), \
     patch.object(observer.time, "monotonic", side_effect=[0, 0, 0, 61] if failure == "deadline" else None, return_value=0), \
     patch.object(observer.time, "sleep"):
    opener.return_value.open.return_value = health
    # Exercise the exact CLI failure envelope consumed by the Node parent.
    try:
        runpy.run_path(sys.argv[1], run_name="__main__")
        code = 0
    except SystemExit as error:
        code = error.code
if failure:
    sys.exit(code)
assert code == 0
client.login.assert_called_once_with(username, "private-unit-password")
client.list.assert_called_once_with('""', '*')
client.select.assert_called_once_with(b'"' + mailbox + b'"', readonly=True)
assert client.uid.call_args_list[1].args == ("fetch", b"45", "(BODY.PEEK[])")
