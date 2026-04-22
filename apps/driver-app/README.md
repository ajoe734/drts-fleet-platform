# Driver App

Expo Router driver surface for onboarding, jobs, trip lifecycle, incident handling, earnings, and settings.

Implemented / materially wired screens include:

- `/onboarding`
- `/jobs`
- `/trip`
- `/incident`
- `/earnings`
- `/settings`

`/onboarding` now behaves as the driver workstation entry gate:

- healthy checks route drivers into the normal multi-platform workspace
- degraded checks stay on a formal recovery screen with probe status, retry,
  and profile/settings recovery actions instead of falling back to a placeholder
  shell

This app is the active Phase 1 driver surface, not a placeholder shell.
