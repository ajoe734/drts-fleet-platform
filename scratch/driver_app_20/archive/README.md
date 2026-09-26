# Archive

## Partner Booking — deferred to `apps/partner-booking-web`

Per **Q-TEN03** in `docs/05-ui/system-design-answers-all-apps-20260524.md`, the cardholder partner-booking entry point has been **moved out of the Tenant Console** into a separate repo-local app `apps/partner-booking-web`. The legacy `tenant-console-web/app/partner/*` route remains for compatibility/rollback only.

### Files

- `Partner Booking.html` — the CTBC World Elite cardholder funnel (7 iOS screens) built in the previous design round
- `partner-screens.jsx` — its React components

### Why archived (not deleted)

- The funnel design language (card-art header, cardholder context,禮遇 quota tracking, combined billing) is still useful **reference material** for the future `partner-booking-web` design hand-off
- A `partner-booking-design-handoff-packet-*.md` does **not exist yet** — the spec team will write one when that app enters planning
- Visual decisions made here (gold/navy CTBC palette, iOS in-app webview pattern, hero-card eligibility surface) can be revisited at that point

### Not part of the current four-surface delivery

The active design index (`DRTS Index.html`) covers:

- Driver App (mobile)
- Ops Console
- Platform Admin
- Tenant Console

Partner Booking is **not** linked from the index.
