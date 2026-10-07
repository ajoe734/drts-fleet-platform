"""Missing, partial, stale or unsuccessful evidence never yields a green run."""
import json
import os
from pathlib import Path


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
    
    def get_call(method, path=None, scenario=None):
        for c in http_calls:
            if c.get("method") == method and (path is None or c.get("path", "").startswith(path)) and (scenario is None or c.get("scenario") == scenario):
                return c
        return None

    # Check statuses
    valid_statuses = all(c.get("status") in (200, 201, 401, 403, 404, 400) for c in http_calls if "status" in c)
    
    first_send = get_call("POST", path="/api/tenant/invoices/", scenario="normal_send")
    retry_send = get_call("POST", path="/api/tenant/invoices/", scenario="idempotent_retry")
    resend = get_call("POST", path="/api/tenant/invoices/", scenario="intentional_resend")
    
    dl_id = first_send.get("delivery_id") if first_send else None
    
    has_identity = bool(get_call("GET", path="tenant/billing/profile") and get_call("GET", path="tenant/billing/profile").get("status") == 200)
    has_invoice = bool(get_call("GET", path="/api/tenant/invoices/") and get_call("GET", path="/api/tenant/invoices/").get("status") == 200)
    
    has_inbox_proof = (mb.get("matched_content") is True and mb.get("candidate_sha") == sha and
                       mb.get("delivery_id") == dl_id and dl_id is not None and 
                       mb.get("rfc_message_id") and mb.get("body_sha256"))
    
    has_download = bool(get_call("GET", path="artifactUrl") and get_call("GET", path="artifactUrl").get("status") == 200 and evidence.get("downloadProof"))
    
    has_idempotency = bool(retry_send and retry_send.get("status") == 200 and retry_send.get("delivery_id") == dl_id and dl_id is not None)
    
    has_durable_get = bool(get_call("GET", scenario="durable_get") and get_call("GET", scenario="durable_get").get("status") == 200 and evidence.get("durableHistoryCount", 0) > 0)
    
    has_read_only = bool(get_call("POST", scenario="read_only") and get_call("POST", scenario="read_only").get("status") == 403)
    has_wrong_tenant = bool(get_call("POST", scenario="wrong_tenant") and get_call("POST", scenario="wrong_tenant").get("status") == 403)
    has_non_allowlisted = bool(get_call("POST", scenario="non_allowlisted") and get_call("POST", scenario="non_allowlisted").get("status") == 400)
    has_intentional_resend = bool(resend and resend.get("status") == 200 and resend.get("delivery_id") != dl_id and resend.get("delivery_id") is not None)
    
    passed = bool(sha and len(sha) == 40 and all(value == "success" for value in steps.values())
                  and evidence.get("candidateSha") == sha and evidence.get("headSha") == sha
                  and evidence.get("status") == "passed" and evidence.get("exitCode") == 0
                  and evidence.get("unimplementedLiveSurfaces") == [] and evidence.get("errors") == []
                  and valid_statuses
                  and has_identity and has_invoice and has_inbox_proof and has_download 
                  and has_idempotency and has_durable_get and has_read_only 
                  and has_wrong_tenant and has_non_allowlisted and has_intentional_resend
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
