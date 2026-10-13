import { describe, expect, it } from "vitest";
import { deepToSnakeCase } from "../../../apps/api/src/common/snake-case.interceptor";
import { command, fixture, identity, seed } from "./backend-fixture";

const fees = Object.fromEntries([
  ["airportFee", 35],
  ["airport_fee", 40],
  ["Airport_Fee", 45],
  ["night-fee", 50],
  ["__proto__", 55],
]);

function officialWire(response: unknown) {
  return deepToSnakeCase(response) as {
    data: {
      fare_version_id?: string;
      items?: Array<{
        tariff: {
          additional_fee_entries: Array<{ key: string; amount: number }>;
        };
      }>;
      tariff?: {
        additional_fee_entries: Array<{ key: string; amount: number }>;
      };
    };
  };
}

describe("AUTO-WIRE-001 official fare controller serialization", () => {
  it("keeps colliding opaque fee identifiers losslessly in list and get responses", async () => {
    const record = seed();
    record.tariff.additionalFees = fees;
    const f = fixture([record]);
    const list = await officialWire(await f.controller.list());
    const get = await officialWire(
      await f.controller.get(record.tariff.version),
    );
    const entries = Object.entries(fees).map(([key, amount]) => ({
      key,
      amount,
    }));
    expect(list.data.items?.[0]?.tariff.additional_fee_entries).toEqual(
      entries,
    );
    expect(get.data.tariff?.additional_fee_entries).toEqual(entries);
    expect(f.state().records[0]?.tariff.additionalFees).toEqual(fees);
  });

  it("returns lossless fees after a real controller command without changing the stored authority", async () => {
    const f = fixture();
    const input = command("wire-draft");
    input.tariff.additionalFees = fees;
    const result = await officialWire(
      await f.controller.create(input, identity, "wire-create"),
    );
    expect(result.data.fare_version_id).toBe("wire-draft");
    expect(result.data.tariff?.additional_fee_entries).toEqual(
      Object.entries(fees).map(([key, amount]) => ({ key, amount })),
    );
    expect(
      f.state().records.find((row) => row.tariff.version === "wire-draft")
        ?.tariff.additionalFees,
    ).toEqual(fees);
    expect(
      f
        .state()
        .records.find((row) => row.tariff.version === seed().tariff.version),
    ).toEqual(seed());
  });
});
