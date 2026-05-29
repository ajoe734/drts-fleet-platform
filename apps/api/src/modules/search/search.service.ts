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

import { ApiRequestError } from "../../common/api-envelope";
import { BillingSettlementService } from "../billing-settlement/billing-settlement.service";
import { OwnedMobilityService } from "../owned-mobility/owned-mobility.service";
import { TenantPartnerService } from "../tenant-partner/tenant-partner.service";
import {
  TENANT_SEARCH_CATEGORIES,
  type SearchResultGroup,
  type TenantSearchCategory,
  type TenantSearchResponse,
} from "./search.types";

type SearchFieldValue = string | string[] | null | undefined;
type SearchFields = Record<string, SearchFieldValue>;

type SearchCandidate = {
  result: Omit<SearchResultRecord, "matchedFields">;
  fields: SearchFields;
  updatedAt?: string | null;
};

type MatchedCandidate = {
  score: number;
  updatedAt: number;
  item: SearchResultRecord;
};

const SEARCH_APP = "tenant-console" as const;
const SEARCH_CATEGORY_SET = new Set<TenantSearchCategory>(
  TENANT_SEARCH_CATEGORIES,
);

function compareMatchedCandidate(
  left: MatchedCandidate,
  right: MatchedCandidate,
) {
  if (right.score !== left.score) {
    return right.score - left.score;
  }

  if (right.updatedAt !== left.updatedAt) {
    return right.updatedAt - left.updatedAt;
  }

  return left.item.primaryLabel.localeCompare(right.item.primaryLabel);
}

@Injectable()
export class SearchService {
  constructor(
    private readonly ownedMobilityService: OwnedMobilityService,
    private readonly tenantPartnerService: TenantPartnerService,
    private readonly billingSettlementService: BillingSettlementService,
  ) {}

  searchTenant(
    tenantId: string,
    query: string,
    requestedTypes?: string | string[],
  ): TenantSearchResponse {
    const normalizedTenantId = this.normalizeTenantId(tenantId);
    const normalizedQuery = this.normalizeQuery(query);
    const types = this.resolveTypes(requestedTypes);
    const tokens = this.tokenize(normalizedQuery);

    const candidateMap: Record<TenantSearchCategory, SearchCandidate[]> = {
      bookings: this.buildBookingCandidates(
        this.ownedMobilityService.listTenantBookings(normalizedTenantId).items,
      ),
      passengers: this.buildPassengerCandidates(
        this.tenantPartnerService.listPassengers(normalizedTenantId),
      ),
      addresses: this.buildAddressCandidates(
        this.tenantPartnerService.listAddresses(normalizedTenantId),
      ),
      "cost-centers": this.buildCostCenterCandidates(
        this.tenantPartnerService.listCostCenters(normalizedTenantId),
      ),
      invoices: this.buildInvoiceCandidates(
        this.billingSettlementService.listTenantInvoices(normalizedTenantId),
      ),
    };

    const groups = types
      .map((category) =>
        this.buildGroup(
          category,
          candidateMap[category],
          normalizedQuery,
          tokens,
        ),
      )
      .filter((group): group is SearchResultGroup => group !== null);

    return {
      query: normalizedQuery,
      types,
      groups,
      totalResults: groups.reduce((sum, group) => sum + group.items.length, 0),
    };
  }

  private buildGroup(
    category: TenantSearchCategory,
    candidates: SearchCandidate[],
    normalizedQuery: string,
    tokens: string[],
  ): SearchResultGroup | null {
    const matched: MatchedCandidate[] = [];
    for (const candidate of candidates) {
      const match = this.matchFields(normalizedQuery, tokens, candidate.fields);
      if (!match) {
        continue;
      }

      matched.push({
        score: match.score,
        updatedAt: this.parseTimestamp(candidate.updatedAt),
        item: {
          ...candidate.result,
          matchedFields: match.matchedFields,
        },
      });
    }

    matched.sort(compareMatchedCandidate);

    if (matched.length === 0) {
      return null;
    }

    return {
      category,
      items: matched.map((candidate) => candidate.item),
    };
  }

