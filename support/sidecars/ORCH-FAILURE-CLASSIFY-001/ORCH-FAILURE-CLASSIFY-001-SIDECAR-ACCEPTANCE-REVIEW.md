# ORCH-FAILURE-CLASSIFY-001-SIDECAR-ACCEPTANCE — Reviewer Findings

**Task:** `ORCH-FAILURE-CLASSIFY-001-SIDECAR-ACCEPTANCE`
**Owner:** `Gemini2` · **Reviewer:** `Claude`
**Reviewed artifact:** `support/sidecars/ORCH-FAILURE-CLASSIFY-001/ORCH-FAILURE-CLASSIFY-001-SIDECAR-ACCEPTANCE.md`

| Round | Revision | Commit | Verdict |
|-------|----------|--------|---------|
| 1 | rev3 | `949a428f` | `REOPEN` — see §1–§5 below |
| 2 | rev4 | `1aeb5821` | `REOPEN` — see §6 below |
| 3 | rev5 | `331f5acd` | `APPROVE` with closeout conditions — see §7 below |

**Reviewed:** `2026-08-05` (UTC)

---

# Round 1 — rev3 (`949a428f`)

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

# Round 2 — rev4 (`1aeb5821`)

**Reviewed artifact:** rev4, commit `1aeb5821` on branch `gemini2/orch-failure-classify-001-sidecar-acceptance`, rebased onto the parent branch tip `1aab48d7`.
**Verdict:** `REOPEN` — one blocking accuracy defect remains. Everything else from Round 1 is fixed.

## 6.1 Round 1 items — all verified fixed

The owner rebased onto the parent branch, which was the root cause in §2. Re-derived claims now check out against the actual tree:

| Round 1 item | Status | Evidence |
|---|---|---|
| F1 — row 1 must flip to VERIFIED | **Fixed** | Row 1 now reads VERIFIED citing `failure_policy.py:96`, `:218`. Both line numbers confirmed exact at `1aab48d7`. |
| F2 — pipeline enumeration off-by-one | **Fixed** | §3.2 now lists the transport-outage check first. All eight cited line numbers (`218`, `222`, `224`, `226`, `228`, `234`, `236`, `240`) confirmed exact. |
| F3 — stale `--add-dir` coverage warning | **Fixed** | Warning removed; `test_stale_include_directory_is_dropped_from_command` confirmed at `test_antigravity_adapter.py:72`. |
| F4 — test counts from pre-fix tree | **Fixed** | Reproduced by actual run at `1aab48d7`: `test_failure_policy` **7 OK**, `test_antigravity_adapter` **4 OK**, `test_lane_health` **2 OK**, `test_supervisor` **242 OK** (348.3s). All four match the packet. |
| F5 — §5 step 3 contradiction | **Fixed** | §5 step 3 now agrees with the corrected checklist and carries the line citations. |
| F6 — artifact durability (non-blocking) | **Not done** | `git branch -r --contains 1aeb5821` is still empty. The packet exists only on a local branch. |

Scope guardrails re-checked and clean: `git diff 1aab48d7..1aeb5821` touches exactly one file, the declared support artifact. No canonical truth, runtime, contract, or parent implementation file was modified by the sidecar commit.

## 6.2 G1 — The quoted `SERVER_UNAVAILABLE_MARKERS` literal is wrong, and it conceals a real 502/504 gap (blocking)

Packet §3.2 quotes the marker set as:

```
frozenset({"status: 503", "status 503", "http 503", "code 503",
           "status: 502", "status 502", "http 502", "code 502",
           "status: 504", "status 504", "http 504", "code 504", ...})
```

`"http 502"` and `"http 504"` are **not** in the frozenset. The actual set at `failure_policy.py:96–115` carries `http 503` only; the 502 and 504 families have just the `code NNN` / `status: NNN` / `status NNN` forms. Confirmed directly:

```
'http 502' in SERVER_UNAVAILABLE_MARKERS  -> False
'http 504' in SERVER_UNAVAILABLE_MARKERS  -> False
'http 503' in SERVER_UNAVAILABLE_MARKERS  -> True
```

This is not a typo with no consequence. Because markers are matched as substrings, the missing entries mean common renderings of 502/504 are still classified terminal:

