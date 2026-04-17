# Supervisor Queue — Impl Gap Fix Planning

## Current Queue

| Priority | Agent   | Task                                                                   | Status         |
| -------- | ------- | ---------------------------------------------------------------------- | -------------- |
| 1        | Codex   | Write review-round-1.md — Phase boundary Q1/Q5, incident severity enum | **DISPATCHED** |
| 2        | Qwen    | Write review-round-2.md — after Codex completes                        | waiting        |
| 3        | Gemini  | Write review-round-3.md — after Qwen completes                         | waiting        |
| 4        | Copilot | Write review-round-4.md — after Gemini completes                       | waiting        |
| 5        | Claude  | Final arbitration → consensus-packet.md                                | waiting        |

## Dispatch Notes

- Supervisor will advance baton after each review completes
- If a reviewer flags a blocker (missing code evidence, unresolvable conflict),
  escalate to supervisor immediately rather than waiting for full round
- Each review-round-N.md must be committed to the branch before baton advance

## Completion Trigger

Human accepts `consensus-packet.md` →
Supervisor switches `execution_mode` back to `supervisor_managed_execution` →
New gap-fix tasks enter the active task board
