# Development Orchestrator

This directory contains the development control plane used to dispatch workers,
observe lane health, and expose the local operations dashboard. It is tooling
for repository development and is not part of the product runtime.

Run its complete test suite from the repository root:

```bash
python3 -m unittest discover -s tools/development-orchestrator -p 'test_*.py'
```

## CI boundary

Pull requests to `dev` that change only development-orchestrator paths or
documentation use the tool-only CI path. That path runs the orchestrator test
suite and the stable aggregate checks while skipping product build, product
test, and product E2E jobs.

Mixed changes, unknown paths, workflow or classifier changes, pushes, and pull
requests to other base branches fail closed to the full product CI path. The
canonical branch policy and required checks are documented in
[`docs/ops/branch-strategy.md`](../../docs/ops/branch-strategy.md).
