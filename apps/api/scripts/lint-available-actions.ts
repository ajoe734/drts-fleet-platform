const { readFileSync } = require("node:fs");
const path = require("node:path");

const API_ROOT = path.resolve(__dirname, "..");

const requiredChecks = [
  {
    name: "dispatch owned order contract",
    file: "packages/contracts/src/index.ts",
    patterns: [
      /export interface OwnedOrderRecord \{/,
      /availableActions\?: ResourceActionDescriptor\[\];/,
    ],
  },
  {
    name: "dispatch forwarded order contract",
    file: "packages/contracts/src/index.ts",
    patterns: [
      /export interface ForwardedOrderRecord \{/,
      /availableActions\?: ResourceActionDescriptor\[\];/,
    ],
  },
  {
    name: "tenant booking contract",
    file: "packages/contracts/src/index.ts",
    patterns: [
      /export interface BookingRecord \{/,
      /readOnlyReasonCode: TenantBookingReadOnlyReasonCode \| null;/,
      /availableActions: ResourceActionDescriptor\[\];/,
    ],
  },
  {
    name: "complaint contract",
    file: "packages/contracts/src/index.ts",
    patterns: [
      /export interface ComplaintCaseRecord \{/,
      /availableActions\?: ResourceActionDescriptor\[\];/,
    ],
  },
  {
    name: "incident contract",
    file: "packages/contracts/src/index.ts",
    patterns: [
      /export interface IncidentReadModel extends IncidentRecord \{/,
      /availableActions: ResourceActionDescriptor\[\];/,
    ],
  },
  {
    name: "rollout state machine contract",
    file: "packages/contracts/src/ui-runtime.ts",
    patterns: [
      /export interface TenantRolloutStateMachineRecord \{/,
      /availableActions: ResourceActionDescriptor\[\];/,
    ],
  },
  {
    name: "dispatch owned order implementation",
    file: "apps/api/src/modules/owned-mobility/owned-mobility.service.ts",
    patterns: [
      /buildOwnedOrderAvailableActions/,
      /availableActions: this\.buildOwnedOrderAvailableActions/,
    ],
  },
  {
    name: "dispatch forwarded order implementation",
    file: "apps/api/src/modules/forwarder/forwarder.service.ts",
    patterns: [
      /buildForwardedOrderAvailableActions/,
      /availableActions: this\.buildForwardedOrderAvailableActions/,
    ],
  },
  {
    name: "tenant booking implementation",
    file: "apps/api/src/modules/owned-mobility/owned-mobility.service.ts",
    patterns: [
      /mapOrderToBooking/,
      /availableActions: \[updateAction, cancelAction\]/,
    ],
  },
  {
    name: "complaint implementation",
    file: "apps/api/src/modules/complaint/complaint.service.ts",
    patterns: [
      /buildAvailableActions\(/,
      /availableActions: this\.buildAvailableActions\(complaintCase\)/,
    ],
  },
  {
    name: "incident implementation",
    file: "apps/api/src/modules/incident/incident.service.ts",
    patterns: [
      /buildAvailableActions\(/,
      /availableActions: this\.buildAvailableActions\(incident, identity\)/,
    ],
  },
  {
    name: "rollout state machine implementation",
    file: "apps/api/src/modules/tenant-rollout/tenant-rollout-state-machine.ts",
    patterns: [/actionSetFor\(stage, gateStatus\)/, /availableActions: actionSetFor/],
  },
];

const actionRouteControllers = [
  "apps/api/src/modules/complaint/complaint.controller.ts",
  "apps/api/src/modules/incident/incident.controller.ts",
  "apps/api/src/modules/owned-mobility/owned-mobility.controller.ts",
  "apps/api/src/modules/platform-admin/tenants.controller.ts",
];

function readRepoFile(relativePath) {
  const repoRoot = path.resolve(API_ROOT, "../..");
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const failures = [];

for (const check of requiredChecks) {
  const content = readRepoFile(check.file);
  for (const pattern of check.patterns) {
    if (!pattern.test(content)) {
      failures.push(
        `${check.name}: missing pattern ${pattern.toString()} in ${check.file}`,
      );
    }
  }
}

for (const controllerPath of actionRouteControllers) {
  const content = readRepoFile(controllerPath);
  if (/@(?:Get|Post|Put|Patch|Delete)\([^)]*actions[^)]*\)/.test(content)) {
    failures.push(
      `standalone /actions endpoint detected in ${controllerPath}; use embedded availableActions instead`,
    );
  }
}

if (failures.length > 0) {
  console.error("availableActions lint failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  "availableActions lint passed for dispatch, booking, complaint, incident, and rollout resources.",
);
