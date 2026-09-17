import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/demo-tenants", () => ({ BANK_DEMO_TENANTS: {} }));
vi.mock("@/lib/translations", () => ({ t: (key: string) => key }));

import {
  canViewSettlementAmounts,
  resolveServerSessionRole,
  signSessionRole,
} from "../../../apps/bank-console-web/lib/session";

describe("scratch import check", () => {
  it("imports session.ts fine", () => {
    expect(canViewSettlementAmounts("bank_finance")).toBe(true);
  });
});
