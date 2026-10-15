# Development Orchestrator

This directory contains the development control plane used to dispatch workers,
observe lane health, and expose the local operations dashboard. It is tooling
for repository development and is not part of the product runtime.

Run its complete test suite from the repository root:

```bash
python3 -m unittest discover -s tools/development-orchestrator -p 'test_*.py'
```

## Claude permission MCP stdio

`claude_permission_prompt_mcp.py` reads and flushes UTF-8 JSON-RPC messages
delimited by newlines, as required by the
[MCP stdio transport specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#stdio).
The first message selects framing for that subprocess session. Existing
`Content-Length` callers retain header-framed responses with UTF-8 byte lengths;
framing cannot change mid-session. Notifications receive no response. Message
bodies are limited to 1 MiB and legacy headers to 8 KiB. Malformed, oversized or
truncated frames close the transport with a diagnostic on stderr and a nonzero
exit; clean EOF exits successfully. Protocol stdout contains only responses.

This codec does not change `evaluate_tool_request`, approval queue decisions,
request-specific `remember=false`, or task/reviewer/candidate/generation fences.
An initialize success grants no approval and does not resume a deferred worker.
Run the hermetic codec, subprocess and decision regressions with:

```bash
python3 -m unittest discover -s tools/development-orchestrator -p 'test_claude_permission_prompt_mcp.py' -v
```

## Reviewed tooling activation boundary

A source fix follows the normal task branch, exact-SHA review, matching CI,
protected merge and task acceptance lifecycle. A running supervisor and its
workers remain pinned to their existing release until coordinated activation;
merging source alone does not repair their loaded tooling.

After review and CI, a maintainer prepares a new detached immutable release
worktree from the merged `origin/dev` commit and verifies its full source SHA
and bridge hash. `bin/release-lifecycle.py --repo-root <canonical-root> activate
<orchestrator-release>` runs that artifact's orchestrator tests, checks integration
branch reachability, and atomically updates the `active` selector with an audit
record. `systemd/drts-supervisor-release-pointer.conf` selects that release on
service startup. Existing processes still require a separately coordinated safe
transition and fresh initialize/approval evidence. Never edit an active release
in place. A bounded codec repair does not authorize activation, supervisor
restart, worker termination, config changes or product deployment; record the
old release identity and outstanding maintainer continuation when it stays live.

## CI boundary

Pull requests to `dev` that change only development-orchestrator paths or
documentation use the tool-only CI path. That path runs the orchestrator test
suite and the stable aggregate checks while skipping product build, product
test, and product E2E jobs.

Mixed changes, unknown paths, workflow or classifier changes, pushes, and pull
requests to other base branches fail closed to the full product CI path. The
canonical branch policy and required checks are documented in
[`docs/ops/branch-strategy.md`](../../docs/ops/branch-strategy.md).
