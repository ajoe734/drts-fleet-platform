"""Validate operator-published readiness before obtaining a cloud token."""
import os
import sys

from provision_drill_sa import SA
from restore_drill import DrillError, obj, require, timestamp, utcnow


def check(raw, candidate, provider):
    receipt = obj(raw)
    require(receipt.get("candidate_sha") == candidate and receipt.get("service_account") == SA, "operator_readiness_candidate_mismatch")
    require(receipt.get("provider") == provider, "operator_readiness_provider_mismatch")
    require(0 <= (utcnow() - timestamp(receipt.get("checked_at"))).total_seconds() <= 86400, "operator_readiness_expired")
    digest = receipt.get("audit_sha256", "")
    require(len(digest) == 64 and all(c in "0123456789abcdef" for c in digest), "operator_audit_missing")


if __name__ == "__main__":
    try:
        check(os.environ.get("OPERATOR_READINESS", ""), os.environ["CANDIDATE_SHA"], os.environ["EXPECTED_WIF_PROVIDER"])
    except (DrillError, KeyError, TypeError, ValueError):
        print("Operator readiness absent, stale or mismatched; run the operator --check-ready flow.", file=sys.stderr)
        sys.exit(1)
