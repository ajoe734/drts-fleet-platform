# Branch Strategy — source of truth

Status: directive-required thin stub
Canonical artifact: `docs/ops/branch-strategy.md`

This file does not redefine product semantics. It points reviewers to the current source of truth.

## Do not restate

Do not copy or reinterpret the canonical artifact here. Branch model (single `dev` trunk + nightly `publish/v*` + hourly promote + `main` + `prod/v*` tag), anchor commit protocol (§11), label provisioning, and CI gate semantics live in `docs/ops/branch-strategy.md`. The directive-required release-truth runbook (`docs/03-runbooks/phase1-release-truth-sync-20260519.md`) names how each tag participates in source-of-truth roles but does not replace the branch strategy.

## Current source of truth

- `docs/ops/branch-strategy.md`
- `docs/03-runbooks/phase1-release-truth-sync-20260519.md` (release-tag source-of-truth roles)
- `.github/workflows/hourly-promote.yml` + `.github/workflows/ci.yml` (operational enforcement)
