import { createRequire } from "node:module";
import { resolve } from "node:path";
import type { Page, Response, TestInfo } from "@playwright/test";

const load = createRequire(resolve(process.cwd(), "package.json"));
const { finalizeCreatedOrders, passengerPageOperations } = load(
  "./operations/verification/recover-interrupted-passenger-rehearsals.cjs",
);

/** A failed assertion remains failed. Only this journey's new orders are finalized. */
export function trackInterruptedRehearsal(
  page: Page,
  info: TestInfo,
  origin: string,
  operationsOverride?: {
    read(orderId: string): Promise<unknown>;
    cancel(orderId: string): Promise<void>;
  },
) {
  const created = new Set<string>();
  const pending = new Set<Promise<void>>();
  let unknownAcknowledgements = 0;
  const capture = (response: Response) => {
    if (
      new URL(response.url()).origin !== new URL(origin).origin ||
      response.request().method() !== "POST" ||
      response.status() !== 201 ||
      new URL(response.url()).pathname !== "/api/passenger-app/rides"
    )
      return;
    const read = response
      .json()
      .then((body) => {
        const order = body.data?.ride?.order;
        const id = order?.orderId ?? order?.order_id;
        if (typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id))
          created.add(id);
        else unknownAcknowledgements++;
      })
      .catch(() => {
        unknownAcknowledgements++;
      });
    pending.add(read);
    void read.finally(() => pending.delete(read));
  };
  page.on("response", capture);
  return async () => {
    await page.context().setOffline(false);
    await Promise.allSettled([...pending]);
    page.off("response", capture);
    const operations =
      operationsOverride ??
      passengerPageOperations(() => page, origin, info.outputDir);
    const results = await finalizeCreatedOrders([...created], operations);
    await info.attach("interrupted-rehearsal-finalization", {
      body: JSON.stringify({
        originalJourneyStillFailed: true,
        onlyNewOrdersCreatedByThisJourney: [...created],
        unknownAcknowledgements,
        results,
        recordsDeleted: false,
        quotaOrPolicyChanges: false,
      }),
      contentType: "application/json",
    });
  };
}
