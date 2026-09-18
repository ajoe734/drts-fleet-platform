#!/usr/bin/env python3
"""Dispatch the Ops Console LLM Assistant build wave to the supervisor.

Source of truth: docs/05-ui/ops-console-llm-assistant-design-handoff-20260602.md

Parallelism design (per user: maximize parallel, minimize unnecessary deps):
  Layer 0 (NO deps, 6 tasks run immediately in parallel):
    GW, SECRET, KB, WIDGET, CTX, FF
  Layer 1: CONV<-GW ; NAV<-WIDGET,CTX
  Layer 2: READTOOLS<-CONV ; EVAL-1<-CONV,KB
  Layer 3: ACTIONTOOL<-READTOOLS ; ACTIONBRIDGE<-NAV,ACTIONTOOL
  Layer 4: SEC<-ACTIONTOOL ; EVAL-2<-ACTIONBRIDGE,ACTIONTOOL
  Layer 5: VERIFY<-(all of phase C + widget/conv/ff/readtools/nav)

  Every dependency below is NECESSARY (a task literally needs the prior
  artifact). No task depends on a sibling it does not need.

Healthy lanes only (gemini/gemini2/copilot are paused indefinitely).
Owner hints follow feedback_agent_workload_ratio.md; supervisor may reshuffle.

Usage:
    AI_NAME=Claude python3 tools/task-dispatch/dispatch-ops-assistant-wave.py
"""
from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

INTER_ASSIGN_SLEEP_SECONDS = 3
REPO = Path(__file__).resolve().parents[2]
PHASE = "ops-console-assistant-202606"
PLANNING_REF = "docs/05-ui/ops-console-llm-assistant-design-handoff-20260602.md"