  private buildBookingCandidates(bookings: BookingRecord[]): SearchCandidate[] {
    return bookings.map((booking) => ({
      result: {
        category: "bookings",
        resourceType: "booking",
        resourceId: booking.bookingId,
        primaryLabel: booking.bookingId,
        secondaryLabel: this.joinParts([
          booking.passenger.name,
          `${booking.pickup.address} -> ${booking.dropoff.address}`,
          booking.status,
        ]),
        link: this.buildLink(
          `/bookings/${booking.bookingId}`,
          "booking",
          booking.bookingId,
          `Open booking ${booking.bookingId}`,
        ),
      },
      fields: {
        tenantId: booking.tenantId,
        bookingId: booking.bookingId,
        orderId: booking.orderId,
        passengerName: booking.passenger.name,
        passengerPhone: booking.passenger.phone,
        pickupAddress: booking.pickup.address,
        dropoffAddress: booking.dropoff.address,
        status: booking.status,
        costCenter: booking.costCenter,
        bookedByName: booking.bookedBy?.name,
        bookedByEmail: booking.bookedBy?.email,
      },
      updatedAt: booking.updatedAt,
    }));
  }

  private buildPassengerCandidates(
    passengers: TenantPassengerRecord[],
  ): SearchCandidate[] {
    return passengers.map((passenger) => ({
      result: {
        category: "passengers",
        resourceType: "tenant_passenger",
        resourceId: passenger.passengerId,
        primaryLabel: passenger.fullName,
        secondaryLabel: this.joinParts([
          passenger.employeeNo,
          passenger.departmentName,
          passenger.mobile,
        ]),
        link: this.buildLink(
          "/passengers",
          "tenant_passenger",
          passenger.passengerId,
          `Open passenger ${passenger.fullName}`,
        ),
      },
      fields: {
        tenantId: passenger.tenantId,
        passengerId: passenger.passengerId,
        fullName: passenger.fullName,
        employeeNo: passenger.employeeNo,
        departmentName: passenger.departmentName,
        mobile: passenger.mobile,
        email: passenger.email,
        roles: passenger.roles,
      },
      updatedAt: passenger.updatedAt,
    }));
  }

  private buildAddressCandidates(
    addresses: TenantAddressRecord[],
  ): SearchCandidate[] {
    return addresses.map((address) => ({
      result: {
        category: "addresses",
        resourceType: "tenant_address",
        resourceId: address.addressId,
        primaryLabel: address.addressName,
        secondaryLabel: this.joinParts([
          address.addressText,
          address.ownerPassengerId,
          address.activeFlag ? "active" : "inactive",
        ]),
        link: this.buildLink(
          "/addresses",
          "tenant_address",
          address.addressId,
          `Open address ${address.addressName}`,
        ),
      },
      fields: {
        tenantId: address.tenantId,
        addressId: address.addressId,
        addressName: address.addressName,
        addressText: address.addressText,
        normalizedAddressText: address.normalizedAddressText,
        ownerPassengerId: address.ownerPassengerId,
        tags: address.tags,
      },
      updatedAt: address.updatedAt,
    }));
  }

  private buildCostCenterCandidates(
    costCenters: TenantCostCenterRecord[],
  ): SearchCandidate[] {
    return costCenters.map((costCenter) => ({
      result: {
        category: "cost-centers",
        resourceType: "tenant_cost_center",
        resourceId: costCenter.code,
        primaryLabel: costCenter.name,
        secondaryLabel: this.joinParts([
          costCenter.code,
          costCenter.ownerName,
          costCenter.activeFlag ? "active" : "inactive",
        ]),
        link: this.buildLink(
          "/cost-centers",
          "tenant_cost_center",
          costCenter.code,
          `Open cost center ${costCenter.code}`,
        ),
      },
      fields: {
        tenantId: costCenter.tenantId,
        code: costCenter.code,
        name: costCenter.name,
        description: costCenter.description,
        ownerUserId: costCenter.ownerUserId,
        ownerName: costCenter.ownerName,
        disabledReason: costCenter.disabledReason,
      },
      updatedAt: costCenter.updatedAt,
    }));
  }

