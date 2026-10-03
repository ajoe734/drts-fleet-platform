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
import urllib.error
import urllib.parse
from datetime import datetime, timezone
from contextlib import contextmanager

PROJECT = "drts-dev-devcc-20260825"
FAILURE_STAGES = frozenset((
    "mailbox_preflight_failed", "mailbox_credentials_failed", "imap_connection_failed",
    "imap_login_failed", "imap_list_failed", "imap_all_folder_not_found",
    "imap_all_folder_ambiguous", "imap_select_failed", "imap_search_failed",
    "imap_fetch_failed", "message_not_found_before_deadline", "content_mismatch",
    "invitation_acceptance_failed", "mailbox_observation_failed",
))


class MailboxObservationError(ValueError):
    def __init__(self, stage):
        self.stage = stage if stage in FAILURE_STAGES else "mailbox_observation_failed"
        super().__init__(self.stage)


@contextmanager
def observation_stage(stage):
    try:
        yield
    except MailboxObservationError:
        raise
    except Exception:
        # Neither the upstream exception nor server payload may cross the CLI.
        raise MailboxObservationError(stage) from None


def require(condition, message):
    if not condition:
        raise ValueError(message)


def message_body(raw):
    message = email.message_from_bytes(raw, policy=email.policy.default)
    parts = [part for part in message.walk() if part.get_content_type() == "text/plain" and part.get_content_disposition() != "attachment"]
    return "\n".join(part.get_content() for part in parts)


def inspect_message(raw, expected_id, recipient, sender, subject, required_text):
    message = email.message_from_bytes(raw, policy=email.policy.default)
    require(str(message.get("Message-ID", "")).strip() == expected_id, "Wrong Message-ID")
    recipients = [address.lower() for _, address in email.utils.getaddresses(message.get_all("To", []))]
    senders = [address.lower() for _, address in email.utils.getaddresses(message.get_all("From", []))]
    require(recipients == [recipient.lower()], "Wrong authorized recipient")
    require(senders == [sender.lower()], "Wrong configured sender")
    require(str(message.get("Subject", "")) == subject, "Wrong subject")
    body = message_body(raw)
    require(required_text and all(text and text in body for text in required_text), "Expected business content is absent")
    return {
        "rfc_message_id": expected_id,
        "subject_sha256": hashlib.sha256(subject.encode()).hexdigest(),
        "body_sha256": hashlib.sha256(body.encode()).hexdigest(),
        "matched_content": True,
    }


def discover_all_mailbox(client):
    """Read RFC 6154 attributes from LIST; keep localized names in wire bytes.

    Gmail includes special-use attributes in ordinary LIST responses. Names may
    be atoms, quoted strings or imaplib literal tuples. Never guess an English
    name, decode/re-encode modified UTF-7, or search Inbox/Sent as a fallback.
    """
    with observation_stage("imap_list_failed"):
        status, rows = client.list('""', '*')
        require(status == "OK" and isinstance(rows, list), "Invalid LIST response")
        candidates = set()
        quoted = rb'"(?:[^"\\\x00\r\n]|\\["\\])*"'
        prefix = rb'\(([^)\r\n]*)\) (?:NIL|' + quoted + rb') (.+)'
        for row in rows:
            if row is None or row == b'':
                continue
            literal = isinstance(row, tuple) and len(row) == 2
            header = row[0] if literal else row
            require(isinstance(header, bytes), "Invalid LIST row")
            match = re.fullmatch(prefix, header)
            require(match is not None, "Invalid LIST syntax")
            flags, wire_name = match.groups()
            flags = {flag.lower() for flag in flags.split()}
            if b'\\all' not in flags or b'\\noselect' in flags:
                continue
            if literal:
                length = re.fullmatch(rb'\{([0-9]+)\}', wire_name)
                require(length and isinstance(row[1], bytes) and len(row[1]) == int(length[1]), "Invalid LIST literal")
                name = row[1]
            elif re.fullmatch(quoted, wire_name):
                name = re.sub(rb'\\(["\\])', rb'\1', wire_name[1:-1])
            else:
                require(re.fullmatch(rb'[^\x00-\x20\x7f(){}%*"\\\]]+', wire_name), "Invalid LIST atom")
                name = wire_name
            require(name and not re.search(rb'[\x00\r\n]', name), "Invalid mailbox name")
            candidates.add(name)
    if not candidates:
        raise MailboxObservationError("imap_all_folder_not_found")
    if len(candidates) != 1:
        raise MailboxObservationError("imap_all_folder_ambiguous")
    return candidates.pop()


