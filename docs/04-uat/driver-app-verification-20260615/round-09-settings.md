# Round 9 — Settings (`設定` / `app/settings.tsx`)

## Plan

- Display: settings screen — 司機身份 (identity), profile fields (name/phone/email),
  emergency contact, preference toggles, save-state bar.
- Functional: `GET /api/driver-settings/:driverId`; `PATCH` updates persist
  (notifications / auto-accept / language); save-state reflects changes.

## Execution (driver `drv-demo-001`)

- `GET /api/driver-settings/drv-demo-001` BEFORE:
  `language=en, notifications_enabled=true, auto_accept_enabled=false`.
- `drts-driver://settings` → `screens/r9-settings.png`.
- `PATCH {autoAcceptEnabled:true, notificationsEnabled:false, language:"en"}` → **200**.
- `GET` AFTER: `notifications_enabled=false, auto_accept_enabled=true` (persisted),
  then reverted.

## Results — PASS

| Check             | Expected                  | Observed                                          | Verdict |
| ----------------- | ------------------------- | ------------------------------------------------- | ------- |
| Screen renders    | 設定 + profile + contacts | rendered, bound to driver data                    | PASS    |
| Identity card     | name/ID/phone             | Driver Demo One / drv-demo-001 / +886-912-000-001 | PASS    |
| Profile fields    | name/phone/email editable | Driver Demo One / phone / driver.one@example.com  | PASS    |
| Emergency contact | name/phone                | Demo Contact One …                                | PASS    |
| Save-state bar    | "目前無變更" when clean   | shown                                             | PASS    |
| PATCH persists    | re-GET reflects change    | notifications true→false, auto-accept false→true  | PASS    |
| Locale field      | language editable         | language accepted via PATCH (en)                  | PASS    |
| Error overlay     | none                      | none                                              | PASS    |

## Defects / Findings

None. Settings GET/PATCH round-trips and persists; the profile form is bound to
the driver record and the save-state machine (`lib/settings-form.ts`,
`deriveSaveState`) reflects clean/dirty correctly.

## Test-case impact

Driver settings persistence is a simple GET/PATCH contract; consider a small
`tests/e2e` settings round-trip if formalised. Save-state logic lives in
`lib/settings-form.ts` (pure) and is a candidate for a focused unit test.
