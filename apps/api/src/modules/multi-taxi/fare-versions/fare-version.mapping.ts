import type {
  MultiTaxiFareManagementList,
  MultiTaxiManagedFareVersion,
} from "@drts/contracts";
import { ApiRequestError } from "../../../common/api-envelope";
import { validateFareTariff } from "../../passenger-app/fare/fare.engine";
import type { FareState, FareVersionData } from "./fare-version.types";

export function managedFare(
  row: FareVersionData,
  evaluatedAt: string,
): MultiTaxiManagedFareVersion {
  try {
    validateFareTariff(row.tariff);
  } catch {
    throw new ApiRequestError(
      503,
      "fare_management_unavailable",
      "The stored fare tariff is unavailable.",
      undefined,
      true,
    );
  }
  const { version, effectiveAt, effectiveUntil, sourceReference, ...tariff } =
    row.tariff;
  const now = Date.parse(evaluatedAt);
  const future = row.dbStatus === "published" && Date.parse(effectiveAt) > now;
  const ended =
    row.dbStatus === "published" &&
    effectiveUntil !== null &&
    Date.parse(effectiveUntil) <= now;
  const status =
    row.dbStatus === "retired" || ended
      ? "retired"
      : future || (row.dbStatus === "draft" && row.filedAt !== null)
        ? "filed"
        : row.dbStatus === "published"
          ? "active"
          : "draft";
  const unpublished = row.dbStatus === "draft";
  const replacementRequired = row.dbStatus === "published" && !ended;
  return {
    fareVersionId: version,
    displayName: row.displayName,
    status,
    effectiveFrom: effectiveAt,
    effectiveUntil,
    publicSummary: row.publicSummary,
    authorityFilingRef: row.authorityFilingRef,
    revision: row.revision,
    sourceReference,
    tariff,
    currency: "TWD",
    nightSurchargeUnit: "TWD_per_trip",
    publicationScheduled: future,
    scheduledFor: future ? effectiveAt : null,
    filingEvidenceReference: row.filingEvidenceReference,
    filedAt: row.filedAt,
    filedBy: row.filedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    availableActions: {
      edit: unpublished && row.filedAt === null,
      file: unpublished && row.filedAt === null,
      schedule: unpublished && row.filedAt !== null,
      retire: (unpublished || ended) && row.retiredReason === null,
    },
    retirementBlockedReason: replacementRequired
      ? "replacement_required"
      : null,
  };
}

export function fareList(state: FareState): MultiTaxiFareManagementList {
  const items = state.records.map((row) => managedFare(row, state.evaluatedAt));
  const active = items.filter((row) => row.status === "active");
  if (active.length > 1)
    throw new ApiRequestError(
      409,
      "fare_timeline_conflict",
      "More than one fare version is currently effective.",
    );
  return {
    items,
    evaluatedAt: state.evaluatedAt,
    activeFareVersionId: active[0]?.fareVersionId ?? null,
  };
}
