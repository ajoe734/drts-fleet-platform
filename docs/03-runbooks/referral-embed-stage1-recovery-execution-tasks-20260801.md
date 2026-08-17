# Referral Embed Stage 1 Recovery Execution Tasks (2026-08-01)

Status: active recovery record  
Task: `REF-DOC-001`  
Owner: `Codex2`  
Reviewer: `Gemini2`

## 1. Purpose

This runbook restores the deleted 2026-06-13 Referral Embed functional docs
byte-exact, then locks the later visual and topology authority chain without
editing the historical documents themselves.

The historical documents remain authoritative for the original 2026-06-13
functional intent. Their old topology wording is preserved as-is for history,
but current implementation and visual authority must follow the supersession
rules below.

## 2. Byte-exact restoration source

Restore these files from their original commits only:

| Artifact                                                                    | Original commit                            | Rule               |
| --------------------------------------------------------------------------- | ------------------------------------------ | ------------------ |
| `docs/05-ui/community-app-referral-channel-spec-20260613.md`                | `138e39974a0a2b65c20b8b47f64437918660b9e4` | restore byte-exact |
| `docs/05-ui/community-app-referral-channel-screen-requirements-20260613.md` | `26904c0d2c437dd6a93d3027c74ded1d5bf15131` | restore byte-exact |

Notes:

- The 2026-06-20 reland of the spec was already byte-identical to the original
  2026-06-13 spec blob.
- The 2026-06-20 reland of the screen requirements was not byte-identical to the
  original blob because it added extra blank lines; use the original
  `26904c0d...` blob.

## 3. Visual authority lock

The only visual authority for the passenger referral embed is the design bundle
landed by commit `e1bce87dd6066bc92465871c63229e9116c4ac74`
(`DESIGN-CANVAS-REFERRAL-20260614`):

- `docs/05-ui/drts-design-canvas/Passenger Embed.html`
- `docs/05-ui/drts-design-canvas/passenger-embed-screens.jsx`
- `docs/05-ui/drts-design-canvas/pe-data.jsx`

Do not redesign or reinterpret Group A from the historical screen-requirements
document once these canvas files exist. The canvas is the visual source of
truth.

### Phase 1 screen registry locked from `Passenger Embed.html`

These 15 artboards are the complete Phase 1 passenger-embed registry:

1. `identity/handoff`
2. `identity/reauth`
3. `identity/unsupported`
4. `identity/consent`
5. `identity/fallback`
6. `book/book`
7. `book/neg-nosupply`
8. `book/neg-ineligible`
9. `book/neg-denied`
10. `book/neg-degraded`
11. `trip/active`
12. `trip/trips`
13. `trip/receipt`
14. `trip/completed`
15. `trip/cancelled`

### Phase 2 registry already present in the same canvas

The same canvas also contains 4 Phase 2 fallback artboards under `av-fallback`:

1. `fb-vehicle-change`
2. `fb-human-assigned`
3. `fb-service-continuing`
4. `fb-eta-updated`

Those 4 screens are recorded for traceability only. They are not part of the
Phase 1 passenger-embed registry.

## 4. Topology supersession

The historical 2026-06-13 screen requirements say Group A extends
`apps/passenger-web` with `/embed/[entrySlug]`. That statement was true at the
time and must remain untouched in the restored historical document.

Current topology is superseded by commit
`14b361c3a5e060106580a7a616d2293960508db9`
(`REFERRAL-EMBED-MIGRATE-20260616`):

- Referral embed was extracted into standalone `apps/referral-embed-web`.
- Generic `apps/passenger-web` consumer routes were retired.
- Current runtime embed entry is
  `apps/referral-embed-web/app/embed/[entrySlug]/page.tsx`.

This supersession is narrow:

- Keep the 2026-06-13 docs byte-exact for history.
- Use the standalone app for present-day topology and runtime authority.
- Use the Passenger Embed canvas files for visual authority.

## 5. Mandatory current source chain

When a reader follows the restored docs today, these current repo paths must be
used:

| Concern                            | Historical reference                                                        | Current resolving source                                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Functional spec                    | `docs/05-ui/community-app-referral-channel-spec-20260613.md`                | same path                                                                                                          |
| Screen requirements                | `docs/05-ui/community-app-referral-channel-screen-requirements-20260613.md` | same path                                                                                                          |
| Group A visual authority           | implied future canvas in screen requirements                                | `docs/05-ui/drts-design-canvas/Passenger Embed.html` + `docs/05-ui/drts-design-canvas/passenger-embed-screens.jsx` |
| Group A runtime topology           | `apps/passenger-web`                                                        | `apps/referral-embed-web`                                                                                          |
| Embed route entry                  | `/embed/[entrySlug]` on passenger-web                                       | `apps/referral-embed-web/app/embed/[entrySlug]/page.tsx`                                                           |
| Embed runtime surface              | passenger-web shell                                                         | `apps/referral-embed-web/components/passenger-embed.tsx`                                                           |
| Dispatch packet cited by both docs | `scripts/dispatch-community-referral-channel-20260613.py`                   | same path                                                                                                          |

## 6. Verification target

Acceptance for `REF-DOC-001` requires:

1. both restored 2026-06-13 docs match their original commit blobs byte-for-byte
2. the authority and supersession note above is explicit
3. all current source-chain paths in Section 5 resolve in the repo
4. docs checks and `git diff --check` pass