# (id, owner, reviewer, title, summary_zh, deps_csv, artifacts_csv, acceptance)
TASKS = [
    # ── Layer 0 — foundation, no deps (all parallel) ───────────────────────
    (
        "ASSIST-BE-GW",
        "Codex",
        "Codex2",
        "LLM provider gateway (model-pinned, prompt-cached, budget guard, kill-switch)",
        "依設計 §6.2/§8A 在 apps/api/src/common/llm-gateway 建 provider-agnostic gateway：預設 Claude（OPS_ASSISTANT_MODEL，reasoning=claude-opus-4-8 / cheap=claude-haiku-4-5），prompt caching，budget guard（OPS_ASSISTANT_MONTHLY_TOKEN_BUDGET），timeout/retry，degraded fallback。支援兩種認證：Vertex AI ADC（Option A，service-account IAM，無金鑰）與 ANTHROPIC_API_KEY env（Option B）。介面對 app code 隱藏 provider/auth。單測用 mock。",
        "",
        "apps/api/src/common/llm-gateway/",
        "Gateway exposes a provider-agnostic chat/stream interface; model pinned via env; prompt caching on; budget guard + degraded fallback; unit tests with mock provider; pnpm --filter @drts/api typecheck + test pass",
    ),
    (
        "ASSIST-OPS-SECRET",
        "Codex2",
        "Codex",
        "Provision + wire LLM credential (Secret Manager OR Vertex IAM) into deploy",
        "依設計 §8A.2/§8A.4：選定 Option A（Vertex：給 drts-api Cloud Run service account roles/aiplatform.user）或 Option B（GCP Secret Manager ${SECRET_PREFIX}-anthropic-api-key）。Option B 需在 .github/workflows/deploy-staging.yml (~line 419 secret_args) 與 deploy-prod.yml 加 ANTHROPIC_API_KEY=${SECRET_PREFIX}-anthropic-api-key:latest。文件化 local .env key。確認 gateway 在 dev 用此認證可開機。無 client 曝露。",
        "",
        ".github/workflows/deploy-staging.yml,.github/workflows/deploy-prod.yml",
        "Credential provisioned per chosen option; deploy workflows inject it (Option B) or IAM bound (Option A); local .env documented; gateway boots with it in dev; nothing in client bundle",
    ),
    (
        "ASSIST-BE-KB",
        "Codex2",
        "Codex",
        "Knowledge index + /knowledge/search with citations over approved docs",
        "依設計 §6.2：建 curated/versioned 知識庫（handoff packet §5、canvas behaviors、domain dictionary、runbooks）+ retrieval endpoint，回傳帶 citation 的片段。受控 build job，非任意讀 repo。供 Tier 0 Answer 引用來源。",
        "",
        "apps/api/src/modules/assistant/knowledge/",
        "Curated corpus indexed; GET /api/ops/assistant/knowledge/search returns ranked snippets with citations; build is a controlled job; tests cover retrieval + citation",
    ),
    (
        "ASSIST-FE-WIDGET",
        "Claude2",
        "Codex",
        "Floating/movable/closable assistant widget shell (Canvas primitives)",
        "依設計 §4：在 apps/ops-console-web 建 components/ops-assistant 浮動視窗，掛在 layout 與 OpsShell 同層（portal，高 z-index，跨 route 持久）：可拖移/縮小/dock/關閉/resize，位置持久化，single instance，non-blocking、可鍵盤操作、aria。用 Canvas primitives（需要新 primitive 時對齊 OPS-PARITY-PRIM）。串流訊息渲染（先用 mock stream）。視覺細節留給設計團隊（§11）。",
        "",
        "apps/ops-console-web/components/ops-assistant/,apps/ops-console-web/app/layout.tsx",
        "Widget floats above shell; move/minimize/dock/close/resize work; position persists; persists across route changes; single instance; non-blocking + keyboard-accessible; typecheck + build pass",
    ),
    (
        "ASSIST-FE-CTX",
        "Claude",
        "Codex2",
        "Context Envelope provider + page setAssistantSelection plumbing",
        "依設計 §5：建 client context provider 產生 OpsAssistantContext（route/board/activeTab/selectedEntity/visibleFilters/identity/health/locale）；各頁在 row focus / detail mount 呼叫 setAssistantSelection({kind,id})。不 scrape DOM，由 app 提供結構化 context。",
        "",
        "apps/ops-console-web/components/ops-assistant/,apps/ops-console-web/lib/",
        "Context provider emits the §5 envelope; representative pages publish selection; deixis (this order/driver) resolvable; typecheck + build pass",
    ),
    (
        "ASSIST-FF",
        "Claude",
        "Codex2",
        "ops.assistant.enabled feature flag wired + read-only visible in /feature-flags",
        "依設計 §7 G9/§8A.2：新增 ops.assistant.enabled per-realm flag（flag service/DB），控制 widget 顯示與後端啟用；在 ops-console /feature-flags 只讀可見。此為開關非 credential。",
        "",
        "apps/api/src/modules/assistant/,apps/ops-console-web/app/feature-flags/page.tsx",
        "Flag toggles widget + backend availability per realm; visible read-only in /feature-flags; default off; tests cover on/off",
    ),
    # ── Layer 1 ────────────────────────────────────────────────────────────
    (
        "ASSIST-BE-CONV",
        "Codex",
        "Codex2",
        "assistant module: conversations/messages endpoints + SSE streaming + persistence",
        "依設計 §6.2/§8：建 apps/api/src/modules/assistant：POST conversations、POST .../messages（SSE 串 token/tool_call/tool_result/action_intent/final/error），UserAssistantSession + AssistantMessageRecord 持久化（retention-bounded），per-realm scoping。對話 loop 透過 GW。",
        "ASSIST-BE-GW",
        "apps/api/src/modules/assistant/",
        "Conversation + messages endpoints stream via SSE; per-realm scoped; persistence with retention; runs the loop through llm-gateway; tests cover stream + scoping",
    ),
    (
        "ASSIST-FE-NAV",
        "Claude2",
        "Codex",
        "Tier 1 navigate/deep-link/filter-prefill from assistant",
        "依設計 §3 Tier1/§6.1：assistant 可導航（route app）、開正確 board/tab、預填 filters、產生 in-app / cross-app(new tab,Q-X03) deep link。串接 widget + context envelope。純前端，無 mutation。",
        "ASSIST-FE-WIDGET,ASSIST-FE-CTX",
        "apps/ops-console-web/components/ops-assistant/",
        "Assistant can navigate, open correct board/tab, prefill filters, emit in-app + new-tab deep links; no mutation; typecheck + build pass",
    ),
    # ── Layer 2 ────────────────────────────────────────────────────────────
    (
        "ASSIST-BE-READTOOLS",
        "Codex2",
        "Codex",
        "Tier 1 read-tool registry (caller-scoped, PII-masked) over existing reads",
        "依設計 §3 Tier1/§6.2/§7 G7,G8：建 read-tool registry，包裝既有 service read（listDispatchJobs/getOrder/getComplaint…），server-side 在 caller 的 auth/realm 下執行，回傳前依既有 export discipline 做 PII masking。供對話 loop 取用。",
        "ASSIST-BE-CONV",
        "apps/api/src/modules/assistant/tools/",
        "Read tools wrap existing reads; executed under caller scope (no broadening); outputs PII-masked; registered for the loop; tests cover scoping + masking",
    ),
    (
        "ASSIST-EVAL-1",
        "Codex",
        "Codex2",
        "Tier 0/1 eval set: answer accuracy + citation correctness + injection resistance",
        "依設計 §10 Phase B：建 eval set 驗證 Q&A 正確性、citation 對應、prompt-injection 抗性、未知時誠實（不杜撰）。可重跑。",
        "ASSIST-BE-CONV,ASSIST-BE-KB",
        "apps/api/src/modules/assistant/evals/",
        "Eval suite runs; measures answer accuracy + citation correctness + injection resistance + honest-uncertainty; repeatable in CI",
    ),
    # ── Layer 3 ────────────────────────────────────────────────────────────
    (
        "ASSIST-BE-ACTIONTOOL",
        "Codex",
        "Codex2",
        "proposeAction tool emitting ActionIntent (NO mutation)",
        "依設計 §3 Tier2/§6.2/§6.3：建 tool.proposeAction({resourceKind,resourceId,action,args})，回傳結構化 ActionIntent（§8 schema）給前端做 descriptor resolution，本身絕不 mutate。system prompt 強制這是唯一改狀態途徑且需人工確認。",
        "ASSIST-BE-READTOOLS",
        "apps/api/src/modules/assistant/tools/",
        "proposeAction returns ActionIntent and performs zero mutation; model constrained to use it as the only state-change path; tests assert no mutation occurs",
    ),
    (
        "ASSIST-FE-ACTIONBRIDGE",
        "Claude2",
        "Codex",
        "Action bridge: descriptor resolve + reuse existing confirm modals + ActionReceipt",
        "依設計 §3 Tier2/§6.1/§6.3/§7：收 ActionIntent → 在資源 availableActions[] 找對應 descriptor → 重用既有 low/medium/high(+reason) 確認 UI → 確認後呼叫既有 api-client mutation → 把 ActionReceipt{actionId,auditId} 回填對話並顯示 audit deep link。找不到/enabled:false 必須拒絕並顯示 disabledReasonCode + 合法替代。",
        "ASSIST-FE-NAV,ASSIST-BE-ACTIONTOOL",
        "apps/ops-console-web/components/ops-assistant/",
        "ActionIntent resolved against availableActions; existing confirm modals reused (high=reason); execution via existing api-client; receipt+audit link surfaced; refuses unavailable/disabled with reason; typecheck + build pass",
    ),
    # ── Layer 4 ────────────────────────────────────────────────────────────
    (
        "ASSIST-SEC",
        "Codex",
        "Codex2",
        "Guardrail middleware: injection screen + output masking + rate limit + action audit",
        "依設計 §7 G6,G7,G9 + §6.2：guardrail middleware：tool/data 輸出視為不可信（injection screening），輸出 PII re-mask，rate limiting，per-realm 限制；assistant 提出/觸發的 action 本身也要 audit。",
        "ASSIST-BE-ACTIONTOOL",
        "apps/api/src/modules/assistant/",
        "Untrusted tool/data output injection-screened; output re-masked; rate limits enforced; proposed/triggered actions audited; tests cover injection + masking + limits",
    ),
    (
        "ASSIST-EVAL-2",
        "Codex2",
        "Codex",
        "Tier 2 action-safety evals (never execute w/o confirm; never exceed availableActions)",
        "依設計 §10 Phase C/§7：action-safety eval：never executes without human confirm；never exceeds user availableActions；high-risk 一律 reason-gated；不能 downgrade risk。",
        "ASSIST-FE-ACTIONBRIDGE,ASSIST-BE-ACTIONTOOL",
        "apps/ops-console-web/,apps/api/src/modules/assistant/evals/",
        "Evals prove: no execution without confirm; actions never exceed availableActions; high-risk always reason-gated; risk tier cannot be downgraded",
    ),
    # ── Layer 5 — verification ─────────────────────────────────────────────
    (
        "ASSIST-VERIFY",
        "Codex",
        "Codex2",
        "Ops Assistant verification: widget UX + tier behaviors + kill-switch + degraded",
        "依設計 §10 Verification + §9：Playwright：widget 移動/關閉/縮小/跨 route 持久；Tier0 帶 citation；Tier1 caller-scoped；Tier2 confirm-gated + audit；kill-switch 關閉時隱藏；LLM degraded 走 help-search fallback。",
        "ASSIST-BE-CONV,ASSIST-FE-WIDGET,ASSIST-FF,ASSIST-BE-READTOOLS,ASSIST-FE-NAV,ASSIST-BE-ACTIONTOOL,ASSIST-FE-ACTIONBRIDGE,ASSIST-SEC",
        "apps/ops-console-web/,docs/05-ui/ops-console-assistant-verification-20260602.md",
        "Playwright: widget move/close/minimize/persist; Tier0 cites; Tier1 scoped; Tier2 confirm-gated+audit; kill-switch hides; degraded-LLM fallback; all pass",
    ),
]


