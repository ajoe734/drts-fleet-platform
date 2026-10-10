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

## UI Design Contract Violation
As per the task guidelines, we cannot invent or substitute missing designs with raw hex palettes, shadcn defaults, or unapproved screens. The previous candidate (SHA 6a61936f67b216347921bbe8b43fa9bb705fecf0) violated this by inventing visual components without canonical canvas backing.

## Request
Please coordinate with the design team to provide the canonical screens (or artboards) for the above flows in the Passenger App canvas. Once the authorized visual source is available, the UI implementation will resume strictly following the realm tokens and the provided canvas.
