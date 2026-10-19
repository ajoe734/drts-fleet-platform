import { expect, type Page, type TestInfo } from "@playwright/test";
import {
  authority,
  camel,
  OPS,
  PAX,
  type JourneyStep,
} from "../pax-review-shared-order/additional-journey";
import { recordOrderEvidence } from "../pax-review-shared-order/evidence";

export async function pendingReceiptJourney(
  pax: Page,
  orderId: string,
  step: JourneyStep,
  info: TestInfo,
) {
  await step(
    "UC12 unfinished original receipt is not-ready; a real offline read remains retryable",
    async () => {
      await pax.goto(`${PAX}/rides/${orderId}/receipt`);
      await expect(
        pax.getByText("乘車證明準備中", { exact: true }),
      ).toBeVisible();
      const pending = pax.waitForResponse(
        (r) =>
          r.url().endsWith(`/rides/${orderId}/receipt`) &&
          r.request().method() === "GET",
      );
      await pax
        .getByRole("button", { name: "重新讀取乘車證明", exact: true })
        .click();
      const response = await pending;
      // The original trusted/account receipt contract uses 404 while the
      // immutable receipt has not been produced, with this specific code.
      expect(response.status()).toBe(404);
      expect((await response.json()).error.code).toBe(
        "PASSENGER_RECEIPT_NOT_READY",
      );
      await pax.context().setOffline(true);
      try {
        await pax
          .getByRole("button", { name: "重新讀取乘車證明", exact: true })
          .click();
        await expect(
          pax.getByText("無法讀取完整乘車證明", { exact: true }),
        ).toBeVisible();
        await info.attach("UC12-real-network-failure", {
          body: await pax.screenshot({ fullPage: true }),
          contentType: "image/png",
        });
      } finally {
        await pax.context().setOffline(false);
      }
      await pax.getByRole("button", { name: "重試讀取", exact: true }).click();
      await expect(
        pax.getByText("乘車證明準備中", { exact: true }),
      ).toBeVisible();
      expect((await authority(pax, orderId)).order.status).toBe("on_trip");
      await pax.goto(`${PAX}/rides/${orderId}`);
    },
  );
}

