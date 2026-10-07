"""Missing, partial, stale or unsuccessful evidence never yields a green run."""
import json
import os
import re
from pathlib import Path

UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")

def evaluate(env, evidence, provider):
    steps = {key: env.get(key, "missing") for key in (
        "DEPLOYMENT_GUARD_OUTCOME", "SESSION_GUARD_OUTCOME",
        "INSTALL_OUTCOME", "PREFLIGHT_OUTCOME", "RESOURCES_OUTCOME",
        "SESSIONS_OUTCOME", "RUNNER_OUTCOME", "TEARDOWN_OUTCOME",
    )}
    sha = env.get("CANDIDATE_SHA", "")
    http_calls = evidence.get("httpCalls", [])
    resources = evidence.get("trackedResources", [])
    mb = evidence.get("mailboxEvidence", {})
    mb2 = evidence.get("resendMailboxEvidence", {})

    def get_call(method, path=None, scenario=None):
        for c in http_calls:
            if c.get("method") == method and (path is None or c.get("path") == path) and (scenario is None or c.get("scenario") == scenario):
                return c
        return None

    # F4: Ensure explicit evidence fields exist for authority tracking
    tenant = evidence.get("tenantId")
    invoice = evidence.get("invoiceId")
    identity = evidence.get("identityEmail")
    has_authority = bool(tenant and invoice and identity and isinstance(tenant, str) and isinstance(invoice, str) and isinstance(identity, str) and UUID_RE.match(tenant) and (UUID_RE.match(invoice) or (invoice.startswith("invoice-") and UUID_RE.match(invoice[8:]))) and len(identity) == 64 and all(c in "0123456789abcdef" for c in identity))

    # Check statuses strictly: no generic checks, validate the exact expected scenarios
    first_send = get_call("POST", path=f"/api/tenant/invoices/{invoice}/mail" if invoice else None, scenario="normal_send")
    retry_send = get_call("POST", path=f"/api/tenant/invoices/{invoice}/mail" if invoice else None, scenario="idempotent_retry")
    resend = get_call("POST", path=f"/api/tenant/invoices/{invoice}/mail" if invoice else None, scenario="intentional_resend")
    na_send = get_call("POST", scenario="non_allowlisted")

    dl_id = first_send.get("delivery_id") if first_send else None

    has_identity = bool(get_call("GET", path="tenant/billing/profile") and get_call("GET", path="tenant/billing/profile").get("status") == 200)
    has_invoice = bool(get_call("GET", path=f"/api/tenant/invoices/{invoice}" if invoice else None) and get_call("GET", path=f"/api/tenant/invoices/{invoice}" if invoice else None).get("status") == 200)

    # F4: Check exact hash and ID shapes
    rfc = mb.get("rfc_message_id")
    sha256 = mb.get("body_sha256")
    has_inbox_proof = (mb.get("matched_content") is True and mb.get("candidate_sha") == sha and
                       mb.get("delivery_id") == dl_id and dl_id is not None and
                       isinstance(rfc, str) and rfc == f"<{dl_id}@notification.drts.invalid>" and
                       isinstance(sha256, str) and len(sha256) == 64 and all(c in "0123456789abcdef" for c in sha256))

    rfc2 = mb2.get("rfc_message_id")
    sha256_2 = mb2.get("body_sha256")
    has_resend_inbox_proof = (mb2.get("matched_content") is True and mb2.get("candidate_sha") == sha and
                       resend and mb2.get("delivery_id") == resend.get("delivery_id") and resend.get("delivery_id") is not None and
                       isinstance(rfc2, str) and rfc2 == f"<{resend.get('delivery_id')}@notification.drts.invalid>" and
                       isinstance(sha256_2, str) and len(sha256_2) == 64 and all(c in "0123456789abcdef" for c in sha256_2))

    # F4: enforce download proof is valid object
    dl_proof = evidence.get("downloadProof")
    if not isinstance(dl_proof, dict):
        dl_proof = {}
    has_download = bool(
        get_call("GET", path="artifactUrl") and get_call("GET", path="artifactUrl").get("status") == 200
        and get_call("GET", path="wrong_tenant_portal") and get_call("GET", path="wrong_tenant_portal").get("status") == 404
        and get_call("GET", path="read_only_portal") and get_call("GET", path="read_only_portal").get("status") == 200
        and get_call("GET", path="bad_sig_api") and get_call("GET", path="bad_sig_api").get("status") == 403
        and dl_proof.get("matched") is True
        and isinstance(dl_proof.get("manifestHash"), str) and bool(re.match(r"^[0-9a-f]{64}$", dl_proof.get("manifestHash")))
        and dl_proof.get("manifestHash") == dl_proof.get("downloadedHash")
        and isinstance(dl_proof.get("downloadedBytes"), int) and dl_proof.get("downloadedBytes") > 0
        and dl_proof.get("contentType") == "application/pdf"
    )

    # F5: Bind durable deliveries
    durable_deliveries = evidence.get("durableDeliveries") or []
    def get_delivery(scenario):
        return next((d for d in durable_deliveries if d.get("scenario") == scenario), None)

    first_send_del = get_delivery("first_send")
    resend_del = get_delivery("intentional_resend")
    na_del = get_delivery("non_allowlisted")
    retry_del = get_delivery("idempotent_retry")

    # Check normal send and retry correlation
    has_normal_send = bool(first_send and first_send.get("status") == 201)

    # Check intentional resend
    has_intentional_resend = bool(resend and resend.get("status") == 201 and resend.get("delivery_id") != dl_id and isinstance(resend.get("delivery_id"), str) and bool(resend.get("delivery_id")))

    # Check durable delivery correlations and idempotency snapshot
    has_idempotency = bool(retry_send and retry_send.get("status") == 201 and retry_send.get("delivery_id") == dl_id and isinstance(dl_id, str) and bool(dl_id) and
                           retry_del and retry_del.get("deliveryId") == dl_id and
                           retry_del and retry_del.get("initialAttemptsCount") == retry_del.get("afterRetryAttemptsCount") and retry_del.get("initialAttemptsCount", 0) > 0 and
                           first_send_del.get("idempotencyKey") and retry_del.get("idempotencyKey") == first_send_del.get("idempotencyKey"))

    has_durable_get_call = bool(get_call("GET", path=f"/api/tenant/invoices/{invoice}/mail" if invoice else None, scenario="durable_get") and get_call("GET", path=f"/api/tenant/invoices/{invoice}/mail" if invoice else None, scenario="durable_get").get("status") == 200)

    has_durable_get = bool(
        has_durable_get_call and
        first_send_del and first_send_del.get("deliveryId") == dl_id and first_send_del.get("acceptedAt") and first_send_del.get("attemptsCount", 0) > 0 and first_send_del.get("status") == "sent" and first_send_del.get("attemptOutcome") == "sent" and first_send_del.get("errorCode") is None and
        resend_del and resend_del.get("deliveryId") == resend.get("delivery_id") and resend_del.get("acceptedAt") and resend_del.get("attemptsCount", 0) > 0 and first_send_del.get("idempotencyKey") and resend_del.get("idempotencyKey") and resend_del.get("idempotencyKey") != first_send_del.get("idempotencyKey") and resend_del.get("status") == "sent" and resend_del.get("attemptOutcome") == "sent" and resend_del.get("errorCode") is None and
        na_del and na_send and na_send.get("status") == 201 and isinstance(na_send.get("delivery_id"), str) and bool(na_send.get("delivery_id")) and na_del.get("deliveryId") == na_send.get("delivery_id") and na_del.get("status") == "failed" and na_del.get("errorCode") == "SMTP_RECIPIENT_NOT_ALLOWLISTED" and na_del.get("outcome") == "failed" and not na_del.get("acceptedAt") and na_del.get("retryable") is False
    )

    has_wrong_tenant = bool(get_call("POST", scenario="wrong_tenant") and get_call("POST", scenario="wrong_tenant").get("status") == 403)
    has_wrong_invoice = bool(get_call("POST", scenario="wrong_invoice") and get_call("POST", scenario="wrong_invoice").get("status") in (403, 404))
    has_read_only = bool(get_call("POST", scenario="read_only") and get_call("POST", scenario="read_only").get("status") == 403)


    # Missing fixture/role authority remains pending rather than fabricated pass.
    # F4: strictly require the key to be present and empty
    is_fully_implemented = "unimplementedLiveSurfaces" in evidence and evidence["unimplementedLiveSurfaces"] == []

    passed = bool(sha and len(sha) == 40 and all(value == "success" for value in steps.values())
                  and evidence.get("candidateSha") == sha and evidence.get("headSha") == sha
                  and evidence.get("status") == "passed" and evidence.get("exitCode") == 0
                  and is_fully_implemented and evidence.get("errors") == []
                  and has_authority
                  and has_identity and has_invoice and has_inbox_proof and has_resend_inbox_proof and has_download
                  and has_idempotency and has_durable_get
                  and has_wrong_tenant and has_wrong_invoice and has_intentional_resend and has_normal_send and has_read_only
                  and resources
                  and provider.get("candidate_sha") == sha and provider.get("alias_revision_fresh") is True)

    return {"candidate_sha": sha, "workflow_sha": env.get("DISPATCH_WORKFLOW_SHA"),
            "checkout_sha": env.get("WORKFLOW_SHA"), "base_sha": env.get("BASE_SHA"),
            "run_id": env.get("GITHUB_RUN_ID"), "run_attempt": env.get("GITHUB_RUN_ATTEMPT"),
            "status": "passed" if passed else "failed", "steps": steps}

