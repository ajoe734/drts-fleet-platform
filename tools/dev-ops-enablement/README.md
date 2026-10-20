# Normal development Ops enablement

This explicit hosted action enables the existing synthetic development operator
through the normal Admin user-role command and its exact step-up proof. It reads
the actual canonical principal ID from that command's normal read-only ACK,
configures only the private Ops service reference, verifies a fresh durable Ops
session, then revokes its own Ops and Admin sessions. It does not operate on rides.

Run the false-default `dev_ops_enablement` input on `ci-integ.yml` only after the
reviewed immutable product source serves the expected runtime SHA and its health
and original 16 operational cases are qualified. Use a separate frozen QA branch
pointing at the full test-code SHA so definition, workflow and checkout agree.
Keep `owned_referral_business` false for this setup action.

The one safe artifact is `.artifacts/dev-ops-enablement/setup.json`. Success
requires matching existing membership/principal ACK and readback, unchanged
non-Ops services, the same Ops source/image/material configuration except its
private principal reference, real canonical Ops scopes and own-session cleanup.
An unacknowledged account or cloud write is retained in that journal and must
not be blindly retried. Missing, ambiguous or suspended users are rejected.

After successful independent artifact review, persist the observed
`canonicalPrincipalId` as repository variable `DEV_OPS_WORKFORCE_PRINCIPAL_ID`
through the normal authorized configuration path. Future normal dev deployments
consume it. Do not use `userId` (the membership ID), an inferred email hash or a
client-provided principal. The existing development MFA waiver remains AAL1,
and provides no evidence of real IAP or completed MFA.
