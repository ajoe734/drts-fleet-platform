"""Read only a task delivery's MIME content; never emit mail bodies or tokens.

Uses Python's maintained stdlib IMAP/TLS/MIME implementations. Run only on the
hosted worker after WIF authentication. RFC Message-ID is derived from the real
NotificationDeliveryService.enqueue format, never used as a provider queue ID.
"""
import email
import email.policy
import email.utils
import hashlib
import imaplib
import json
import os
import re
import ssl
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone

PROJECT = "drts-dev-devcc-20260825"
MAILBOX = "[Gmail]/All Mail"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def inspect_message(raw, expected_id, recipient, sender, subject, required_text):
    message = email.message_from_bytes(raw, policy=email.policy.default)
    require(str(message.get("Message-ID", "")).strip() == expected_id, "Wrong Message-ID")
    recipients = [address.lower() for _, address in email.utils.getaddresses(message.get_all("To", []))]
    senders = [address.lower() for _, address in email.utils.getaddresses(message.get_all("From", []))]
    require(recipients == [recipient.lower()], "Wrong authorized recipient")
    require(senders == [sender.lower()], "Wrong configured sender")
    require(str(message.get("Subject", "")) == subject, "Wrong subject")
    parts = [part for part in message.walk() if part.get_content_type() == "text/plain" and part.get_content_disposition() != "attachment"]
    body = "\n".join(part.get_content() for part in parts)
    require(required_text and all(text and text in body for text in required_text), "Expected business content is absent")
    return {
        "rfc_message_id": expected_id,
        "subject_sha256": hashlib.sha256(subject.encode()).hexdigest(),
        "body_sha256": hashlib.sha256(body.encode()).hexdigest(),
        "matched_content": True,
    }


def observe(client, expected_id, recipient, sender, subject, required_text, timeout=60):
    status, _ = client.select('"' + MAILBOX + '"', readonly=True)
    require(status == "OK", "Cannot open authorized All Mail folder read-only")
    validity = client.response("UIDVALIDITY")[1]
    require(validity and validity[0] and validity[0].isdigit(), "Missing UIDVALIDITY")
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        status, result = client.uid("search", None, "HEADER", "Message-ID", '"' + expected_id + '"')
        require(status == "OK", "IMAP lookup failed")
        uids = result[0].split() if result and result[0] else []
        require(len(uids) <= 1, "Ambiguous duplicate Message-ID")
        if uids:
            require(uids[0].isdigit(), "Invalid IMAP UID")
            status, data = client.uid("fetch", uids[0], "(BODY.PEEK[])")
            require(status == "OK", "IMAP read failed")
            payloads = [item[1] for item in data if isinstance(item, tuple) and isinstance(item[1], bytes)]
            require(len(payloads) == 1, "Missing MIME payload")
            evidence = inspect_message(payloads[0], expected_id, recipient, sender, subject, required_text)
            return {**evidence, "uid": uids[0].decode(), "uid_validity": validity[0].decode(), "mailbox": MAILBOX, "observed_at": datetime.now(timezone.utc).isoformat()}
        time.sleep(min(2, max(0, deadline - time.monotonic())))
    raise ValueError("No matching authorized mailbox content before deadline")


def secret(name):
    result = subprocess.run(["gcloud", "secrets", "versions", "access", "latest", "--secret=" + name, "--project=" + PROJECT], capture_output=True, text=True, timeout=20, check=True).stdout.strip()
    require(result and "\n" not in result and "\r" not in result, "Invalid mailbox secret")
    # The hosted parent inherits stderr so Actions registers the mask at once.
    print("::add-mask::" + result.replace("%", "%25"), file=sys.stderr, flush=True)
    # No raw values in argv, output JSON, files or failure diagnostics.
    return result


def main():
    require(os.environ.get("GITHUB_ACTIONS") == "true", "Hosted runner required")
    request = json.load(sys.stdin)
    require(os.environ.get("DEV_GCP_PROJECT_ID") == PROJECT, "Unauthorized project")
    sha = request["candidate_sha"]
    require(re.fullmatch(r"[a-f0-9]{40}", sha), "Invalid candidate SHA")
    origin = request["api_origin"]
    require(origin == "https://drts-dev-api-r6ykdme3wa-uc.a.run.app", "Unauthorized API origin")
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args):
            return None
    with urllib.request.build_opener(NoRedirect).open(origin + "/health", timeout=15) as health:
        require(health.status == 200 and health.headers.get("x-drts-candidate-sha") == sha, "Deployed candidate changed before mailbox access")
    delivery_id = request["delivery_id"]
    require(re.fullmatch(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}", delivery_id), "Invalid delivery ID")
    flow = request["flow"]
    require(flow in ("invite", "approve"), "Unauthorized alias")
    username = secret("drts-dev-smtp-username")
    require(re.fullmatch(r"[a-zA-Z0-9._-]+@gmail\.com", username), "Invalid dedicated mailbox")
    password = secret("drts-dev-smtp-password")
    sender = secret("drts-dev-smtp-from-email")
    local, domain = username.split("@")
    recipient = local + "+" + flow + "@" + domain
    print("::add-mask::" + recipient.replace("%", "%25"), file=sys.stderr, flush=True)
    expected_id = "<" + delivery_id + "@notification.drts.invalid>"
    with imaplib.IMAP4_SSL("imap.gmail.com", 993, ssl_context=ssl.create_default_context(), timeout=20) as client:
        client.login(username, password)
        evidence = observe(client, expected_id, recipient, sender, request["subject"], request["required_text"])
    print(json.dumps({**evidence, "candidate_sha": sha, "delivery_id": delivery_id}))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # IMAP/server/subprocess exceptions may echo credentials or mailbox data.
        print("Mailbox observation failed; no content or credentials retained.", file=sys.stderr)
        sys.exit(1)
