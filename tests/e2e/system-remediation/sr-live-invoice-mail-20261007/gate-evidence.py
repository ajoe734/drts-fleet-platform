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
    
    has_identity = any(call.get("path") == "tenant/billing/profile" for call in http_calls)
    has_invoice = any(call.get("path", "").startswith("/api/tenant/invoices/") and call.get("method") == "GET" for call in http_calls)
    has_inbox_proof = evidence.get("mailboxEvidence") and evidence.get("mailboxEvidence").get("matched_content") is True
    has_download = any(call.get("path") == "artifactUrl" for call in http_calls)
    has_idempotency = any(call.get("idempotency") is True for call in http_calls)
    has_durable_get = any(call.get("path", "").endswith("/mail") and call.get("method") == "GET" for call in http_calls)
    has_read_only = any(call.get("scenario") == "read_only" for call in http_calls)
    has_wrong_tenant = any(call.get("scenario") == "wrong_tenant" for call in http_calls)
    has_non_allowlisted = any(call.get("scenario") == "non_allowlisted" for call in http_calls)
    has_intentional_resend = any(call.get("scenario") == "intentional_resend" for call in http_calls)

    passed = bool(sha and len(sha) == 40 and all(value == "success" for value in steps.values())
                  and evidence.get("candidateSha") == sha and evidence.get("headSha") == sha
                  and evidence.get("status") == "passed" and evidence.get("exitCode") == 0
                  and evidence.get("unimplementedLiveSurfaces") == [] and evidence.get("errors") == []
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
