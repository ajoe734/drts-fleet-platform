# Ops Console LLM Assistant — Design & Development Document

**Date:** 2026-06-02
**Author:** Claude
**App:** `apps/ops-console-web`
**Status:** Planning outline → design/dev handoff. **Behavior/architecture authority. NO visual decisions** (those go to the 視覺設計團隊 per the §0 rule below).
**Companion docs:**

- Functional authority for the app: [`ops-console-design-handoff-packet-20260525.md`](./ops-console-design-handoff-packet-20260525.md)
- Visual authority for the app: [`drts-design-canvas/Ops Console.html`](./drts-design-canvas/Ops%20Console.html) + `ops-screens-*.jsx`
- Current parity backlog: [`ops-console-body-parity-audit-20260602.md`](./ops-console-body-parity-audit-20260602.md)
- System answers (binding): [`system-design-answers-all-apps-20260524.md`](./system-design-answers-all-apps-20260524.md)

---

## 0. How to read this document

This is a **functional + architectural** spec for a floating, movable, closable LLM assistant ("Ops 小幫手") that lives on top of the Ops Console UI and can **(a) answer system-operation questions** and **(b) help the operator actually operate the system**.

What this document **does** contain: goals, personas, the capability/authority model, the integration contract with the existing descriptor-driven action pipeline, data/API contracts, state variants, security/guardrails, and a phased development plan with dispatch-ready tasks.

What it **does NOT** contain (by project rule — see `feedback_no_llm_ui_design`): pixel layout, color, typography, exact component composition, motion. Where a visual choice is required, it is listed as a **§11 open question for the design team**. The one ASCII sketch in §4.1 is a **requirements sketch** to communicate affordances, not a visual decision.

The single most important design rule in this document:

> **The assistant's authority is exactly the operator's authority, and every state-changing action flows through the SAME `availableActions[]` → risk-tiered confirmation → `ActionReceipt`/audit pipeline that the normal UI uses. The LLM never calls a mutation endpoint directly and never invents an action the operator could not already perform.**

This is what keeps the feature safe, auditable, and not a "套皮" wrapper around an ungoverned agent.

---

## 1. Goals & non-goals

### 1.1 Goals

1. **Answer operation questions** in context: "為什麼這張單派不出去？", "no_supply 跟 exception_hold 差在哪？", "這個 forwarded 訂單 sync_failed 我該怎麼處理？", "報表的 artifact 過期了還能下載嗎？".
2. **Help operate the system**: locate the right screen/row, pre-fill filters, and — with explicit confirmation — perform the operator's available actions (release driver, redispatch, create complaint, acknowledge alert, generate a report job, etc.).
3. **Float above the Ops Console UI**: movable, resizable, minimizable, closable, and persistent across route changes within the session.
4. **Be context-aware**: know the current route, the selected entity, visible filters, the operator's identity/realm, and current health, so answers and proposed actions are about *what the user is looking at*.
5. **Stay inside the governance model**: same RBAC, same risk tiers, same audit, same PII masking, same per-realm scoping as the rest of the platform.

### 1.2 Non-goals (v1)

- Not an autonomous agent. It does not execute high-risk actions without human confirmation, and it does not run multi-step action loops unattended.
- Not a replacement for the screens. It augments; it does not hide the canonical UI or become the only path to an action.
- Not cross-app mutation. It can *deep-link* to platform-admin / tenant-console (new tab, per Q-X03) but it never mutates another app's resources from inside ops-console.
- Not a general chatbot. Scope is DRTS ops operation + the operator's own data scope.
- No model fine-tuning in v1; use a hosted Claude model (latest, e.g. `claude-opus-4-8` for reasoning / `claude-haiku-4-5` for cheap classification) via a provider gateway.

---

## 2. Personas & top use cases

Reuses the Ops Console personas (packet §2). The assistant is available to **every ops role**, but its proposed actions are gated by that user's `availableActions` exactly as the screens are.

