# Chain-First E2E Testing Rules (2026-06-16)

Purpose: give testers a hard operating stance for `/bff/*`, projections,
ledgers, summaries, and any other read surface that can look healthy while the
real producing chain is broken.

Do not mark a scenario or checklist row as pass until the producing chain is
proven.

## Rule 1: Write the production chain before testing the read

For every `/bff/X`, force yourself to answer:

- Who produces this data on spec?
- Which action triggers it?
- How many hops does it travel before it lands here?

If you cannot write that chain, you are not yet allowed to say the surface
"should have data."

After the chain is written, test the chain head action and the side effect of
every hop. Do not begin by reading the chain tail.

Example:

- Not: read `/bff/ooda/packets` and ask whether it has data.
- Do: `POST` a persona, then assert cron registration, OpenClaw invocation, and
  one new packet-store row.

## Rule 2: Empty is a failure that must be explained

`[]`, `0`, `null`, and unchanged ledgers are not neutral results. They are
failing symptoms until their cause is named.

Hard rule: when a ledger is `0`, the run cannot close until you can answer all
of these:

- Did the chain head actually fire?
- Did each hop actually run?
- Was the execution engine actually powered and registered?
- Is a silent seam faking health or returning `200` without doing work?

Treat empty as a symptom, not a pass mark. The test is not complete until you
can trace the symptom to one of these root-cause classes:

- Trigger never fired.
- A step-to-step handoff is broken.
- The worker/cron/transport/runtime is defined but not actually wired in.
- Upstream auth, credentials, or backend connectivity is dead while a shallow
  probe still looks healthy.

## Rule 3: Test seams, especially silent seams

Cross-step bugs live at the seam where step `N` hands work to step `N+1`.

The most dangerous seam is "returns `200` but does nothing," because it passes
surface-level output checks.

Typical silent seams:

- Stub handler: `POST /personas` returns `201` but no wire loop exists.
- Cron job is defined in a catalog but never registered at runtime.
- Client transport defaults to `None` or `dry_run=true`, so the real backend is
  never hit.
- Auth or credentials are dead, but health or login status still says `ok`.
- Read model falls back to synthesized-on-read output with `timestamp=now` and
  no `trace_id`.

Required method for seam testing:

- Assert the end-to-end side effect.
- Prove the source of truth.

That means not only asking whether something came back, but also proving:

- The real downstream/backend was actually hit by checking logs, connections,
  queue writes, audit rows, or persisted state.
- The returned data carries real producer fingerprints such as `trace_id`,
  upstream timestamp, source marker, job id, or audit id.

If you cannot distinguish a real producer from fixture seed data or
synthesized-on-read output, the test is not done.

## Wall Version

別測「頁面有沒有料」，要測「那條把料生出來的鏈，每一跳有沒有接通」。
看到空，不准收工。先證明鏈頭觸發了、每一跳跑了、引擎接電了；尤其盯那些「回
`200` 卻沒做事」的沉默接縫。
