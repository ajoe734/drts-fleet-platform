// @vitest-environment jsdom
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import type {
  MultiTaxiFareManagementList,
  MultiTaxiManagedFareVersion,
} from "@drts/contracts";
import * as canvas from "../../../packages/ui-web/src/index";
import {
  t as translate,
  type Locale,
} from "../../../apps/platform-admin-web/lib/translations";
import { ApiClient } from "../../../packages/api-client/src/index";
import { identity } from "./backend-fixture";
import {
  opaqueFees,
  unavailableError,
  wireCommand,
  wireHarness,
} from "./wire-harness";
import { demoFareList } from "../../../apps/platform-admin-web/app/platform-admin/p5/fares/fare-management-model";
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";

const appRoot = resolve("apps/platform-admin-web");
const client = {
  listPlatformFareVersions: vi.fn(),
  createPlatformFareVersion: vi.fn(),
  updatePlatformFareVersion: vi.fn(),
  recordPlatformFareVersionFiling: vi.fn(),
  schedulePlatformFareVersion: vi.fn(),
  retirePlatformFareVersion: vi.fn(),
};
let activeClient: typeof client | ApiClient = client;
let scopes: string[];
let locale: Locale;
const tt = (key: string, params?: Record<string, string | number>) =>
  translate(key, locale, params);
