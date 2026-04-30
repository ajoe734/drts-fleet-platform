# ORX-ID-001 Review Notes

Reviewer: `Codex2`  
Date: `2026-04-30`  
Status: `not_approvable_yet`

## Findings

1. Revoked or suspended driver sessions are cleared in background revalidation, but the app is not actually returned to the provisioning/onboarding flow.
   Evidence:
   - `initializeDriverIdentity()` now clears the stored session on auth failures such as `DRIVER_DEVICE_REFRESH_INVALID` and `DRIVER_AUTH_SUSPENDED`, which leaves the app without a provisioned client. See [apps/driver-app/lib/api-client.ts](/home/edna/workspace/drts-fleet-platform/apps/driver-app/lib/api-client.ts:184).
   - The new foreground/interval revalidation path in [apps/driver-app/app/\_layout.tsx](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/_layout.tsx:25) catches all errors and only logs `console.warn(...)`; it does not navigate to `/onboarding`, reset the router stack, or otherwise force the user back into the provisioning screen after the session is invalidated.
   - The runbook acceptance for this task explicitly says revoked or suspended bindings should "surface a driver-facing explanation, and return the app to the provisioning form" in [docs/03-runbooks/driver-app-native-dev-runbook.md](/home/edna/workspace/drts-fleet-platform/docs/03-runbooks/driver-app-native-dev-runbook.md:228).
     Impact:
   - A driver who is already inside `/jobs`, `/earnings`, or another protected screen can lose the session during background revalidation and remain stranded on the old route with a broken client instead of being returned to onboarding. That misses the task's session recovery acceptance behavior.

## Re-review Gate

- After `initializeDriverIdentity()` invalidates the device session during root-level revalidation, route the user back to onboarding/provisioning and preserve the user-facing identity-issue message there.
- Re-review with proof that both revoked-binding and suspended-driver cases transition the live app back to the provisioning screen rather than only clearing secure storage.