  private buildInvoiceCandidates(
    invoices: TenantInvoiceRecord[],
  ): SearchCandidate[] {
    return invoices.map((invoice) => ({
      result: {
        category: "invoices",
        resourceType: "tenant_invoice",
        resourceId: invoice.invoiceId,
        primaryLabel: invoice.invoiceId,
        secondaryLabel: this.joinParts([
          `${invoice.periodStart} -> ${invoice.periodEnd}`,
          invoice.status,
          this.formatMoney(invoice.amount),
        ]),
        link: this.buildLink(
          "/invoices",
          "tenant_invoice",
          invoice.invoiceId,
          `Open invoice ${invoice.invoiceId}`,
        ),
      },
      fields: {
        tenantId: invoice.tenantId,
        invoiceId: invoice.invoiceId,
        periodStart: invoice.periodStart,
        periodEnd: invoice.periodEnd,
        status: invoice.status,
        pricingVersionSnapshot: invoice.pricingVersionSnapshot,
        lineOrderIds: invoice.lines.map((line) => line.orderId),
        lineDescriptions: invoice.lines.map((line) => line.description),
      },
      updatedAt: invoice.updatedAt,
    }));
  }

  private resolveTypes(requestedTypes?: string | string[]) {
    const rawValues = Array.isArray(requestedTypes)
      ? requestedTypes
      : requestedTypes
        ? [requestedTypes]
        : [];
    const parsed = rawValues
      .flatMap((value) => value.split(","))
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);

    if (parsed.length === 0) {
      return [...TENANT_SEARCH_CATEGORIES];
    }

    const invalidTypes = parsed.filter(
      (value): value is string =>
        !SEARCH_CATEGORY_SET.has(value as TenantSearchCategory),
    );
    if (invalidTypes.length > 0) {
      throw new ApiRequestError(
        400,
        "INVALID_SEARCH_TYPES",
        "Search types must be one or more supported tenant categories.",
        {
          invalidTypes,
          allowedTypes: TENANT_SEARCH_CATEGORIES,
        },
      );
    }

    return [...new Set(parsed as TenantSearchCategory[])];
  }

  private normalizeTenantId(tenantId: string) {
    const normalized = tenantId.trim();
    if (!normalized) {
      throw new ApiRequestError(
        400,
        "TENANT_ID_REQUIRED",
        "x-tenant-id header is required for tenant search.",
      );
    }

    return normalized;
  }

  private normalizeQuery(query: string) {
    const normalized = query.trim().replace(/\s+/g, " ");
    if (!normalized) {
      throw new ApiRequestError(
        400,
        "SEARCH_QUERY_REQUIRED",
        "q is required for tenant search.",
      );
    }

    return normalized;
  }

  private tokenize(query: string) {
    return this.normalizeText(query).split(" ").filter(Boolean);
  }

  private matchFields(
    normalizedQuery: string,
    tokens: string[],
    fields: SearchFields,
  ) {
    const queryText = this.normalizeText(normalizedQuery);
    const normalizedFieldEntries = Object.entries(fields).flatMap(
      ([field, value]) =>
        this.fieldValues(value)
          .map((item) => this.normalizeText(item))
          .filter(Boolean)
          .map((item) => [field, item] as const),
    );

    if (
      normalizedFieldEntries.length === 0 ||
      !tokens.every((token) =>
        normalizedFieldEntries.some(([, value]) => value.includes(token)),
      )
    ) {
      return null;
    }

    const matchedFields: string[] = [];
    let score = 0;

    for (const [field, value] of normalizedFieldEntries) {
      if (!tokens.some((token) => value.includes(token))) {
        continue;
      }

      if (!matchedFields.includes(field)) {
        matchedFields.push(field);
      }

      if (value === queryText) {
        score += 120;
      } else if (value.startsWith(queryText)) {
        score += 60;
      } else if (value.includes(queryText)) {
        score += 25;
      } else {
        score += 10;
      }
    }

    return {
      matchedFields,
      score: score + matchedFields.length,
    };
  }

  private buildLink(
    route: string,
    resourceType: string,
    resourceId: string,
    label: string,
  ): CrossAppResourceLink {
    return {
      targetApp: SEARCH_APP,
      route,
      resourceType,
      resourceId,
      openMode: "same_tab",
      label,
    };
  }

  private fieldValues(value: SearchFieldValue): string[] {
    if (Array.isArray(value)) {
      return value.filter((item): item is string => Boolean(item));
    }

    if (!value) {
      return [];
    }

    return [value];
  }

  private joinParts(parts: Array<string | null | undefined>) {
    return parts.filter((part): part is string => Boolean(part)).join(" · ");
  }

  private parseTimestamp(value?: string | null) {
    if (!value) {
      return 0;
    }

    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private formatMoney(value: TenantInvoiceRecord["amount"]) {
    return `${value.currency} ${(value.amountMinor / 100).toFixed(2)}`;
  }

  private normalizeText(value: string) {
    return value
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
}
