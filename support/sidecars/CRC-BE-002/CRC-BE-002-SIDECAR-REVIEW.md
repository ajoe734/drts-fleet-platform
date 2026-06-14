# CRC-BE-002 Review Packet & Evidence Summary

**Sidecar Task:** `CRC-BE-002-SIDECAR-REVIEW`  
**Parent Task:** `CRC-BE-002`  
**Helper Kind:** `review_packet`  
**Current Owner:** `Codex`  
**Assigned Reviewer:** `Codex2`  
**Parent Owner / Reviewer:** `Codex` / `Claude2`  
**Last Revised:** `2026-06-14 (UTC)`  
**Status:** `SUPPORT ARTIFACT READY FOR REVIEWER HANDOFF`

---

## 1. Scope Boundary

This sidecar is support-only.

- In scope: review packet, evidence summary, reviewer checkpoints, and handoff text.
- Out of scope: canonical truth edits, runtime/code/test changes, or re-scoping the parent implementation.

The packet is derived from recorded machine truth plus the parent implementation commit already referenced by machine truth.

---

## 2. Machine-Truth Snapshot

Current task state from `scripts/ai-status.sh show`:

- Sidecar task `CRC-BE-002-SIDECAR-REVIEW` is owned by `Codex`, assigned reviewer `Codex2`, and began from `backlog`.
- Parent task `CRC-BE-002` is currently `review`.
- Parent owner / reviewer are `Codex` / `Claude2`.
- Parent dependency `CRC-BE-001` is already `done`, with `integration_status: merged_to_dev`.
- Parent `next` records the evidence chain already expected by review:
  - `POST /partner/ingress/handoff` implemented
  - partner ingress credential validation enforced
  - `resolveOrCreate` binding reuse wired through `CRC-BE-001`
  - short-lived passenger JWT includes `partnerEntrySlug` and `drtsPassengerId`
  - verification recorded as:
    - `pnpm test:unit -- tests/unit/multi-tenant-header-routing.test.ts apps/api/tests/unit/tenant-partner.controller.test.ts apps/api/tests/unit/auth-bootstrap.test.ts apps/api/tests/unit/tenant-partner.service.test.ts`
    - `pnpm --filter @drts/api typecheck`
    - `pnpm typecheck:root`
  - recorded parent commit: `f290049d5d0f2f8442ca70238ff94e6e532d465f`

Dependency baseline:

- `CRC-BE-001` closeout is already recorded at commit `95803b4dbde53e9de7dce33ff89af9605641722c`
- `CRC-BE-001` was pushed to `origin/integrate/crc-be-001-20260614`
- `CRC-BE-001` machine truth says `integration_status: merged_to_dev`

Practical meaning:

- this sidecar should help review the already-implemented parent change
- it must not mutate or reinterpret the parent scope
- it should point reviewer attention to the exact seams where `CRC-BE-002` composes on top of `CRC-BE-001`

---

## 3. Parent Implementation Summary

Parent commit `f290049d5d0f2f8442ca70238ff94e6e532d465f` adds the partner ingress handoff flow across controller, service, auth, and contracts.

### E-1 Route and session issuance

`apps/api/src/modules/tenant-partner/tenant-partner.controller.ts` in the parent commit adds:

- `@OpenRoute()` `POST("partner/ingress/handoff")`
- open-route throttling for the handoff endpoint
- call-through to `tenantPartnerService.issuePartnerIngressHandoff(...)`
- short-lived JWT issuance with `PARTNER_INGRESS_HANDOFF_EXPIRES_IN = "15m"`
- returned session payload carrying:
  - `accessToken`
  - `tokenType: "Bearer"`
  - `expiresIn: "15m"`
  - `partnerEntrySlug`
  - `drtsPassengerId`
  - `identity` for actor type `referral_passenger`

Commit anchors:

- `f290049:apps/api/src/modules/tenant-partner/tenant-partner.controller.ts#L182-L230`
- same file also maps missing `JWT_SECRET` to `503 JWT_NOT_CONFIGURED` at `#L142-L165`

### E-2 Binding reuse via CRC-BE-001

`apps/api/src/modules/tenant-partner/tenant-partner.service.ts` in the parent commit adds `issuePartnerIngressHandoff(...)`:

- authenticates partner bootstrap using `entrySlug + apiKey`
- requires non-empty `partnerUserRef`
- calls `partnerUserIdentityLinkRepository.resolveOrCreate(...)`
- immediately calls `touchLastSeen(...)`
- reuses the existing `drtsPassengerId` on reopen
- rejects inactive links with `PARTNER_USER_IDENTITY_REVOKED`
- returns identity for actor type `referral_passenger` with scope `partner:handoff`

This is the core composition seam with `CRC-BE-001`: the parent task does not invent a new binding store, it consumes the durable link repository added by `CRC-BE-001`.

Commit anchor:

- `f290049:apps/api/src/modules/tenant-partner/tenant-partner.service.ts#L4345-L4412`

### E-3 Contract surface

`packages/contracts/src/referral-channel.ts` in the parent commit adds the transport contract for the new flow:

- `CreatePartnerIngressHandoffCommand`
- `PartnerIngressHandoffSession`
- handoff identity shape including `partnerEntrySlug` and `drtsPassengerId`

Commit anchor:

- `f290049:packages/contracts/src/referral-channel.ts#L66-L93`

### E-4 Auth model and JWT payload

The parent commit extends auth for the new bearer session:

- `apps/api/src/common/auth/auth.constants.ts`
  - adds actor type `referral_passenger`
  - maps it to partner role family
  - restricts default scope preset to `partner:handoff`
- `apps/api/src/common/auth/jwt-auth.service.ts`
  - adds `drtsPassengerId` to JWT payload and signer input
  - preserves `partnerEntrySlug` in the token payload

