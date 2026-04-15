# Cross-Review: WC-003 — Platform Account Binding + Re-auth

## Metadata

- Reviewer lane: Qwen
- Target lane: Codex
- Round: 1 (supervisor_managed_execution)
- Date: 2026-04-14

## Acceptance Criteria Verification

### 1. 可綁定新平台帳號 — PASS

- **File:** `apps/driver-app/components/platform-binding.tsx`, lines 148–156
- `handleOpenBind()` sets form to `bind` mode with empty `platformCode`
- `handleSubmitForm()` validates `platformCode` is non-empty (line 104)
- Calls `client.setPlatformOnline({ platformCode, tokenExpiresAt })` (lines 112–115)
- `SetPlatformOnlineCommand` type from `@drts/contracts` matches: `platformCode: string; tokenExpiresAt?: string | null`

### 2. 可解除平台帳號綁定 — PASS

- **File:** `apps/driver-app/components/platform-binding.tsx`, lines 135–148
- `handleUnbind()` shows confirmation `Alert.alert` with cancel/destructive options
- On confirm, calls `client.setPlatformOffline({ platformCode })` (line 143)
- Reloads presence list after successful unbind

### 3. re-auth flow 觸發後更新 token — PASS

- **File:** `apps/driver-app/components/platform-binding.tsx`, lines 150–152
- `handleOpenReauth()` sets form to `reauth` mode with pre-filled `platformCode`
- `handleSubmitForm()` calls same `client.setPlatformOnline()` endpoint (line 112)
- Success message differentiates re-auth vs bind (lines 118–122)

### 4. pnpm --filter @drts/driver-app typecheck — PASS

- Executed: `pnpm --filter @drts/driver-app typecheck` → exit code 0
- `@drts/api-client` exports `getPlatformPresence`, `setPlatformOnline`, `setPlatformOffline` (file: `packages/api-client/src/index.ts`, lines 365–383)
- `@drts/contracts` exports `PlatformPresenceRecord`, `SetPlatformOnlineCommand`, `SetPlatformOfflineCommand` (file: `packages/contracts/src/platform-presence.ts`)

## Code Quality

| Aspect              | Assessment                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------- |
| Type safety         | All imports and types match between contracts, api-client, and driver-app                |
| Error handling      | All async operations wrapped in try/catch with `Alert.alert`                             |
| UX states           | Loading, empty, populated, form, submitting all handled                                  |
| Destructive actions | Unbind requires confirmation dialog                                                      |
| UI integration      | `settings.tsx` imports and renders `<PlatformBinding />` within section style (line 124) |

## Review Outcome

**`confirm`** — All acceptance criteria met. Implementation is clean, typesafe, and follows project conventions.

## Remaining Questions

None. Ready for approval.
