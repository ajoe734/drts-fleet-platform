import { test, expect, type APIResponse } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
// This uses the existing GitHub-hosted OpsShell API/PostgreSQL/Next servers.
// The worker VM must never start these services or open this database.
test("voice callback workbench retains the real closed-call order through contact, transfer, terminal state and lost-response recovery", async ({
  page,
}, testInfo) => {
  if (process.env.GITHUB_ACTIONS !== "true")
    throw new Error(
      "The real callback browser workflow is GitHub-hosted only.",
    );
  test.setTimeout(120000);
  const origin = process.env.OPS_CONSOLE_URL || "http://localhost:3003";
  const source = process.env.CANDIDATE_SHA || process.env.GITHUB_SHA;
  const directory = resolve(
    ".artifacts/ops-shell-acceptance/voice-callback-workbench",
  );
  await mkdir(directory, { recursive: true });
  const require = createRequire(resolve("apps/api/package.json"));
  const { Pool } = require("pg") as typeof import("pg");
  const database = new Pool({ connectionString: process.env.DATABASE_URL });
  const stages: { name: string; at: string }[] = [];
  const screenshots: string[] = [];
  const stage = (name: string) =>
    stages.push({ name, at: new Date().toISOString() });
  const screenshot = async (name: string) => {
    const path = resolve(directory, `${name}.png`);
    await page.screenshot({ path, fullPage: true });
    screenshots.push(path);
    await testInfo.attach(name, { path, contentType: "image/png" });
  };
  async function data(response: APIResponse) {
    expect(
      response.ok(),
      `Actual BFF response ${response.status()}: ${await response.text()}`,
    ).toBe(true);
    return (await response.json()).data;
  }
  const bff = (path: string) => `${origin}/control-plane-proxy${path}`;
  let callId: string | undefined;
  let orderId: string | undefined;
  let taskId: string | undefined;
  let voiceSessionId: string | undefined;
  const createdTaskIds: string[] = [];
  const httpAttempts: { key: string; body: unknown }[] = [];
  try {
    await page
      .context()
      .addCookies([{ name: "drts-locale-v2", value: "zh", url: origin }]);
    const seed = JSON.parse(
      await readFile(resolve(directory, "seed.json"), "utf8"),
    );
    expect(seed.source).toBe(source);
    callId = seed.callId;
    voiceSessionId = seed.voiceSessionId;
    orderId = seed.orderId;
    taskId = seed.taskId;
    createdTaskIds.push(taskId!);
    const reason = seed.reason as string;
    const originalOrder = seed.originalOrder;
    stages.push(...seed.stages);
    async function create(reason: string) {
      const result = await data(
        await page.request.post(
          bff(`/voice/sessions/${voiceSessionId}/callbacks`),
          {
            headers: { "Idempotency-Key": randomUUID() },
            data: {
              contactPhoneEncrypted: "SIM-callback-browser-cipher",
              contactPhoneLookupToken: "SIM-callback-browser-lookup",
              consentSnapshotHash: "SIM-callback-browser-explicit-consent",
              reason,
            },
          },
        ),
      );
      expect(result.task.linked_order_id).toBe(orderId);
      expect(result.task.call_id).toBe(callId);
      expect(result.receipt.command_id).toBeTruthy();
      createdTaskIds.push(result.task.task_id);
      return result.task.task_id as string;
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${origin}/callcenter`, { waitUntil: "domcontentloaded" });
    await page
      .getByRole("link", { name: "語音來電回撥工作台", exact: true })
      .click();
    await expect(page).toHaveURL(/\/callcenter\/voice-callbacks$/);
    const workbench = page.getByRole("main", {
      name: "語音來電回撥工作台",
      exact: true,
    });
    await page
      .getByLabel("服務範圍", { exact: true })
      .selectOption(seed.scopeId);
    await page.getByRole("button", { name: new RegExp(reason) }).click();
    await expect(page.getByText(orderId!, { exact: true })).toBeVisible();
    await expect(page.getByText(callId!, { exact: true })).toBeVisible();
    await expect(workbench).not.toContainText("1970");
    stage("Normal call-center entry opens real scoped closed-call callback");
    await screenshot("01-original-closed-call-and-order");

    await page.getByRole("button", { name: "領取待辦", exact: true }).click();
    await expect(workbench.getByRole("status")).toHaveText("操作已儲存");
    const claimed = await data(
      await page.request.get(bff(`/voice/callbacks/${taskId}`)),
    );
    expect(claimed.task.status).toBe("claimed");
    expect(claimed.commands).toHaveLength(1);
    stage("Actual browser claim persists current operator and receipt");

    await page
      .getByLabel("聯繫說明／結案說明", { exact: true })
      .fill("SIM operator observed answered call");
    await page.getByLabel("聯繫結果", { exact: true }).selectOption("answered");
    await page.getByLabel("已確認電話結束", { exact: true }).check();
    await page
      .getByRole("button", { name: "記錄聯繫結果", exact: true })
      .click();
    await expect(
      page
        .getByText("SIM operator observed answered call", { exact: true })
        .first(),
    ).toBeVisible();
    const contacted = await data(
      await page.request.get(bff(`/voice/callbacks/${taskId}`)),
    );
    expect(contacted.attempts).toHaveLength(1);
    expect(contacted.attempts[0]).toMatchObject({
      outcome: "answered",
      hangup_confirmed: true,
    });
    stage("Explicit SIM contact observation creates one actual SQL attempt");

    await page
      .getByLabel("轉交承辦人編號", { exact: true })
      .fill("SIM-next-shift-operator");
    await page
      .getByLabel("取消或轉交原因", { exact: true })
      .fill("SIM original callback shift handoff");
    await page.getByRole("button", { name: "轉交承辦人", exact: true }).click();
    await expect(
      page.getByText("SIM-next-shift-operator", { exact: true }).first(),
    ).toBeVisible();
    const transferred = await data(
      await page.request.get(bff(`/voice/callbacks/${taskId}`)),
    );
    expect(transferred.task.assigned_operator_id).toBe(
      "SIM-next-shift-operator",
    );
    expect(transferred.commands.at(-1).transfer.reason).toBe(
      "SIM original callback shift handoff",
    );
    stage("Transfer persists original owner, recipient and reason");
    await screenshot("02-contact-and-transfer-history");

    await page
      .getByLabel("聯繫說明／結案說明", { exact: true })
      .fill("SIM callback resolved");
    await page.getByRole("button", { name: "完成待辦", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "已完成", exact: true }),
    ).toBeVisible();
    for (const name of [
      "領取待辦",
      "記錄聯繫結果",
      "完成待辦",
      "取消待辦",
      "轉交承辦人",
    ])
      await expect(
        page.getByRole("button", { name, exact: true }),
      ).toBeDisabled();
    expect(
      (await data(await page.request.get(bff(`/voice/callbacks/${taskId}`))))
        .commands,
    ).toHaveLength(4);
    stage(
      "Completion retains original identifiers and disables terminal mutations",
    );
    await screenshot("03-completed-original-task");

    const lostReason = `SIM recovery ${randomUUID()}`;
    const lostTask = await create(lostReason);
    await page.getByRole("button", { name: "重新讀取", exact: true }).click();
    await page.getByRole("button", { name: new RegExp(lostReason) }).click();
    await page
      .getByLabel("聯繫說明／結案說明", { exact: true })
      .fill("SIM no-answer observation, lost acknowledgement");
    let dropFirst = true;
    await page.route(
      `**/control-plane-proxy/voice/callbacks/${lostTask}/attempts`,
      async (route) => {
        const request = route.request();
        httpAttempts.push({
          key: request.headers()["idempotency-key"]!,
          body: request.postDataJSON(),
        });
        // Send the real BFF/API/SQL request first. Only its browser response is
        // lost, so the retry must find the already-committed original receipt.
        const response = await route.fetch();
        if (dropFirst) {
          dropFirst = false;
          expect(response.ok()).toBe(true);
          await route.abort("failed");
        } else await route.fulfill({ response });
      },
    );
    await page.getByLabel("已確認電話結束", { exact: true }).check();
    await page
      .getByRole("button", { name: "記錄聯繫結果", exact: true })
      .click();
    await expect(workbench.getByRole("status")).toHaveText(
      "操作未確認，請重試或重新讀取。",
    );
    stage("Real attempt commits before its browser acknowledgement is dropped");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page
      .getByRole("button", { name: "重試上一次操作", exact: true })
      .click();
    await expect(workbench.getByRole("status")).toHaveText("已查回原操作結果");
    expect(httpAttempts).toHaveLength(2);
    expect(httpAttempts[1]).toEqual(httpAttempts[0]);
    const recovered = await data(
      await page.request.get(bff(`/voice/callbacks/${lostTask}`)),
    );
    expect(recovered.task.attempt_count).toBe(1);
    expect(recovered.attempts).toHaveLength(1);
    expect(recovered.commands).toHaveLength(1);
    stage(
      "Browser reload retries original key and payload with one SQL attempt",
    );
    await screenshot("04-lost-response-recovered-on-same-task");

    await page
      .getByLabel("取消或轉交原因", { exact: true })
      .fill("SIM no further contact requested");
    await page.getByRole("button", { name: "取消待辦", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "已取消", exact: true }),
    ).toBeVisible();
    const cancelled = await data(
      await page.request.get(bff(`/voice/callbacks/${lostTask}`)),
    );
    expect(cancelled.task).toMatchObject({
      status: "cancelled",
      linked_order_id: orderId,
      call_id: callId,
      attempt_count: 1,
    });
    expect(cancelled.commands).toHaveLength(2);
    stage("Recovered task cancels without changing the original order");

    const activeReason = `SIM active phone ${randomUUID()}`;
    const activeTask = await create(activeReason);
    await page.getByRole("button", { name: "重新讀取", exact: true }).click();
    await page.getByRole("button", { name: new RegExp(activeReason) }).click();
    await page.getByLabel("聯繫結果", { exact: true }).selectOption("answered");
    await expect(
      page.getByLabel("已確認電話結束", { exact: true }),
    ).not.toBeChecked();
    await page
      .getByRole("button", { name: "記錄聯繫結果", exact: true })
      .click();
    await expect(workbench.getByRole("alert")).toHaveCount(0);
    await expect(
      page
        .getByText("仍有未確認結束的電話，請確認通話狀態。", { exact: true })
        .first(),
    ).toBeVisible();
    await page
      .getByLabel("取消或轉交原因", { exact: true })
      .fill("SIM cancel task while phone state unknown");
    await page.getByRole("button", { name: "取消待辦", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "已取消", exact: true }),
    ).toBeVisible();
    await expect(workbench.getByRole("alert")).toHaveText(
      "仍有未確認結束的電話，請確認通話狀態。",
    );
    const uncertain = await data(
      await page.request.get(bff(`/voice/callbacks/${activeTask}`)),
    );
    expect(uncertain.task.dial_reconcile_required).toBe(true);
    expect(uncertain.commands.at(-1).actual_phone_hung_up).toBe(false);
    expect(uncertain.attempts[0]).toMatchObject({
      ended_at: null,
      hangup_confirmed: false,
    });
    stage(
      "Task cancellation explicitly leaves unconfirmed physical phone state unresolved",
    );
    await screenshot("05-cancelled-with-phone-state-unconfirmed");

    const rows = (
      await database.query(
        "SELECT task_id,voice_session_id,status,version FROM voice.callback_task WHERE task_id=ANY($1::uuid[]) ORDER BY task_id",
        [createdTaskIds],
      )
    ).rows;
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.voice_session_id))).toEqual(
      new Set([voiceSessionId]),
    );
    const binding = (
      await database.query(
        "SELECT bound_order_id FROM voice.intent WHERE voice_session_id=$1 AND action='create_owned_order'",
        [voiceSessionId],
      )
    ).rows;
    expect(binding).toEqual([{ bound_order_id: orderId }]);
    expect(
      (
        await database.query(
          "SELECT order_id,record FROM ops.phase1_owned_orders WHERE order_id=$1",
          [orderId],
        )
      ).rows,
    ).toEqual(originalOrder);
    const receipts = (
      await database.query(
        "SELECT scope,idempotency_key,response_body FROM ops.idempotency_records WHERE scope=ANY($1::varchar[]) ORDER BY created_at,record_id",
        [
          createdTaskIds.flatMap((id) =>
            ["claim", "attempt", "complete", "cancel", "transfer"].map(
              (action) => `voice_callback:${id}:${action}`,
            ),
          ),
        ],
      )
    ).rows;
    expect(receipts).toHaveLength(8);
    stage(
      "Independent SQL readback confirms three tasks, eight receipts and one original order",
    );
    await writeFile(
      resolve(directory, "qualified-browser-facts.json"),
      JSON.stringify(
        {
          source,
          runId: process.env.GITHUB_RUN_ID,
          callId,
          voiceSessionId,
          orderId,
          createdTaskIds,
          taskRows: rows,
          receipts,
          retryRequests: httpAttempts,
          stages,
          screenshots,
          externalContactConsentMediaAndPhoneObservations: "SIM",
          qualificationPrerequisites:
            "Synthetic fixture; full spoken booking is not qualified here.",
          internalOriginalCallOrderTasksAttemptsReceiptsAndHistory:
            "actual API and PostgreSQL",
          realPSTNOrFormalConsentAcceptance: false,
        },
        null,
        2,
      ),
    );
  } finally {
    await writeFile(
      resolve(directory, "progress.json"),
      JSON.stringify(
        {
          source,
          runId: process.env.GITHUB_RUN_ID,
          callId,
          voiceSessionId,
          orderId,
          taskId,
          createdTaskIds,
          stages,
          screenshots,
        },
        null,
        2,
      ),
    );
    await database.end();
  }
});
