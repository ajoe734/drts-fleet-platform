import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantBookingDraftValues } from "../../../apps/tenant-console-web/app/bookings/new/tenant-booking-create-form-utils";
import {
  buildTenantBookingCreateCommand,
  getDefaultDateTimeLocalValue,
} from "../../../apps/tenant-console-web/app/bookings/new/tenant-booking-create-form-utils";
import type { TenantBookingCreatePageModel } from "../../../apps/tenant-console-web/app/bookings/new/tenant-booking-create-form";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { TenantPartnerService } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import AddressesPage from "../../../apps/tenant-console-web/app/addresses/page";
import NewBookingPage from "../../../apps/tenant-console-web/app/bookings/new/page";
// The real server page is the query consumer under test; the client form is
// not mounted in this socket-free server-element test. Its actual typed builder
// runs below; browser interaction is separately unclaimed.
vi.mock(
  "../../../apps/tenant-console-web/app/bookings/new/tenant-booking-create-form",
  () => ({ TenantBookingCreateForm: () => null }),
);
const client = vi.hoisted(() => ({
  get: vi.fn(),
  listPassengers: vi.fn(),
  listAddresses: vi.fn(),
  listAddressExportView: vi.fn(),
  listCostCenters: vi.fn(),
}));
vi.mock("@/lib/api-client", () => ({ getTenantClient: async () => client }));
vi.mock("@/lib/server-locale", () => ({ getServerLocale: async () => "en" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const tenantId = "tenant-demo-001";
const tenant = new TenantPartnerService(new AuditNotificationService());
const addresses = tenant.listAddresses(tenantId);
const selected = addresses.find((address) => address.activeFlag)!;
const passengers = tenant.listPassengers(tenantId);
function links(node: unknown): string[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(links);
  const props = (node as { props?: Record<string, unknown> }).props;
  if (!props) return [];
  return [
    ...(typeof props.href === "string" ? [props.href] : []),
    ...Object.values(props).flatMap(links),
  ];
}
async function model(query: Record<string, string>) {
  const element = await NewBookingPage({
    searchParams: Promise.resolve(query),
  });
  return element.props as {
    pageModel: TenantBookingCreatePageModel;
    addresses: typeof addresses;
    passengers: typeof passengers;
  };
}
beforeEach(() => {
  client.get.mockResolvedValue({ data: { items: addresses } });
  client.listPassengers.mockResolvedValue(passengers);
  client.listAddresses.mockResolvedValue(addresses);
  client.listAddressExportView.mockResolvedValue([]);
  client.listCostCenters.mockResolvedValue([]);
});
describe("actual saved-address page producer → existing booking query consumer → typed command", () => {
  it("keeps the selected master ID through the real rendered Link and new-booking page", async () => {
    const page = await AddressesPage({
      searchParams: Promise.resolve({ addressId: selected.addressId }),
    });
    const href = links(page).find((href) => href.startsWith("/bookings/new?"));
    expect(href).toBeDefined();
    const url = new URL(href!, "https://tenant.example");
    const props = await model(Object.fromEntries(url.searchParams));
    expect(props.pageModel.prefill.pickupAddressId).toBe(selected.addressId);
    expect(props.pageModel.prefill.dropoffAddressId).toBe("");
    const draft: TenantBookingDraftValues = {
      businessDispatchSubtype: "enterprise_dispatch",
      selectedPassengerId: "",
      pickupAddressId: props.pageModel.prefill.pickupAddressId,
      dropoffAddressId: "",
      pickupAddress: selected.addressText,
      pickupLat: "",
      pickupLng: "",
      dropoffAddress: "Manual destination",
      dropoffLat: "",
      dropoffLng: "",
      reservationWindowStart: getDefaultDateTimeLocalValue(180),
      reservationWindowEnd: getDefaultDateTimeLocalValue(240),
      passengerName: "Manual passenger",
      passengerPhone: "0912000000",
      costCenter: "",
      benefitReference: "",
      vehiclePreference: "",
      direction: "",
      flightNo: "",
      terminal: "",
      luggageCount: "",
      notes: "",
      bookedByName: "",
      bookedByEmail: "",
      onsiteContactName: "",
      onsiteContactPhone: "",
      estimatedAmount: "",
      signoffRequired: false,
      expenseProofRequired: false,
    };
    const command = buildTenantBookingCreateCommand({
      draft,
      passengers: props.passengers,
    });
    expect(command.pickupAddressId).toBe(selected.addressId);
    expect(command.pickup.addressId).toBe(selected.addressId);
    expect(command.dropoffAddressId).toBeUndefined();
    expect(command.dropoff.address).toBe("Manual destination");
    expect(client.get).toHaveBeenCalledWith("/api/tenant/addresses");
  });
  it("preserves direct pickup/dropoff query roles and passenger shortcut", async () => {
    const passenger = passengers.find((row) => row.activeFlag)!;
    const props = await model({
      addressId: selected.addressId,
      addressRole: "dropoff",
      passengerId: passenger.passengerId,
    });
    expect(props.pageModel.prefill.pickupAddressId).toBe("");
    expect(props.pageModel.prefill.dropoffAddressId).toBe(selected.addressId);
    expect(props.pageModel.prefill.selectedPassengerId).toBe(
      passenger.passengerId,
    );
    const direct = await model({
      pickupAddressId: selected.addressId,
      dropoffAddressId: selected.addressId,
    });
    expect(direct.pageModel.prefill.pickupAddressId).toBe(selected.addressId);
    expect(direct.pageModel.prefill.dropoffAddressId).toBe(selected.addressId);
  });
  it("keeps missing/inactive references unselected and clear-shortcut/manual flow lawful", async () => {
    for (const query of [{ addressId: "missing-address" }, {}]) {
      const props = await model(query);
      expect(props.pageModel.prefill.pickupAddressId).toBe("");
      expect(props.pageModel.links.clearShortcuts).toBe("/bookings/new");
    }
    client.listAddresses.mockResolvedValue([
      { ...selected, activeFlag: false },
    ]);
    const inactive = await model({ addressId: selected.addressId });
    expect(inactive.pageModel.prefill.pickupAddressId).toBe("");
    expect(inactive.addresses).toHaveLength(0);
    expect(() =>
      tenant.getAddressMasterRecord("another-tenant", selected.addressId),
    ).toThrow(expect.objectContaining({ code: "ADDRESS_NOT_FOUND" }));
  });
});