Commit anchors:

- `f290049:apps/api/src/common/auth/auth.constants.ts#L22-L35`
- `f290049:apps/api/src/common/auth/auth.constants.ts#L143-L150`
- `f290049:apps/api/src/common/auth/jwt-auth.service.ts#L12-L25`
- `f290049:apps/api/src/common/auth/jwt-auth.service.ts#L110-L145`

### E-5 Test coverage called out by machine truth

The parent review notes and recorded verification point to these checks:

- `apps/api/tests/unit/tenant-partner.controller.test.ts`
  - happy path issues a bearer token, preserves `partnerEntrySlug`, and reuses `drtsPassengerId` on reopen
  - invalid API key is rejected
- `tests/unit/multi-tenant-header-routing.test.ts`
  - constructor wiring updated so tenant-partner controller still participates in routing checks
- machine truth also records passing runs for:
  - `apps/api/tests/unit/auth-bootstrap.test.ts`
  - `apps/api/tests/unit/tenant-partner.service.test.ts`

Direct commit anchor:

- `f290049:apps/api/tests/unit/tenant-partner.controller.test.ts#L36-L112`

---

## 4. Evidence Inventory

| ID | Evidence | Anchor |
| --- | --- | --- |
| E-1 | Parent machine-truth review state and verification summary | `scripts/ai-status.sh show CRC-BE-002` |
| E-2 | Dependency machine-truth closeout for durable binding store | `scripts/ai-status.sh show CRC-BE-001` |
| E-3 | Parent implementation commit summary | `git show --stat --summary f290049d5d0f2f8442ca70238ff94e6e532d465f` |
| E-4 | Handoff controller route and JWT session issuance | `f290049:apps/api/src/modules/tenant-partner/tenant-partner.controller.ts` |
| E-5 | Binding reuse through `resolveOrCreate` / `touchLastSeen` | `f290049:apps/api/src/modules/tenant-partner/tenant-partner.service.ts` |
| E-6 | Public contracts for command/session payloads | `f290049:packages/contracts/src/referral-channel.ts` |
| E-7 | Auth scoping and JWT payload additions | `f290049:apps/api/src/common/auth/auth.constants.ts`, `f290049:apps/api/src/common/auth/jwt-auth.service.ts` |
| E-8 | Parent unit-test anchor for reopen reuse and invalid-key rejection | `f290049:apps/api/tests/unit/tenant-partner.controller.test.ts` |

---

## 5. Reviewer Hotspots

Reviewer `Codex2` should confirm:

1. This packet stays support-only and does not modify or reinterpret canonical truth.
2. Parent `CRC-BE-002` is still in `review`, not `done`, and this packet reflects that exact state.
3. The parent implementation composes on top of `CRC-BE-001` instead of duplicating identity-binding logic.
4. The handoff endpoint is open-route but still guarded by partner ingress credential validation in service flow.
5. The issued bearer session is intentionally short-lived (`15m`) and carries both `partnerEntrySlug` and `drtsPassengerId`.
6. The new auth actor/scope surface is constrained to `referral_passenger` + `partner:handoff`, not broad tenant or partner admin scopes.
7. The recorded verification list in machine truth is consistent with the implementation seams cited above.

Suggested approval wording:

> `審查通過：CRC-BE-002 sidecar review packet 已對齊 machine truth（parent CRC-BE-002 目前為 review，commit f290049），清楚指出 handoff route、CRC-BE-001 的 resolveOrCreate/touchLastSeen 組合點、15m referral_passenger JWT 與 partner:handoff scope、以及已記錄的 typecheck/test 證據；support artifact only，未改 canonical truth。可交由 Claude2 依此 packet 審 parent 實作。`

Suggested reopen wording:

> `packet needs refresh: [machine-truth mismatch / parent commit drift / missing evidence anchor / support-scope violation]`

---

## 6. Handoff Commands

Owner handoff to sidecar reviewer:

```bash
AI_NAME=Codex scripts/ai-status.sh handoff CRC-BE-002-SIDECAR-REVIEW Codex2 "CRC-BE-002 sidecar review packet is ready at support/sidecars/CRC-BE-002/CRC-BE-002-SIDECAR-REVIEW.md. It matches current machine truth: parent CRC-BE-002 is in review at commit f290049d5d0f2f8442ca70238ff94e6e532d465f, depends on CRC-BE-001 done/merged_to_dev at 95803b4dbde53e9de7dce33ff89af9605641722c, and the packet summarizes the reviewer hotspots, auth/contracts seams, and recorded verification evidence without changing canonical truth."
```

Reviewer approval:

```bash
AI_NAME=Codex2 scripts/ai-status.sh approve CRC-BE-002-SIDECAR-REVIEW "審查通過：CRC-BE-002 sidecar review packet 已對齊 machine truth（parent CRC-BE-002 目前為 review，commit f290049），清楚指出 handoff route、CRC-BE-001 的 resolveOrCreate/touchLastSeen 組合點、15m referral_passenger JWT 與 partner:handoff scope、以及已記錄的 typecheck/test 證據；support artifact only，未改 canonical truth。可交由 Claude2 依此 packet 審 parent 實作。"
```

Reviewer reopen:

```bash
AI_NAME=Codex2 scripts/ai-status.sh reopen CRC-BE-002-SIDECAR-REVIEW "packet needs refresh: [machine-truth mismatch / parent commit drift / missing evidence anchor / support-scope violation]"
```

---

## 7. Change Log

- 2026-06-14 - Initial packet created for `CRC-BE-002-SIDECAR-REVIEW`.
- 2026-06-14 - Packet anchored the parent review state, dependency on `CRC-BE-001`, parent implementation commit `f290049...`, and the reviewer handoff commands for `Codex2`.
