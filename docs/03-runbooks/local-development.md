# Local Development

## Purpose

This runbook describes the bootstrap development workflow only.

## First-time Setup

1. Use Node.js 22 and pnpm 10.
2. Copy `.env.example` to `.env` if local overrides are needed.
3. Run `pnpm install`.
4. Run `./scripts/dev-up.sh` to start PostgreSQL, Redis, and Mailpit.

## Common Commands

- `pnpm dev:api`
- `pnpm dev:tenant`
- `pnpm dev:platform-admin`
- `pnpm dev:ops`
- `pnpm dev:driver`
- `./scripts/check.sh`

## Current Boundaries

- API is a health-check placeholder only.
- Web and mobile routes are shell screens only.
- Database schema, booking flows, dispatch engines, and billing logic are not implemented in bootstrap.
