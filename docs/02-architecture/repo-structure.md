# Repo Structure

This repository uses a `pnpm` workspace with `turborepo`.

## Top-level Layout

- `apps/`: product-facing applications
- `packages/`: shared configuration, types, and UI
- `docs/`: project context, architecture notes, and runbooks
- `infra/`: development infrastructure and GitHub-oriented placeholders
- `scripts/`: local automation entrypoints

## Applications

- `apps/api`: NestJS API bootstrap with a health endpoint placeholder
- `apps/tenant-portal-web`: Next.js tenant-facing placeholder shell
- `apps/platform-admin-web`: Next.js platform administration placeholder shell
- `apps/ops-console-web`: Next.js operations console placeholder shell
- `apps/driver-app`: Expo Router mobile placeholder shell

## Shared Packages

- `packages/shared-types`: cross-surface placeholder types
- `packages/eslint-config`: shared flat-config ESLint presets
- `packages/tsconfig`: shared TypeScript baselines
- `packages/ui-web`: minimal shared web UI placeholders

When a new app or package is added, this document must be updated in the same change.
