import { createRequire } from "node:module";
import { resolve } from "node:path";
import { expect, type Page, type TestInfo } from "@playwright/test";
import {
  authority,
  camel,
  PAX,
  sharedDev,
} from "../pax-review-shared-order/additional-journey";

/** Only the external synthetic qualification row is changed, reversibly, in
 * the disposable hosted DB. Assignment, authorization, orders/tasks stay real.
 */
export async function incompleteDisclosureJourney(
  pax: Page,
  ops: Page,
  orderId: string,
  info: TestInfo,
) {
  if (sharedDev) {
    await info.attach("UC08-disclosure-fixture-unexecuted", {
      body: JSON.stringify({
        orderId,
        executed: false,
        blocker:
          "Shared rehearsal supply has no normal UI operation for publishing an incomplete disclosure profile; this fixture only edits the disposable hosted external supply row.",
      }),
      contentType: "application/json",
    });
    return;
  }
  if (process.env.GITHUB_ACTIONS !== "true")
    throw new Error("External supply fixture is hosted-only");
  const apiRequire = createRequire(
    resolve(__dirname, "../../../apps/api/package.json"),
  );
  const { Pool } = apiRequire("pg") as typeof import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const vehicleId = "pax-review-vehicle-a";
  let original:
    | {
        color: string | null;
        status: string;
        missing_field_codes: string[];
        updated_at: Date;
      }
    | undefined;
  try {
    const saved = await pool.query(
      "SELECT color,status,missing_field_codes,updated_at FROM reg.vehicle_passenger_disclosure_profiles WHERE vehicle_id=$1",
      [vehicleId],
    );
    expect(saved.rows).toHaveLength(1);
    original = saved.rows[0];
    await pool.query(
      "UPDATE reg.vehicle_passenger_disclosure_profiles SET color=NULL,status='incomplete',missing_field_codes='[\"color\"]'::jsonb,updated_at=now() WHERE vehicle_id=$1",
      [vehicleId],
    );
    const rejected = ops.waitForResponse(
      (r) =>
        r.url().endsWith("/dispatch/assign") && r.request().method() === "POST",
    );
    await ops
      .getByRole("button", { name: "指派 pax-review-driver-a", exact: true })
      .click();
    const response = await rejected;
    expect(response.status()).toBe(409);
    const error = camel(await response.json()).error;
    expect(error.code).toBe("P5_VEHICLE_DISCLOSURE_INCOMPLETE");
    expect(error.details.missingFieldCodes).toEqual(["color"]);
    const beforeRecovery = await authority(pax, orderId);
    expect(beforeRecovery.assignment).toBeNull();
    await pax.reload();
    await expect(pax.getByText("SIM-1001", { exact: true })).toHaveCount(0);
    await info.attach("UC08-missing-disclosure-real-refusal", {
      body: JSON.stringify({
        orderId,
        vehicleId,
        httpStatus: response.status(),
        code: error.code,
        missingFieldCodes: error.details.missingFieldCodes,
        passengerAssignment: beforeRecovery.assignment,
        internalAssignmentMocked: false,
      }),
      contentType: "application/json",
    });
    await info.attach("UC08-missing-disclosure-Passenger", {
      body: await pax.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
    await info.attach("UC08-missing-disclosure-Ops", {
      body: await ops.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  } finally {
    try {
      if (original)
        await pool.query(
          "UPDATE reg.vehicle_passenger_disclosure_profiles SET color=$2,status=$3,missing_field_codes=$4::jsonb,updated_at=$5 WHERE vehicle_id=$1",
          [
            vehicleId,
            original.color,
            original.status,
            JSON.stringify(original.missing_field_codes),
            original.updated_at,
          ],
        );
    } finally {
      await pool.end();
    }
  }
  await pax.goto(`${PAX}/rides/${orderId}`);
}
