# Passenger App Auth & Account Screen Requirements

**Date**: 2026-10-10
**Task**: PAX-WEB-AUTH-UI-20261009

## Missing Screens in Design Canvas
The design canvas `docs/05-ui/drts-design-canvas/智行叫車 Passenger.html` and `p5-screens.jsx` do not contain authorized visual sources for the following screens and states required by the task:

1. **Login & Registration (手機/Email/OAuth)**
   - Initial Login Method Selection Screen (Enabled providers, Google/Facebook/LINE/Phone/Email).
   - OTP Input Screen (Cooldown timer, Error states, Challenge locked, Expiry).
   - Terms and Privacy Policy Consent flow (First-use consent).
   - OAuth redirect/callback loading or error states.

2. **Account Management & Profile (`/account`)**
   - User Profile Information display.
   - Contact Phone Verification flow & OTP states.
   - Connected Accounts (Identities) list.
   - Link / Unlink action confirmation and error states.
   - Logout confirmation.
   - Delete Account confirmation and retention notice.

## 2026-10-10 Supervisor design decision carried by owner dispatch

The Codex2 takeover dispatch explicitly directs this task to use **P5 components + this requirements note + SD copy**. This is the authorization for composing the missing functional screens; it does not assert that new auth artboards exist. Earlier reviews of `6a61936f67b216347921bbe8b43fa9bb705fecf0` and `bb1f4ac00ea134f9418b82b82b21fe94d245e8ca` correctly reported that gap.

Read references before implementation:

- `智行叫車 Passenger.html`, `p5-screens.jsx`: P5_S08 card/form spacing, P5_S10 account-like key/value rows, P5_S11 recoverable error actions.
- `p5-e-screens.jsx`: P5_E19a first-use acknowledgement and P5_E19b explicit unchecked/disabled confirmation pattern. Fee copy is specific to booking and is not reused for legal consent.
- `apps/passenger-app-web/components/p5-ui.tsx`: existing P5Card, P5Icon, and P5Btn presentation. The auth-scoped button adds native disabled semantics without changing the shared shell component.
- `packages/ui-tokens/src/realms.ts`: passenger realm; neutral/success/warning/danger surfaces and foregrounds are from the shared tokens. No replacement palette or typeface.
- `docs/02-architecture/passenger-app-20261009/01_system_sa_sd.md` §2: enabled providers, OTP timing, session-bound link/verification, soft deletion and retained trip/financial records.

The screens above use the existing card/button/form patterns. Visual approval of dedicated auth artboards remains a design limitation for independent review; this note records the explicit dispatch decision, not an invented canvas.