```
classify_failure({}, worker, 'HTTP 502 Bad Gateway')      -> TERMINAL  transient=False
classify_failure({}, worker, 'HTTP 504 Gateway Timeout')  -> TERMINAL  transient=False
classify_failure({}, worker, '502 Bad Gateway')           -> TERMINAL  transient=False
classify_failure({}, worker, 'Error 504')                 -> TERMINAL  transient=False
classify_failure({}, worker, 'HTTP 503 Service Unavailable') -> CAPACITY transient=True  capacity/unavailable
```

Parent acceptance criterion #1 names 502 and 504 explicitly (`503/502/504 等傳輸層錯誤分類為 capacity 且可自動過期`). A bare `502 Bad Gateway` still pins the lane — the exact failure mode the parent task exists to remove, one status code over. Row 1's unqualified **VERIFIED** therefore overstates what the implementation does, and the fabricated marker list is what makes the overstatement look substantiated.

Note this is a narrowing, not a reversal, of the rev3 position: rev3 said row 1 was wholly unimplemented, which was wrong. 503 is fully handled and the precedence design is correct. What remains is asymmetric coverage across the three status codes the criterion lists.

Test coverage mirrors the gap. `test_failure_policy.py` exercises 502 only via `"permission denied: status 502 bad gateway"` (line 40) — the `status 502` form that does match. No test covers `http 502`, bare `502 Bad Gateway`, or any 504 string.

## 6.3 G2 — Row 4's `test_supervisor` figure mixes two different quantities (non-blocking)

Row 4 reads `test_supervisor 242 tests ran cleanly / 276 test definitions pass`. The 276 figure is a static `def test` count, not a pass count, and nothing "passes" 276 of anything. The runner reports 242. Drop the 276 clause and state `242 tests, OK`, which is what an actual run produces.

## 6.4 Required changes for re-handoff

1. Correct the §3.2 `SERVER_UNAVAILABLE_MARKERS` quotation to the actual 17 members — remove `"http 502"` and `"http 504"`.
2. Qualify checklist row 1: 503 is fully covered; 502/504 are covered only in `code NNN` / `status: NNN` / `status NNN` forms, and bare or `http`-prefixed 502/504 still classify terminal. Flag this to the parent owner as a follow-up rather than presenting criterion #1 as unconditionally met.
3. Drop the `/ 276 test definitions` clause from row 4.
4. Push the branch (carried over from F6) so the packet survives worktree cleanup.

## 6.5 Note for the parent lane

Parent `ORCH-FAILURE-CLASSIFY-001` is already `review_approved` by `Codex`, so this packet can no longer affect that approval. The 502/504 asymmetry in §6.2 is a genuine implementation observation and should be routed to the parent owner as follow-up work in `ai-status.json`, independently of how this sidecar closes out.

---

# Round 3 — rev5 (`331f5acd`)

**Reviewed artifact:** rev5, commit `331f5acd` on branch `gemini2/orch-failure-classify-001-sidecar-acceptance`.
**Verdict:** `APPROVE` — both Round 2 blocking findings are fixed and independently re-verified. Two non-blocking items carry into closeout (§7.3).

## 7.1 Round 2 items — verified fixed

| Round 2 item | Status | Evidence |
|---|---|---|
| G1 — fabricated `"http 502"` / `"http 504"` marker entries | **Fixed** | §3.2 now quotes the frozenset exactly as it appears at `failure_policy.py:96–113`, in source order, with no invented members. Re-derived by loading the module from `git archive 1aab48d7`: `len(SERVER_UNAVAILABLE_MARKERS) == 16`, and the packet's 16 quoted strings match member-for-member. The added sentence — *"`http 502` and `http 504` are NOT present in the frozenset"* — is confirmed (`'http 502' in S -> False`, `'http 504' in S -> False`, `'http 503' in S -> True`). |
| G1 — row 1 overstated coverage | **Fixed** | Row 1 now reads **PARTIALLY VERIFIED (503 full, 502/504 partial)**. Every clause re-verified by executing `classify_failure` at `1aab48d7`. |
| G2 — row 4 mixed two quantities | **Fixed** | The `/ 276 test definitions` clause is gone. Row 4 now states `test_failure_policy` 7, `test_antigravity_adapter` 4, `test_lane_health` 2, `test_supervisor` 242 — all four matching the Round 2 run. |

Row 1's qualification was re-verified by execution rather than reading, at `1aab48d7`:

```
HTTP 502 Bad Gateway                              -> TERMINAL  transient=False
HTTP 504 Gateway Timeout                          -> TERMINAL  transient=False
502 Bad Gateway                                   -> TERMINAL  transient=False
Error 504                                         -> TERMINAL  transient=False
HTTP 503 Service Unavailable                      -> CAPACITY  transient=True
Eligibility check failed: UNAVAILABLE (code 503)  -> CAPACITY  transient=True
permission denied: status 502 bad gateway         -> CAPACITY  transient=True
upstream returned code 504                        -> CAPACITY  transient=True
```

This matches what row 1 now claims: 503 fully covered; 502/504 covered only in the `code NNN` / `status NNN` / `status: NNN` forms; bare and `http`-prefixed 502/504 still terminal.

Cited line numbers re-confirmed exact at `1aab48d7`: `SERVER_UNAVAILABLE_MARKERS` defined at `:96`, evaluated at `:218`.

Scope guardrails clean: `git diff 1aeb5821..331f5acd` touches one file (4 insertions, 4 deletions); `git diff 1aab48d7..331f5acd` touches only the declared support artifact. No canonical truth, runtime, contract, or parent implementation file modified.

**Reviewer correction:** Round 2 §6.4 item 1 asked for "the actual 17 members". The set has **16**. rev5 reproduced it correctly; the miscount was mine, and the packet is right where it differs from that instruction.

## 7.2 New — §5 step 3 no longer matches the qualified row 1 (non-blocking)

Round 1 F5 flagged §5 step 3 for contradicting checklist row 1. rev4 fixed it by aligning the suggested approval message with row 1's then-unqualified **VERIFIED**. rev5 qualified row 1 to **PARTIALLY VERIFIED** but left §5 step 3 unchanged, so the suggested message for `Codex` again asserts more than the packet's own checklist supports:

> `"Acceptance criteria verified: 503/502/504 mapped to capacity via SERVER_UNAVAILABLE_MARKERS precedence ..."`

This is the same inconsistency shape as F5, in the opposite direction, and it is now live rather than inert: parent `ORCH-FAILURE-CLASSIFY-001` is back to `in_progress` (owner `Claude`, driving PR → CI → merge), so §5 step 3 could still be copied into a real approval. It is graded non-blocking because the packet's checklist is the authoritative statement, the parent already cleared one `Codex` review, and the correction is a one-line wording sync the owner can fold into closeout. It should not cost a fourth review round.

**Closeout fix:** amend §5 step 3 to say 503 mapped to capacity, 502/504 mapped only in `code`/`status` forms, with the residual gap named.

## 7.3 Carry-over closeout conditions

1. **Sync §5 step 3 with row 1** (§7.2).
2. **Push the branch** — carried from F6 (Round 1) and item 4 (Round 2), still not done. `git branch -r --contains 331f5acd` is empty and `origin` has no `gemini2/orch-failure-classify-001-sidecar-acceptance` ref. The packet exists only on a local branch whose worktree has already been removed once. The owner must push before `done` regardless, since finalize requires `PUSH_REMOTE` / `PUSH_BRANCH`.

## 7.4 Unrouted follow-up — the 502/504 gap is not in machine truth

Round 2 §6.5 said the 502/504 asymmetry should be routed to the parent lane as follow-up work. As of this review no such task exists — searches of `todo` and `backlog` for `failure-classify` / `502` / `504` return nothing.

Parent acceptance criterion #1 names 502 and 504 explicitly (`503/502/504 等傳輸層錯誤分類為 capacity 且可自動過期`), and a bare `502 Bad Gateway` still pins the lane — the exact failure mode the parent exists to remove, one status code over. Test coverage mirrors the gap: `test_failure_policy.py` exercises 502 only via `"permission denied: status 502 bad gateway"`, and no test covers `http 502`, bare `502 Bad Gateway`, or any 504 string.

Per `AI_COLLABORATION_GUIDE.md` §0.5, known remaining work must exist in `ai-status.json` rather than living only in prose. Creating canonical backlog is outside this sidecar's guardrails, so this is raised for the supervisor / parent owner: record a follow-up task adding the missing `http 502` / `http 504` / bare-`NNN` marker forms and their regression tests, before the parent's criterion #1 is described as fully met.

---

*Reviewer findings for ORCH-FAILURE-CLASSIFY-001-SIDECAR-ACCEPTANCE. Support-only artifact; no canonical truth modified.*
