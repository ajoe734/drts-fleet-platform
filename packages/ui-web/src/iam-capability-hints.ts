import {
  getIamScopeDefinition,
  type IamResourceConstraintKind,
} from "@drts/contracts";

export interface IamCapabilityHint {
  scope: string;
  description: string;
  constraintKinds: IamResourceConstraintKind[];
  constraintLabels: string[];
}

function describeConstraint(kind: IamResourceConstraintKind): string {
  switch (kind) {
    case "tenant":
      return "Tenant-bound";
    case "partner":
      return "Partner-bound";
    case "partner_entry":
      return "Partner entry-bound";
    case "driver":
      return "Driver-bound";
    case "actor":
      return "Actor-bound";
    case "object":
      return "Object-level check required";
    default:
      return "Scoped";
  }
}

export function getIamCapabilityHint(scope: string): IamCapabilityHint | null {
  const definition = getIamScopeDefinition(scope);
  if (!definition) {
    return null;
  }

  return {
    scope: definition.scope,
    description: definition.description,
    constraintKinds: definition.resourceConstraints.map(
      (constraint) => constraint.kind,
    ),
    constraintLabels: definition.resourceConstraints.map((constraint) =>
      describeConstraint(constraint.kind),
    ),
  };
}

export function listIamCapabilityHints(
  scopes: readonly string[],
): IamCapabilityHint[] {
  return scopes
    .map((scope) => getIamCapabilityHint(scope))
    .filter((hint): hint is IamCapabilityHint => hint !== null);
}
