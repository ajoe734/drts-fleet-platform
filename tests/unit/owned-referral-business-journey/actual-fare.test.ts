import { describe, expect, it } from "vitest";
import {
  assertCompletedFare,
  simulationCompletion,
} from "../../e2e/owned-referral-business-journey/protocol";

function example() {
  const command = simulationCompletion(
    { fixedPrice: false, proofRequirements: { minPhotoCount: 1 } },
    "data:image/png;base64,c3ludGhldGlj",
  );
  return {
    command,
    task: {
      fare: { ...command.fare },
      actualFareBreakdown: { ...command.actualFareBreakdown },
    },
    history: { fareTotal: 120 },
    receipt: {
      totalFare: 120,
      formattedTotal: "NT$ 120",
      fareBase: 85,
      fareDistance: 30,
      fareTime: 5,
      fareNight: 0,
      paymentChannel: "付款及結算狀態未提供",
    },
    txt: "Base Fare: NT$ 85\nDistance Fare: NT$ 30\nTime Fare: NT$ 5\nNight Fare: NT$ 0\nTOTAL FARE: NT$ 120\n",
  };
}
describe("completed actual fare propagates through canonical readbacks", () => {
  it("accepts actual minor units and the corresponding major-unit history, receipt and TXT", () => {
    const x = example();
    expect(() =>
      assertCompletedFare(x.command, x.task, x.history, x.receipt, x.txt),
    ).not.toThrow();
  });
  it("rejects task amounts, components, currencies and inconsistent Driver commands", () => {
    for (const change of [
      (x: ReturnType<typeof example>) => {
        x.task.fare.amountMinor = 29000;
      },
      (x: ReturnType<typeof example>) => {
        x.task.fare.currency = "USD";
      },
      (x: ReturnType<typeof example>) => {
        x.task.actualFareBreakdown.distanceMinor = 2900;
      },
      (x: ReturnType<typeof example>) => {
        x.command.fare.amountMinor = 13000;
        x.task.fare.amountMinor = 13000;
      },
    ]) {
      const x = example();
      change(x);
      expect(() =>
        assertCompletedFare(x.command, x.task, x.history, x.receipt, x.txt),
      ).toThrow("canonical Driver actual fare");
    }
  });
  it("rejects estimated, missing or minor-unit history amounts", () => {
    for (const amount of [290, 1500, 12000, undefined]) {
      const x = example();
      expect(() =>
        assertCompletedFare(
          x.command,
          x.task,
          { fareTotal: amount },
          x.receipt,
          x.txt,
        ),
      ).toThrow("history actual fare");
    }
  });
  it("rejects receipt total, breakdown, formatting or an unsupported paid assertion", () => {
    for (const patch of [
      { totalFare: 290 },
      { fareBase: 120 },
      { fareDistance: 31 },
      { fareTime: 0 },
      { fareNight: 20 },
      { formattedTotal: "NT$ 290" },
      { paymentChannel: "paid" },
    ]) {
      const x = example();
      expect(() =>
        assertCompletedFare(
          x.command,
          x.task,
          x.history,
          { ...x.receipt, ...patch },
          x.txt,
        ),
      ).toThrow("receipt actual fare");
    }
  });
  it("checks exact downloaded lines, rejecting estimated totals or omitted components", () => {
    for (const [before, after] of [
      ["TOTAL FARE: NT$ 120", "TOTAL FARE: NT$ 290"],
      ["Distance Fare: NT$ 30", ""],
      ["Base Fare: NT$ 85", "Base Fare: NT$ 850"],
    ]) {
      const x = example();
      expect(() =>
        assertCompletedFare(
          x.command,
          x.task,
          x.history,
          x.receipt,
          x.txt.replace(before!, after!),
        ),
      ).toThrow("downloaded TXT actual fare");
    }
  });
});
