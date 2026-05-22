# 08. Weak Network Proof

**Directive item:** weak network proof  
**Status:** `blocked_external`

## Required artifact

- device-side network-conditioning run
- retry/replay evidence under degraded network
- request-id continuity or equivalent backend proof showing no duplicate
  completion

## Current repo anchors

- `docs/04-uat/driver-mobile-real-device-test-report-20260519.md` marks `RD-13`
  as `NOT RUN + STATIC EVIDENCE`
- `docs/03-runbooks/driver-app-native-dev-runbook.md`
- pending replay tests referenced in the report

## Missing external input

- weak-network environment
- physical device execution
- backend trace capture tied to the run

## Collection note

If logs include personal identifiers, redact them before attachment.
