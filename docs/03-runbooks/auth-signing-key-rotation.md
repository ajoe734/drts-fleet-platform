# Auth Signing Key Rotation & Rollback Runbook (IAM-KEY-001)

## Overview

This runbook documents the architecture, operational workflows, and emergency procedures for managed asymmetric signing key rotation with key identifiers (`kid`) across the DRTS Fleet Platform authentication infrastructure.

Replacing single long-lived static secrets with dynamic asymmetric (RSA/ECDSA) or symmetric key rings prevents key exposure risks, enables seamless zero-downtime rotation, and enforces explicit retirement of compromised keys.

---

## 1. Key Ring Architecture & State Model

Every issued JWT token carries a `kid` (key ID) header and an `alg` header (`RS256`, `HS256`, etc.):

```json
{
  "alg": "RS256",
  "typ": "JWT",
  "kid": "key-2026-v2"
}
```

### Key States

| State          | Purpose                | Description                                                                                                              |
| :------------- | :--------------------- | :----------------------------------------------------------------------------------------------------------------------- |
| **`active`**   | Signing & Verification | The primary key currently used to sign all newly issued JWT tokens. Also verified during token validation.               |
| **`previous`** | Verification Only      | Keys used in prior rotation cycles. Still valid for token validation during overlap periods (e.g. 24h-72h).              |
| **`retired`**  | Rejected               | Compromised or expired keys. Token verification using a `retired` `kid` fails closed immediately (`JwtKeyRetiredError`). |

---

## 2. Configuration & Environment Setup

Key rings are configured in staging and production environments using the `JWT_KEY_RING_JSON` environment variable (or via secret manager overlays):

```json
[
  {
    "kid": "key-2026-v2",
    "status": "active",
    "algorithm": "RS256",
    "publicKey": "-----BEGIN PUBLIC KEY-----\n...",
    "privateKey": "-----BEGIN PRIVATE KEY-----\n...",
    "createdAt": "2026-08-02T12:00:00Z"
  },
  {
    "kid": "key-2026-v1",
    "status": "previous",
    "algorithm": "RS256",
    "publicKey": "-----BEGIN PUBLIC KEY-----\n...",
    "createdAt": "2026-07-01T12:00:00Z"
  },
  {
    "kid": "key-2025-v0",
    "status": "retired",
    "algorithm": "RS256",
    "publicKey": "-----BEGIN PUBLIC KEY-----\n...",
    "retiredAt": "2026-08-01T12:00:00Z"
  }
]
```

### Fallback Compatibility

For single-key legacy deployments, the system synthesizes an `active` key ring entry automatically from `JWT_KID_CURRENT` and `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` (or `JWT_SECRET`).

---

## 3. Planned Key Rotation Workflow (Zero Downtime)

### Step 1: Generate New Key Pair

Use `scripts/rotate-auth-keys.py` to generate a new signing key pair:

```bash
python3 scripts/rotate-auth-keys.py generate --kid key-2026-v3 --alg RS256
```

### Step 2: Promote New Key to `active` and Demote Current to `previous`

Run the rotation command to update the key ring structure:

```bash
python3 scripts/rotate-auth-keys.py rotate --new-kid key-2026-v3 --alg RS256
```

This sets `key-2026-v3` as `active` and changes `key-2026-v2` to `previous`.

### Step 3: Deploy Updated Environment Secret

Update `JWT_KEY_RING_JSON` in secret manager / GCP Secret Manager / Kubernetes Secrets, and trigger service rollout.

- Existing valid tokens signed with `key-2026-v2` (`previous`) continue to pass verification during the overlap window.
- All new tokens are signed with `key-2026-v3` (`active`).

### Step 4: Retire Old Key After Overlap Window

After the overlap window (e.g., maximum token lifetime of 8-24 hours) has passed, mark `key-2026-v2` as `retired`:

```bash
python3 scripts/rotate-auth-keys.py retire --target-kid key-2026-v2
```

---

## 4. Emergency Key Compromise & Rollback Drill Procedure

In the event of suspected key material compromise or emergency rollback required during deployment issues:

### Emergency Step 1: Execute Rollback / Compromise Retirement

Run the CLI tool to set target fallback key as `active` or mark compromised key as `retired`:

```bash
# Emergency rollback to previous valid key (e.g. key-2026-v1)
python3 scripts/rotate-auth-keys.py rollback --target-kid key-2026-v1

# Mark compromised key as retired
python3 scripts/rotate-auth-keys.py retire --target-kid key-2026-v2
```

### Emergency Step 2: Invalidate Impacted Sessions

If a private key was compromised, revoke active sessions tied to the compromised timeframe using identity repository revocation or session version bump (`tokenVersion`).

### Strict Security Rule Enforcement

During emergency rollback operations:

- **Strict claim checks (`iss`, `aud`, `exp`, `sid`, `jti`, `tokenVersion`) MUST NEVER be relaxed or bypassed**.
- **No private key material shall be printed in logs, console summaries, frontend bundles, or error stack traces.** Console tools automatically redact private keys.

---

## 5. Security Verification Checklist

- [x] All issued tokens carry `kid` in JWT header.
- [x] Current (`active`) and previous (`previous`) overlap validation works seamlessly.
- [x] Retired (`retired`) and unknown key IDs fail verification immediately.
- [x] Key rotation and rollback drill preserves strict issuer, audience, and algorithm validation.
- [x] Private key material is never logged or exposed to frontend images.