def observe(client, expected_id, recipient, sender, subject, required_text, timeout=60, consume=None):
    mailbox = discover_all_mailbox(client)
    with observation_stage("imap_select_failed"):
        # imaplib does not quote mailbox arguments for select/EXAMINE itself.
        quoted_mailbox = b'"' + mailbox.replace(b'\\', b'\\\\').replace(b'"', b'\\"') + b'"'
        status, _ = client.select(quoted_mailbox, readonly=True)
        require(status == "OK", "Cannot open authorized All Mail folder read-only")
        validity = client.response("UIDVALIDITY")[1]
        require(validity and validity[0] and validity[0].isdigit(), "Missing UIDVALIDITY")
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        with observation_stage("imap_search_failed"):
            status, result = client.uid("search", None, "HEADER", "Message-ID", '"' + expected_id + '"')
            require(status == "OK", "IMAP lookup failed")
            uids = result[0].split() if result and result[0] else []
            require(len(uids) <= 1, "Ambiguous duplicate Message-ID")
            require(not uids or uids[0].isdigit(), "Invalid IMAP UID")
        if uids:
            with observation_stage("imap_fetch_failed"):
                status, data = client.uid("fetch", uids[0], "(BODY.PEEK[])")
                require(status == "OK", "IMAP read failed")
                payloads = [item[1] for item in data if isinstance(item, tuple) and isinstance(item[1], bytes)]
                require(len(payloads) == 1, "Missing MIME payload")
            with observation_stage("content_mismatch"):
                evidence = inspect_message(payloads[0], expected_id, recipient, sender, subject, required_text)
            if consume is not None:
                with observation_stage("invitation_acceptance_failed"):
                    evidence.update(consume(message_body(payloads[0])))
            return {**evidence, "uid": uids[0].decode(), "uid_validity": validity[0].decode(),
                    "mailbox": "\\All", "mailbox_sha256": hashlib.sha256(mailbox).hexdigest(),
                    "observed_at": datetime.now(timezone.utc).isoformat()}
        time.sleep(min(2, max(0, deadline - time.monotonic())))
    raise MailboxObservationError("message_not_found_before_deadline")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


def invitation_from_body(body):
    codes = re.findall(r"^Invitation code: (\S+)$", body, re.MULTILINE)
    links = re.findall(r"^Accept your invitation: (\S+)$", body, re.MULTILINE)
    for link in links:
        # Parse only; never follow an email link or transmit the code to it.
        codes.extend(urllib.parse.parse_qs(urllib.parse.urlsplit(link).query).get("token", []))
    expires = re.findall(r"^This invitation expires at (\S+)\.$", body, re.MULTILINE)
    require(len(codes) == 1 and re.fullmatch(r"[A-Za-z0-9_-]{20,200}", codes[0]), "Missing unique invitation code")
    require(len(expires) == 1, "Missing unique invitation expiry")
    expiry = datetime.fromisoformat(expires[0].replace("Z", "+00:00"))
    require(expiry.tzinfo is not None, "Invitation expiry has no timezone")
    return codes[0], expiry


def accept_invitation(body, request, opener=None):
    token, expiry = invitation_from_body(body)
    expected = request["acceptance"]
    require(expected in ("accepted", "denied", "expired"), "Invalid acceptance probe")
    if expected == "expired":
        require(datetime.now(timezone.utc) > expiry, "Real invitation expiry has not elapsed")
    payload = json.dumps({"invitationToken": token}).encode()
    call = urllib.request.Request(request["api_origin"] + "/api/tenant/invitations/accept",
                                  data=payload, headers={"Content-Type": "application/json"}, method="POST")
    started = time.monotonic()
    opener = opener or urllib.request.build_opener(NoRedirect)
    try:
        response = opener.open(call, timeout=15)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        require(response.headers.get("x-drts-candidate-sha") == request["candidate_sha"], "Acceptance candidate drift")
        result = json.load(response)
        status = response.status
        if expected == "accepted":
            data = result.get("data", {})
            user = data.get("user", {})
            require(status in (200, 201) and data.get("accepted") is True
                    and user.get("user_id") == request["user_id"] and user.get("status") == "active"
                    and user.get("tenant_id") == "10000000-0000-0000-0000-000000000201", "Acceptance did not activate the expected user")
        else:
            require(status == 403 and result.get("error", {}).get("code") == "TENANT_INVITATION_ACCEPTANCE_DENIED", "Expected invitation rejection absent")
    return {"acceptance": expected, "acceptance_status": status,
            "acceptance_duration_ms": round((time.monotonic() - started) * 1000),
            "expires_at": expiry.isoformat()}