| Persona | Representative ask | Capability tier (see §3) |
| --- | --- | --- |
| 派車員 Dispatcher | "把 ord_8234 改派給候選 #2" / "為什麼陽明山這張派不出去" | Act / Answer |
| 客服 Call agent | "幫我把這通電話轉成客訴" | Act (transfer = medium) |
| 客訴專員 | "cmp_0908 的 SLA 為什麼 breach" / "升級成事故" | Answer / Act (escalate = high+reason) |
| 安全主管 | "inc_0214 現在的 recovery 做到哪" | Answer |
| 營運財務 | "這個月 forwarded sync_failed 佔比多少，去哪看 mismatch" | Answer / Navigate |
| 車隊主管 | "今天有哪些逾期保養影響可派車輛" | Answer / Navigate |

---

## 3. Capability model — three tiers

The assistant's abilities are layered. Each tier is a clean superset of governance constraints. Tiers map directly to the phased dev plan (§10).

### Tier 0 — Answer (read-only knowledge)
- Explains domain codes (`accept_pending`, `sync_failed`, `override_pending`, `no_supply`, SLA states, EmptyReason, adapter health…) via the shared dictionary + a curated knowledge base (handoff packet §5, canvas behaviors, runbooks).
- Explains "what does this screen do / what's this column".
- Cites the source (which doc/section) so answers are verifiable, not hallucinated.
- **No data access, no mutation.** Pure RAG over approved docs.

### Tier 1 — Look-up & Navigate (read tools)
- Reads live data the operator can already see, via **existing read endpoints** (e.g. `listDispatchJobs`, `getOrder`, `listComplaints`), scoped to the operator's realm/permissions.
- "幫我找司機 d_8843 現在的狀態" → calls `getDriver`/`listDrivers`, summarizes, offers a deep link to `/drivers/d_8843`.
- Can **navigate** (route the app), **pre-fill filters**, **open the right board/tab** — all client-side, no mutation.
- Answers grounded in live data carry a freshness stamp (`UiRefreshMetadata`).

### Tier 2 — Act (descriptor-bound mutations, human-confirmed)
- The assistant may **propose** a state-changing action, but only by emitting a structured **ActionIntent** that resolves against the target resource's `availableActions[]`.
- The frontend renders the **same confirmation affordance the screen would**: low = direct + receipt toast, medium = confirm modal + receipt, **high = confirm modal + required reason + receipt + audit link** (packet §3.4).
- Execution uses the **existing** action endpoint and returns the **same `ActionReceipt { actionId, auditId }`**. The assistant surfaces the receipt + audit deep link.
- If the action is not in `availableActions`, or `enabled:false`, the assistant must refuse and surface the `disabledReasonCode` (e.g. "不能改派：on_trip") — it cannot route around the gate.

**Authority invariant:** assistant-capable actions ⊆ `availableActions` of the current user on the current resource. There is no "assistant-only" action and no elevated token.

---

## 4. The floating widget — UX requirements

These are **requirements / affordances**, not visual decisions. Visual treatment (shape, color, motion, exact density) is a §11 design-team question. Reuse the Canvas primitive family (`@drts/ui-web` Canvas*) so it is not a foreign visual system; coordinate with `OPS-PARITY-PRIM` if new primitives are needed.

### 4.1 Affordance requirements (requirements sketch — NOT final visual)

```
┌───────────────────────────────┐  ← floats above CanvasShell (portal, high z-index)
│ ⠿ Ops 小幫手        — ▭ ✕      │  ← drag handle (⠿) · minimize (—) · dock (▭) · close (✕)
├───────────────────────────────┤
│ context: /dispatch · ord_8234  │  ← live context chip (current route + selected entity)
│                               │
│  [assistant message …]         │
│  ┌─ proposed action ─────────┐ │  ← ActionIntent card, descriptor-bound
│  │ 改派 ord_8234 → 候選 #2   │ │
│  │ risk: medium · 需確認      │ │
│  │ [確認改派]  [取消]         │ │  ← confirm runs the SAME pipeline as the screen
│  └───────────────────────────┘ │
│                               │
│  [user message …]              │
├───────────────────────────────┤
│ > 輸入問題或指令…        [送出] │  ← composer; supports quick-suggestions
└───────────────────────────────┘
```

