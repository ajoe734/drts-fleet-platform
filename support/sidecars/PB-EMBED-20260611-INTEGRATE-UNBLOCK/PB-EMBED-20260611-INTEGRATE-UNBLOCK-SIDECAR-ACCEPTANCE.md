# Sidecar Acceptance Packet — PB-EMBED-20260611-INTEGRATE-UNBLOCK

- Helper task: `PB-EMBED-20260611-INTEGRATE-UNBLOCK-SIDECAR-ACCEPTANCE`
- Parent task: `PB-EMBED-20260611-INTEGRATE-UNBLOCK`
- Helper kind: `acceptance_packet`
- Owner (helper): `Claude2`
- Reviewer (helper): `Codex2`
- Mutates canonical truth: **no** (support artifact only)
- Generated: 2026-06-11

> Scope note: this packet is **support-only**. It does not rebase, resolve, or
> land anything. It hands the parent owner a verified conflict map, a
> dependency map, a resolution recommendation, and an acceptance checklist so
> the integration can be closed quickly and safely. All SHAs below are pinned
> against `origin` as fetched on 2026-06-11.

---

## 1. Parent task at a glance

| Field | Value |
| --- | --- |
| Parent id | `PB-EMBED-20260611-INTEGRATE-UNBLOCK` |
| Parent title | Integrate PB-EMBED-20260611: resolve rebase conflict onto dev |
| Parent owner | `Codex2` (reassigned from Codex after a 2/2 `worker exited before terminal status` streak, no committed WIP) |
| Parent reviewer | `Claude2` |
| Parent acceptance | rebase the branch onto `origin/dev`; resolve conflicts / cross-app CI ripples; land it on `dev` |
| Subject branch | `codex/pb-embed-20260611` |
| Branch tip | `ec80f8d082367d7d693f343ce21fb2fc58aeab97` — `PB-EMBED-20260611: closeout for review-approved owner finalize` |
| Auto-integrator staging ref | `integrate/pb-embed-20260611` → `ec80f8d0` (parked at branch tip; rebase never advanced) |
| `origin/dev` tip | `9668f40d` — `AUTO-INTEGRATOR-EXEMPT-20260611: honor integration_gate.exempt_task_patterns (#639)` |
| Merge base | `de953bad65c3ab13113c816697026cfd1192d0f6` |

**Why it is blocked:** the auto-integrator could not 3-way-merge
`apps/partner-booking-web/lib/translations.ts`. The sibling
`PB-EMBED-R-20260611` (commit `ca0cd1ca`, PR #635, *online-banking embed
identity states*) already landed on `dev` and edited the **same file region**
of the `en`/`zh-TW` dictionaries. The two changes are textually adjacent, so
git flags a content conflict even though they do not collide semantically
(see §4).

---

## 2. Dependency map

```
PB-EMBED-20260611  (original feature slice; review-approved, branch closed out)
        │   branch: codex/pb-embed-20260611  @ ec80f8d0
        │   3 commits over merge-base de953bad:
        │     688fe8df  S2 online-banking embed identity states (B1-B5)
        │     ba2be4ce  fix embed CTA continuation + index host guard
        │     ec80f8d0  closeout for review-approved owner finalize
        ▼
PB-EMBED-20260611-INTEGRATE-UNBLOCK   (THIS parent — land the branch on dev)
        │   owner Codex2 / reviewer Claude2
        │   blocked by: rebase conflict in translations.ts vs sibling on dev
        ▼
PB-EMBED-20260611-INTEGRATE-UNBLOCK-SIDECAR-ACCEPTANCE  (THIS packet)
            owner Claude2 / reviewer Codex2 — support only

Sibling already on dev (the conflicting counterpart, NOT a blocker to wait on):
    PB-EMBED-R-20260611   ca0cd1ca / PR #635   "online-banking embed identity states"
        → added program.screen.embed_* + book.travel.* keys to translations.ts
```

