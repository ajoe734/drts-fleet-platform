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
    has_authority = bool(tenant and invoice and identity and isinstance(tenant, str) and isinstance(invoice, str) and isinstance(identity, str) and UUID_RE.match(tenant) and UUID_RE.match(invoice) and len(identity) == 64 and all(c in "0123456789abcdef" for c in identity))

    # Check statuses strictly: no generic checks, validate the exact expected scenarios
    first_send = get_call("POST", path=f"/api/tenant/invoices/{invoice}/mail" if invoice else None, scenario="normal_send")
    retry_send = get_call("POST", path=f"/api/tenant/invoices/{invoice}/mail" if invoice else None, scenario="idempotent_retry")
    resend = get_call("POST", path=f"/api/tenant/invoices/{invoice}/mail" if invoice else None, scenario="intentional_resend")
    
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
        and dl_proof.get("matched") is True
        and isinstance(dl_proof.get("manifestHash"), str) and len(dl_proof.get("manifestHash")) == 64
        and isinstance(dl_proof.get("downloadedBytes"), int) and dl_proof.get("downloadedBytes") > 0
        and isinstance(dl_proof.get("contentType"), str) and "pdf" in dl_proof.get("contentType")
    )
    
    # F5: Bind durable deliveries
    durable_deliveries = evidence.get("durableDeliveries") or []
    def get_delivery(scenario):
        return next((d for d in durable_deliveries if d.get("scenario") == scenario), None)
        
    first_send_del = get_delivery("first_send")
    resend_del = get_delivery("intentional_resend")
    na_del = get_delivery("non_allowlisted")
    
    # Check normal send and retry correlation
    has_normal_send = bool(first_send and first_send.get("status") == 201)
    has_idempotency = bool(retry_send and retry_send.get("status") == 201 and retry_send.get("delivery_id") == dl_id and dl_id is not None)
    
    # Check intentional resend
    has_intentional_resend = bool(resend and resend.get("status") == 201 and resend.get("delivery_id") != dl_id and resend.get("delivery_id") is not None)
    
    # Check durable delivery correlations
    has_durable_get = bool(
        first_send_del and first_send_del.get("deliveryId") == dl_id and first_send_del.get("acceptedAt") is not None and first_send_del.get("attemptsCount", 0) > 0 and
        resend_del and resend_del.get("deliveryId") == resend.get("delivery_id") and resend_del.get("acceptedAt") is not None and
        na_del and na_del.get("status") == "failed" and na_del.get("errorCode") == "SMTP_RECIPIENT_NOT_ALLOWLISTED"
    )
    
    has_wrong_tenant = bool(get_call("POST", scenario="wrong_tenant") and get_call("POST", scenario="wrong_tenant").get("status") == 403)


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
                  and has_wrong_tenant and has_intentional_resend and has_normal_send
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
            
    teardown_ev = read("evidence-teardown.json")
    if not (teardown_ev.get("success") is True and teardown_ev.get("attempted", 0) > 0 and teardown_ev.get("failures", -1) == 0):
        print("Mail acceptance: failed - missing or failed cleanup evidence")
        raise SystemExit(1)
        
    result = evaluate(os.environ, read("evidence-mail.json"), read("evidence-provider.json"))
    (directory / "run-status.json").write_text(json.dumps(result, indent=2) + "\n")
    print("Mail acceptance: " + result["status"])
    raise SystemExit(0 if result["status"] == "passed" else 1)

if __name__ == "__main__":
    main()
