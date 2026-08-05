# ORCH-FAILURE-CLASSIFY-001-SIDECAR-ACCEPTANCE — Reviewer Findings

**Task:** `ORCH-FAILURE-CLASSIFY-001-SIDECAR-ACCEPTANCE`
**Owner:** `Gemini2` · **Reviewer:** `Claude`
**Reviewed artifact:** `support/sidecars/ORCH-FAILURE-CLASSIFY-001/ORCH-FAILURE-CLASSIFY-001-SIDECAR-ACCEPTANCE.md` (rev3, commit `949a428f` on branch `gemini2/orch-failure-classify-001-sidecar-acceptance`)
**Verdict:** `REOPEN` — packet not accepted.
**Reviewed:** `2026-08-05` (UTC)

---

## 1. Verdict

The packet is **rejected**. It is well-structured and stays inside its scope guardrails, but its central factual claim is inverted, and acting on it would cause the parent reviewer (`Codex`) to reject a correct implementation.

The packet asserts that parent acceptance criterion #1 is **UNIMPLEMENTED** in `failure_policy.py@9ae9cef2`. It is implemented, and it is implemented in exactly the shape the packet's own §3.1 target architecture prescribes.

---

## 2. Root cause

The `gemini2/orch-failure-classify-001-sidecar-acceptance` branch is based on `bb1af21c` (`origin/dev`), which does **not** contain the parent task's commits. The packet describes the state of that pre-fix base tree while labelling every finding as `failure_policy.py@9ae9cef2`.

```
bb1af21c  origin/dev            SERVER_UNAVAILABLE_MARKERS absent   <-- what the packet actually read
9ae9cef2  parent fix            SERVER_UNAVAILABLE_MARKERS present  <-- what the packet claims to describe
1aab48d7  parent regression tests
```

Every incorrect claim below is consistent with this one substitution.

---

## 3. Findings

### F1 — `SERVER_UNAVAILABLE_MARKERS` does exist at `9ae9cef2` (blocking)

Packet §3.2 and checklist row 1 state: *"In `failure_policy.py@9ae9cef2`, **`SERVER_UNAVAILABLE_MARKERS` does NOT exist**"* and that 502/503/504 *"fall through `classify_failure` to `FailureKind.TERMINAL`"*.

Actual state at `9ae9cef2`:

- `SERVER_UNAVAILABLE_MARKERS` is defined as a distinct `frozenset` at line 96, containing `code 503`, `status: 503`, `status 503`, `http 503`, the 502 and 504 equivalents, plus `service is currently unavailable`, `currently unavailable`, `temporarily unavailable`, `server overloaded`, `deadline exceeded`.
- It is evaluated at line 218 as the **first** check in `classify_failure`, ahead of `AUTH_MARKERS`, with an explicit `QUOTA_TERMINAL_MARKERS` carve-out, returning `FailureDecision(FailureKind.CAPACITY, True, "capacity/unavailable")`.

This is precedence-order-identical to the packet's own §3.1 target diagram, including the `capacity/unavailable` label. Checklist row 1 must move from **UNIMPLEMENTED** to **VERIFIED**.

### F2 — The documented `classify_failure` pipeline omits the first check (blocking)

Packet §3.2 enumerates the pipeline as steps 1–7 beginning with `AUTH_MARKERS`. At `9ae9cef2` the transport-outage check precedes it, so the documented order is wrong at step 1 and off-by-one thereafter. Since the packet's §3.1 rationale turns entirely on this precedence, the two sections contradict each other.

### F3 — The flagged `--add-dir` test-coverage gap is already closed (blocking)

Checklist row 3 warns the parent owner that `test_antigravity_adapter.py` *"lacks a unit test asserting exclusion of non-existent paths"*.

`1aab48d7` adds `test_stale_include_directory_is_dropped_from_command`, which constructs a removed repo path, passes it through `extra_include_directories`, and asserts `assertNotIn(str(stale_repo), add_dirs)`. The gap is closed; the warning should be removed.

### F4 — Test counts are from the pre-fix base tree (non-blocking, but must be corrected)

Checklist row 4 records `test_antigravity_adapter` = 3 and `test_failure_policy` = 4. Those are the `bb1af21c` numbers. At `1aab48d7` they are **4** and **7** respectively — the parent added one adapter test and three classification tests (`test_transport_outage_wrapped_in_auth_wording_is_capacity`, `test_quota_exhaustion_still_wins_over_transport_outage`, `test_real_auth_failure_without_transport_marker_stays_auth`).

The `test_supervisor` = 242 figure was not reproduced in review (static `def test` count is 276 at both refs); it should be restated from an actual run against the parent branch rather than carried forward.

### F5 — Internal contradiction in the reviewer instructions (blocking)

§5 step 3 instructs `Codex` to approve the parent with the message *"503/502/504 mapped to capacity via SERVER_UNAVAILABLE_MARKERS precedence"* — asserting the mechanism the same packet marks UNIMPLEMENTED in row 1. A reviewer following the packet top-to-bottom gets contradictory instructions, and following row 1 would reopen a correct implementation.

### F6 — Artifact durability (non-blocking)

The packet exists only as commit `949a428f` on the local branch `gemini2/orch-failure-classify-001-sidecar-acceptance`. It is not pushed to `origin`, is not present in the canonical root working tree, and its worktree (`.artifacts/worktrees/auto/gemini2-orch-failure-classify-001-sidecar-acceptance`) has already been removed. The branch ref still resolves, so nothing is lost yet, but the packet should be pushed before this sidecar closes out.

---

## 4. What passed

- Scope guardrails honoured: `git diff bb1af21c..949a428f` touches exactly one file, the declared support artifact. No canonical truth, runtime, contract, or parent implementation file was modified.
- Machine-truth anchors in §2 (task ids, owners, reviewers, phase, artifact list, acceptance criteria) match `ai-status.json`.
- §3.1 target architecture and the precedence rationale are correct and useful — they accurately describe why the Antigravity `"Eligibility check failed: ... UNAVAILABLE (code 503)"` string must not land in the auth bucket. This section should be kept as-is.
- §3.2 `infer_pause_resume_at` description (three reset-hint patterns) is accurate.

---

## 5. Required changes for re-handoff

1. Rebase or re-read against the parent branch `claude/orch-failure-classify-001` (`1aab48d7`) rather than `origin/dev`, and re-derive every `@9ae9cef2` claim from that tree.
2. Flip checklist row 1 to **VERIFIED**, citing `failure_policy.py:96` and `:218`.
3. Correct the §3.2 pipeline enumeration to put the transport-outage check first.
4. Remove the row 3 coverage warning; cite `test_stale_include_directory_is_dropped_from_command`.
5. Restate row 4 counts from an actual run against the parent branch.
6. Reconcile §5 step 3 with the corrected checklist.
7. Push the branch so the artifact survives worktree cleanup.

---

*Reviewer findings for ORCH-FAILURE-CLASSIFY-001-SIDECAR-ACCEPTANCE. Support-only artifact; no canonical truth modified.*
