install:
	pnpm install

bootstrap:
	./tools/local-development/bootstrap.sh

check:
	./tools/ci/check.sh

db-init:
	./operations/database/db-init-local.sh

db-migrate:
	./operations/database/db-apply.sh

db-seed:
	./operations/database/db-seed.sh all

db-verify:
	./operations/database/db-verify.sh

dev-up:
	./tools/local-development/dev-up.sh

dev-down:
	./tools/local-development/dev-down.sh

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
