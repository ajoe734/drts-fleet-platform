# REF-DOC-001 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `REF-DOC-001` — Restore and lock Referral Embed design + functional source chain  
**Parent Owner / Reviewer:** `Codex2` / `Gemini2`  
**Sidecar Owner / Reviewer:** `Codex` / `Codex2`  
**Generated:** `2026-08-01` (UTC)  
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` — support-only packet; does not modify canonical truth or reopen the parent implementation slice.

This sidecar exists to hand the assigned reviewer a concise acceptance map for parent
`REF-DOC-001`. The parent is already in `review` in machine truth, so this packet focuses
on evidence anchors, dependency posture, and the exact items the reviewer should confirm.

## 1. Scope Boundary

In scope:

- record the sidecar task's acceptance checklist, dependency map, and reviewer handoff
  packet
- restate the parent acceptance gate in reviewer-facing form using current machine truth
- pin the parent review evidence to the recorded review commit and existing repo paths

Out of scope:

- editing `docs/**`, `apps/referral-embed-web/**`, `.prettierignore`, or any other parent
  artifact
- changing L1 / L2 canonical truth, runtime behavior, or registry / governance state
- re-implementing or superseding parent `REF-DOC-001`

## 2. Machine Truth Snapshot

### Sidecar row: `REF-DOC-001-SIDECAR-ACCEPTANCE`

- owner=`Codex`
- reviewer=`Codex2`
- status was `backlog` at dispatch, then moved to `in_progress` by
  `AI_NAME=Codex scripts/ai-status.sh start ...`
- helper_parent=`REF-DOC-001`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- depends_on=`[]`
- artifact=`support/sidecars/REF-DOC-001/REF-DOC-001-SIDECAR-ACCEPTANCE.md`
- acceptance:
  - `Create support artifacts only`
  - `Do not edit canonical truth`
  - `Hand off the packet to the assigned reviewer`

### Parent row: `REF-DOC-001`

Machine truth currently reports:

- status=`review`
- owner=`Codex2`
- reviewer=`Gemini2`
- depends_on=`[]`
- artifacts:
  - `docs/05-ui/community-app-referral-channel-spec-20260613.md`
  - `docs/05-ui/community-app-referral-channel-screen-requirements-20260613.md`
  - `docs/03-runbooks/referral-embed-stage1-recovery-execution-tasks-20260801.md`
  - `apps/referral-embed-web/README.md`
- acceptance:
  - `Both functional docs are byte-exact to original commits; all mandatory source paths resolve; authority/supersession note is explicit; docs checks and git diff --check pass`
- `next` records parent review evidence on commit `535b0fbd`:
  - restored the two `2026-06-13` functional docs byte-exact from historical commits
  - added the referral-embed recovery runbook
  - updated `apps/referral-embed-web/README.md`
  - added `.prettierignore` entries so checks pass without rewriting historical snapshots

## 3. Dependency Map

### Formal dependencies

`REF-DOC-001` and this sidecar both have no formal `depends_on` entries in machine truth.
There is no upstream task blocker to clear before reviewer action.

### Evidence dependencies

The parent acceptance still depends on these evidence anchors being coherent:

| Anchor | Current observation | Why it matters |
| --- | --- | --- |
| Parent review commit | `git show --stat 535b0fbd` shows 5 files changed, including the two restored docs, the recovery runbook, `apps/referral-embed-web/README.md`, and `.prettierignore`. | Confirms the implementation slice the reviewer should inspect. |
| Referral embed runtime README | `apps/referral-embed-web/README.md` exists in this worktree and explicitly states the standalone-host topology plus supersession over historical `passenger-web`. | Covers the authority / supersession acceptance clause. |
| Dev acceptance rail runbook | `docs/03-runbooks/smarttransport-tw-custom-domains.md` §6 records the formal `yuhe-residence` dev acceptance URL and the non-production caveat. | Corroborates the referral host authority note referenced by the parent review summary. |
| Parent artifact paths in current sidecar worktree | The three canonical parent doc paths from machine truth are **not present** at current `HEAD` `c5f061e4`; `sed`/path resolution fails locally for those files. | Reviewer should inspect parent commit `535b0fbd` / branch `origin/codex2/ref-doc-001`, not assume this sidecar worktree already contains the reviewed parent diff. |

Implication: this sidecar packet does not certify the parent acceptance itself. It tells
the reviewer exactly which branch/commit evidence to read and flags that this worker's
baseline is older than the parent review branch.

## 4. Acceptance Checklist

### Sidecar acceptance

- [ ] `support/sidecars/REF-DOC-001/REF-DOC-001-SIDECAR-ACCEPTANCE.md` exists and stays
      support-only.
- [ ] No canonical parent artifact is edited by this sidecar.
- [ ] Packet is handed off to assigned reviewer `Codex2`.

### Parent reviewer checklist for `Gemini2`

These are the concrete checks implied by `ai-status.json -> REF-DOC-001.acceptance` and
the parent `next` field:

- [ ] Confirm commit `535b0fbd` restores
      `docs/05-ui/community-app-referral-channel-spec-20260613.md` byte-exact to
      source commit `138e39974a0a2b65c20b8b47f64437918660b9e4`.
- [ ] Confirm commit `535b0fbd` restores
      `docs/05-ui/community-app-referral-channel-screen-requirements-20260613.md`
      byte-exact to source commit `26904c0d2c437dd6a93d3027c74ded1d5bf15131`.
- [ ] Confirm all four parent artifact paths resolve on the parent review branch
      `origin/codex2/ref-doc-001`.
- [ ] Confirm the authority / supersession note is explicit across
      `apps/referral-embed-web/README.md` and
      `docs/03-runbooks/referral-embed-stage1-recovery-execution-tasks-20260801.md`:
      standalone `referral-embed-web` is authoritative, historical `passenger-web`
      topology is superseded, and the dev acceptance URL is not overclaimed as production.
- [ ] Confirm docs verification recorded in parent `next` is reproducible on the parent
      branch: byte-compare checks, docs path resolution, `pnpm prettier --check` on the
      changed docs / README, and `git diff --check`.

## 5. Reviewer Handoff Notes

For `Codex2` reviewing this sidecar:

1. Confirm the packet stays within support-only scope and does not modify parent truth.
2. Confirm the dependency section correctly says there are no formal blockers.
3. Confirm the packet accurately warns that the parent review artifacts are visible via
   commit `535b0fbd` / branch `origin/codex2/ref-doc-001`, not in this sidecar branch's
   current baseline.
4. If accurate, approve this sidecar so machine truth can move it to `review_approved`.

For `Gemini2` reviewing the parent:

1. Read parent task `REF-DOC-001` directly from machine truth.
2. Inspect commit `535b0fbd` on `origin/codex2/ref-doc-001`.
3. Re-run only the parent acceptance checks claimed in `next`; do not treat this sidecar
   as substitute implementation evidence.

## 6. Status Commands

Owner handoff to sidecar reviewer:

```bash
AI_NAME=Codex scripts/ai-status.sh handoff REF-DOC-001-SIDECAR-ACCEPTANCE Codex2 \
  "Prepared support-only acceptance packet at support/sidecars/REF-DOC-001/REF-DOC-001-SIDECAR-ACCEPTANCE.md. Packet records that parent REF-DOC-001 is already in review with acceptance evidence anchored on commit 535b0fbd, has no formal dependencies, and that this sidecar worktree baseline does not itself contain the restored parent docs, so review must inspect origin/codex2/ref-doc-001 rather than this branch."
```

Reviewer approval:

```bash
AI_NAME=Codex2 scripts/ai-status.sh approve REF-DOC-001-SIDECAR-ACCEPTANCE \
  "REF-DOC-001 acceptance packet is support-only, correctly records no formal dependencies, correctly anchors parent review evidence on commit 535b0fbd / origin/codex2/ref-doc-001, and correctly warns that the current sidecar worktree baseline does not itself contain the restored parent docs."
```

Reviewer reopen:

```bash
AI_NAME=Codex2 scripts/ai-status.sh reopen REF-DOC-001-SIDECAR-ACCEPTANCE \
  "packet needs revision: [specify machine-truth mismatch / dependency-map error / parent-evidence misstatement / support-scope violation]"
```

## 7. Change Log

- `2026-08-01` — Initial packet created from `AI_COLLABORATION_GUIDE.md`, sidecar machine
  truth, parent task snapshot, `git show --stat 535b0fbd`, current worktree path
  existence checks, `apps/referral-embed-web/README.md`, and
  `docs/03-runbooks/smarttransport-tw-custom-domains.md` §6.
