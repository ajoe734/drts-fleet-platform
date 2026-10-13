// @vitest-environment jsdom
import { createElement } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantPassengerRecord } from "@drts/contracts";
import PassengersPage from "../../../apps/tenant-console-web/app/passengers/page";
import { savePassengerAction } from "../../../apps/tenant-console-web/app/passengers/actions";
import {
  getPageActions,
  getPassengerActions,
} from "../../../apps/tenant-console-web/app/passengers/passenger-actions";
import { PassengerActionControl } from "../../../apps/tenant-console-web/app/passengers/passenger-action-control";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  upsert: vi.fn(),
  revalidate: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("../../../apps/tenant-console-web/lib/api-client", () => ({
  getTenantClient: async () => ({
    listPassengers: mocks.list,
    upsertPassenger: mocks.upsert,
  }),
}));
vi.mock("../../../apps/tenant-console-web/lib/server-locale", () => ({
  getServerLocale: async () => "en",
}));

const passenger: TenantPassengerRecord = {
  passengerId: "passenger_1",
  tenantId: "tenant_1",
  fullName: "Demo Passenger",
  employeeNo: "EMP-1",
  departmentName: "Office",
  mobile: "0900000000",
  email: "passenger@example.test",
  roles: ["employee", "vip"],
  activeFlag: true,
  metadata: { consentVersion: "v1" },
  createdAt: "2026-10-13T00:00:00Z",
  updatedAt: "2026-10-13T00:00:00Z",
};

function data(values: Record<string, string>) {
  const form = new FormData();
  for (const [name, value] of Object.entries(values)) form.set(name, value);
  return form;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.list.mockResolvedValue([structuredClone(passenger)]);
  mocks.upsert.mockResolvedValue(passenger);
  // jsdom has no dialog rendering engine; exercise the real form DOM and events.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
});
afterEach(cleanup);