def main():
    directory = Path(".artifacts/live-invoice-mail-acceptance")
    directory.mkdir(parents=True, exist_ok=True)
    def read(name):
        try:
            value = json.loads((directory / name).read_text())
            return value if isinstance(value, dict) else {}
        except (OSError, ValueError):
            return {}

    run_id = os.environ.get("GITHUB_RUN_ID")
    sha = os.environ.get("CANDIDATE_SHA")
    result = {"status": "failed", "steps": {}}
    teardown_passed = False

    try:
        teardown_ev = read("evidence-teardown.json")
        bootstrap_ev = read("evidence-bootstrap.json")

        issued = bootstrap_ev.get("issued_sessions_count", 0)
        issued_sessions_raw = bootstrap_ev.get("issued_sessions")
        if not isinstance(issued_sessions_raw, list):
            raise ValueError("issued_sessions must be a list")

        expected_keys = {
            "DRTS_LIVE_INVOICE_MAIL_ROLE_SESSION_TOKEN",
            "DRTS_LIVE_INVOICE_MAIL_READ_ONLY_TOKEN",
            "DRTS_LIVE_INVOICE_MAIL_NON_ALLOWLISTED_TOKEN"
        }

        issued_keys = []
        for k in issued_sessions_raw:
            if not isinstance(k, str) or k not in expected_keys:
                raise ValueError("malformed or unknown issued key")
            issued_keys.append(k)

        if len(set(issued_keys)) != len(issued_keys):
            raise ValueError("duplicate issued keys")

        issued_keys.sort()

        sessions_raw = teardown_ev.get("sessions")
        if not isinstance(sessions_raw, list):
            raise ValueError("sessions must be a list")

        teardown_keys = []
        teardown_success_keys = []
        for s in sessions_raw:
            if not isinstance(s, dict):
                raise ValueError("malformed session entry")
            k = s.get("key")
            st = s.get("status")
            if not isinstance(k, str) or k not in expected_keys:
                raise ValueError("malformed or unknown session key")
            if st not in ("success", "not_issued"):
                raise ValueError("session status must be success or not_issued")

            teardown_keys.append(k)
            if st == "success":
                teardown_success_keys.append(k)

        if len(set(teardown_keys)) != len(teardown_keys):
            raise ValueError("duplicate teardown keys across ALL entries")

        for k in teardown_keys:
            st = next(s.get("status") for s in sessions_raw if s.get("key") == k)
            if k in issued_keys and st == "not_issued":
                raise ValueError("contradiction: key was issued but status is not_issued")

        teardown_success_keys.sort()

        teardown_passed = bool(
            teardown_ev.get("success") is True and
            teardown_ev.get("attempted") == issued and
            teardown_ev.get("attempted") == len(teardown_success_keys) and
            teardown_ev.get("failures", -1) == 0 and
            teardown_ev.get("runId") == run_id and
            bootstrap_ev.get("runId") == run_id and
            teardown_ev.get("candidateSha") == sha and
            bootstrap_ev.get("candidateSha") == sha and
            issued == len(issued_keys) and
            issued > 0 and
            teardown_success_keys == issued_keys
        )
    except Exception as e:
        teardown_passed = False

    try:
        if teardown_passed:
            result = evaluate(os.environ, read("evidence-mail.json"), read("evidence-provider.json"))
        else:
            result = {"status": "failed", "steps": {}, "error": "Missing or failed cleanup evidence"}
    except Exception as e:
        result = {"status": "failed", "steps": {}, "error": "Evaluation raised exception"}

    if not teardown_passed:
        result["status"] = "failed"
        if "steps" not in result:
            result["steps"] = {}
        result["steps"]["teardown"] = False
        print("Mail acceptance: failed - missing or failed cleanup evidence")

    (directory / "run-status.json").write_text(json.dumps(result, indent=2) + "\n")
    print("Mail acceptance: " + result["status"])
    raise SystemExit(0 if result["status"] == "passed" else 1)

if __name__ == "__main__":
    main()
