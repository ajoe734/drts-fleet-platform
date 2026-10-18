import { expect, type Page, type TestInfo } from "@playwright/test";

const camel = (value: any): any =>
  Array.isArray(value)
    ? value.map(camel)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value).map(([key, entry]) => [
            key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
            camel(entry),
          ]),
        )
      : value;

/** Operate the ordinary workspace with the original Ops page/identity so the
 * existing cross-role response journal observes the real create command.
 */
export async function createDispatchInOrdinaryWorkspace(
  ops: Page,
  origin: string,
  orderId: string,
  info: TestInfo,
) {
  const readOrder = async () => {
    const response = await ops.request.get(
      `${origin}/control-plane-proxy/orders/${orderId}`,
    );
    expect(response.status()).toBe(200);
    const order = camel(await response.json()).data;
    expect(order.orderId).toBe(orderId);
    return order;
  };
  const before = await readOrder();
  const navigation = await ops.goto(`${origin}/dispatch/${orderId}`);
  expect(navigation?.status()).toBe(200);
  await expect(ops.locator(`[data-ops-order-id="${orderId}"]`)).toBeVisible();
  await expect(
    ops.getByText(before.orderNo, { exact: false }).first(),
  ).toBeVisible();
  const create = ops.locator('[data-drt-operation="ops-dispatch-create"]');
  await expect(create).toBeVisible();
  await expect(create).toBeEnabled();
  await info.attach("A-ordinary-Ops-before-dispatch-ops", {
    contentType: "image/png",
    body: await ops.screenshot({ fullPage: true }),
  });
  const [response] = await Promise.all([
    ops.waitForResponse(
      (result) =>
        result.request().method() === "POST" &&
        new URL(result.url()).pathname ===
          `/control-plane-proxy/orders/${orderId}/dispatch`,
    ),
    create.click(),
  ]);
  expect(response.status()).toBe(201);
  expect(response.request().postDataJSON()).toEqual({ mode: "auto" });
  const requestHeaders = await response.request().allHeaders();
  expect(requestHeaders["idempotency-key"]).toBeTruthy();
  expect(requestHeaders["x-idempotency-key"]).toBe(
    requestHeaders["idempotency-key"],
  );
  await expect(create).toHaveCount(0);
  const list = await ops.request.get(
    `${origin}/control-plane-proxy/dispatch/tasks`,
  );
  expect(list.status()).toBe(200);
  const jobs = camel(await list.json()).data.items.filter(
    (job: any) => job.orderId === orderId,
  );
  expect(jobs).toHaveLength(1);
  const job = jobs[0];
  expect(job.dispatchJobId).toMatch(/^[0-9a-f-]{36}$/);
  await expect(
    ops.getByText(job.dispatchJobId, { exact: false }).first(),
  ).toBeVisible();
  await expect(
    ops.locator('[data-drt-operation="ops-dispatch-assign"]'),
  ).toBeVisible();
  const after = await readOrder();
  expect(after.orderId).toBe(before.orderId);
  expect(after.orderNo).toBe(before.orderNo);
  await info.attach("A-ordinary-Ops-created-dispatch-ops", {
    contentType: "image/png",
    body: await ops.screenshot({ fullPage: true }),
  });
  return {
    orderId,
    orderNo: after.orderNo,
    dispatchJobId: job.dispatchJobId,
    actualEntry: `/dispatch/${orderId}`,
    actualNavigationHTTPStatus: navigation?.status(),
    actualCreatePOSTStatus: response.status(),
    actualCreateBody: response.request().postDataJSON(),
    actualSameOriginalOrderBeforeAndAfter: true,
    actualCreatedJobsForThisOrder: jobs.length,
    actualServerRefreshRemovedCreateControl: true,
    actualOrdinaryAssignControlShown: true,
    actualInternalNetworkMocks: false,
    actualDirectCreateRequestSubstituteUsed: false,
    scope:
      "ordinary Ops creation on original Passenger order; subsequent review assignment/reassignment and ordinary full journey remain separately scoped",
  };
}
