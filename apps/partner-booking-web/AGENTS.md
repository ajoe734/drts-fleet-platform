<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## Repo Delivery Gate

Also follow the repo-root `AI_COLLABORATION_GUIDE.md`.

- For fragile-surface or multi-file design-intent changes, do not end the session with working-tree-only diffs.
- Create a task-scoped anchor/closeout commit first, or explicitly report blocked/progress if a safe commit/push is not possible.
- Existing unrelated dirty files are not a valid reason to skip the commit; stage only task-owned files or move to a clean branch/worktree.

<!-- END:nextjs-agent-rules -->
