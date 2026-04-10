# ADR-0001: Monorepo Bootstrap

## Status

Accepted

## Decision

Adopt a `pnpm` workspace with `turborepo` as the repository baseline for web, mobile, API, docs, and local infrastructure assets.

## Rationale

- The platform already spans multiple product surfaces.
- Shared types and shared tooling are needed immediately.
- CI, local infra, and docs should evolve alongside application code.
- A monorepo reduces drift in TypeScript, lint, and developer workflow standards.

## Consequences

- Bootstrap starts with shared configuration packages instead of isolated repos.
- Application scaffolds remain intentionally thin until product modules are approved.
- Cross-surface changes can be validated through one workspace pipeline.
