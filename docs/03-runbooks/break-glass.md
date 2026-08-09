# Break-glass operations

Break-glass is a last-resort, two-person workflow. The requester records an incident reason and phishing-resistant or vault-controlled proof reference, then a different privileged operator approves it. Activation may only use a subset of the approved least-privilege scopes and is capped at 60 minutes.

The activation response contains an access token only: it deliberately has no refresh token. Keep the `BREAK_GLASS_ACTIVE` session banner visible for its entire lifetime. Every request, approval, activation, close and expiry is written as a critical `break_glass` security event with the grant identity.

Close the grant as soon as the incident work completes. Close and automatic expiry revoke the linked durable session immediately. The resulting grant remains marked `postUseReviewRequired`; security reviews the reason, proof reference, scope, approver, audit events and follow-up actions before marking the incident complete.
