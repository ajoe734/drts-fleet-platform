install:
	pnpm install

bootstrap:
	./scripts/bootstrap.sh

check:
	./scripts/check.sh

dev-up:
	./scripts/dev-up.sh

dev-down:
	./scripts/dev-down.sh

dev-api:
	pnpm dev:api

dev-tenant:
	pnpm dev:tenant

dev-platform-admin:
	pnpm dev:platform-admin

dev-ops:
	pnpm dev:ops

dev-driver:
	pnpm dev:driver
