# UAT: PAX-ACCOUNT-SESSION-20261009

## Features

- **Account Management**: Create, soft-delete, and fetch accounts.
- **Identities**: Link and unlink multiple login identities (e.g. email, phone).
- **Session Management**: Issue JWT with 15m expiry, refresh tokens hashed, 30 days expiry.
- **Revocation**: Full family revocation on suspicious refresh, explicit logout revokes specific session, and account deletion revokes all sessions.

## Test Matrix

1. Session Issuance: Verify 15m JWT expiry, hashed refresh token.
2. Refresh Token: Verify rotation, family revocation on double use.
3. Logout: Verify IAM session revocation.
4. Account Linking: Link identity requires active session.
5. Unlink Identity: Unlinking last identity fails.
6. Delete Account: Verify account anonymization and revocation of all IAM sessions.
