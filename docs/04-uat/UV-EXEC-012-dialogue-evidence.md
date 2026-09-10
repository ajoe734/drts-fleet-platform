# UV-EXEC-012 candidate evidence

Owner: Codex (supervisor quota fallback from preferred agy/Claude execution lane).
Reviewer: Codex2. Design: unattended voice SD sections 3.5, 6 and 12.

## Delivered boundary

- `VoiceDialogueProvider` admits versioned live or explicit fixture profiles,
  enforces a maximum 30-second deadline, abort and epoch fencing, strict output
  schemas and transcript/segment provenance. `VoiceDialogueTransport` reuses
  shared provider secrets and HTTP transport, supplies an independent output
  token limit and records provider usage. No regex assistant or mock fallback.
- `VoiceDialogueEngine` persists a tentative state through the coordinator CAS
  port before invoking tools. Failed persistence does not publish that tentative
  state. Model free text is never a playback script. Trusted domain results
  remain separate from deterministic collection prompts.
- `VoiceToolGatewayService` authenticates bearer capability and rechecks active
  resource scope, route version, AI ownership and exact input/lease epochs.
  A turn instance admits at most three calls across retries, serializes calls,
  bounds ignored cancellation and validates both arguments and results.
  Bound-order lookup uses the existing intent/succeeded-receipt authorization.
  Driver assignment, coordinates, price override, confirmation proof and all
  booking mutations are absent from the proposal schema.
- Human, complaint, lost-property, emergency and unsupported cancel/amend/
  reservation intents override booking proposals with handoff. Explicit handoff
  tools also take precedence over all collection tools. No later AI collection
  resumes from the handoff state.
- Corrections invalidate confirmation and advance draft version; prior slot
  evidence is retained. Two failed address repair answers retain the initial
  query and candidate history for handoff. Phone/door digits and Taipei
  date/time use grouped readback helpers.

## Original branch executable evidence

On 2026-09-08:

- `pnpm exec vitest run tests/unit/uv-exec-012.test.ts tests/unit/uv-exec-007.test.ts tests/unit/uv-exec-011.test.ts tests/security/uv-exec-003.test.ts`: 101 tests passed (31 for UV-EXEC-012).
- `pnpm --filter @drts/contracts build`: passed before API checks.
- `pnpm --filter @drts/api typecheck`: passed.
- `pnpm --filter @drts/voice-media-worker typecheck`: passed.
- Targeted ESLint of dialogue, voice transport, gateway, contract and test files:
  passed with zero warnings.

The isolated worktree initially linked worker dependencies to the canonical
checkout. The local untracked worker dependency links were corrected to resolve
this worktree's contracts; canonical source and dependencies were not changed.

## Integration and acceptance limits

The gateway is a per-admitted-turn service with required domain ports, not an
enabled HTTP endpoint. The session coordinator must supply durable CAS and one
gateway instance per admitted turn; its domain adapters must perform atomic
scope/draft/service-area/ownership checks at their own transaction boundary.
Address/product adapters are UV-EXEC-013; authoritative readback and confirmation
are UV-EXEC-014. No synthetic domain adapter is registered in production.
The transport test uses an injected HTTP fixture; no production model account,
spoken-language quality, live CTI transfer or booking completion is asserted.
Same-SHA review, CI, merge and external acceptance remain candidate lifecycle
responsibilities, not conclusions of these local tests.

## Recovery branch verification (2026-09-08)

Supervisor assigned Codex to `codex/uv-exec-012-recovered` following accepted
history-repair helper PR #1819. Applied the net implementation patch from
`65186b22c066da9eeca1266d6af2f9ee77be95a1` once onto dev
`d07bad8d7`. Original branch and PR #1811 are preserved. The only patch-context
conflict was the worker index; retained dev's recorder exports and added the
three dialogue exports. Anchor `fc224b650` was pushed normally.

Fresh verification on the recovered implementation:

- The four-suite command above passed **106 tests across 4 files**.
- Contracts and control-plane-auth builds passed before API typecheck.
- API, voice-media-worker and root typechecks passed.
- Scoped ESLint passed with zero warnings; scoped Prettier check passed.

Initial dependency links pointed outside this worktree, yielding missing Node
types, stale contracts and a missing JWT dependency. Removed only this
worktree's dependency symlinks and installed with
`pnpm install --frozen-lockfile --ignore-scripts`, then built local prerequisite
packages and reran verification. No tracked dependency or lockfile change was
needed. Recovery results replace reliance on original-branch checks; review,
CI, merge and acceptance must bind to the new candidate supplied at handoff.