def secret(name):
    result = subprocess.run(["gcloud", "secrets", "versions", "access", "latest", "--secret=" + name, "--project=" + PROJECT], capture_output=True, text=True, timeout=20, check=True).stdout.strip()
    require(result and "\n" not in result and "\r" not in result, "Invalid mailbox secret")
    # The hosted parent inherits stderr so Actions registers the mask at once.
    print("::add-mask::" + result.replace("%", "%25"), file=sys.stderr, flush=True)
    # No raw values in argv, output JSON, files or failure diagnostics.
    return result


def derive_alias_recipient(username, flow):
    """Dedicated Gmail/Workspace address; the domain is not a provider gate."""
    require(flow in ("invite", "approve"), "Unauthorized alias")
    parts = username.split("@")
    require(len(parts) == 2, "Invalid dedicated mailbox")
    local, domain = parts
    labels = domain.split(".")
    recipient = local + "+" + flow + "@" + domain
    require(re.fullmatch(r"[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+", local)
            and not local.startswith(".") and not local.endswith(".") and ".." not in local
            and len(local) + len(flow) + 1 <= 64 and len(recipient) <= 254
            and not re.search(r"(?:^|[.-])(?:fixture|demo|example)(?:[.-]|$)", domain, re.IGNORECASE)
            and not re.search(r"\.(?:invalid|test|localhost)$", domain, re.IGNORECASE)
            and len(labels) >= 2
            and all(re.fullmatch(r"[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?", label) for label in labels),
            "Invalid dedicated mailbox")
    return recipient


def main():
    with observation_stage("mailbox_preflight_failed"):
        require(os.environ.get("GITHUB_ACTIONS") == "true", "Hosted runner required")
        request = json.load(sys.stdin)
        require(os.environ.get("DEV_GCP_PROJECT_ID") == PROJECT, "Unauthorized project")
        sha = request["candidate_sha"]
        require(re.fullmatch(r"[a-f0-9]{40}", sha), "Invalid candidate SHA")
        origin = request["api_origin"]
        require(origin == "https://drts-dev-api-r6ykdme3wa-uc.a.run.app", "Unauthorized API origin")
        with urllib.request.build_opener(NoRedirect).open(origin + "/health", timeout=15) as health:
            require(health.status == 200 and health.headers.get("x-drts-candidate-sha") == sha, "Deployed candidate changed before mailbox access")
        delivery_id = request["delivery_id"]
        require(re.fullmatch(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}", delivery_id), "Invalid delivery ID")
        flow = request["flow"]
        require(flow in ("invite", "approve"), "Unauthorized alias")
        require(not request.get("acceptance") or flow == "invite", "Only invitation mail can be consumed")
    with observation_stage("mailbox_credentials_failed"):
        username = secret("drts-dev-smtp-username")
        recipient = derive_alias_recipient(username, flow)
        password = secret("drts-dev-smtp-password")
        sender = secret("drts-dev-smtp-from-email")
        print("::add-mask::" + recipient.replace("%", "%25"), file=sys.stderr, flush=True)
    expected_id = "<" + delivery_id + "@notification.drts.invalid>"
    with observation_stage("imap_connection_failed"):
        with imaplib.IMAP4_SSL("imap.gmail.com", 993, ssl_context=ssl.create_default_context(), timeout=20) as client:
            with observation_stage("imap_login_failed"):
                status, _ = client.login(username, password)
                require(status == "OK", "IMAP login rejected")
            consume = (lambda body: accept_invitation(body, request)) if request.get("acceptance") else None
            evidence = observe(client, expected_id, recipient, sender, request["subject"], request["required_text"], consume=consume)
    print(json.dumps({**evidence, "candidate_sha": sha, "delivery_id": delivery_id}))


def run_cli():
    try:
        main()
        return 0
    except Exception as error:
        # Only fixed allowlisted stages cross stdout/stderr, never an upstream
        # message, mailbox name, exception class, traceback or credential.
        stage = error.stage if isinstance(error, MailboxObservationError) else "mailbox_observation_failed"
        if stage not in FAILURE_STAGES:
            stage = "mailbox_observation_failed"
        print(json.dumps({"error": {"stage": stage}}))
        print("Mailbox observation failed; stage=" + stage + "; no content or credentials retained.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(run_cli())
