"""Unit subprocess boundary adapter; no HTTP, Secret Manager or IMAP traffic."""
import importlib.util
import io
import json
import os
import sys
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
client.select.return_value = ("OK", [])
client.response.return_value = ("UIDVALIDITY", [b"900"])
client.uid.side_effect = [("OK", [b"45"]), ("OK", [(b"data", message.as_bytes())])]
health = MagicMock()
health.__enter__.return_value = health
health.status = 200
health.headers = {"x-drts-candidate-sha": request["candidate_sha"]}
secrets = {"drts-dev-smtp-username": username, "drts-dev-smtp-password": "private-unit-password",
           "drts-dev-smtp-from-email": username}
with patch.dict(os.environ, {"GITHUB_ACTIONS": "true", "DEV_GCP_PROJECT_ID": observer.PROJECT}), \
     patch.object(sys, "stdin", io.StringIO(json.dumps(request))), \
     patch.object(sys, "stderr", io.StringIO()), \
     patch.object(observer, "secret", side_effect=secrets.__getitem__), \
     patch.object(observer.urllib.request, "build_opener") as opener, \
     patch.object(observer.imaplib, "IMAP4_SSL", return_value=client):
    opener.return_value.open.return_value = health
    observer.main()
client.login.assert_called_once_with(username, "private-unit-password")
client.select.assert_called_once_with('"[Gmail]/All Mail"', readonly=True)
assert client.uid.call_args_list[1].args == ("fetch", b"45", "(BODY.PEEK[])")
