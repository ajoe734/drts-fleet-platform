# UI-FE-ADM-AUD Unblock Planning Decision

## Scope

- Task: `UI-FE-ADM-AUD-UNBLOCK-PLANNING-DECISION`
- Parent: `UI-FE-ADM-AUD`
- Owner: `Codex`
- Reviewer: `Claude2`
- Decision date: `2026-05-28`

## Diagnosis

`UI-FE-ADM-AUD` was blocked by an apparent missing product / contract decision
for the Platform Admin `/audit` page: whether the rebuilt Audit & evidence
governance surface is read-only, or whether it must include evidence-governance
write actions for legal holds and deletion exceptions.

The confusion came from an older BFF handoff note that left this as an
"authority decision" to be negotiated later:

- `support/sidecars/ADM-UI-004/ADM-UI-004-SIDECAR-BFF-HANDOFF.md` §5
  open question #5

That note is now stale relative to higher-precedence planning artifacts that
already resolved the authority semantics.

## Decision

The canonical decision is already present in the current Platform Admin
planning sources and should be treated as binding for `UI-FE-ADM-AUD`:

1. `docs/05-ui/system-design-answers-all-apps-20260524.md` `Q-ADM16`
   explicitly decides that legal hold is a first-class evidence-governance
   state surfaced in audit and evidence lists, with hold owner, expiry, and
   deletion-exception metadata visible.
2. `docs/05-ui/platform-admin-design-handoff-packet-20260525.md` §3.7 and
   §5.16 elevate that decision into the page brief for `/audit`.
3. The `/audit` page therefore is not read-only. It must expose
   evidence-governance write surfaces for:
   - grant / lift legal hold
   - grant / revoke deletion exception
4. Authority remains bounded by backend-issued `availableActions[]`; the UI
   must not hard-code role-based buttons beyond honoring the page personas
   `pa_ops_risk_gov` and `pa_super_admin`.
5. The API / client surface for those actions already exists and is not a new
   contract ask for this unblock:
   - `listEvidenceLegalHolds()`
   - `placeEvidenceLegalHold()`
   - `releaseEvidenceLegalHold()`
   - `listEvidenceDeletionExceptions()`
   - `registerEvidenceDeletionException()`
   - `resolveEvidenceDeletionException()`

## Scope Cut

This unblock resolves the product / authority decision only. It does not expand
`UI-FE-ADM-AUD` into adjacent contract work that older notes also mentioned.

Out of scope for the parent task unless separately assigned:

1. Adding server-side pagination to `listAuditLogs()`.
2. Adding server-side time-range filtering to `listAuditLogs()`.
3. Reworking audit retrieval beyond the existing manual-refresh (`T6`) model.
4. Broadening the page into a generic audit-module contract cleanup slice.

Those remain follow-up opportunities, not blockers to rebuilding
`apps/platform-admin-web/app/audit/page.tsx`.

## Parent Unblocked Next Step

`UI-FE-ADM-AUD` should proceed with the rebuild using the existing canonical
decision:

1. Rebuild `/audit` to match the Platform Admin canvas / packet for
   Audit & evidence governance.
2. Keep the audit log, retention-policy summary, active legal-hold list, and
   active deletion-exception list as first-class sections.
3. Add action entry points for grant / release / register / resolve flows,
   gated by backend `availableActions[]` and using required-reason affordances
   for high-risk actions.
4. Preserve the packet's `T6 manual` refresh model and deep-link behavior
   (`/audit?auditId=<id>` when surfaced from action receipts).
5. Treat audit pagination / time-range filtering as explicit follow-up, not as
   a reason to defer the route rebuild.

Because `UI-FE-TOKENS`, `UI-BE-006`, and `UI-CL-001` are already `done`, the
parent is no longer blocked on prerequisites after this decision packet lands.

## Verification Basis

- `docs/05-ui/system-design-answers-all-apps-20260524.md` `Q-ADM16`
- `docs/05-ui/platform-admin-design-handoff-packet-20260525.md` §3.7, §5.16
- `support/sidecars/ADM-UI-004/ADM-UI-004-SIDECAR-BFF-HANDOFF.md` open question #5
- `packages/api-client/src/index.ts`
- `apps/platform-admin-web/app/audit/page.tsx`
