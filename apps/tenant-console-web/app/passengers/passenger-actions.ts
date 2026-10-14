import type {
  ResourceActionDescriptor,
  TenantPassengerRecord,
} from "@drts/contracts";

export type PassengerAction = "create" | "edit" | "deactivate" | "reactivate";

export type ActionablePassenger = TenantPassengerRecord & {
  availableActions?: ResourceActionDescriptor[];
  readOnlyReasonCode?: string | null;
};

export function isPassengerAction(action: string): action is PassengerAction {
  return ["create", "edit", "deactivate", "reactivate"].includes(action);
}

function isActionDescriptor(value: unknown): value is ResourceActionDescriptor {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.action === "string" &&
    typeof candidate.enabled === "boolean" &&
    typeof candidate.riskLevel === "string"
  );
}

function descriptors(value: unknown): ResourceActionDescriptor[] | null {
  return Array.isArray(value) && value.every(isActionDescriptor) ? value : null;
}

export function getPassengerActions(
  passenger: ActionablePassenger,
): ResourceActionDescriptor[] {
  const supplied =
    descriptors(passenger.availableActions) ??
    descriptors(passenger.metadata.availableActions);
  if (supplied) return supplied;

  const availability = passenger.readOnlyReasonCode
    ? { enabled: false, disabledReasonCode: passenger.readOnlyReasonCode }
    : { enabled: true };
  return [
    { action: "edit", ...availability, riskLevel: "medium" },
    passenger.activeFlag
      ? {
          action: "deactivate",
          ...availability,
          requiresReason: true,
          riskLevel: "high",
        }
      : { action: "reactivate", ...availability, riskLevel: "medium" },
  ];
}

export function getPageActions(
  passengers: ActionablePassenger[],
): ResourceActionDescriptor[] {
  const pageActionSource = passengers
    .map((passenger) => descriptors(passenger.metadata.availableActions))
    .find((actions) => actions !== null);
  const createActions = pageActionSource?.filter(
    (action) => action.action === "create",
  );
  if (createActions?.length) return createActions;

  const source = passengers[0];
  return [
    (source &&
      getPassengerActions(source).find(
        (action) => action.action === "create",
      )) ?? {
      action: "create",
      enabled: true,
      riskLevel: "medium",
    },
  ];
}
