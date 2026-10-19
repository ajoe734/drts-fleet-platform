import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createJourneyProgress } from "../pax-review-shared-order/progress";
import { recordOrderEvidence } from "../pax-review-shared-order/evidence";
import { trackInterruptedRehearsal } from "../pax-review-shared-order/interrupted-rehearsal-finalizer";
import {
  authority,
  bind,
  camel,
  OPS,
  opsRead,
  PAX,
  prepareBooking,
  sharedDev,
} from "../pax-review-shared-order/additional-journey";
import { bureauPhone } from "./review-runtime";
import { roleBrowser } from "./role-browser";
import { loginPassenger } from "./otp-consent-journey";

async function methods(page: Page) {
  const response = await page.request.get(
    `${PAX}/api/passenger-app/payment-methods`,
  );
  expect(response.status()).toBe(200);
  return camel(await response.json()).data.methods as {
    paymentMethodId: string;
    isDefault: boolean;
  }[];
}

test("original drafts, lost acknowledgement, payment methods and a second device recover the same real order", async ({
  browser,
}, info) => {
  const progress = createJourneyProgress(info.outputPath("safe-progress.json"));
  const step = progress.step;
  const contexts: BrowserContext[] = [];
  const pax = await roleBrowser(browser, "pax", contexts, progress);
  const ops = await roleBrowser(browser, "ops", contexts, progress);
  const finalize = trackInterruptedRehearsal(pax, info, PAX);
  let finished = false;
  try {
    const phone = bureauPhone("reliability");
    const passengerId = await step(
      "UC01 ordinary first consent for the dedicated reliability account",
      () => loginPassenger(pax, phone),
    );
    if (sharedDev) {
      await info.attach("UC09-external-provider-fault-unexecuted", {
        body: JSON.stringify({
          executed: false,
          blocker:
            "Shared deployment has no hosted external Google fetch substitution; real shared provider faults/zero candidates need a controlled external source. Internal GeoService/order/auth never mocked.",
        }),
        contentType: "application/json",
      });
    } else
      await step(
        "UC09 real GeoService handles external disconnect, timeout, no candidates, disambiguation and recovery",
        async () => {
          await pax.goto(`${PAX}/`);
          const ack = pax.getByRole("button", {
            name: "我已閱讀並同意",
            exact: true,
          });
          await expect(
            ack.or(pax.getByLabel("演練選址方式", { exact: true })),
          ).toBeVisible();
          if (await ack.isVisible()) await ack.click();
          await pax
            .getByLabel("演練選址方式", { exact: true })
            .selectOption("standard");
          const picker = pax.locator("[data-address-map-picker]").first();
          const search = async (query: string) => {
            await picker.getByPlaceholder("請輸入街道、地點或地標").fill(query);
            const requested = pax.waitForResponse(
              (r) =>
                new URL(r.url()).pathname === "/api/passenger-app/geo/search" &&
                new URL(r.url()).searchParams.get("q") === query,
            );
            await picker
              .getByRole("button", { name: "搜尋", exact: true })
              .click();
            return requested;
          };
          for (const query of ["交通局圖資斷線", "交通局圖資逾時"]) {
            const response = await search(query);
            expect(response.status()).toBe(503);
            expect((await response.json()).error.code).toBe(
              "GEO_PROVIDER_UNAVAILABLE",
            );
            await expect(
              picker.getByText("目前無法搜尋地址，請稍後重試。", {
                exact: true,
              }),
            ).toBeVisible();
            await expect(
              pax.getByRole("button", { name: "試算車資", exact: true }),
            ).toBeDisabled();
          }
          const empty = await search("交通局零候選");
          expect(empty.status()).toBe(200);
          expect(camel(await empty.json()).data.candidates).toEqual([]);
          // The picker also announces this text in a visually hidden live
          // region. Assert the actual visible empty-state banner here.
          await expect(
            picker
              .getByText("找不到相符的地址", { exact: true })
              .and(picker.locator(":not([aria-live])")),
          ).toBeVisible();
          const ambiguous = await search("交通局同名地址");
          expect(ambiguous.status()).toBe(200);
          const candidates = camel(await ambiguous.json()).data.candidates;
          expect(candidates).toHaveLength(2);
          expect(candidates[0].candidateId).not.toBe(candidates[1].candidateId);
          // Search candidates already include coordinates. The actual picker
          // applies the selection directly; it does not call /geo/resolve.
          await picker
            .getByRole("button", { name: /合成同名地址/ })
            .nth(1)
            .click();
          await expect(
            picker.getByRole("button", { name: "清除選點", exact: true }),
          ).toBeVisible();
          const destination = pax.locator("[data-address-map-picker]").nth(1);
          await destination
            .getByPlaceholder("請輸入街道、地點或地標")
            .fill("板橋車站");
          await destination
            .getByRole("button", { name: "搜尋", exact: true })
            .click();
          await destination
            .getByRole("button", { name: /合成板橋車站/ })
            .click();
          const localTime = await pax.evaluate(() => {
            const date = new Date(Date.now() + 180_000);
            const pad = (value: number) => String(value).padStart(2, "0");
            return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
          });
          await pax.getByLabel("預約時間", { exact: true }).fill(localTime);
          const quote = pax.waitForResponse(
            (r) =>
              new URL(r.url()).pathname === "/api/passenger-app/quotes" &&
              r.request().method() === "POST",
          );
          await pax
            .getByRole("button", { name: "試算車資", exact: true })
            .click();
          const quoted = await quote;
          expect(camel(quoted.request().postDataJSON())).toMatchObject({
            originLat: candidates[1].location.lat,
            originLng: candidates[1].location.lng,
          });
          expect(quoted.status()).toBe(201);
          expect(camel(await quoted.json()).data.serviceAreaResult).toBe(
            "serviceable",
          );
          await info.attach("UC09-external-fault-recovered-UI", {
            body: await pax.screenshot({ fullPage: true }),
            contentType: "image/png",
          });
        },
      );
    const method = await step(
      "UC02 bind two real owned methods via simulated external PSP",
      async () => {
        const first = await bind(pax, "success");
        const second = await bind(pax, "success");
        expect(second).not.toBe(first);
        return first;
      },
    );
    await step(
      "UC02 real default switch and abandoned delete leave authoritative methods consistent",
      async () => {
        const before = await methods(pax);
        const nonDefault = before.find((row) => !row.isDefault)!;
        expect(nonDefault).toBeTruthy();
        const updated = pax.waitForResponse(
          (r) =>
            r.url().endsWith(`/${nonDefault.paymentMethodId}/default`) &&
            r.request().method() === "PUT",
        );
        await pax
          .getByRole("button", { name: "設為預設", exact: true })
          .first()
          .click();
        expect((await updated).status()).toBe(200);
        expect(
          (await methods(pax))
            .filter((row) => row.isDefault)
            .map((row) => row.paymentMethodId),
        ).toEqual([nonDefault.paymentMethodId]);
        let deletes = 0;
        const observe = (request: import("@playwright/test").Request) => {
          if (request.method() === "DELETE") deletes++;
        };
        pax.on("request", observe);
        const current = await methods(pax);
        await pax
          .getByRole("button", { name: "刪除", exact: true })
          .first()
          .click();
        await pax.getByRole("button", { name: "取消", exact: true }).click();
        expect(await methods(pax)).toEqual(current);
        expect(deletes).toBe(0);
        pax.off("request", observe);
      },
    );
    await step(
      "UC03 requote clears the original fee confirmation",
      async () => {
        await prepareBooking(pax, method);
        await pax
          .getByRole("button", { name: "返回修改", exact: true })
          .click();
        const nextMidnight = await pax.evaluate(() => {
          const date = new Date();
          date.setDate(date.getDate() + 1);
          date.setHours(0, 0, 0, 0);
          // Keep the original lead-time rule near midnight too; select the
          // following legal midnight rather than shortening that rule.
          if (date.getTime() < Date.now() + 180_000)
            date.setDate(date.getDate() + 1);
          const pad = (value: number) => String(value).padStart(2, "0");
          return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T00:00`;
        });
        await pax.getByLabel("預約時間", { exact: true }).fill(nextMidnight);
        await expect
          .poll(() =>
            pax.evaluate((expected) => {
              const saved = sessionStorage.getItem(
                "drts.passenger.booking-recovery.v1",
              );
              return saved
                ? JSON.parse(saved).draft.localTime === expected
                : false;
            }, nextMidnight),
          )
          .toBe(true);
        await pax.reload();
        await expect(pax.getByLabel("預約時間", { exact: true })).toHaveValue(
          nextMidnight,
        );
        await expect(
          pax.getByRole("button", { name: "清除選點", exact: true }),
        ).toHaveCount(2);
        await expect(
          pax.getByRole("checkbox", { name: "我已確認費用與優惠說明" }),
        ).toHaveCount(0);
        await pax
          .getByRole("button", { name: "試算車資", exact: true })
          .click();
        await expect(
          pax.getByRole("checkbox", { name: "我已確認費用與優惠說明" }),
        ).not.toBeChecked();
        await expect(
          pax.getByRole("button", { name: "確認叫車", exact: true }),
        ).toBeDisabled();
        await pax
          .getByRole("checkbox", { name: "我已確認費用與優惠說明" })
          .check();
      },
    );
    let originalKey = "";
    let originalBody: unknown;
    let orderId = "";
    let createRequests = 0;
    pax.on("request", (request) => {
      if (
        new URL(request.url()).pathname === "/api/passenger-app/rides" &&
        request.method() === "POST"
      )
        createRequests++;
    });
    await step(
      "UC10 the original BFF/API commits, then only the browser acknowledgement is lost",
      async () => {
        await pax.route(
          "**/api/passenger-app/rides",
          async (route) => {
            if (route.request().method() !== "POST") return route.continue();
            originalKey = route.request().headers()["x-request-id"]!;
            originalBody = route.request().postDataJSON();
            const response = await route.fetch();
            expect(response.status()).toBe(201);
            orderId = camel(await response.json()).data.ride.order.orderId;
            expect(orderId).toMatch(/^[0-9a-f-]{36}$/);
            await route.abort("connectionreset");
          },
          { times: 1 },
        );
        await pax
          .getByRole("button", { name: "確認叫車", exact: true })
          .dblclick();
        await expect(
          pax.getByRole("button", { name: "重試同一筆叫車請求", exact: true }),
        ).toBeVisible();
        expect(originalKey).toMatch(/^[0-9a-f-]{36}$/);
        expect(createRequests).toBe(1);
        await info.attach("UC10-lost-ACK-UI", {
          body: await pax.screenshot({ fullPage: true }),
          contentType: "image/png",
        });
      },
    );
    await step(
      "UC10 reload restores the original immutable command and one retry returns the original UUID",
      async () => {
        await pax.reload();
        const retry = pax.waitForResponse(
          (r) =>
            new URL(r.url()).pathname === "/api/passenger-app/rides" &&
            r.request().method() === "POST",
        );
        await pax
          .getByRole("button", { name: "重試同一筆叫車請求", exact: true })
          .click();
        const response = await retry;
        expect(response.status()).toBe(201);
        expect(response.request().headers()["x-request-id"]).toBe(originalKey);
        expect(response.request().postDataJSON()).toEqual(originalBody);
        expect(camel(await response.json()).data.ride.order.orderId).toBe(
          orderId,
        );
        const repeated = await Promise.all(
          [1, 2].map(() =>
            pax.request.post(`${PAX}/api/passenger-app/rides`, {
              headers: { Origin: PAX, "x-request-id": originalKey },
              data: originalBody,
            }),
          ),
        );
        for (const replay of repeated) {
          expect(replay.status()).toBe(201);
          expect(camel(await replay.json()).data.ride.order.orderId).toBe(
            orderId,
          );
        }
        await expect(pax).toHaveURL(new RegExp(`/rides/${orderId}$`));
        const list = await pax.request.get(
          `${PAX}/api/passenger-app/rides?limit=100`,
        );
        expect(list.status()).toBe(200);
        expect(
          camel(await list.json()).data.rides.map(
            (ride: { order: { orderId: string } }) => ride.order.orderId,
          ),
        ).toEqual([orderId]);
      },
    );
    await step(
      "UC02 a separate device performs real OTP and recovers the original account, methods and order",
      async () => {
        const device = await roleBrowser(
          browser,
          "pax",
          contexts,
          progress,
          "UTC",
        );
        expect(await loginPassenger(device, phone, false)).toBe(passengerId);
        expect(await methods(device)).toEqual(await methods(pax));
        await device.goto(`${PAX}/rides/${orderId}`);
        await expect(device.getByTestId("review-order-id")).toHaveText(orderId);
        expect((await authority(device, orderId)).order).toEqual(
          (await authority(pax, orderId)).order,
        );
        await info.attach("UC02-second-device-original-order", {
          body: await device.screenshot({ fullPage: true }),
          contentType: "image/png",
        });
      },
    );
    await step(
      "UC10 a changed body is rejected and a genuinely different logged-in account cannot recover this account's command",
      async () => {
        const command = originalBody as Record<string, unknown>;
        const changed = await pax.request.post(
          `${PAX}/api/passenger-app/rides`,
          {
            headers: { Origin: PAX, "x-request-id": originalKey },
            data: {
              ...command,
              origin: {
                ...(command.origin as Record<string, unknown>),
                address: "合成改字：不得改寫原請求",
              },
            },
          },
        );
        expect(changed.status()).toBe(409);
        expect((await changed.json()).error.code).toBe(
          "IDEMPOTENCY_KEY_REUSED",
        );
        const other = await roleBrowser(browser, "pax", contexts, progress);
        // The wrong-code account has never verified a code or agreed to terms.
        // Its first legitimate login still uses ordinary OTP and real consent.
        const otherPassengerId = await loginPassenger(
          other,
          bureauPhone("wrong"),
        );
        expect(otherPassengerId).not.toBe(passengerId);
        const refused = await other.request.post(
          `${PAX}/api/passenger-app/rides`,
          {
            headers: { Origin: PAX, "x-request-id": originalKey },
            data: originalBody,
          },
        );
        expect(refused.status()).toBe(404);
        expect((await refused.json()).error.code).toBe("FARE_QUOTE_NOT_FOUND");
        const list = await other.request.get(
          `${PAX}/api/passenger-app/rides?limit=100`,
        );
        expect(list.status()).toBe(200);
        expect(camel(await list.json()).data.rides).toEqual([]);
        expect((await authority(pax, orderId)).order.orderId).toBe(orderId);
        await info.attach("UC10-real-cross-account-refusal", {
          body: JSON.stringify({
            orderId,
            passengerId,
            otherPassengerId,
            changedBodyStatus: changed.status(),
            changedBodyCode: "IDEMPOTENCY_KEY_REUSED",
            differentAccountStatus: refused.status(),
            differentAccountCode: "FARE_QUOTE_NOT_FOUND",
            otherAccountOrders: 0,
          }),
          contentType: "application/json",
        });
      },
    );
    await step("UC02 an active order's method cannot be deleted", async () => {
      await pax.goto(`${PAX}/account/payment-methods`);
      const current = await methods(pax);
      await pax
        .getByRole("button", { name: "刪除", exact: true })
        .nth(current.findIndex((row) => row.paymentMethodId === method))
        .click();
      const rejected = pax.waitForResponse(
        (r) => r.request().method() === "DELETE",
      );
      await pax.getByRole("button", { name: "確定刪除", exact: true }).click();
      const response = await rejected;
      expect(response.status()).toBe(409);
      expect((await response.json()).error.code).toBe("pending_payment_block");
      expect(await methods(pax)).toEqual(current);
    });
    await step(
      "UC05 original unassigned cancellation has no charge or extra payment, then its method is removable",
      async () => {
        await pax.goto(`${PAX}/rides/${orderId}`);
        const before = await authority(pax, orderId);
        expect(before.payment).toBeNull();
        pax.once("dialog", (dialog) => dialog.accept());
        const canceled = pax.waitForResponse(
          (r) =>
            r.url().endsWith(`/rides/${orderId}/cancel`) &&
            r.request().method() === "POST",
        );
        await pax
          .getByRole("button", { name: "取消行程", exact: true })
          .first()
          .click();
        expect((await canceled).status()).toBe(201);
        expect((await authority(pax, orderId)).order.status).toBe("cancelled");
        expect((await authority(pax, orderId)).payment).toBeNull();
        await ops.goto(`${OPS}/review`);
        await opsRead(ops, orderId);
        const rows = await recordOrderEvidence(
          orderId,
          "UC05-no-charge-cancelled",
          { pax, ops },
          info,
        );
        for (const row of rows) {
          expect(row.payment_id ?? null).toBeNull();
          expect(row.amount_minor ?? null).toBeNull();
        }
        await pax.goto(`${PAX}/account/payment-methods`);
        const current = await methods(pax);
        await pax
          .getByRole("button", { name: "刪除", exact: true })
          .nth(current.findIndex((row) => row.paymentMethodId === method))
          .click();
        const removed = pax.waitForResponse(
          (r) => r.request().method() === "DELETE",
        );
        await pax
          .getByRole("button", { name: "確定刪除", exact: true })
          .click();
        expect((await removed).status()).toBe(200);
        expect(
          (await methods(pax)).some((row) => row.paymentMethodId === method),
        ).toBe(false);
        expect((await authority(pax, orderId)).order.status).toBe("cancelled");
        finished = true;
      },
    );
    await info.attach("UC02-03-05-09-10-facts", {
      body: JSON.stringify({
        orderId,
        passengerId,
        originalRequestId: originalKey,
        internalOrdersAuthFeesAndPGMocked: false,
        externalMapPortSimulated: !sharedDev,
        sameOrderRecovered: true,
      }),
      contentType: "application/json",
    });
  } finally {
    await pax.context().setOffline(false);
    if (!finished) await finalize();
    for (const context of contexts) await context.close();
  }
});
