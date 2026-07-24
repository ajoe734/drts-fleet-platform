import type {
  FareQuoteAnomaly,
  RouteFareDisclosureSnapshot,
} from "./phase1-p5-s3-multi-taxi";
import type {
  EmptyStateEnvelope,
  ResourceActionDescriptor,
  UiRefreshMetadata,
} from "./ui-runtime";

export const FARE_QUOTE_RECOVERY_ACTIONS = ["retry_quote"] as const;
export type FareQuoteRecoveryAction =
  (typeof FARE_QUOTE_RECOVERY_ACTIONS)[number];

export type FareQuoteAnomalyAddressSnapshot = Omit<
  RouteFareDisclosureSnapshot["pickup"],
  "lat" | "lng" | "resolvedAt"
> & {
  lat: number | null;
  lng: number | null;
  resolvedAt: string | null;
};

/**
 * An attempted route/fare snapshot. Unlike a passenger disclosure snapshot,
 * anomaly evidence may explicitly carry unresolved coordinates as null.
 */
export interface FareQuoteAnomalySnapshot extends Omit<
  RouteFareDisclosureSnapshot,
  "pickup" | "dropoff"
> {
  pickup: FareQuoteAnomalyAddressSnapshot;
  dropoff: FareQuoteAnomalyAddressSnapshot;
}

/**
 * Platform Admin read model composed from the canonical route/fare snapshot,
 * anomaly reason, and server-owned action authority.
 */
export interface FareQuoteAnomalyAdminView {
  reason: FareQuoteAnomaly;
  snapshot: FareQuoteAnomalySnapshot;
  availableActions: ResourceActionDescriptor[];
  recoveryPending: boolean;
  lastRecoveryRequestedAt: string | null;
}

export interface FareQuoteAnomalyListReadModel {
  items: FareQuoteAnomalyAdminView[];
  refresh: UiRefreshMetadata;
  emptyState?: EmptyStateEnvelope;
}

export interface FareQuoteAnomalyResourceReadModel {
  item: FareQuoteAnomalyAdminView;
  refresh: UiRefreshMetadata;
}

/**
 * Internal pricing integration input. This is intentionally not an HTTP
 * mutation exposed to Platform Admin.
 */
export interface RecordFareQuoteAnomalyCommand {
  reason: FareQuoteAnomaly;
  snapshot: FareQuoteAnomalySnapshot;
}
