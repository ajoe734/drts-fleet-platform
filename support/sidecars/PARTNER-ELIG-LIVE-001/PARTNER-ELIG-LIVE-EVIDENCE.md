# PARTNER-ELIG-LIVE-001 — Live Issuer Credential Hold Evidence

**Task:** `PARTNER-ELIG-LIVE-001`  
**Owner:** `Codex2`  
**Reviewer:** `Claude2`  
**Status:** `HELD / external-gated`  
**Last reviewed:** `2026-05-19`

## Purpose

This packet records why partner eligibility cannot claim live issuer or bank closure from repo-only
evidence. The codebase and runbooks document the contract seam, retry/manual-review behavior, and
operator handling, but live issuer activation still depends on external credentials and issuer-owned
approval inputs.

## Current Gate Read

| Gate | Read | Evidence |
| --- | --- | --- |
| Wave planning status | `HELD (external)` | `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md` §4, §5, §8 |
| Master closeout status | `external-gated` | `docs/03-runbooks/master-system-closeout-checklist.md` §D-4a |
| Issuer activation blocker packet | `external-gated` | `support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md` |
| Task dependency | repo-local prerequisite satisfied | `PRT-SPEC-001` is `done` in `ai-status.json`; remaining blockers are external only |

## Blocking Conditions

`PARTNER-ELIG-LIVE-001` stays blocked until all of the following exist:

1. The issuer or bank provides an approved API contract and activation authority.
2. Sandbox credentials or equivalent live-safe credentials are issued and stored at an approved secret path.
3. Network prerequisites are approved if the issuer requires IP allowlists, mTLS, or similar controls.
4. Allowed issuer test cards or references are supplied for eligible, ineligible, timeout, and rate-limit coverage.
5. The issuer confirms timeout/retry expectations and manual-review release policy.
6. Sensitive-data handling and retention requirements are approved for the live credential path.

## External Blocker Mapping

The authoritative external gate remains `EXT-001`. This task should not be moved to live-ready until
the following blocker records are resolved:

| External blocker | Missing input | Effect on this task |
| --- | --- | --- |
| `EXT-001-BLK-001` | Issuer / bank API contract authority | No approved live integration target |
| `EXT-001-BLK-002` | Sandbox credentials and network allowlist | No live sandbox proof or credential handoff |
| `EXT-001-BLK-003` | Allowed test card / reference matrix | No issuer-approved verification fixtures |
| `EXT-001-BLK-004` | Timeout and retry behavior confirmation | Manual fallback remains repo-only |
| `EXT-001-BLK-005` | Manual-review fallback business sign-off | Manual review cannot imply issuer approval |
| `EXT-001-BLK-006` | Sensitive-data handling and retention approval | No production credential rollout |

## Non-Claims

The following statements are not currently supportable:

- "Partner eligibility has live issuer verification."
- "Manual review equals issuer approval."
- "Sandbox test cards passed" without issuer-provided fixtures and logs.
- "This task blocks the documentation-completion wave." The v3 wave planning doc explicitly keeps
  this task in the held external bucket and says held tasks do not block the wave's
  documentation-and-rail-completion definition of done.

## Resume Conditions

Resume active closure work on this task when the external issuer inputs below exist:

1. Contract authority and sandbox credentials are available for the `EXT-001` blocker set.
2. Issuer-approved fixtures, retry/manual-review policy, and sensitive-data approval are attached.

At that point this packet should be extended with:

- credential receipt date and storage path reference
- issuer environment type and any network controls
- approved fixture inventory
- verification log locations
- reviewer-facing statement of exactly what moved from repo/static proof to live issuer proof

## Source List

- `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`
- `docs/03-runbooks/master-system-closeout-checklist.md`
- `support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md`
- `ai-status.json`
