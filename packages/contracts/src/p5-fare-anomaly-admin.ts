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

/**
 * Platform Admin read model composed from the canonical route/fare snapshot,
 * anomaly reason, and server-owned action authority.
 */
export interface FareQuoteAnomalyAdminView {
  reason: FareQuoteAnomaly;
  snapshot: RouteFareDisclosureSnapshot;
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
  snapshot: RouteFareDisclosureSnapshot;
}