### 4.2 Window behavior (functional, testable)

- **Movable**: drag by header; stays within viewport; position persisted per user (localStorage + optional server `UserAssistantSession.uiState`).
- **Closable**: ✕ closes to a launcher affordance (e.g. a dock button); conversation is retained for the session.
- **Minimize / restore**: collapse to header/launcher without losing scrollback.
- **Resize**: at least width/height drag; min and max bounds (design decides exact sizes).
- **Dock vs float**: optional docked mode (right rail) vs free-floating overlay (design's call which is default).
- **Non-blocking**: must not trap focus or block the underlying UI; underlying screen remains operable; the widget is `aria`-labeled and keyboard-navigable (open/close/focus-composer shortcuts).
- **Persistence across routes**: navigating ops-console routes keeps the same conversation + position (it lives in the shell layout, not per-page).
- **One instance**: a single assistant per session/tab (no duplicate windows).
- **Responsive/min-viewport**: define behavior below a width threshold (full-screen sheet vs hidden) — §11.

### 4.3 Where it mounts

Mount in `apps/ops-console-web/app/layout.tsx` alongside `OpsShell` (sibling portal), so it overlays every route and survives navigation. It reads route/selection context from the same client context the shell uses.

---

## 5. Context awareness — the Context Envelope

For answers and proposed actions to be about "what the user is looking at", the frontend passes a **Context Envelope** with each turn. The LLM never scrapes the DOM; the app supplies structured context.

```ts
interface OpsAssistantContext {
  route: string;                 // e.g. "/dispatch"
  board?: string;                // e.g. "no_supply" (dispatch sub-board)
  activeTab?: string;
  selectedEntity?: {             // the row/detail in focus, if any
    kind: "order" | "driver" | "vehicle" | "complaint" | "incident"
        | "approval_request" | "report_job" | "contract" | "...";
    id: string;
  };
  visibleFilters?: Record<string, string | string[]>;
  identity: { actorType: string; realm: string; tenant?: string; env: string };
  health: UiHealthEnvelope;      // so it can say "gocab degraded" without a call
  locale: "zh-TW" | "en";
}
```

The backend uses this to (a) scope tools, (b) ground RAG, and (c) resolve "this order / this driver" deixis to a concrete id.

---

## 6. Architecture

### 6.1 Frontend (`apps/ops-console-web`)

- **`OpsAssistant` widget** (new `components/ops-assistant/`): portal overlay, conversation view, composer, ActionIntent cards, streaming renderer. Built on Canvas primitives.
- **Conversation store**: client state (messages, streaming buffer, window uiState). Server-persisted session optional in v1.
- **Context provider**: exposes the §5 envelope from route + a lightweight "selection" context the pages publish (pages call `setAssistantSelection({kind,id})` on row focus/detail mount).
- **Action bridge** (the critical piece): receives an `ActionIntent` from the backend, looks up the matching descriptor in the resource's `availableActions[]` (already loaded by the page, or fetched), and renders the **existing** confirmation component. On confirm, it calls the **existing** api-client mutation method and feeds the resulting `ActionReceipt` back into the conversation. **It refuses any ActionIntent that does not map to an enabled descriptor.**
- **Transport**: SSE (or fetch streaming) for token streaming + tool-call events.

### 6.2 Backend (`apps/api/src/modules/assistant/` — NEW)

- **Orchestrator**: runs the conversation loop with a hosted Claude model via a **provider gateway** (`apps/api/src/common/llm-gateway` — NEW; provider-agnostic, prompt-cached, model pinned). Default reasoning model: latest Claude (e.g. `claude-opus-4-8`); cheap intent/classification: `claude-haiku-4-5`.
- **Tool registry** (two kinds):
  - **Read tools** — thin wrappers over existing service read methods, executed **server-side under the caller's auth/realm** (never broaden scope). E.g. `tool.listDispatchJobs`, `tool.getComplaint`. Results are PII-masked per existing export discipline before returning to the model.
  - **Action-intent tool** — `tool.proposeAction({resourceKind, resourceId, action, args})`. This tool **does not mutate**. It returns a structured `ActionIntent` to the frontend for descriptor resolution + human confirm. The model is system-prompted that this is the *only* way to change state and that execution requires the human.
- **Knowledge/RAG index**: curated, versioned corpus (handoff packets §5, canvas behavior notes, domain dictionary, runbooks). Retrieval returns citations. Index build is a controlled job, not "read any repo file".
- **Conversation persistence**: `UserAssistantSession` / `AssistantMessageRecord` (per-user, per-realm), retention-bounded.
- **Guardrail middleware**: prompt-injection screening on tool outputs, output PII re-masking, per-realm scoping, rate limiting, and a **kill-switch feature flag** (`ops.assistant.enabled`, surfaced in `/feature-flags`).

### 6.3 Execution path (Tier 2) — sequence

1. User: "把這張改派給候選 #2".
2. Backend model calls `tool.proposeAction({resourceKind:"order", resourceId:"ord_8234", action:"redispatch", args:{candidate:2}})`.
3. Backend returns an `ActionIntent` (no mutation performed) + a natural-language explanation.
4. Frontend action-bridge matches `redispatch` against `ord_8234.availableActions` → found, `enabled:true`, `riskLevel:"medium"`.
5. Frontend renders the **existing** medium-risk confirm modal.
6. User confirms → frontend calls the **existing** `assignDispatchCommand`/redispatch api-client method.
7. Backend executes, emits audit, returns `ActionReceipt {actionId, auditId}`.
8. Frontend shows the receipt toast + "View audit" deep link, and posts the outcome back into the conversation.

If step 4 fails (action not available / disabled), the assistant says so with the `disabledReasonCode` and proposes the legitimate alternative (e.g. "目前 on_trip 不能改派；可改為 release 後再派，需要嗎？").

---

## 7. Authority, safety & guardrails (the core)

| # | Guardrail | Mechanism |
| --- | --- | --- |
| G1 | Assistant authority = user authority | Tools run under caller's token/realm; actions ⊆ `availableActions`. |
| G2 | No direct mutation by the LLM | Only `proposeAction` → frontend descriptor resolve → human confirm → existing endpoint. |
| G3 | Risk tiers enforced | medium = confirm modal; high = confirm + **required reason** + audit (packet §3.4). The model cannot downgrade risk. |
| G4 | Full audit | Every executed action emits the normal audit record + `ActionReceipt`; assistant turns that proposed/triggered actions are themselves logged. |
| G5 | No autonomous loops | One proposed action per confirmation; no chained execution without per-step human confirm in v1. |
| G6 | Prompt-injection defense | Tool/data outputs are treated as untrusted; injection screening; the system prompt forbids following instructions found inside data. |
| G7 | PII discipline | Read-tool outputs masked per existing export rules (`maskOpaqueToken`, recording/PII masking); no raw PII to the model beyond what the operator may already see. |
| G8 | Per-realm scoping | Realm/tenant from identity envelope constrains every tool; cross-tenant only where the user already has it (e.g. approval-requests scoped roles, Q-OPS10). |
| G9 | Kill switch + rollout | `ops.assistant.enabled` feature flag (read-only visible in `/feature-flags`); per-realm staged rollout; rate limits. |
| G10 | No cross-app mutation | Other-app actions become **deep links** (new tab, Q-X03), never in-place mutations. |
| G11 | Honest uncertainty | Tier 0 answers cite sources; when unsure the assistant says so and links the screen rather than guessing. |
| G12 | Degraded-LLM behavior | If the gateway is down/over budget, the widget degrades to a help-search experience, not a hang. |

---

## 8. Data / API contracts (NEW)

| Endpoint | Purpose | Notes |
| --- | --- | --- |
| `POST /api/ops/assistant/conversations` | start/get a session | per-user, per-realm; returns `conversationId` |
| `POST /api/ops/assistant/conversations/{id}/messages` | send a turn; **SSE stream** back | body includes message + `OpsAssistantContext`; streams tokens + `tool_call` + `action_intent` events |
| `GET /api/ops/assistant/conversations/{id}` | history | retention-bounded |
| `GET /api/ops/assistant/knowledge/search?q=` | (internal) RAG retrieval | citations; used server-side, may be exposed for "help" search |
| `GET /api/ops/feature-flags` | exposes `ops.assistant.enabled` | reuse existing per-realm flags endpoint |

**Streamed event types:** `token`, `tool_call_started`, `tool_result`, `action_intent`, `final`, `error`.

**`ActionIntent` schema (model → frontend):**

```ts
interface ActionIntent {
  resourceKind: string;   // "order" | "complaint" | ...
  resourceId: string;
  action: string;         // must match a ResourceActionDescriptor.action
  args?: Record<string, unknown>;
  rationale: string;      // why the assistant proposes it (shown to user)
}
```

**Records:** `UserAssistantSession { id, userId, realm, uiState, createdAt, lastActiveAt }`, `AssistantMessageRecord { id, conversationId, role, content, toolCalls?, actionIntents?, citations?, createdAt }`.

No new client method bypasses existing mutation methods — Tier 2 execution reuses the api-client methods already mapped in packet §6.

---

## 8A. LLM credentials & configuration (how the assistant "logs in")

**There is no user-facing LLM login.** The operator authenticates to Ops Console with the existing JWT/OIDC flow only. The assistant calls the model **server-side from `apps/api`** with a **platform-held service credential**; that credential is **never** sent to the browser, never in the repo, and never per-user. "Login" here = how `apps/api`'s `llm-gateway` authenticates to the model provider.

### 8A.1 Two credential strategies (both fit the existing GCP/Cloud Run + Secret Manager pattern)

- **Option A — Vertex AI + Workload Identity (recommended for staging/prod).** Run Claude via **Vertex AI**. Grant the `drts-api` Cloud Run service account `roles/aiplatform.user`; the gateway authenticates with Application Default Credentials (ADC). **No API key to store, leak, or rotate** — the "login" is the Cloud Run service-account IAM identity. Best for data-residency too (stays in-project).
- **Option B — Anthropic API key in Secret Manager (simplest; good for dev).** A single platform key in GCP Secret Manager, injected as an env var.

Recommendation: Option A for deployed envs, Option B acceptable for local/dev. The gateway abstracts both behind one interface so app code is provider-auth-agnostic.

### 8A.2 Where it is configured (matches how `apps/api` does secrets today)

The repo already pattern: GCP Secret Manager → `gcloud run deploy --set-secrets` → `process.env.*`. Mirror it exactly.

1. **Secret store (Option B):** create `${SECRET_PREFIX}-anthropic-api-key` in GCP Secret Manager — sibling of `drts-staging-jwt-secret`, `${SECRET_PREFIX}-db-url`, etc. (`drts-staging-…`, `drts-prod-…`).
2. **Injection:** append one entry to the `secret_args` list in `.github/workflows/deploy-staging.yml` (~line 419) and `deploy-prod.yml`:
   `secret_args="${secret_args},ANTHROPIC_API_KEY=${SECRET_PREFIX}-anthropic-api-key:latest"` → Cloud Run mounts it as env. (Option A needs no secret entry — only the IAM role binding on the runtime service account.)
3. **Read in code:** `process.env.ANTHROPIC_API_KEY` (Option B) or ADC (Option A) inside `apps/api/src/common/llm-gateway` — same convention as `process.env.JWT_SECRET` / `DATABASE_URL`.
4. **Local dev:** `.env` / `config.local` (gitignored). Never committed; never reaches the client bundle.
5. **Non-secret config (plain env vars):** `OPS_ASSISTANT_MODEL` (pin to latest Claude, e.g. `claude-opus-4-8`; cheap lane `claude-haiku-4-5`), `OPS_ASSISTANT_MONTHLY_TOKEN_BUDGET`, gateway timeouts/retries.
6. **Per-realm enable (NOT a credential):** the `ops.assistant.enabled` feature flag (flag service / DB), read-only visible in `/feature-flags`. This is the on/off + staged-rollout switch, separate from auth.

### 8A.3 Credential hygiene

- Least privilege: the LLM credential grants *only* model invocation; it is not the platform's data credential. Data access stays under the **operator's** token via the read-tools (G1/G8).
- Rotation: Option A = nothing to rotate (IAM). Option B = rotate the Secret Manager version; Cloud Run picks up `:latest` on next deploy (or pin a version + redeploy).
- No client exposure: the gateway is server-only; the browser talks to `/api/ops/assistant/*`, never to the provider directly. CSP forbids direct provider calls from the client.
- Kill switch: if the credential is compromised or budget is exceeded, flip `ops.assistant.enabled=false` (instant disable) and revoke/rotate.

### 8A.4 New dev-plan task

- **ASSIST-OPS-SECRET** *(Codex / infra)* — provision the credential per chosen option (Secret Manager entry **or** Vertex IAM binding), wire `--set-secrets`/role binding in `deploy-staging.yml` + `deploy-prod.yml`, document the local `.env` key, and confirm the gateway boots with it in dev. Dep of `ASSIST-BE-GW`.

---

## 9. State variants (all must be designed — §11)

- **Disabled** (`ops.assistant.enabled=false` for realm) — launcher hidden or shows "未啟用".
- **Idle / launcher** — closed state.
- **Thinking / streaming** — tokens arriving; cancelable.
- **Tool-running** — "查詢派遣佇列中…" with the read tool name.
- **Action proposed, awaiting confirm** — ActionIntent card with risk badge; high-risk shows reason field.
- **Action executed** — receipt + audit link in-thread.
- **Action refused** — not in `availableActions` / disabled → show `disabledReasonCode` + alternative.
- **Permission denied** — tool scope refusal.
- **LLM degraded / budget exceeded** — fall back to help search (G12).
- **Offline / API down** — match `UiHealthEnvelope` degraded treatment.
- **Empty knowledge hit** — "找不到依據" → link the screen, don't fabricate.

---

## 10. Phased development plan (dispatch-ready)

Mirrors the capability tiers. Each phase ends shippable behind the `ops.assistant.enabled` flag. Owners are hints (workload ratio; supervisor may reshuffle); healthy lanes only (gemini/gemini2/copilot are paused).

### Phase A — Foundation + Tier 0 (Answer)
- **ASSIST-BE-GW** — LLM provider gateway in `apps/api/src/common/llm-gateway` (model-pinned, prompt-cached, budget guard, kill-switch). *(Codex)*
- **ASSIST-BE-KB** — Knowledge index + `knowledge/search` with citations over approved docs. *(Codex2)*
- **ASSIST-BE-CONV** — `assistant` module: conversations/messages endpoints + SSE streaming + persistence + per-realm scoping. dep: GW. *(Codex)*
- **ASSIST-FE-WIDGET** — floating/movable/closable/minimizable widget shell on Canvas primitives, mounted in layout; streaming render; position persistence. *(Claude2)*
- **ASSIST-FE-CTX** — Context Envelope provider + page `setAssistantSelection` plumbing. *(Claude)*
- **ASSIST-FF** — `ops.assistant.enabled` flag wired + visible in `/feature-flags`. *(Claude)*

### Phase B — Tier 1 (Look-up & Navigate)
- **ASSIST-BE-READTOOLS** — read-tool registry over existing service reads, caller-scoped + PII-masked. dep: CONV. *(Codex2)*
- **ASSIST-FE-NAV** — navigation/deep-link/filter-prefill actions from assistant. dep: WIDGET, CTX. *(Claude2)*
- **ASSIST-EVAL-1** — eval set for Q&A accuracy + citation correctness + injection resistance. *(Codex)*

### Phase C — Tier 2 (Act)
- **ASSIST-BE-ACTIONTOOL** — `proposeAction` tool emitting `ActionIntent` (no mutation). dep: READTOOLS. *(Codex)*
- **ASSIST-FE-ACTIONBRIDGE** — descriptor resolution + reuse existing confirm modals (low/medium/high+reason) + ActionReceipt feedback + refuse-on-unavailable. dep: NAV. *(Codex2)*
- **ASSIST-SEC** — guardrail middleware (injection screen, output masking, rate limit) + audit of proposed/triggered actions. dep: ACTIONTOOL. *(Codex)*
- **ASSIST-EVAL-2** — action-safety evals: never executes without confirm; never exceeds `availableActions`; high-risk always reason-gated. *(Codex2)*

### Phase D — Polish / proactive (optional, post-MVP)
- Proactive suggestions from `today's-to-do` banners (opt-in), quick-action chips, conversation history UX, multi-turn task assist with per-step confirm, en locale parity.

### Verification (closes every phase)
- **ASSIST-VERIFY** — Playwright: widget move/close/minimize/persist-across-routes; Tier 0 cites; Tier 1 scoped; Tier 2 confirm-gated + audit; kill-switch hides it; degraded-LLM fallback. dep: all C tasks.

---

## 11. Open questions for the design team (visual / interaction)

1. Default mode: free-floating overlay vs docked right rail? Default size/position?
2. Launcher affordance when closed (FAB? shell button? where)?
3. ActionIntent card visual + how the risk tier and required-reason field are presented in-thread vs reusing the page modal.
4. Streaming/thinking indicator treatment; cancel affordance.
5. Citation display (inline chips? footnotes?).
6. Min-viewport behavior (full-screen sheet vs hide).
7. How the live "context chip" (route + selected entity) is shown and whether the user can pin/clear it.
8. Quick-suggestion chips: show which, when (per route)?
9. Distinguishing assistant-proposed actions from normal UI actions for auditability/clarity.
10. Dark-surface treatment consistent with the ops coral-accent canvas.

## 12. Open questions for product / system-design

1. Conversation retention period + whether transcripts are auditable artifacts.
2. Whether Tier 2 is in v1 scope or A/B is shipped read-only first (recommend: ship A+B, gate C behind the flag for a pilot realm).
3. Budget/cost ceiling per realm and degraded behavior threshold.
4. Whether proactive suggestions (Phase D) are wanted at all.
5. Model/provider choice + data-residency constraints for sending ops data to a hosted model.

## 13. Cross-references

- Action/risk/audit model & `availableActions[]`: packet §3.4–§3.5, and the descriptor contract surfaced throughout `ops-console-body-parity-audit-20260602.md`.
- Empty/health/refresh contracts: packet §3.2, §3.3, §3.6.
- Cross-app deep-link rule: packet §3.10 (Q-X03).
- Canvas primitive family to build on: `@drts/ui-web` Canvas* (+ `OPS-PARITY-PRIM` if new primitives needed).

---

## 14. Summary

The Ops 小幫手 is a floating, movable, closable assistant that answers operation questions (Tier 0, RAG with citations), looks things up and navigates (Tier 1, caller-scoped read tools), and helps operate the system (Tier 2, **descriptor-bound, human-confirmed, fully audited** actions). Its defining constraint is that it is a *governed front-end to the operator's own authority*, never an ungoverned agent: every mutation reuses the existing `availableActions` → risk-tiered confirm → `ActionReceipt`/audit pipeline. Visual decisions are deferred to the design team (§11); this document is the behavior + architecture authority and the phased, dispatch-ready build plan.
