import { Injectable } from "@nestjs/common";

import type {
  BookingRecord,
  CrossAppResourceLink,
  SearchResultRecord,
  TenantAddressRecord,
  TenantCostCenterRecord,
  TenantInvoiceRecord,
  TenantPassengerRecord,
} from "@drts/contracts";

import { BillingSettlementService } from "../billing-settlement/billing-settlement.service";
import { OwnedMobilityService } from "../owned-mobility/owned-mobility.service";
import { TenantPartnerService } from "../tenant-partner/tenant-partner.service";
import type {
  TenantSearchCategory,
  TenantSearchQuery,
  TenantSearchResponse,
} from "./tenant-search.types";
import { TENANT_SEARCH_CATEGORIES } from "./tenant-search.types";

type NormalizedSearchTerm = {
  raw: string;
  folded: string;
  compact: string;
};

type SearchableFieldValue =
  | string
  | number
  | null
  | undefined
  | readonly (string | number | null | undefined)[];

type SearchableField = {
  key: string;
  value: SearchableFieldValue;
};

type SearchRecordBuilder<T> = {
  link: (record: T) => CrossAppResourceLink;
  primaryLabel: (record: T) => string;
  resourceId: (record: T) => string;
  resourceType: string;
  secondaryLabel?: (record: T) => string | undefined;
  searchableFields: (record: T) => SearchableField[];
};

const TENANT_APP_TARGET = "tenant-console" as const;

function normalizeSearchText(value: string) {
  return value.trim().toLocaleLowerCase("zh-Hant").replace(/\s+/g, " ");
}

function compactSearchText(value: string) {
  return value.replace(/[\s\-_./]+/g, "");
}

function buildSearchTerm(value: string): NormalizedSearchTerm {
  const folded = normalizeSearchText(value);
  return {
    raw: value.trim(),
    folded,
    compact: compactSearchText(folded),
  };
}

function includesSearchTerm(
  term: NormalizedSearchTerm,
  rawValue: string | number | null | undefined,
) {
  if (rawValue == null) {
    return false;
  }

  const candidate = normalizeSearchText(String(rawValue));
  if (!candidate) {
    return false;
  }

  if (candidate.includes(term.folded)) {
    return true;
  }

  return term.compact.length > 0
    ? compactSearchText(candidate).includes(term.compact)
    : false;
}

function matchedFieldNames(
  term: NormalizedSearchTerm,
  fields: readonly SearchableField[],
) {
  const matches = new Set<string>();

  for (const field of fields) {
    const values = Array.isArray(field.value) ? field.value : [field.value];
    if (values.some((value) => includesSearchTerm(term, value))) {
      matches.add(field.key);
    }
  }

  return [...matches];
}

function buildTenantLink(
  route: string,
  resourceType: string,
  resourceId: string,
  label: string,
): CrossAppResourceLink {
  return {
    targetApp: TENANT_APP_TARGET,
    route,
    resourceType,
    resourceId,
    openMode: "same_tab",
    label,
  };
}

function buildSearchResults<T>(
  records: readonly T[],
  term: NormalizedSearchTerm,
  category: TenantSearchCategory,
  builder: SearchRecordBuilder<T>,
): SearchResultRecord[] {
  return records.flatMap((record) => {
    const matchedFields = matchedFieldNames(term, builder.searchableFields(record));
    if (matchedFields.length === 0) {
      return [];
    }

    const secondaryLabel = builder.secondaryLabel?.(record);

    return [
      {
        category,
        resourceType: builder.resourceType,
        resourceId: builder.resourceId(record),
        primaryLabel: builder.primaryLabel(record),
        ...(secondaryLabel ? { secondaryLabel } : {}),
        link: builder.link(record),
        matchedFields,
      } satisfies SearchResultRecord,
    ];
  });
}

function invoicePeriodKey(invoice: TenantInvoiceRecord) {
  return invoice.periodStart.slice(0, 7);
}

@Injectable()
export class TenantSearchService {
  constructor(
    private readonly ownedMobilityService: OwnedMobilityService,
    private readonly tenantPartnerService: TenantPartnerService,
    private readonly billingSettlementService: BillingSettlementService,
  ) {}

  searchTenant(tenantId: string, query: TenantSearchQuery): TenantSearchResponse {
    const searchTerm = buildSearchTerm(query.q);
    const categories = query.types?.length
      ? query.types
      : [...TENANT_SEARCH_CATEGORIES];

    if (!searchTerm.folded) {
      return {
        query: searchTerm.raw,
        groups: categories.map((category) => ({
          category,
          items: [],
        })),
      };
    }

    const bookings = this.ownedMobilityService.listTenantBookings(tenantId).items;
    const passengers = this.tenantPartnerService.listPassengers(tenantId);
    const addresses = this.tenantPartnerService.listAddresses(tenantId);
    const costCenters = this.tenantPartnerService.listCostCenters(tenantId);
    const invoices = this.billingSettlementService.listTenantInvoices(tenantId);

    return {
      query: searchTerm.raw,
      groups: categories.map((category) => ({
        category,
        items: this.searchCategory(category, searchTerm, {
          bookings,
          passengers,
          addresses,
          costCenters,
          invoices,
        }),
      })),
    };
  }

