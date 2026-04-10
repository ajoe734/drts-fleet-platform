# Codex Working Rules

These rules apply to automated agent changes in this repository.

1. Start with bootstrap and structural work before domain features.
2. Evolve shared modules before introducing cross-app business logic.
3. Do not create secrets, tokens, or production credentials in the repo.
4. Do not rename the repository or change the project slug without explicit approval.
5. Do not introduce deep API workflows, production schema design, or autonomous-driving runtime logic during bootstrap.
6. When adding a new app or package, update `docs/02-architecture/repo-structure.md` in the same change.
7. Prefer small, reviewable changes that preserve a runnable scaffold.
