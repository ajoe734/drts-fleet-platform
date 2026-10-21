# PAX-WEB-AUTH-UI-20261009-UNBLOCK-PLANNING-DECISION

Date: 2026-10-10. Owner: Codex. Reviewer: Codex2.
Disposition: route the missing visual source to Supervisor; parent remains blocked.
This planning packet supplies requirements and routing, not approved screen designs.

## Evidence and authority

- Inspected base and fetched `origin/dev`: `5b11155d33fd4d6c345e01cb9730012d3b3d08d1`.
- Parent owner: Codex2; reviewer: Codex. Preserved [draft PR #2514](https://github.com/ajoe734/drts-fleet-platform/pull/2514), branch `codex2/pax-web-auth-ui-20261009`, head `c1f92a346b3993ea60e8f66f61b1e06049a87edc`. This is an owner checkpoint, not a locked review candidate.
- Read the complete original parent UAT and screen-requirements note from that exact head using `git show`. They are present on the parent branch, not this dev-based helper. Local snapshots: `.local/pax-web-auth-unblock-planning-20261010/parent-uat.md` (SHA256 `c30e6e5cff74ee3add39c463fc47191916a13b989480177e03f0d82ba9551250`) and `parent-screen-requirements.md` (SHA256 `569e6ededbf807cdd1e22c5d8931a0e829285106b01e1ba8d815ebf2c4700932`). These snapshots are machine-specific evidence, not replacement canonical documents.
- [Accepted first-party decision](../../../docs/01-decisions/SD-DP-20261009-001-first-party-passenger-app.md) records the latest user requirements: mobile web first; phone, Email, Google, Facebook and LINE login; explicit identity linking, no automatic account merging.
- [SA/SD §§2–4](../../../docs/02-architecture/passenger-app-20261009/01_system_sa_sd.md) and `packages/contracts/src/passenger-app.ts` define provider availability, transaction purposes, consent fields, session and account rules. No missing API contract choice was found that authorizes a replacement layout.
- Visual sources actually inspected: `docs/05-ui/drts-design-canvas/智行叫車 Passenger.html`, `p5-screens.jsx`, `p5-e-screens.jsx`, and `packages/ui-tokens/src/realms.ts`. The HTML mounts only `p5-01` through `p5-12`, `p5-a03`, `p5-a04`, `e18`, `e18b`, `e19a`, `e19b`, `e19b-off`. Receipt E-04 is `p5-10`. None is an auth/account artboard.

## Recorded decision and scope

F7 is a missing canonical visual source, not permission to design a new UI.
Keep the canvas-only contract and both parent acceptance keys unchanged.
Existing P5 cards/buttons, token colors, SD behavior and passing functional checks
do not authorize the missing screen composition. A Supervisor status change or
the historical “P5 components + requirements note + SD copy” rationale cannot
override the latest user's explicit STOP rule.

This helper changes only this planning artifact. It adds no canvas, product UI,
token palette, legal text, provider credentials, or acceptance waiver. Preserve
the parent's repair ledger and published history. Do not resubmit the adjacent
F7 defect unchanged. The five login methods remain required; environment-disabled
methods follow SA/SD availability rather than an unapproved product scope cut.

## Screen requirements for the design-source follow-up

The following are behavioral coverage requirements, not invented artboard IDs,
layout, typography or colors. Supervisor coordinates an authorized design source
under the existing Passenger canvas and records its real path, IDs and version.

| Surface / production call path at parent checkpoint   | Required canonical screen states                                                                                                                                          | Existing contract constraint                                                                                                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LoginPage → enabled providers / phone or Email OTP    | Provider discovery loading/error/empty/available; method selection; OTP sending, sent, verifying, invalid, locked, expired, resend cooldown and return/re-entry           | `AuthProvidersResponse`, `RequestOtpCommand`, `VerifyOtpCommand`; 60-second resend cooldown, five-minute expiry and five failures; disabled providers hidden                  |
| LoginPage or AccountPage → OAuth start → CallbackPage | Login versus link initiation; redirect pending; callback success, denial, error and recoverable transaction failure                                                       | Provider-specific Google/Facebook/LINE start/callback; state and transaction binding; authenticated linking; no placeholder transaction or automatic merging                  |
| OTP login / CallbackPage / AccountPage → ConsentGate  | Both current consent versions present, missing/outdated/partial consent, unchecked/refused, read/write failure, unavailable content/configuration, successful persistence | `UpdatePassengerMeCommand.termsVersion` and `.privacyVersion`; retain recoverable failures and configured content URLs; booking E-19 fee acknowledgement is not legal consent |
| AccountPage → profile / contact-phone OTP             | Initial loading/error; editable profile, save pending/success/error; unverified/verified contact; verification enabled/disabled/pending/locked/expired                    | Server account identity is authoritative; `verify_contact_phone` is session-bound; phone change invalidates verification; `REQUIRE_SMS_VERIFICATION` governs booking          |
| AccountPage → identities / login-method linking       | Identity loading/empty/error/list; enabled OTP/OAuth linking; pending/success/conflict; unlink confirm/cancel/error and last-identity refusal                             | Explicit logged-in linking; `UnlinkPassengerIdentityCommand.identityId`; preserve session/account-switch boundary and `last_identity_error`                                   |
| AccountPage → logout / delete                         | Confirm/cancel and pending/success/failure states; deletion retention notice and pending-payment refusal                                                                  | Session revocation; soft deletion/anonymization with statutory trip/financial retention; `pending_payment_block` must stay visible                                            |

Legal full text and production consent versions/URLs remain a separate pending
input documented by the parent owner. Design delivery must not fabricate these
values or treat functional consent tests as legal-content acceptance.

## Supervisor coordination and concrete parent next step

1. Record this packet on the existing parent task, retain `status=blocked`, and
   coordinate an authorized design owner/source for the missing screen matrix.
   Check overlapping canvas writers before granting any additional write scopes.
   If a separate design task is needed, register it in machine truth and its
   dependency before treating it as assigned work; this helper invents no task.
2. Before this helper can merge, use the current-release gateway to set all three
   helper metadata fields below. The owner dispatch is restricted to this helper's
   lifecycle commands; it cannot assign metadata or mutate the parent. Keep this
   helper blocked awaiting that coordination rather than allowing the default
   helper completion behavior to mark the parent `todo`.
3. Supply committed canonical Passenger screen paths, actual artboard IDs and
   source version for the matrix. Only an explicit user revision can authorize
   a different visual source. No revision is inferred or requested by this packet.
4. Once the source exists, Supervisor verifies the resume gate and routes the
   parent back to Codex2. Codex2 references those actual artboards in the original
   UAT/requirements note, matches existing auth/account composition to them,
   preserves F1–F6/F8/F9 regressions, and reruns affected checks. Published parent
   history uses normal merge/push if synchronization is necessary; no rebase,
   amend, reset or force push. New exact-SHA review/CI and both acceptances remain
   required; browser/runtime acceptance uses authorized hosted infrastructure.

Requested helper metadata (Supervisor applies; not yet applied by this owner):

```json
{
  "resolved_parent_status": "blocked",
  "resolved_parent_waiting_for": "Codex",
  "resolved_parent_next": "F7 remains open. Coordinate canonical Passenger login/OTP/OAuth callback/consent/profile/contact/identity/logout/delete screens per support/unblock/PAX-WEB-AUTH-UI-20261009/PAX-WEB-AUTH-UI-20261009-UNBLOCK-PLANNING-DECISION.md; record actual source paths, artboard IDs and version. Preserve draft PR #2514 and its repair evidence. After the visual source is delivered and Supervisor verifies the resume gate, Codex2 matches the implementation to it, updates the original UAT and revalidates both pax-web-auth_login_methods_ui and pax-web-auth_account_management_ui with new same-SHA review/CI. Legal-content configuration and hosted/external acceptance remain pending. Status changes alone do not resolve F7."
}
```

The same concrete next-step message must be written to the parent through the
gateway, preserving blocked status and routing design coordination to Supervisor.
The helper's own progress/blocker record carries this request until that happens.

## Finding and acceptance evidence (AI_COLLABORATION_GUIDE §0.7)

| Finding / acceptance                               | Source and bounded change                                                                                                                                                                                | Old → current result                                                                                         | Commands / evidence                                                                                                                                                              | Remaining limitation                                                                               |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| F7, same defect across two reviews                 | Original UAT at parent head; adjacent reviewed SHAs `6a61936f67b216347921bbe8b43fa9bb705fecf0` and `bb1f4ac00ea134f9418b82b82b21fe94d245e8ca`; actual Passenger artboard inventory; this packet's matrix | Both reviews found auth/account artboards absent → still absent at inspected dev and parent checkpoint; OPEN | Complete parent `git show` reads, `gh pr view 2514`, HTML inventory and JSX symbol/content reads; exit 0. Static localization; dynamic reproduction N/A for missing design files | No approved visual source; no UI implementation or acceptance claimed                              |
| Route missing decision / record explicit follow-up | Accepted decision, SA/SD, formal commands, canvas inventory; this packet                                                                                                                                 | Ambiguous “unblock planning” → identified visual delivery and named Supervisor action with resume gate       | Source/content checks and hashes above; exact helper validation/delivery recorded below                                                                                          | Routing does not close parent F7 or supply designs                                                 |
| Commit / push / PR evidence                        | Only this task artifact on assigned dev-based branch                                                                                                                                                     | Canonical packet needs recoverable delivery                                                                  | Exact helper head and published PR recorded in machine progress/handoff when eligible                                                                                            | No merge or deployment claim                                                                       |
| Update parent next                                 | Current-release worker guard and candidate lifecycle                                                                                                                                                     | Parent waiting for Codex → concrete Supervisor routing requested in helper machine truth                     | Owner progress records the request; Supervisor must update parent and helper metadata before merge                                                                               | PENDING: owner dispatch cannot mutate a different task or run assignment commands; no guard bypass |
| Both parent UI acceptance keys                     | Original parent UAT retains F1–F9 and owner test/CI evidence                                                                                                                                             | Parent reports repaired functional checks; this helper does not rerun or independently approve them          | Parent checkpoint and original UAT hashes above; source inspection only                                                                                                          | F7, legal configuration and hosted/external acceptance remain; neither key passed by this helper   |

No product runtime, preview, browser server, Docker or live provider was started.
Planning-only validation uses content/citation/format/commit gates; product tests
and deployment are not applicable to this helper's one-document diff.

## Completed local validation and coordination boundary

At anchor `c2ad57b2a` against fixed base `5b11155d33fd4d6c345e01cb9730012d3b3d08d1`:

- PASS exit 0: `python3 tools/ci/git/check_canonical_consistency.py --ci --base 5b11155d33fd4d6c345e01cb9730012d3b3d08d1 --head HEAD` (zero findings).
- PASS exit 0: `python3 tools/ci/git/check_commit_trailers.py --base 5b11155d33fd4d6c345e01cb9730012d3b3d08d1 --head HEAD` (one commit).
- PASS exit 0: `git diff --check 5b11155d33fd4d6c345e01cb9730012d3b3d08d1...HEAD`.
- PASS exit 0: `pnpm exec prettier --check` for this artifact and `node tools/ci/check-repo-classification.mjs` (6216 files).
- BLOCKED exit 1: authorized attempt to update the parent's next step using `AI_NAME=Codex` and the current-release `ai-status.sh note PAX-WEB-AUTH-UI-20261009` was rejected: `Dispatched worker cannot mutate a different task`. No parent change occurred. Dispatch guard was preserved, not removed or bypassed.
- PENDING: Supervisor applies the requested parent next/status and all three helper disposition metadata fields. Current helper `show` still has those fields unset. Owner will publish a draft PR/checkpoint and write `blocker ... Codex2` for reviewer coordination with Supervisor; no candidate handoff until this boundary is resolved.

All locally started checks finished and their output was read. Final exact head,
ordinary push and draft PR identity are recorded in this helper's machine status
and PR description; no hosted CI is claimed as passed by this helper.

Routing correction: current-release `ensure_agent` accepts worker lanes, not the Supervisor role. A `blocker` attempt naming Supervisor exited 1 (`Unknown agent: Supervisor`) and changed no machine truth. Preserve parent waiting lane Codex in the requested helper metadata; Codex2 coordinates the Supervisor gateway action for this helper. Supervisor remains the responsible operator for metadata, parent routing and design-source assignment.