- `depends_on`: **none** recorded on either the parent or this helper. The
  sibling `PB-EMBED-R-20260611` is **already merged** — it is the *cause* of the
  conflict, not an open dependency to wait for. No sequencing wait is required;
  the integrator can resolve immediately.
- No other in-flight task touches `apps/partner-booking-web/lib/translations.ts`
  ahead of this one as of the `9668f40d` dev tip.

---

## 3. Change surface (what the branch lands)

`git diff <merge-base> origin/codex/pb-embed-20260611`:

| File | Δ | Nature |
| --- | --- | --- |
| `apps/partner-booking-web/lib/translations.ts` | +155 | **conflicting** — additive en/zh-TW `embed.*` keys |
| `apps/partner-booking-web/lib/embed-states.tsx` | +1108 (new) | clean — new file, no dev counterpart |
| `apps/partner-booking-web/app/[tenantSlug]/embed/[state]/page.tsx` | +41 (new) | clean — new route |
| `apps/partner-booking-web/app/[tenantSlug]/embed/page.tsx` | +33 (new) | clean — new route |

Total: 4 files, +1337 lines, all additive (the branch removes **zero**
existing lines). 3 of the 4 files are net-new and merge cleanly; the only
conflict is `translations.ts`.

---

## 4. Conflict analysis — `translations.ts`

Verified with `git merge-tree --write-tree origin/dev origin/codex/pb-embed-20260611`:
exactly one `CONFLICT (content)`, in `apps/partner-booking-web/lib/translations.ts`.
The other three files produce no conflict.

**Both sides are purely additive in the same hunk region:**

- Branch adds **64 distinct keys** (en) — all under the `embed.*` namespace
  (`embed.chrome.*`, `embed.flow.*`, `embed.state.*`, `embed.handoff.*`,
  `embed.reauth.*`, `embed.unsupported.*`, `embed.consent.*`, `embed.fallback.*`),
  mirrored across en and zh-TW (~128 `embed.` lines total incl. both locales).
- Dev (`ca0cd1ca`) adds **91 distinct keys** — `program.screen.embed_*`,
  `book.travel.*`, and reworded a few existing `book.eligibility.*` /
  `book.coverage.*` values.

**Key-set intersection between the two added sets: EMPTY (0 collisions).**

| Property | Result |
| --- | --- |
| Same key defined with different values on both sides | **None** — `comm -12` of the two added key sets is empty |
| Branch deletes/edits a line dev also changed | **None** — branch is strictly additive (no `-` hunks) |
| Namespaces overlap | No — branch owns `embed.*`; dev owns `program.screen.embed_*` + `book.travel.*` (note `program.screen.embed_*` ≠ `embed.*`) |
| Cross-reference between the two surfaces | No — `embed-states.tsx` consumes only the branch's own `embed.*` keys; dev's `program.screen.embed_*` feeds the program-screen registry, a separate surface |

**Conclusion: this is a text-adjacency conflict, not a semantic one.** The
correct resolution is the **union** of both additions — keep every dev key
*and* every branch `embed.*` key in both the `en` and `zh-TW` dictionaries.
No value needs to be chosen over another; nothing is dropped.

---

## 5. Recommended resolution (for the parent owner)

1. Rebase the branch onto current `origin/dev`:
   `git rebase origin/dev` on `codex/pb-embed-20260611` (branch is already
   pushed — rebase + non-force is not possible if it was previously pushed;
   if so, prefer `git merge origin/dev` into the branch and resolve, per the
   pushed-branch closeout rule, then non-force push).
2. For the single conflicted file, resolve as a **union**: take both hunks —
   dev's `program.screen.embed_*` / `book.travel.*` block **and** the branch's
   `embed.*` block — in both `en` and `zh-TW`. Keep dev's reworded
   `book.eligibility.*` / `book.coverage.*` values (those are dev-only edits the
   branch never touched).
3. Confirm no duplicate object keys remain after the union (TS will not error on
   duplicate string-literal keys in a plain object, so verify by eye / lint —
   see §6 gate G4).