describe("tenant passenger actions", () => {
  it("creates the first passenger through the existing command and refreshes the directory", async () => {
    mocks.list.mockResolvedValue([]);
    expect(getPageActions([])[0]?.enabled).toBe(true);
    expect(
      await savePassengerAction(
        data({
          action: "create",
          fullName: " New Passenger ",
          employeeNo: "EMP-2",
          departmentName: "Operations",
          mobile: "0900000001",
          email: "new@example.test",
        }),
      ),
    ).toEqual({ ok: true, message: "Passenger created." });
    expect(mocks.upsert).toHaveBeenCalledWith({
      fullName: "New Passenger",
      employeeNo: "EMP-2",
      departmentName: "Operations",
      mobile: "0900000001",
      email: "new@example.test",
    });
    expect(mocks.revalidate).toHaveBeenCalledWith("/passengers");
  });

  it("edits optional fields with explicit clearing and leaves roles, status and metadata intact", async () => {
    await savePassengerAction(
      data({
        action: "edit",
        passengerId: passenger.passengerId,
        fullName: "Renamed Passenger",
        employeeNo: "EMP-1",
        departmentName: "New Office",
        mobile: "",
        email: "",
      }),
    );
    expect(mocks.upsert).toHaveBeenCalledWith({
      passengerId: passenger.passengerId,
      fullName: "Renamed Passenger",
      employeeNo: "EMP-1",
      departmentName: "New Office",
      mobile: "",
      email: "",
    });
  });

  it("requires the existing deactivation reason and toggles status without replacing contact details", async () => {
    const form = data({
      action: "deactivate",
      passengerId: passenger.passengerId,
    });
    expect((await savePassengerAction(form)).ok).toBe(false);
    expect(mocks.upsert).not.toHaveBeenCalled();
    form.set("reason", "Left the organisation");
    expect((await savePassengerAction(form)).ok).toBe(true);
    expect(mocks.upsert).toHaveBeenLastCalledWith({
      passengerId: passenger.passengerId,
      fullName: passenger.fullName,
      activeFlag: false,
      metadata: { passengerChangeReason: "Left the organisation" },
    });
    mocks.list.mockResolvedValue([{ ...passenger, activeFlag: false }]);
    expect(
      (
        await savePassengerAction(
          data({ action: "reactivate", passengerId: passenger.passengerId }),
        )
      ).ok,
    ).toBe(true);
    expect(mocks.upsert).toHaveBeenLastCalledWith({
      passengerId: passenger.passengerId,
      fullName: passenger.fullName,
      activeFlag: true,
    });
  });

  it("retains explicit availability from the service, including not_wired_yet", async () => {
    for (const disabledReasonCode of [
      "read_only_mode",
      "requires_tenant_admin",
      "not_wired_yet",
    ]) {
      const record = {
        ...passenger,
        availableActions: [
          {
            action: "edit",
            enabled: false,
            disabledReasonCode,
            riskLevel: "medium" as const,
          },
        ],
      };
      mocks.list.mockResolvedValue([record]);
      expect(getPassengerActions(record)).toBe(record.availableActions);
      expect(
        (
          await savePassengerAction(
            data({
              action: "edit",
              passengerId: passenger.passengerId,
              fullName: "Changed",
            }),
          )
        ).ok,
      ).toBe(false);
    }
    const record = {
      ...passenger,
      metadata: {
        availableActions: [
          {
            action: "create",
            enabled: false,
            disabledReasonCode: "read_only_mode",
            riskLevel: "medium" as const,
          },
        ],
      },
    };
    mocks.list.mockResolvedValue([record]);
    expect(
      (await savePassengerAction(data({ action: "create", fullName: "New" })))
        .ok,
    ).toBe(false);
    expect(
      getPassengerActions({
        ...passenger,
        readOnlyReasonCode: "read_only_mode",
      }).every((action) => !action.enabled),
    ).toBe(true);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("reports missing records and failed API writes without a success refresh", async () => {
    mocks.list.mockResolvedValue([]);
    expect(
      (
        await savePassengerAction(
          data({ action: "edit", passengerId: "removed", fullName: "Name" }),
        )
      ).ok,
    ).toBe(false);
    mocks.upsert.mockRejectedValue(new Error("Service unavailable"));
    const result = await savePassengerAction(
      data({ action: "create", fullName: "Name" }),
    );
    expect(result).toEqual({
      ok: false,
      message: expect.stringContaining("Service unavailable"),
    });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});

describe("tenant passenger form", () => {
  it("wires the empty directory create control to the form and existing API", async () => {
    mocks.list.mockResolvedValue([]);
    render(await PassengersPage({}));
    fireEvent.click(screen.getAllByRole("button", { name: "Create" })[0]!);
    fireEvent.change(screen.getByLabelText("Name *"), {
      target: { value: "First passenger" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("status");
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ fullName: "First passenger" }),
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it("opens with existing values, preserves entries after failure, and refreshes after retry", async () => {
    render(
      createElement(PassengerActionControl, {
        descriptor: { action: "edit", enabled: true, riskLevel: "medium" },
        label: "Edit",
        helper: "Edit",
        locale: "en",
        passenger,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const name = screen.getByLabelText("Name *") as HTMLInputElement;
    expect(name.value).toBe(passenger.fullName);
    fireEvent.change(name, { target: { value: "Updated name" } });
    mocks.upsert.mockRejectedValueOnce(new Error("Temporary error"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("alert");
    expect(name.value).toBe("Updated name");
    expect(mocks.refresh).not.toHaveBeenCalled();
    // The error can render before React settles the pending transition.
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("status");
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({ fullName: "Updated name" }),
    );
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Close" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows pending state while the real action is waiting and submits the deactivation reason", async () => {
    let finish!: (value: TenantPassengerRecord) => void;
    mocks.upsert.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(
      createElement(PassengerActionControl, {
        descriptor: {
          action: "deactivate",
          enabled: true,
          requiresReason: true,
          riskLevel: "high",
        },
        label: "Deactivate",
        helper: "Deactivate",
        locale: "en",
        passenger,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    fireEvent.change(screen.getByLabelText("Reason *"), {
      target: { value: "No longer travelling" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.upsert).toHaveBeenCalledOnce());
    expect(
      (screen.getByRole("button", { name: "Saving…" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    finish(passenger);
    await screen.findByRole("status");
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        activeFlag: false,
        metadata: { passengerChangeReason: "No longer travelling" },
      }),
    );
  });
});
