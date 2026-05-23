# 07. Location Permission Proof

**Directive item:** location permission proof
**Status:** `blocked_external`

## Required artifact

- OS permission prompt capture or settings-state capture
- proof that permission was granted on the tested device
- link to the build/session used for the rest of the packet

## Current repo anchors

- `apps/driver-app/lib/driver-location-heartbeat.ts`
- `apps/driver-app/app/trip.tsx`
- parent acceptance for `PH1GC-DRV-MP-002` explicitly requires this item

## Missing external input

- physical device permission flow
- human-in-loop capture of the permission grant

## Collection note

Mask any visible driver identity fields before attachment.
