// @vitest-environment jsdom
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import type { FleetPartnerStatementRecord } from "@drts/contracts";
import * as canvas from "../../../packages/ui-web/src/index";
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";

type Row = {
  id: string;
  period: string;
  trips: number;
  payable: string;
  status: "pending_confirm" | "paid";
  issued: string;
} & Pick<
  FleetPartnerStatementRecord,
  | "decisionStatus"
  | "confirmedAt"
  | "confirmedBy"
  | "confirmNote"
  | "disputedAt"
  | "disputedBy"
  | "disputeReason"
  | "disputeCaseId"
>;
const baseRecord = {
  statementId: "fst-real-27",
  fleetPartnerId: "fleet-unit",
  periodMonth: "2026-10",
  payoutStatus: "pending",
  shareAmount: { currency: "TWD", amountMinor: 840000 },
  reimbursementAmount: null,
  sponsorFundedTripCount: 0,
  createdAt: "2026-10-01T00:00:00Z",
  lines: [],
  decisionStatus: "unreviewed",
};
function harness(overrides: Record<string, unknown> = {}) {
  const appRoot = resolve("apps/fleet-partner-portal-web");
  const record = { ...baseRecord, ...overrides };
  const listFleetPortalStatements = vi
    .fn()
    .mockImplementation(async () => [record]);
  const confirmFleetPartnerStatement = vi.fn().mockImplementation(async () => ({
    ...record,
    decisionStatus: "confirmed",
    confirmedAt: "2026-10-13T09:00:00Z",
    confirmedBy: "fleet-reviewer",
    confirmNote: null,
  }));
  const disputeFleetPartnerStatement = vi.fn().mockImplementation(async () => ({
    ...record,
    decisionStatus: "disputed",
    disputedAt: "2026-10-13T09:10:00Z",
    disputedBy: "fleet-reviewer",
    disputeReason: "Actual disputed amount",
    disputeCaseId: "case /27",
  }));
  const client = {
    listFleetPortalStatements,
    confirmFleetPartnerStatement,
    disputeFleetPartnerStatement,
  };
  const refresh = vi.fn();
  const revalidatePath = vi.fn();
  const load = createUiModuleLoader(appRoot, {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "@drts/ui-web": canvas,
    "server-only": {},
    "./api-client.server": {
      getServerFleetPartnerClient: async () => ({
        client,
        fleetPartnerId: "fleet-unit",
      }),
    },
    "../../lib/api-client.server": {
      getServerFleetPartnerClient: async () => ({
        client,
        fleetPartnerId: "fleet-unit",
      }),
    },
    "next/navigation": {
      useRouter: () => ({ refresh }),
      useSearchParams: () =>
        new URLSearchParams("locale=en&fleetPartnerId=fleet-unit"),
      notFound: () => {
        throw new Error("not_found");
      },
    },
    "next/cache": { revalidatePath },
    "@/lib/server-locale": { getServerLocale: async () => "en" },
  });
  const data = load<{
    loadStatements: () => Promise<{ rows: Row[]; source: string }>;
    loadStatementDetail: (id: string) => Promise<{ statement: Row | null }>;
  }>(resolve(appRoot, "lib/fleet-portal-data.server.ts"));
  const { FleetStatementActions, StatementDecisionNote } = load<{
    FleetStatementActions: React.ComponentType<{
      fleetPartnerId: string;
      statement: Row;
      available?: boolean;
    }>;
    StatementDecisionNote: React.ComponentType<{ statement: Row }>;
  }>(resolve(appRoot, "components/fleet-statement-actions.tsx"));
  const { StatementsTable } = load<{
    StatementsTable: React.ComponentType<{
      fleetPartnerId: string;
      rows: Row[];
      available?: boolean;
    }>;
  }>(resolve(appRoot, "components/portal-tables.tsx"));
  const { LanguageProvider } = load<{
    LanguageProvider: React.ComponentType<{
      children: React.ReactNode;
      defaultLocale: "en";
    }>;
  }>(resolve(appRoot, "lib/i18n.tsx"));
  const actions = load<{
    submitStatementDecision: (
      id: string,
      decision: "confirmed" | "disputed",
      text: string,
    ) => Promise<{ ok: boolean; error?: string }>;
  }>(resolve(appRoot, "app/statements/actions.ts"));
  const banner = load<{
    resolveStatementBannerState: (row: Row | null) => string;
  }>(resolve(appRoot, "app/revenue/statement-banner.ts"));
  const detailPage = load<{
    default: (props: {
      params: Promise<{ id: string }>;
    }) => Promise<React.ReactElement>;
  }>(resolve(appRoot, "app/statements/[id]/page.tsx")).default;
  const wrap = (element: React.ReactElement) =>
    render(<LanguageProvider defaultLocale="en">{element}</LanguageProvider>);
  const mount = async (available = true) => {
    const { rows } = await data.loadStatements();
    const row = rows[0]!;
    return wrap(
      <>
        <FleetStatementActions
          fleetPartnerId="fleet-unit"
          statement={row}
          available={available}
        />
        <StatementDecisionNote statement={row} />
      </>,
    );
  };
  const mountTable = async () => {
    const { rows } = await data.loadStatements();
    return wrap(<StatementsTable fleetPartnerId="fleet-unit" rows={rows} />);
  };
  return {
    mountTable,
    data,
    client,
    refresh,
    revalidatePath,
    mount,
    wrap,
    detailPage,
    actions,
    banner,
    record,
  };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("fleet statement decisions: production UI, server action and read mapping", () => {
  it("ignores legacy browser decisions and confirms with an optional empty note through the server", async () => {
    localStorage.setItem(
      "drts:fleet-partner-portal:statements:fleet-unit",
      JSON.stringify({
        "fst-real-27": {
          decision: "disputed",
          requestedAt: "old",
          reason: "Browser fake",
        },
      }),
    );
    const h = harness();
    vi.spyOn(window, "prompt").mockReturnValue("");
    await h.mount();
    expect(screen.queryByText("Browser fake")).toBeNull();
    expect(screen.getByRole("button", { name: "Confirm" })).toHaveProperty(
      "disabled",
      false,
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await screen.findByText(
      /Confirmed · 2026-10-13 09:00:00Z · fleet-reviewer/,
    );
    expect(
      h.client.confirmFleetPartnerStatement,
    ).toHaveBeenCalledExactlyOnceWith("fst-real-27", {});
    expect(h.client.disputeFleetPartnerStatement).not.toHaveBeenCalled();
    expect(h.refresh).toHaveBeenCalledTimes(1);
    expect(h.revalidatePath.mock.calls.flat()).toEqual([
      "/statements",
      "/statements/fst-real-27",
      "/revenue",
    ]);
    expect(screen.getByRole("button", { name: /^Confirm/ })).toHaveProperty(
      "disabled",
      true,
    );
    expect(
      screen.getByRole("button", { name: /^Raise dispute/ }),
    ).toHaveProperty("disabled", true);
    expect(
      localStorage.getItem("drts:fleet-partner-portal:statements:fleet-unit"),
    ).toContain("Browser fake");
  });

  it("requires a nonblank dispute reason, then displays the server reason and existing case link", async () => {
    const h = harness();
    vi.spyOn(window, "prompt")
      .mockReturnValueOnce("   ")
      .mockReturnValueOnce(" Actual disputed amount ");
    await h.mount();
    fireEvent.click(screen.getByRole("button", { name: "Raise dispute" }));
    expect(screen.getByRole("alert").textContent).toBe(
      "A dispute reason is required.",
    );
    expect(h.client.disputeFleetPartnerStatement).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Raise dispute" }));
    const link = await screen.findByRole("link", {
      name: "View dispute case case /27",
    });
    expect(link.getAttribute("href")).toBe(
      "/cases/case%20%2F27?locale=en&fleetPartnerId=fleet-unit",
    );
    expect(screen.getByText("Actual disputed amount")).toBeTruthy();
    expect(
      h.client.disputeFleetPartnerStatement,
    ).toHaveBeenCalledExactlyOnceWith("fst-real-27", {
      reason: "Actual disputed amount",
    });
    expect(h.revalidatePath).toHaveBeenCalledWith("/cases/case%20%2F27");
  });

  it("also rejects a blank dispute at the server-action boundary without sending the mutation", async () => {
    const h = harness();
    expect(
      await h.actions.submitStatementDecision("fst-real-27", "disputed", "\n "),
    ).toEqual({ ok: false, error: "STATEMENT_DISPUTE_REASON_REQUIRED" });
    expect(h.client.disputeFleetPartnerStatement).not.toHaveBeenCalled();
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });

  it("keeps both actions pending until the backend responds; failure is visible and retry retains its note", async () => {
    const h = harness();
    let reject!: (error: Error) => void;
    h.client.confirmFleetPartnerStatement.mockImplementationOnce(
      () =>
        new Promise((_, rejectPromise) => {
          reject = rejectPromise;
        }),
    );
    const prompt = vi
      .spyOn(window, "prompt")
      .mockReturnValue(" Reconciled all rows ");
    await h.mount();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(h.client.confirmFleetPartnerStatement).toHaveBeenCalledTimes(1),
    );
    expect(screen.getByRole("button", { name: "Confirm" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(
      screen.getByRole("button", { name: "Raise dispute" }),
    ).toHaveProperty("disabled", true);
    reject(new Error("Statement service unavailable"));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Statement service unavailable",
    );
    expect(h.refresh).not.toHaveBeenCalled();
    expect(h.revalidatePath).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Confirm" })).toHaveProperty(
        "disabled",
        false,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(h.refresh).toHaveBeenCalledTimes(1));
    expect(prompt.mock.calls[1]?.[1]).toBe(" Reconciled all rows ");
    expect(h.client.confirmFleetPartnerStatement).toHaveBeenNthCalledWith(
      2,
      "fst-real-27",
      { note: "Reconciled all rows" },
    );
  });

  it.each([
    { payoutStatus: "paid", decisionStatus: "unreviewed", expected: "paid" },
    {
      decisionStatus: "confirmed",
      confirmNote: "Previously saved",
      expected: "confirmed",
    },
    {
      decisionStatus: "disputed",
      disputeReason: "Previously disputed",
      disputeCaseId: "case-saved",
      expected: "disputed",
    },
  ])(
    "readback for $expected disables terminal actions and drives the revenue banner",
    async ({ expected, ...record }) => {
      const h = harness(record);
      await h.mount();
      expect(screen.getByRole("button", { name: /^Confirm/ })).toHaveProperty(
        "disabled",
        true,
      );
      expect(
        screen.getByRole("button", { name: /^Raise dispute/ }),
      ).toHaveProperty("disabled", true);
      const { rows } = await h.data.loadStatements();
      expect(h.banner.resolveStatementBannerState(rows[0]!)).toBe(expected);
      expect(
        (await h.data.loadStatementDetail("fst-real-27")).statement,
      ).toMatchObject({ decisionStatus: record.decisionStatus });
      expect(h.client.confirmFleetPartnerStatement).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["confirmed", "Confirmed"],
    ["disputed", "Disputed"],
  ])(
    "statement table status reflects %s and never still asks for confirmation",
    async (decisionStatus, label) => {
      const h = harness({ decisionStatus });
      await h.mountTable();
      expect(
        screen.getAllByText(label, { exact: true }).length,
      ).toBeGreaterThan(0);
      expect(screen.queryByText("Pending confirm", { exact: true })).toBeNull();
    },
  );

  it("renders durable notes and case linkage on a newly loaded detail page", async () => {
    const h = harness({
      decisionStatus: "disputed",
      disputedAt: "2026-10-13T09:10:00Z",
      disputedBy: "actor-from-db",
      disputeReason: "Saved on another device",
      disputeCaseId: "case-db",
    });
    h.wrap(
      await h.detailPage({ params: Promise.resolve({ id: "fst-real-27" }) }),
    );
    expect(screen.getByText("Saved on another device")).toBeTruthy();
    expect(screen.getByText("Disputed", { exact: true })).toBeTruthy();
    expect(screen.queryByText("Pending confirm")).toBeNull();
    expect(screen.getByText(/actor-from-db/)).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "View dispute case case-db" })
        .getAttribute("href"),
    ).toBe("/cases/case-db?locale=en&fleetPartnerId=fleet-unit");
    expect(screen.queryByText(/not wired to a real backend/)).toBeNull();
  });

  it("disables mutations for fixture fallback rows when the live read fails", async () => {
    const h = harness();
    h.client.listFleetPortalStatements.mockRejectedValue(
      new Error("DB offline"),
    );
    const view = await h.data.loadStatements();
    expect(view.source).toBe("fallback");
    await h.mount(view.source === "live");
    expect(screen.getByRole("button", { name: /^Confirm/ })).toHaveProperty(
      "disabled",
      true,
    );
    expect(
      screen.getByRole("button", { name: /^Raise dispute/ }),
    ).toHaveProperty("disabled", true);
    expect(h.client.confirmFleetPartnerStatement).not.toHaveBeenCalled();
  });

  it("downloads the real CSV endpoint with the loaded statement ID and existing context", async () => {
    const h = harness();
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push(this.getAttribute("href")!);
    });
    await h.mount();
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(downloads).toEqual([
      "/statements/export?locale=en&fleetPartnerId=fleet-unit&statementId=fst-real-27",
    ]);
    expect(document.querySelector("a[download]")).toBeNull();
    expect(h.client.confirmFleetPartnerStatement).not.toHaveBeenCalled();
  });
});