def register(task):
    task_id, owner, reviewer, title, summary_zh, deps, artifacts, acceptance = task
    env = os.environ.copy()
    env.setdefault("AI_NAME", "Claude")
    env["TASK_TITLE"] = title
    env["TASK_SUMMARY_ZH"] = f"[依據 {PLANNING_REF}] {summary_zh}"
    env["TASK_PHASE"] = PHASE
    env["TASK_DEPENDS_ON"] = deps
    env["TASK_ARTIFACTS"] = artifacts
    env["TASK_ACCEPTANCE"] = acceptance
    env["TASK_PLANNING_REF"] = PLANNING_REF
    cmd = ["bash", "tools/development-orchestrator/bin/ai-status.sh", "assign", task_id, owner, reviewer, title]
    r = subprocess.run(cmd, env=env, cwd=str(REPO), capture_output=True, text=True, check=False)
    if r.returncode != 0:
        sys.stderr.write(f"FAILED {task_id}: {r.stderr}\n")
        return False
    dep_note = f"deps=[{deps}]" if deps else "deps=[] (independent)"
    print(f"  {task_id:24s} {owner:>8s} -> {reviewer:>8s} | {dep_note}")
    return True


def run():
    ok = 0
    for i, task in enumerate(TASKS):
        if register(task):
            ok += 1
        if i < len(TASKS) - 1:
            time.sleep(INTER_ASSIGN_SLEEP_SECONDS)
    print(f"\nDone: {ok}/{len(TASKS)} registered. Supervisor picks up on next scan (~60s).")
    return 0 if ok == len(TASKS) else 1


if __name__ == "__main__":
    print(
        f"Registering {len(TASKS)} ASSIST tasks under phase '{PHASE}'\n"
        f"Planning ref: {PLANNING_REF}\n"
        f"Layer 0 (6 parallel, no deps): GW, SECRET, KB, WIDGET, CTX, FF\n"
    )
    sys.exit(run())