export async function completedOrderAftercare(
  pax: Page,
  ops: Page,
  orderId: string,
  step: JourneyStep,
  info: TestInfo,
) {
  await step(
    "UC12 same completed order receipt recovers without changing payment or the immutable snapshot",
    async () => {
      await expect
        .poll(async () => (await authority(pax, orderId)).receipt?.record)
        .toBeTruthy();
      const before = await authority(pax, orderId);
      await pax.goto(`${PAX}/rides/${orderId}/receipt`);
      const response = await pax.request.get(
        `${PAX}/api/passenger-app/rides/${orderId}/receipt`,
      );
      expect(response.status()).toBe(200);
      await expect(
        pax.getByText("乘車證明準備中", { exact: true }),
      ).toHaveCount(0);
      expect((await authority(pax, orderId)).receipt).toEqual(before.receipt);
      expect((await authority(pax, orderId)).payment).toEqual(before.payment);
      await recordOrderEvidence(
        orderId,
        "UC12-same-order-receipt-recovered",
        { pax, ops },
        info,
      );
    },
  );
  await step(
    "UC13 five-star submission and repeated changes preserve the first rating",
    async () => {
      await pax.goto(`${PAX}/rides/${orderId}`);
      await expect
        .poll(async () => (await authority(pax, orderId)).payment?.status)
        .toBe("captured");
      await pax.getByRole("button", { name: "5 星", exact: true }).click();
      const rated = pax.waitForResponse(
        (r) =>
          r.url().endsWith(`/rides/${orderId}/ratings`) &&
          r.request().method() === "POST",
      );
      await pax.getByRole("button", { name: "送出評價", exact: true }).click();
      expect((await rated).status()).toBe(201);
      const before = (await authority(pax, orderId)).rating;
      expect(before.score).toBe(5);
      for (const rating of [1, 4]) {
        const refused = await pax.request.post(
          `${PAX}/api/passenger-app/rides/${orderId}/ratings`,
          {
            headers: { Origin: PAX },
            data: {
              rideId: orderId,
              rating,
              tags: [],
              comments: "合成重送：不能覆寫首次五星",
              contactRequested: true,
            },
          },
        );
        expect(refused.status()).toBe(409);
        expect((await refused.json()).error.code).toBe(
          "PASSENGER_RATING_ALREADY_SUBMITTED",
        );
      }
      await pax.reload();
      await expect(
        pax.getByRole("button", { name: "送出評價", exact: true }),
      ).toHaveCount(0);
      expect((await authority(pax, orderId)).rating).toEqual(before);
      await recordOrderEvidence(
        orderId,
        "UC13-first-five-stars-preserved",
        { pax, ops },
        info,
      );
    },
  );
  for (const category of ["fare", "service"] as const)
    await step(
      `UC15 real ${category} case follows its original order through Ops handling and audit`,
      async () => {
        await pax.goto(`${PAX}/rides/${orderId}`);
        await pax
          .getByRole("button", { name: "客訴與遺失物表單", exact: true })
          .click();
        await pax.getByRole("combobox").selectOption(category);
        await pax
          .getByPlaceholder("請描述您的問題，如為遺失物請說明特徵...")
          .fill(
            `合成${category}申訴：核對原單 ${orderId}，不代表真人服務或正式費用採認。`,
          );
        const submitted = pax.waitForResponse(
          (r) =>
            r.url().endsWith(`/rides/${orderId}/complaints`) &&
            r.request().method() === "POST",
        );
        await pax
          .getByRole("button", { name: "確認送出", exact: true })
          .click();
        const result = await submitted;
        expect(result.status()).toBe(201);
        const caseNo = camel(await result.json()).data.complaintId as string;
        expect(caseNo).toMatch(/^PAX-[0-9a-f-]{36}$/);
        const read = async (suffix = "") => {
          const response = await ops.request.get(
            `${OPS}/control-plane-proxy/complaints/${caseNo}${suffix}`,
          );
          expect(response.status()).toBe(200);
          return camel(await response.json()).data;
        };
        const complaint = await read();
        expect(complaint).toMatchObject({
          caseNo,
          relatedOrderId: orderId,
          category: category === "fare" ? "fare_dispute" : "driver_service",
        });
        expect(complaint.description).toContain("同意客服聯繫：否");
        await ops.goto(
          `${OPS}/complaints?caseNo=${encodeURIComponent(caseNo)}`,
        );
        const receipts = [];
        for (const action of [
          { path: "notes", label: "新增備註", status: "new" },
          { path: "assign", label: "指派 / 重新指派", status: "assigned" },
          { path: "resolve", label: "結案處理", status: "resolved" },
          { path: "close", label: "關閉案件", status: "closed" },
        ]) {
          await ops
            .getByTestId("complaint-list-actions")
            .getByRole("button", { name: action.label, exact: true })
            .click();
          const note = `合成${category}原單 ${orderId}：${action.path}；未聯繫真人。`;
          if (action.path === "notes")
            await ops.getByLabel("調查備註", { exact: true }).fill(note);
          else if (action.path === "assign") {
            await ops
              .getByLabel("負責人 ID", { exact: true })
              .fill("AGENT-OPS-002");
            await ops.getByLabel("指派備註", { exact: true }).fill(note);
          } else {
            await ops.getByLabel("處理代碼").selectOption("resolved_other");
            await ops.getByLabel("結案備註").fill(note);
          }
          const changed = ops.waitForResponse(
            (r) =>
              r.url().endsWith(`/complaints/${caseNo}/${action.path}`) &&
              r.request().method() === "POST",
          );
          await ops.getByRole("button", { name: "確認", exact: true }).click();
          const response = await changed;
          expect(response.ok()).toBe(true);
          const receipt = camel(await response.json()).meta.actionReceipt;
          expect(receipt).toMatchObject({
            resourceType: "complaint_case",
            resourceId: caseNo,
            status: "completed",
          });
          expect(receipt.auditId).toMatch(/^[0-9a-f-]{36}$/);
          const audit = await ops.request.get(
            `${OPS}/control-plane-proxy/audit?auditId=${encodeURIComponent(receipt.auditId)}`,
          );
          expect(audit.status()).toBe(200);
          expect(
            camel(await audit.json()).data.items.some(
              (row: { auditId: string }) => row.auditId === receipt.auditId,
            ),
          ).toBe(true);
          receipts.push(receipt);
          expect(await read()).toMatchObject({
            status: action.status,
            relatedOrderId: orderId,
          });
        }
        const timeline = (await read("/timeline")).items;
        expect(
          timeline.map((entry: { action: string }) => entry.action),
        ).toEqual([
          "case_created",
          "case_note_added",
          "case_assigned",
          "case_resolved",
          "case_closed",
        ]);
        await info.attach(`UC15-${category}-same-order-case`, {
          body: JSON.stringify({
            orderId,
            caseNo,
            category,
            timeline,
            receipts,
            humanContactExecuted: false,
          }),
          contentType: "application/json",
        });
        await info.attach(`UC15-${category}-Ops`, {
          body: await ops.screenshot({ fullPage: true }),
          contentType: "image/png",
        });
      },
    );
}