  private searchCategory(
    category: TenantSearchCategory,
    term: NormalizedSearchTerm,
    sources: {
      bookings: BookingRecord[];
      passengers: TenantPassengerRecord[];
      addresses: TenantAddressRecord[];
      costCenters: TenantCostCenterRecord[];
      invoices: TenantInvoiceRecord[];
    },
  ) {
    switch (category) {
      case "bookings":
        return buildSearchResults(sources.bookings, term, category, {
          resourceType: "booking",
          resourceId: (booking) => booking.bookingId,
          primaryLabel: (booking) => booking.bookingId,
          secondaryLabel: (booking) =>
            `${booking.passenger.name} · ${booking.pickup.address} → ${booking.dropoff.address}`,
          link: (booking) =>
            buildTenantLink(
              `/bookings/${encodeURIComponent(booking.bookingId)}`,
              "booking",
              booking.bookingId,
              "Open booking detail",
            ),
          searchableFields: (booking) => [
            { key: "bookingId", value: booking.bookingId },
            { key: "orderId", value: booking.orderId },
            { key: "passenger.name", value: booking.passenger.name },
            { key: "passenger.phone", value: booking.passenger.phone },
            { key: "pickup.address", value: booking.pickup.address },
            { key: "dropoff.address", value: booking.dropoff.address },
            { key: "costCenter", value: booking.costCenter },
            { key: "notes", value: booking.notes },
          ],
        });
      case "passengers":
        return buildSearchResults(sources.passengers, term, category, {
          resourceType: "passenger",
          resourceId: (passenger) => passenger.passengerId,
          primaryLabel: (passenger) => passenger.fullName,
          secondaryLabel: (passenger) =>
            [
              passenger.employeeNo,
              passenger.departmentName,
              passenger.mobile,
            ]
              .filter((value): value is string => Boolean(value))
              .join(" · ") || undefined,
          link: (passenger) =>
            buildTenantLink(
              `/passengers?passengerId=${encodeURIComponent(passenger.passengerId)}`,
              "passenger",
              passenger.passengerId,
              "Open passenger directory",
            ),
          searchableFields: (passenger) => [
            { key: "passengerId", value: passenger.passengerId },
            { key: "fullName", value: passenger.fullName },
            { key: "employeeNo", value: passenger.employeeNo },
            { key: "departmentName", value: passenger.departmentName },
            { key: "mobile", value: passenger.mobile },
            { key: "email", value: passenger.email },
          ],
        });
      case "addresses":
        return buildSearchResults(sources.addresses, term, category, {
          resourceType: "address",
          resourceId: (address) => address.addressId,
          primaryLabel: (address) => address.addressName,
          secondaryLabel: (address) => address.addressText,
          link: (address) =>
            buildTenantLink(
              `/addresses?addressId=${encodeURIComponent(address.addressId)}`,
              "address",
              address.addressId,
              "Open address directory",
            ),
          searchableFields: (address) => [
            { key: "addressId", value: address.addressId },
            { key: "addressName", value: address.addressName },
            { key: "addressText", value: address.addressText },
            {
              key: "normalizedAddressText",
              value: address.normalizedAddressText,
            },
            { key: "tags", value: address.tags },
            { key: "ownerPassengerId", value: address.ownerPassengerId },
          ],
        });
      case "cost-centers":
        return buildSearchResults(sources.costCenters, term, category, {
          resourceType: "cost-center",
          resourceId: (costCenter) => costCenter.code,
          primaryLabel: (costCenter) => costCenter.code,
          secondaryLabel: (costCenter) =>
            [
              costCenter.name,
              costCenter.ownerName,
              costCenter.description,
            ]
              .filter((value): value is string => Boolean(value))
              .join(" · ") || undefined,
          link: (costCenter) =>
            buildTenantLink(
              `/cost-centers?code=${encodeURIComponent(costCenter.code)}`,
              "cost-center",
              costCenter.code,
              "Open cost-center directory",
            ),
          searchableFields: (costCenter) => [
            { key: "code", value: costCenter.code },
            { key: "name", value: costCenter.name },
            { key: "description", value: costCenter.description },
            { key: "ownerName", value: costCenter.ownerName },
            { key: "ownerUserId", value: costCenter.ownerUserId },
          ],
        });
      case "invoices":
        return buildSearchResults(sources.invoices, term, category, {
          resourceType: "invoice",
          resourceId: (invoice) => invoice.invoiceId,
          primaryLabel: (invoice) => invoice.invoiceId,
          secondaryLabel: (invoice) =>
            `${invoicePeriodKey(invoice)} · ${invoice.status}`,
          link: (invoice) =>
            buildTenantLink(
              `/invoices?period=${encodeURIComponent(invoicePeriodKey(invoice))}&invoiceId=${encodeURIComponent(invoice.invoiceId)}`,
              "invoice",
              invoice.invoiceId,
              "Open invoice list",
            ),
          searchableFields: (invoice) => [
            { key: "invoiceId", value: invoice.invoiceId },
            { key: "status", value: invoice.status },
            { key: "periodStart", value: invoice.periodStart },
            { key: "periodEnd", value: invoice.periodEnd },
            {
              key: "lines.orderId",
              value: invoice.lines.map((line) => line.orderId),
            },
          ],
        });
    }
  }
}