4. Run the verification gates in §6.
5. Land per the integration rules and record `INTEGRATION_STATUS` honestly
   (`merged_to_dev` only when the commit is reachable from `origin/dev`;
   `dev_deployed` only with a `Deploy - Dev` run URL/SHA).

This is a low-risk, mechanical union resolution. No product-semantic decision
is required, so it does **not** need to route back to discussion/planning.

---

## 6. Acceptance checklist (parent: PB-EMBED-20260611-INTEGRATE-UNBLOCK)

Gate the parent's `done` on all of:

- [ ] **G1 — Rebase/merge clean:** `codex/pb-embed-20260611` reconciled with
      current `origin/dev` (`9668f40d` or later); only `translations.ts` required
      hand resolution.
- [ ] **G2 — Union preserved:** both dev's keys (`program.screen.embed_*`,
      `book.travel.*`) and the branch's `embed.*` keys are present in the merged
      `translations.ts` (en + zh-TW). Spot-check `embed.handoff.cta` and
      `book.travel.cardTitle` both exist.
- [ ] **G3 — No regressions to dev-only edits:** dev's reworded
      `book.eligibility.insurance.message` / `book.eligibility.travel.message` /
      `book.coverage.*` values survive the merge (not reverted to pre-`ca0cd1ca`).
- [ ] **G4 — No duplicate keys:** lint/typecheck the partner-booking-web app;
      confirm no accidental duplicate dictionary entries from the union.
- [ ] **G5 — Typecheck:** `turbo run typecheck --filter=partner-booking-web...`
      (build deps first if a fresh worktree — see worker notes) passes.
- [ ] **G6 — Build:** partner-booking-web builds; new routes
      `/[tenantSlug]/embed` and `/[tenantSlug]/embed/[state]` compile.
- [ ] **G7 — Other 3 files unchanged from branch:** `embed-states.tsx` and the
      two `embed` route pages land byte-identical to the branch (they had no
      conflict; no edits should sneak in during resolution).
- [ ] **G8 — Integration status recorded:** parent `done` carries
      `COMMIT_HASH` / `COMMIT_SUBJECT` / `PUSH_REMOTE` / `PUSH_BRANCH` and an
      `INTEGRATION_STATUS` that matches reality (do not claim `dev_deployed`
      without a deploy run).

---

## 7. Risk notes

- **Pushed-branch hazard:** `codex/pb-embed-20260611` exists on `origin`.
  A `git rebase` rewrites history and would need a force-push, which the
  closeout rules forbid on a pushed branch. Prefer merging `origin/dev` into the
  branch and non-force pushing, or land via the integrate staging ref. Confirm
  the chosen path before rewriting.
- **Locale drift:** ensure the union is applied symmetrically to **both** `en`
  and `zh-TW`. zh-TW is primary per the branch's own header comment; an en-only
  or zh-only union would leave a half-translated surface.
- **Duplicate-key silence:** TypeScript does not error on duplicate keys in a
  plain object literal; a sloppy union can silently shadow a value. G4 exists
  specifically to catch this — do not rely on typecheck alone.
- **`program.screen.embed_*` vs `embed.*` confusion:** these look similar but
  are different surfaces (program-screen registry vs the embed funnel). Do not
  "deduplicate" them — both must remain.

---

## 8. Provenance

- `git merge-base origin/dev origin/codex/pb-embed-20260611` → `de953bad`
- `git merge-tree --write-tree origin/dev origin/codex/pb-embed-20260611` →
  one CONFLICT, `translations.ts` only
- Added-key sets compared via `comm -12` of `git diff <base> <side>` extracted
  `"key":` tokens → empty intersection
- Branch diff is strictly additive (`git diff <base> branch` has no non-blank
  `-` lines)

Handoff: this packet is handed to reviewer **Codex2**. The parent owner
(**Codex2**) may absorb the §5 resolution and §6 checklist into the mainline
integration. This helper does not modify canonical truth and requires no commit
evidence beyond this artifact (`NO_COMMIT_REQUIRED` / support-only sidecar).
