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

/** Real ordinary Ops control -> SDK/BFF -> persisted assignment/task readback.
 * No direct POST, review-action substitute, or internal network response mock.
 */
export async function assignInOrdinaryWorkspace(
  ops: Page,
  origin: string,
  orderId: string,
  driver: "a" | "b",
  reassign: boolean,
  info: TestInfo,
) {
  const navigation = await ops.goto(`${origin}/dispatch/${orderId}`);
  expect(navigation?.status()).toBe(200);
  await expect(ops.locator(`[data-ops-order-id="${orderId}"]`)).toBeVisible();
  const readTasks = async () => {
    const response = await ops.request.get(
      `${origin}/control-plane-proxy/driver/tasks`,
    );
    expect(response.status()).toBe(200);
    return camel(await response.json()).data.items.filter(
      (task: any) => task.orderId === orderId,
    );
  };
  const before = await readTasks();
  const prior = before.find(
    (task: any) => task.status === "pending_acceptance",
  );
  if (reassign) expect(prior).toBeTruthy();
  else expect(before).toHaveLength(0);
  const driverId = `pax-review-driver-${driver}`;
  const vehicleId = `pax-review-vehicle-${driver}`;
  await ops
    .locator("select[data-drt-dispatch-candidate]")
    .selectOption(`${driverId}:${vehicleId}`);
  if (reassign) {
    await ops
      .locator("select[data-drt-dispatch-reason]")
      .selectOption("operator_reassign");
    await ops
      .locator("input[data-drt-dispatch-note]")
      .fill("同單一般調度改派演練");
  }
  const operation = reassign ? "reassign" : "assign";
  const [response] = await Promise.all([
    ops.waitForResponse(
      (result) =>
        result.request().method() === "POST" &&
        new URL(result.url()).pathname ===
          `/control-plane-proxy/dispatch/${operation}`,
    ),
    ops.locator(`[data-drt-operation="ops-dispatch-${operation}"]`).click(),
  ]);
  expect(response.status(), await response.text()).toBe(201);
  const body = response.request().postDataJSON();
  expect(body.driverId).toBe(driverId);
  expect(body.vehicleId).toBe(vehicleId);
  if (reassign) {
    expect(body.reasonCode).toBe("operator_reassign");
    expect(body.reasonNote).toBe("同單一般調度改派演練");
  }
  const headers = await response.request().allHeaders();
  expect(headers["idempotency-key"]).toBeTruthy();
  expect(headers["x-idempotency-key"]).toBe(headers["idempotency-key"]);
  const result = camel(await response.json()).data;
  await expect(
    ops.locator(`[data-ops-task-id="${result.taskId}"]`),
  ).toBeVisible();
  await expect(ops.getByText(orderId, { exact: true })).toBeVisible();
  await expect(
    ops.locator('[data-drt-operation="ops-dispatch-reassign"]'),
  ).toBeVisible();
  const tasks = await readTasks();
  const task = tasks.find((entry: any) => entry.taskId === result.taskId);
  expect(task).toMatchObject({
    orderId,
    dispatchJobId: body.dispatchJobId,
    assignmentId: result.assignmentId,
    driverId,
    vehicleId,
    status: "pending_acceptance",
  });
  expect(
    tasks.filter((entry: any) => entry.status === "pending_acceptance"),
  ).toHaveLength(1);
  if (reassign) {
    expect(result.taskId).not.toBe(prior.taskId);
    expect(body.dispatchJobId).toBe(prior.dispatchJobId);
    expect(
      tasks.find((entry: any) => entry.taskId === prior.taskId)?.status,
    ).toBe("cancelled");
  }
  await info.attach(`A-ordinary-Ops-${operation}-ops`, {
    contentType: "image/png",
    body: await ops.screenshot({ fullPage: true }),
  });
  const facts = {
    orderId,
    actualEntry: `/dispatch/${orderId}`,
    actualNavigationHTTPStatus: navigation?.status(),
    actualOperation: operation,
    actualPOSTStatus: response.status(),
    actualCommand: body,
    assignmentId: result.assignmentId,
    taskId: result.taskId,
    previousTaskId: prior?.taskId ?? null,
    actualPersistedTask: task,
    actualPreviousTaskCancelled: reassign ? true : null,
    actualOnlyOnePendingTask: true,
    actualServerRefreshShowsReassignControl: true,
    actualServerRefreshShowsPersistedTaskId: result.taskId,
    actualOriginalOrderIdVisibleInOrdinaryDetail: true,
    actualInternalNetworkMocks: false,
    actualDirectCommandPOSTSubstituteUsed: false,
  };
  await info.attach(`A-ordinary-Ops-${operation}-facts`, {
    contentType: "application/json",
    body: JSON.stringify(facts),
  });
  return facts;
}
