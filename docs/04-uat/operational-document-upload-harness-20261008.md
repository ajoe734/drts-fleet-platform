# Operational Document Upload Harness 2026-10-08

This document records the fix for the operational document upload harness.

## Issue

The previous test harness setup only performed intent and confirm requests, bypassing the actual document upload via PUT request. Because the real backend strictly requires a clean scan receipt on confirmation (which is generated when the actual document bytes are received and scanned), the confirmation steps correctly returned `409 DOCUMENT_NOT_SCANNED`.

## Resolution

- Replaced the intent/confirm operations in `operational-browser-journeys.json` with a single `document-upload` setup instruction.
- Updated the test harness (`operational-browser-acceptance.spec.ts`) to interpret the `document-upload` setup instruction.
- Created `operational-document-upload.ts` to perform the actual PUT request of a harmless PDF.
- The helper supports retrying the upload in case the anti-malware scanner returns `503 DOCUMENT_SCANNER_UNAVAILABLE`.
- Verified the fix through updated unit tests in `operational-browser-manifest.test.ts` and new lifecycle tests in `operational-document-upload.test.ts`.
