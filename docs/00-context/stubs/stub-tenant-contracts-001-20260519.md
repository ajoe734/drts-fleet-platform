# Tenant Contracts Stub

Status: directive-required thin stub
Canonical artifact: `packages/contracts/src/index.ts`

This file does not redefine product semantics. It points reviewers to the current source of truth for tenant-facing contract enums, envelopes, and identity/bootstrap interfaces.

## Do not restate

- Service bucket, dispatch semantic, and partner eligibility definitions already owned by `packages/contracts/src/index.ts`.
- API envelope, pagination, and domain event contract details already owned by `packages/contracts/src/index.ts`.
- Tenant bootstrap session, tenant portal profile, and identity context field-level semantics already owned by `packages/contracts/src/index.ts`.
- Any other exported tenant contract types, constants, or interfaces from the canonical artifact.

## Current source of truth

- Canonical tenant contracts artifact: `packages/contracts/src/index.ts`
- Planning reference: `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`
- Resolution requiring thin stubs: `docs/00-context/phase1-v3-resolution-20260519.md`