const load = createUiModuleLoader(appRoot, {
  react: React,
  "react/jsx-runtime": jsxRuntime,
  "@drts/ui-web": canvas,
  "@/lib/admin-client": { usePlatformAdminClient: () => activeClient },
  "@/lib/platform-admin-authority": {
    usePlatformAdminAuthority: () => ({ scopes }),
  },
  "@/lib/i18n": { useTranslation: () => ({ locale, t: tt }) },
});
const { PublicFareManagement } = load<{
  PublicFareManagement: React.ComponentType;
}>(resolve(appRoot, "app/platform-admin/p5/fares/public-fare-management.tsx"));
const { P5AdminConsole } = load<{
  P5AdminConsole: React.ComponentType<{ view: "fares" }>;
}>(resolve(appRoot, "app/platform-admin/p5/p5-admin-console.tsx"));
const at = "2026-10-13T00:00:00.000Z";
function record(
  id = "official-current",
  status: MultiTaxiManagedFareVersion["status"] = "active",
): MultiTaxiManagedFareVersion {
  const value = demoFareList(at).items[0]!;
  return {
    ...value,
    fareVersionId: id,
    displayName: id,
    publicSummary: "Actual published source",
    sourceReference: "operator-source",
    status,
    revision: 7,
    effectiveFrom:
      status === "active" ? value.effectiveFrom : "2026-11-01T00:00:00.000Z",
    availableActions: {
      edit: status === "draft",
      file: status === "draft",
      schedule: status === "filed",
      retire: status === "draft" || status === "filed",
    },
    retirementBlockedReason:
      status === "active" ? "replacement_required" : null,
  };
}
function list(
  ...items: MultiTaxiManagedFareVersion[]
): MultiTaxiFareManagementList {
  return {
    items,
    evaluatedAt: at,
    activeFareVersionId:
      items.find((item) => item.status === "active")?.fareVersionId ?? null,
  };
}
function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(tt(label)), { target: { value } });
}
function button(key: string) {
  return screen.getByRole("button", {
    name: new RegExp(`${tt(key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
  });
}
async function loaded() {
  await waitFor(() =>
    expect(screen.queryByText(tt("fareManage.loading"))).toBeNull(),
  );
}
function choose(id: string) {
  fireEvent.click(
    within(screen.getByRole("row", { name: new RegExp(id) })).getByRole(
      "button",
    ),
  );
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.resetAllMocks();
  activeClient = client;
  scopes = ["foundation:read", "foundation:write"];
  locale = "en";
  client.listPlatformFareVersions.mockResolvedValue(list(record()));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("actual P5 fare page and interactions", () => {
  it("opens the actual fare view with existing foundation read scope", async () => {
    scopes = ["foundation:read"];
    render(<P5AdminConsole view="fares" />);
    await loaded();
    expect(client.listPlatformFareVersions).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText("official-current").length).toBeGreaterThan(0);
    expect((button("p5.fares.create") as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByText(/NT\$85 \/ 1250 m/)).toBeTruthy();
    expect(screen.getByText(/NT\$20 · 23:00–06:00/)).toBeTruthy();
    expect(screen.queryByText(/北市交運字/)).toBeNull();
  });

  it("does not substitute registry permission for the existing fare read permission", async () => {
    scopes = ["reg.read", "reg.review"];
    render(<P5AdminConsole view="fares" />);
    expect(client.listPlatformFareVersions).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: tt("fareManage.enterDemo") }),
    ).toBeNull();
  });

  it("keeps a truly empty list empty and requires explicit rates for its first draft", async () => {
    client.listPlatformFareVersions.mockResolvedValue(list());
    render(<PublicFareManagement />);
    await loaded();
    expect(screen.getByText(tt("fareManage.empty"))).toBeTruthy();
    fireEvent.click(button("p5.fares.create"));
    expect(
      (
        screen.getByLabelText(
          tt("fareManage.field.baseFare"),
        ) as HTMLInputElement
      ).value,
    ).toBe("");
    expect(
      (
        screen.getByLabelText(
          tt("fareManage.field.nightSurchargeAmount"),
        ) as HTMLInputElement
      ).value,
    ).toBe("");
    expect(client.createPlatformFareVersion).not.toHaveBeenCalled();
  });

  it("shows read failure, disables official writes, then retries the real list", async () => {
    client.listPlatformFareVersions.mockRejectedValueOnce(new Error("offline"));
    render(<PublicFareManagement />);
    await loaded();
    expect(screen.getByText(tt("fareManage.loadError"))).toBeTruthy();
    expect(screen.queryByText("demo-current")).toBeNull();
    expect((button("p5.fares.create") as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(button("fareManage.retry"));
    await loaded();
    expect(client.listPlatformFareVersions).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(tt("fareManage.loadError"))).toBeNull();
    expect((button("p5.fares.create") as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("clones all fees and rules, converts Taiwan time once, and uses actual saved readback", async () => {
    const current = record();
    current.tariff.additionalFees = { Airport_Fee: 35, "night-fee": 20 };
    client.listPlatformFareVersions.mockResolvedValueOnce(list(current));
    const saved = {
      ...record("new-id", "draft"),
      displayName: "New proposal",
      tariff: current.tariff,
    };
    client.createPlatformFareVersion.mockResolvedValue(saved);
    client.listPlatformFareVersions.mockResolvedValue(list(saved, current));
    render(<PublicFareManagement />);
    await loaded();
    fireEvent.click(button("p5.fares.create"));
    change("fareManage.field.fareVersionId", "new-id");
    change("fareManage.field.displayName", "New proposal");
    change("fareManage.field.effectiveLocal", "2026-11-01T08:15");
    fireEvent.click(button("fareManage.saveDraft"));
    await screen.findByText(tt("fareManage.saved"));
    expect(client.createPlatformFareVersion.mock.calls[0]![0]).toMatchObject({
      fareVersionId: "new-id",
      effectiveFrom: "2026-11-01T00:15:00.000Z",
      tariff: current.tariff,
    });
    expect(client.createPlatformFareVersion.mock.calls[0]![1]).toMatch(
      /[a-f0-9-]{36}/,
    );
    expect(
      screen.queryByLabelText(tt("fareManage.field.fareVersionId")),
    ).toBeNull();
    expect(screen.getAllByText("new-id").length).toBeGreaterThan(0);
  });

  it("reuses one key for an unchanged failed intent and changes it when the body changes", async () => {
    client.listPlatformFareVersions.mockResolvedValue(
      list(record("draft", "draft")),
    );
    client.updatePlatformFareVersion.mockRejectedValue({
      code: "fare_management_unavailable",
    });
    render(<PublicFareManagement />);
    await loaded();
    fireEvent.click(button("fareManage.edit"));
    change("fareManage.field.baseFare", "95");
    fireEvent.click(button("fareManage.saveDraft"));
    await screen.findByText(tt("fareManage.saveError"));
    fireEvent.click(button("fareManage.saveDraft"));
    await waitFor(() =>
      expect(client.updatePlatformFareVersion).toHaveBeenCalledTimes(2),
    );
    await screen.findByText(tt("fareManage.saveError"));
    change("fareManage.field.baseFare", "100");
    fireEvent.click(button("fareManage.saveDraft"));
    await waitFor(() =>
      expect(client.updatePlatformFareVersion).toHaveBeenCalledTimes(3),
    );
    const calls = client.updatePlatformFareVersion.mock.calls;
    expect(calls[0]![2]).toBe(calls[1]![2]);
    expect(calls[2]![2]).not.toBe(calls[1]![2]);
    expect(calls[2]![1].tariff.baseFare).toBe(100);
  });

  it("keeps entered fields and the edit base revision after a conflict and manual refresh", async () => {
    const draft = record("draft", "draft");
    client.listPlatformFareVersions
      .mockResolvedValueOnce(list(draft))
      .mockResolvedValue(list({ ...draft, revision: 9 }));
    client.updatePlatformFareVersion.mockRejectedValue({
      code: "fare_revision_conflict",
    });
    render(<PublicFareManagement />);
    await loaded();
    fireEvent.click(button("fareManage.edit"));
    change("fareManage.field.baseFare", "110");
    fireEvent.click(button("fareManage.saveDraft"));
    await screen.findByText(tt("fareManage.revisionError"));
    fireEvent.click(button("fareManage.refresh"));
    await loaded();
    expect(
      (
        screen.getByLabelText(
          tt("fareManage.field.baseFare"),
        ) as HTMLInputElement
      ).value,
    ).toBe("110");
    fireEvent.click(button("fareManage.saveDraft"));
    await waitFor(() =>
      expect(client.updatePlatformFareVersion).toHaveBeenCalledTimes(2),
    );
    expect(
      client.updatePlatformFareVersion.mock.calls[1]![1].expectedRevision,
    ).toBe(7);
    expect(client.updatePlatformFareVersion.mock.calls[1]![2]).toBe(
      client.updatePlatformFareVersion.mock.calls[0]![2],
    );
  });

  it("reports committed save plus read failure and retains the returned saved record", async () => {
    const draft = record("draft", "draft");
    const saved = {
      ...draft,
      displayName: "Server committed name",
      revision: 8,
    };
    client.listPlatformFareVersions
      .mockResolvedValueOnce(list(draft))
      .mockRejectedValueOnce(new Error("read unavailable"))
      .mockResolvedValue(list(saved));
    client.updatePlatformFareVersion.mockResolvedValue(saved);
    render(<PublicFareManagement />);
    await loaded();
    fireEvent.click(button("fareManage.edit"));
    change("fareManage.field.displayName", saved.displayName);
    fireEvent.click(button("fareManage.saveDraft"));
    await screen.findByText(tt("fareManage.saved"));
    expect(screen.getByText(tt("fareManage.savedReadError"))).toBeTruthy();
    expect(screen.getByText(saved.displayName)).toBeTruthy();
    expect(screen.queryByText(tt("fareManage.saveError"))).toBeNull();
    expect((button("fareManage.edit") as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(button("fareManage.retry"));
    await loaded();
    expect(client.updatePlatformFareVersion).toHaveBeenCalledTimes(1);
    expect((button("fareManage.edit") as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("records supplied real filing metadata and schedules a filed version without activating it early", async () => {
    const current = record();
    const draft = record("proposal", "draft");
    const filed = {
      ...record("proposal", "filed"),
      revision: 8,
      authorityFilingRef: "actual-reference",
      filingEvidenceReference: "actual-evidence",
      filedBy: "operator",
      filedAt: at,
    };
    const scheduled = {
      ...filed,
      revision: 9,
      publicationScheduled: true,
      scheduledFor: "2026-11-01T00:00:00.000Z",
      availableActions: {
        edit: false,
        file: false,
        schedule: false,
        retire: false,
      },
      retirementBlockedReason: "replacement_required" as const,
    };
    client.listPlatformFareVersions
      .mockResolvedValueOnce(list(current, draft))
      .mockResolvedValueOnce(list(current, filed))
      .mockResolvedValue(list(current, scheduled));
    client.recordPlatformFareVersionFiling.mockResolvedValue(filed);
    client.schedulePlatformFareVersion.mockResolvedValue(scheduled);
    render(<PublicFareManagement />);
    await loaded();
    choose("proposal");
    change("p5.fares.col.filingRef", "actual-reference");
    change("fareManage.evidence", "actual-evidence");
    fireEvent.click(button("fareManage.recordFiling"));
    await screen.findByText(tt("fareManage.saved"));
    expect(
      client.recordPlatformFareVersionFiling.mock.calls[0]!.slice(0, 2),
    ).toEqual([
      "proposal",
      {
        expectedRevision: 7,
        authorityFilingRef: "actual-reference",
        filingEvidenceReference: "actual-evidence",
      },
    ]);
    expect(screen.getByText("actual-evidence")).toBeTruthy();
    change("fareManage.field.effectiveLocal", "2026-11-01T08:00");
    fireEvent.click(
      screen.getAllByRole("button", { name: tt("p5.fares.schedule") }).at(-1)!,
    );
    await waitFor(() =>
      expect(client.schedulePlatformFareVersion).toHaveBeenCalledTimes(1),
    );
    await loaded();
    expect(client.schedulePlatformFareVersion.mock.calls[0]![1]).toEqual({
      expectedRevision: 8,
      effectiveFrom: "2026-11-01T00:00:00.000Z",
    });
    expect(screen.getByText(/not active yet/)).toBeTruthy();
    expect(
      within(screen.getByRole("row", { name: /official-current/ })).getByText(
        tt("p5.status.active"),
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: tt("fareManage.activateNow") }),
    ).toBeNull();
  });

  it("sends null for immediate database-time activation and a real retirement reason", async () => {
    const filed = record("filed", "filed");
    client.listPlatformFareVersions.mockResolvedValue(list(filed));
    client.schedulePlatformFareVersion.mockRejectedValue({
      code: "fare_effective_time_conflict",
    });
    client.retirePlatformFareVersion.mockResolvedValue({
      ...filed,
      status: "retired",
      availableActions: {
        edit: false,
        file: false,
        schedule: false,
        retire: false,
      },
    });
    render(<PublicFareManagement />);
    await loaded();
    fireEvent.click(button("fareManage.activateNow"));
    await screen.findByText(tt("fareManage.timeError"));
    expect(client.schedulePlatformFareVersion.mock.calls[0]![1]).toEqual({
      expectedRevision: 7,
      effectiveFrom: null,
    });
    change("fareManage.retireReason", "Withdraw proposal");
    fireEvent.click(button("fareManage.retire"));
    await screen.findByText(tt("fareManage.saved"));
    expect(client.retirePlatformFareVersion.mock.calls[0]![1]).toEqual({
      expectedRevision: 7,
      reason: "Withdraw proposal",
    });
  });

  it("isolates the full skip-filing demo, future clock, retirement and reset from official writes", async () => {
    scopes = ["foundation:read"];
    render(<PublicFareManagement />);
    await loaded();
    fireEvent.click(button("fareManage.enterDemo"));
    expect(screen.getByText(tt("fareManage.demoNotice"))).toBeTruthy();
    fireEvent.click(button("p5.fares.create"));
    change("fareManage.field.fareVersionId", "demo-proposal");
    change("fareManage.field.displayName", "Demo proposal");
    change("fareManage.field.publicSummary", "Demo only");
    change("fareManage.field.effectiveLocal", "2099-11-01T08:00");
    fireEvent.click(button("fareManage.saveDraft"));
    await screen.findByText(tt("fareManage.demoSaved"));
    fireEvent.click(button("fareManage.tryDemoFiling"));
    expect(screen.getByText(tt("fareManage.filingUnavailable"))).toBeTruthy();
    fireEvent.click(button("fareManage.tryDemoFiling"));
    fireEvent.click(button("fareManage.skipFiling"));
    await screen.findByText(tt("fareManage.demoSaved"));
    fireEvent.click(
      screen.getAllByRole("button", { name: tt("p5.fares.schedule") }).at(-1)!,
    );
    await screen.findByText(/not active yet/);
    fireEvent.click(button("fareManage.advanceDemo"));
    expect(
      within(screen.getByRole("row", { name: /demo-proposal/ })).getByText(
        tt("p5.status.active"),
      ),
    ).toBeTruthy();
    choose("demo-current");
    change("fareManage.retireReason", "Demo history");
    fireEvent.click(button("fareManage.retire"));
    await screen.findByText(tt("fareManage.demoSaved"));
    fireEvent.click(button("fareManage.resetDemo"));
    expect(screen.queryByText("Demo proposal")).toBeNull();
    fireEvent.click(button("fareManage.exitDemo"));
    await loaded();
    expect(screen.getAllByText("official-current").length).toBeGreaterThan(0);
    for (const [name, fn] of Object.entries(client))
      if (name !== "listPlatformFareVersions")
        expect(fn).not.toHaveBeenCalled();
    expect(client.listPlatformFareVersions).toHaveBeenCalledTimes(2);
  });

  it("discards old read responses across simulation mode and the next official read", async () => {
    const first = deferred<MultiTaxiFareManagementList>();
    const second = deferred<MultiTaxiFareManagementList>();
    client.listPlatformFareVersions
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    render(<PublicFareManagement />);
    fireEvent.click(button("fareManage.enterDemo"));
    fireEvent.click(button("fareManage.exitDemo"));
    await act(async () => {
      second.resolve(list(record("latest-official")));
    });
    await act(async () => {
      first.resolve(list(record("stale-official")));
    });
    expect(screen.getAllByText("latest-official").length).toBeGreaterThan(0);
    expect(screen.queryByText("stale-official")).toBeNull();
    expect(screen.queryByText("demo-current")).toBeNull();
  });

  it("does not let an in-flight save switch modes or submit twice", async () => {
    const saved = deferred<MultiTaxiManagedFareVersion>();
    const draft = record("draft", "draft");
    client.listPlatformFareVersions.mockResolvedValue(list(draft));
    client.updatePlatformFareVersion.mockReturnValue(saved.promise);
    render(<PublicFareManagement />);
    await loaded();
    fireEvent.click(button("fareManage.edit"));
    fireEvent.click(button("fareManage.saveDraft"));
    expect((button("fareManage.enterDemo") as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(button("fareManage.enterDemo"));
    fireEvent.click(button("fareManage.saving"));
    expect(client.updatePlatformFareVersion).toHaveBeenCalledTimes(1);
    await act(async () => {
      saved.resolve({ ...draft, revision: 8 });
    });
    await screen.findByText(tt("fareManage.saved"));
    expect(screen.queryByText(tt("fareManage.demoNotice"))).toBeNull();
  });

  it("renders Chinese editor and rules without exposing translation keys", async () => {
    locale = "zh";
    client.listPlatformFareVersions.mockResolvedValue(
      list(record("草稿", "draft")),
    );
    const rendered = render(<PublicFareManagement />);
    await loaded();
    fireEvent.click(button("fareManage.edit"));
    expect(screen.getByLabelText("夜間加收（每趟整數新臺幣）")).toBeTruthy();
    expect(
      screen.getByLabelText("生效時間 · 台灣時間（UTC+08:00）"),
    ).toBeTruthy();
    expect(rendered.container.textContent).not.toContain("fareManage.");
  });
});

describe("AUTO-WIRE-001 production serialized response -> actual fare component", () => {
  it("consumes the actual list and preserves every colliding fee through clone/create/readback/edit", async () => {
    const f = wireHarness();
    vi.stubGlobal("fetch", f.fetch);
    activeClient = new ApiClient({ baseUrl: "https://unit.invalid" });
    render(<PublicFareManagement />);
    await loaded();
    expect(screen.getByText(/NT\$85 \/ 1250 m/)).toBeTruthy();
    for (const name of Object.keys(opaqueFees))
      expect(screen.getByText(name)).toBeTruthy();
    fireEvent.click(button("p5.fares.create"));
    for (const [index, [name, amount]] of Object.entries(
      opaqueFees,
    ).entries()) {
      expect(
        (
          screen.getByLabelText(
            `${tt("fareManage.feeName")} ${index + 1}`,
          ) as HTMLInputElement
        ).value,
      ).toBe(name);
      expect(
        (
          screen.getByLabelText(
            `${tt("fareManage.feeAmount")} ${index + 1}`,
          ) as HTMLInputElement
        ).value,
      ).toBe(String(amount));
    }
    change("fareManage.field.fareVersionId", "wire-clone");
    change("fareManage.field.displayName", "Wire clone");
    change("fareManage.field.effectiveLocal", "2026-11-01T08:00");
    fireEvent.click(button("fareManage.saveDraft"));
    await screen.findByText(tt("fareManage.saved"));
    expect((await f.service.get("wire-clone")).tariff.additionalFees).toEqual(
      opaqueFees,
    );
    fireEvent.click(button("fareManage.edit"));
    change("fareManage.field.baseFare", "90");
    fireEvent.click(button("fareManage.saveDraft"));
    await screen.findByText(tt("fareManage.saved"));
    const saved = await f.service.get("wire-clone");
    expect(saved.tariff.baseFare).toBe(90);
    expect(saved.tariff.additionalFees).toEqual(opaqueFees);
    expect(Object.hasOwn(saved.tariff.additionalFees, "__proto__")).toBe(true);
    expect(
      f.requests
        .filter((request) => request.method !== "GET")
        .map((request) => request.method),
    ).toEqual(["POST", "PUT"]);
  });
});

describe("AUTO-WIRE-002 production exception filter -> SDK -> actual fare component", () => {
  it("shows actual revision conflict guidance and retains the original edit revision after reload", async () => {
    const f = wireHarness();
    const input = wireCommand("wire-draft");
    await f.controller.create(input, identity, "prepare");
    vi.stubGlobal("fetch", f.fetch);
    activeClient = new ApiClient({ baseUrl: "https://unit.invalid" });
    render(<PublicFareManagement />);
    await loaded();
    choose("wire-draft");
    fireEvent.click(button("fareManage.edit"));
    const { fareVersionId: _id, ...body } = input;
    void _id;
    await f.controller.update(
      input.fareVersionId,
      { ...body, expectedRevision: 1, displayName: "Concurrent update" },
      identity,
      "another-editor",
    );
    change("fareManage.field.baseFare", "95");
    fireEvent.click(button("fareManage.saveDraft"));
    await screen.findByText(tt("fareManage.revisionError"));
    expect(
      (
        screen.getByLabelText(
          tt("fareManage.field.baseFare"),
        ) as HTMLInputElement
      ).value,
    ).toBe("95");
    fireEvent.click(button("fareManage.refresh"));
    await loaded();
    fireEvent.click(button("fareManage.saveDraft"));
    await screen.findByText(tt("fareManage.revisionError"));
    const attempts = f.requests.filter((request) => request.method === "PUT");
    expect(attempts).toHaveLength(2);
    expect(attempts[1]!.key).toBe(attempts[0]!.key);
    expect(attempts[1]!.body).toMatchObject({ expectedRevision: 1 });
    expect((await f.service.get(input.fareVersionId)).displayName).toBe(
      "Concurrent update",
    );
  });

  it("keeps the entered draft through actual 503 and retries the same intent through the real SDK", async () => {
    const f = wireHarness();
    const input = wireCommand("wire-draft");
    await f.controller.create(input, identity, "prepare");
    vi.stubGlobal("fetch", f.fetch);
    activeClient = new ApiClient({ baseUrl: "https://unit.invalid" });
    render(<PublicFareManagement />);
    await loaded();
    choose("wire-draft");
    fireEvent.click(button("fareManage.edit"));
    change("fareManage.field.baseFare", "95");
    f.failNext(unavailableError());
    fireEvent.click(button("fareManage.saveDraft"));
    await screen.findByText(tt("fareManage.saveError"));
    expect(
      (
        screen.getByLabelText(
          tt("fareManage.field.baseFare"),
        ) as HTMLInputElement
      ).value,
    ).toBe("95");
    fireEvent.click(button("fareManage.saveDraft"));
    await screen.findByText(tt("fareManage.saved"));
    const attempts = f.requests.filter((request) => request.method === "PUT");
    expect(attempts).toHaveLength(2);
    expect(attempts[1]!.key).toBe(attempts[0]!.key);
    expect(attempts[1]!.body).toEqual(attempts[0]!.body);
    expect((await f.service.get(input.fareVersionId)).tariff.baseFare).toBe(95);
  });
});
