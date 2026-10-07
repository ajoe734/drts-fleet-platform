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
                       isinstance(rfc, str) and len(rfc) > 5 and "@" in rfc and
                       isinstance(sha256, str) and len(sha256) == 64 and all(c in "0123456789abcdef" for c in sha256))
                       
    rfc2 = mb2.get("rfc_message_id")
    sha256_2 = mb2.get("body_sha256")
    has_resend_inbox_proof = (mb2.get("matched_content") is True and mb2.get("candidate_sha") == sha and
                       resend and mb2.get("delivery_id") == resend.get("delivery_id") and resend.get("delivery_id") is not None and 
                       isinstance(rfc2, str) and len(rfc2) > 5 and "@" in rfc2 and
                       isinstance(sha256_2, str) and len(sha256_2) == 64 and all(c in "0123456789abcdef" for c in sha256_2))
    
    # F4: downloadProof must be strict True
    has_download = bool(get_call("GET", path="artifactUrl") and get_call("GET", path="artifactUrl").get("status") == 200 and evidence.get("downloadProof") is True)
    
    has_idempotency = bool(retry_send and retry_send.get("status") == 201 and retry_send.get("delivery_id") == dl_id and dl_id is not None)
    
    # F4: enforce path on durable_get
    durable_get_call = get_call("GET", path=f"/api/tenant/invoices/{invoice}/mail" if invoice else None, scenario="durable_get")
    has_durable_get = bool(durable_get_call and durable_get_call.get("status") == 200 and evidence.get("durableHistoryCount", 0) > 0)
    
    has_wrong_tenant = bool(get_call("POST", scenario="wrong_tenant") and get_call("POST", scenario="wrong_tenant").get("status") == 403)
    has_intentional_resend = bool(resend and resend.get("status") == 201 and resend.get("delivery_id") != dl_id and resend.get("delivery_id") is not None)
    has_normal_send = bool(first_send and first_send.get("status") == 201)

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
    result = evaluate(os.environ, read("evidence-mail.json"), read("evidence-provider.json"))
    (directory / "run-status.json").write_text(json.dumps(result, indent=2) + "\n")
    print("Mail acceptance: " + result["status"])
    raise SystemExit(0 if result["status"] == "passed" else 1)

if __name__ == "__main__":
    main()
