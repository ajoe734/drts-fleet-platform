import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as passengerAppContracts from "../../../packages/contracts/src/passenger-app";

const repoRoot = process.cwd();

describe("PAX-SD-20261009 Unit Tests", () => {
  describe("Schema Allocation Invariants (schema-allocation.json)", () => {
    const allocationPath = path.join(
      repoRoot,
      "docs/04-uat/system-remediation-20260906/schema-allocation.json",
    );

    it("exists and allocates discrete sequential migration files starting at V0109 for passenger app", () => {
      expect(fs.existsSync(allocationPath)).toBe(true);
      const content = JSON.parse(fs.readFileSync(allocationPath, "utf8"));
      const allocations = content.passenger_app_allocations;

      expect(allocations).toBeDefined();
      expect(allocations.length).toBeGreaterThanOrEqual(8);

      const expectedTasks = [
        { task_id: "PAX-ACCOUNT-SESSION-20261009", version: "V0109" },
        { task_id: "PAX-OTP-20261009", version: "V0110" },
        { task_id: "PAX-OIDC-LOGIN-20261009", version: "V0111" },
        { task_id: "PAX-FARE-QUOTE-20261009", version: "V0112" },
        { task_id: "PAX-BOOKING-HISTORY-20261009", version: "V0113" },
        { task_id: "PAX-RECEIPT-COMPLAINT-20261009", version: "V0114" },
        { task_id: "PAX-PAYMENT-CORE-20261009", version: "V0115" },
        { task_id: "PAX-PUSH-DEVICE-API-20261009", version: "V0116" },
      ];

      for (const expected of expectedTasks) {
        const alloc = allocations.find(
          (a: any) => a.task_id === expected.task_id,
        );
        expect(alloc).toBeDefined();
        expect(alloc.version).toBe(expected.version);
      }
    });

    it("respects cross-ledger boundaries by referencing existing common tables instead of creating new ones", () => {
      const content = JSON.parse(fs.readFileSync(allocationPath, "utf8"));
      const allocations = content.passenger_app_allocations;

      const paymentAlloc = allocations.find((a: any) => a.task_id === "PAX-PAYMENT-CORE-20261009");
      expect(paymentAlloc.primary_tables).not.toContain("passenger.payment_states");
      expect(paymentAlloc.referenced_tables).toContain("billing.multi_taxi_passenger_payments");

      const pushAlloc = allocations.find((a: any) => a.task_id === "PAX-PUSH-DEVICE-API-20261009");
      expect(pushAlloc.primary_tables).not.toContain("passenger.push_devices");
      expect(pushAlloc.referenced_tables).toContain("iam.phase1_passenger_push_devices");

      const fareAlloc = allocations.find((a: any) => a.task_id === "PAX-FARE-QUOTE-20261009");
      expect(fareAlloc.primary_tables).toContain("passenger.fare_quote_snapshots");
    });
  });

  describe("Passenger App Contracts", () => {
    it("exports necessary constant values", () => {
      expect(passengerAppContracts.PASSENGER_REALM).toBe("passenger");
      expect(passengerAppContracts.FIRST_PARTY_PASSENGER_ACTOR_TYPE).toBe("first_party_passenger");
    });
  });
});
