# S1F-FLT-002 non-destructive history repair

## Finding

The original delivery branch `codex/s1f-flt-002` backs PR #1333. Its range
from `origin/dev` contains these commits:

| Commit | Subject | Result |
| --- | --- | --- |
| `0eb979c426022355c50b8d6304f3ef7d70df8a13` | `feat(S1F-FLT-002): build fleet supply onboarding UI` | Fails the required `<TASK-ID>: <summary>` subject form. |
| `74dfae4126e9beb7a18f4efe8c5cece3e29ab568` | `chore(S1F-FLT-002): finalize owner closeout` | Fails the same subject rule. |

Although later commits `3493bb797` and `33f83f297` have compliant subjects,
the Commit trailers job validates every commit in the PR range. PR #1333
therefore cannot be made green by appending commits; changing either bad
subject would rewrite shared history and require a force-push.

## Repair performed

The pre-existing replacement branch `codex/s1f-flt-002-clean` starts at
`origin/dev` commit `6a43f1a9` and contains the compliant squashed delivery
commit `6d6db8495`:

```
S1F-FLT-002: build fleet supply onboarding and submission UI
```

It is the non-destructive replacement for the original branch and backs PR
#1334. The replacement initially missed the two unused-import removals that
were included only in the original branch's later lint cleanup. Commit
`ca90479b12d09755c42d6be07b2de24685dc1673` cherry-picks that one-file cleanup
onto the replacement branch, with a normal (non-force) push:

```
origin/codex/s1f-flt-002-clean: 6d6db8495..ca90479b1
```

This preserves the original branch and PR #1333 as historical evidence while
leaving PR #1334 as the sole merge candidate. Its entire current range has
only compliant task subjects.

## Verification and next step

- `git diff --check codex/s1f-flt-002-clean`
- On `codex/s1f-flt-002-clean`: `pnpm --filter @drts/fleet-partner-portal-web lint`
- On `codex/s1f-flt-002-clean`: `pnpm --filter @drts/fleet-partner-portal-web typecheck`
- On `codex/s1f-flt-002-clean`: `pnpm --filter @drts/fleet-partner-portal-web test`

All three portal checks pass locally after `ca90479b1`. The parent must now
use PR #1334 (`codex/s1f-flt-002-clean` -> `dev`) for review and CI, and leave
PR #1333 closed or superseded. The remaining work is PR #1334 CI/review; it
is not a branch-history repair.

## Evidence links

- Original blocked PR: https://github.com/ajoe734/drts-fleet-platform/pull/1333
- Replacement PR: https://github.com/ajoe734/drts-fleet-platform/pull/1334
- Original failing Commit trailers run: https://github.com/ajoe734/drts-fleet-platform/actions/runs/31257230194/job/93102374287
