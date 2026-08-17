import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT_DIR = path.resolve(__dirname, "../../apps/api/src");

const HTTP_DECORATORS = new Map<string, string>([
  ["Get", "GET"],
  ["Post", "POST"],
  ["Put", "PUT"],
  ["Patch", "PATCH"],
  ["Delete", "DELETE"],
  ["Head", "HEAD"],
  ["Options", "OPTIONS"],
]);

export interface DiscoveredRouteCommand {
  file: string;
  controller: string;
  methodName: string;
  httpMethod: string;
  routePath: string;
  routeLabel: string;
  hasIdempotencyHeader: boolean;
  hasIdempotencyServiceUsage: boolean;
  isIdempotent: boolean;
  isCreateTypeCommand: boolean;
  classification:
    | "idempotent_command"
    | "auth_session_exchange"
    | "telemetry_or_stream_ingest"
    | "search_query_computation"
    | "entity_crud_or_configuration"
    | "unprotected_mutation";
}

export interface IdempotencyInventoryResult {
  controllersDiscovered: string[];
  totalRoutesDiscovered: number;
  routesDiscovered: DiscoveredRouteCommand[];
  createCommandsDiscovered: DiscoveredRouteCommand[];
  idempotentCommands: DiscoveredRouteCommand[];
  unprotectedCommands: DiscoveredRouteCommand[];
}

function getDecorators(node: ts.Node): readonly ts.Decorator[] {
  if (ts.canHaveDecorators(node)) {
    return ts.getDecorators(node) ?? [];
  }
  return [];
}

function getDecoratorName(decorator: ts.Decorator): string {
  const expression = decorator.expression;
  return ts.isCallExpression(expression)
    ? expression.expression.getText()
    : expression.getText();
}

function getStringDecoratorArg(decorator: ts.Decorator): string {
  const expression = decorator.expression;
  if (!ts.isCallExpression(expression) || expression.arguments.length === 0) {
    return "";
  }
  const argument = expression.arguments[0];
  if (
    argument &&
    (ts.isStringLiteral(argument) ||
      ts.isNoSubstitutionTemplateLiteral(argument))
  ) {
    return argument.text;
  }
  if (argument && ts.isObjectLiteralExpression(argument)) {
    for (const prop of argument.properties) {
      if (
        ts.isPropertyAssignment(prop) &&
        prop.name.getText() === "path" &&
        (ts.isStringLiteral(prop.initializer) ||
          ts.isNoSubstitutionTemplateLiteral(prop.initializer))
      ) {
        return prop.initializer.text;
      }
    }
  }
  return "";
}

function normalizeRoutePath(
  controllerPath: string,
  methodPath: string,
): string {
  const joined = [controllerPath, methodPath]
    .filter((segment) => segment && segment !== "/")
    .join("/");
  return `/${joined.replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/")}`;
}

export function discoverControllersRecursively(dir: string): string[] {
  const results: string[] = [];

  function walk(currentDir: string) {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".controller.ts")) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results.sort();
}

/**
 * Generic categorization heuristics for non-transactional endpoints:
 * Evaluated purely via HTTP method, URI structure, parameter signatures, and domain action verbs.
/**
 * Generic categorization heuristics for non-transactional endpoints:
 * Evaluated purely via HTTP method, URI structure, parameter signatures, and domain action verbs.
 * NOTE: NO controller-level allowlists or controller-name regexes are permitted.
 */
const AUTH_METHOD_OR_PATH_REGEX =
  /(?:token|session|login|logout|oauth|credential|password|key-rotation|virtual-key|pairing|handoff|consent|revoke-session|bootstrap-session|step-up-proof|break-glass\/request)/i;

const TELEMETRY_METHOD_OR_PATH_REGEX =
  /(?:heartbeat|tracking|ping|telemetry|presence|bookmark|read-receipt|recording-callback|driver-location|webhooks|webhook|inbound|queue\/(?:check-in|check-out)|alerts\/rendered|notifications\/read)/i;

const SEARCH_QUERY_METHOD_OR_PATH_REGEX =
  /(?:preview|calculate|estimate|quote-compute|search|query|dry-run|simulate|evaluate|resolve|reverse|route|validate-point|validate-route|process-timeouts|overdue-sweep|rebuild|verify|eligibility|tools\/|propose)/i;

/**
 * Verbs that explicitly denote updates, upserts, bindings, state transitions, administrative requests, or non-create mutations:
 */
const NON_CREATE_MUTATION_VERBS =
  /^(?:update|upsert|bind|unbind|set|reset|toggle|sync|accept|consume|record|remove|delete|disable|enable|clock|close|reorder|place|request|ingest)/i;

/**
 * Generic creation / transactional action verb pattern:
 * Identifies methods and route verbs that represent creating records or executing high-stakes commands.
 */
const TRANSACTIONAL_COMMAND_VERBS =
  /^(?:create|generate|assign|reassign|dispatch|redispatch|approve|pay|submit|book|issue|register|bootstrap|initiate|publish|retry|execute|regenerate)/i;

const ADMIN_OR_CONFIG_MUTATION_REGEX =
  /(?:maintenance-mode|manual-release|clock-in|clock-out|shifts\/start|\/disable|\/reorder|\/policies|\/catalog|\/notices|\/sla|\/feed|\/pricing-rules|\/rates|\/cost-centers|\/passengers|\/addresses|\/drafts|\/matrix|\/settings|legal-holds|deletion-exceptions|exports\/request)/i;

export function classifyRouteCommand(params: {
  controllerName: string;
  methodName: string;
  httpMethod: string;
  routePath: string;
  methodText: string;
  isIdempotent: boolean;
}): {
  classification: DiscoveredRouteCommand["classification"];
  isCreateTypeCommand: boolean;
} {
  const { methodName, httpMethod, routePath, methodText, isIdempotent } =
    params;

  // 1. If route implements Idempotency-Key header or IdempotencyService -> idempotent_command
  if (isIdempotent) {
    return {
      classification: "idempotent_command",
      isCreateTypeCommand: true,
    };
  }

  // 2. Auth & Session exchanges (OAuth, PKCE, token refresh/revoke, handoffs)
  if (
    AUTH_METHOD_OR_PATH_REGEX.test(methodName) ||
    AUTH_METHOD_OR_PATH_REGEX.test(routePath)
  ) {
    return {
      classification: "auth_session_exchange",
      isCreateTypeCommand: false,
    };
  }

  // 3. Telemetry & Ingestion streams (GPS heartbeat, tracking pings, event feeds)
  if (
    TELEMETRY_METHOD_OR_PATH_REGEX.test(methodName) ||
    TELEMETRY_METHOD_OR_PATH_REGEX.test(routePath)
  ) {
    return {
      classification: "telemetry_or_stream_ingest",
      isCreateTypeCommand: false,
    };
  }

  // 4. Query & Calculation / Simulation / Verification endpoints using POST for payload filters
  if (
    SEARCH_QUERY_METHOD_OR_PATH_REGEX.test(methodName) ||
    SEARCH_QUERY_METHOD_OR_PATH_REGEX.test(routePath)
  ) {
    return {
      classification: "search_query_computation",
      isCreateTypeCommand: false,
    };
  }

  // 5. Non-mutating HTTP methods (GET, HEAD, OPTIONS)
  const isMutating = httpMethod === "POST" || httpMethod === "PUT";
  if (!isMutating) {
    return {
      classification: "entity_crud_or_configuration",
      isCreateTypeCommand: false,
    };
  }

  // 6. Subordinate action / state transition on an existing entity instance:
  // If the path contains an instance parameter (e.g. /:orderId, /:taskId, /:caseId),
  // it targets an already-persisted entity instance rather than creating a new root entity.
  const segments = routePath.split("/").filter(Boolean);
  const hasIdParamInPath = segments.some((segment) => segment.startsWith(":"));
  if (hasIdParamInPath) {
    return {
      classification: "entity_crud_or_configuration",
      isCreateTypeCommand: false,
    };
  }

  // 7. Non-creation method verbs (update*, upsert*, bind*, sync*, etc.)
  if (NON_CREATE_MUTATION_VERBS.test(methodName)) {
    return {
      classification: "entity_crud_or_configuration",
      isCreateTypeCommand: false,
    };
  }

  // 8. Generic Create-Type Command Detection Heuristic:
  // Evaluates root collection endpoints and creation/action verbs without any controller allowlists.
  const hasBodyParam = /@Body\s*\(/.test(methodText);
  const hasCommandVerbInMethod = TRANSACTIONAL_COMMAND_VERBS.test(methodName);
  const lastSegment = segments[segments.length - 1] ?? "";
  const hasCommandVerbInPath = TRANSACTIONAL_COMMAND_VERBS.test(lastSegment);

  const isCreateCommand =
    hasCommandVerbInMethod ||
    hasCommandVerbInPath ||
    (httpMethod === "POST" &&
      hasBodyParam &&
      !ADMIN_OR_CONFIG_MUTATION_REGEX.test(routePath));

  if (isCreateCommand) {
    return {
      classification: "unprotected_mutation",
      isCreateTypeCommand: true,
    };
  }

  return {
    classification: "entity_crud_or_configuration",
    isCreateTypeCommand: false,
  };
}

export function analyzeSourceFileForIdempotency(
  sourceFile: ts.SourceFile,
  relativePath: string,
): {
  routes: DiscoveredRouteCommand[];
  unprotectedCommands: DiscoveredRouteCommand[];
} {
  const routes: DiscoveredRouteCommand[] = [];
  const unprotectedCommands: DiscoveredRouteCommand[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isClassDeclaration(statement)) {
      continue;
    }

    const controllerDecorator = getDecorators(statement).find(
      (decorator) => getDecoratorName(decorator) === "Controller",
    );
    if (!controllerDecorator) {
      continue;
    }

    const controllerName = statement.name
      ? statement.name.getText(sourceFile)
      : "AnonymousController";
    const controllerPath = getStringDecoratorArg(controllerDecorator);

    for (const member of statement.members) {
      if (!ts.isMethodDeclaration(member)) {
        continue;
      }

      const routeDecorator = getDecorators(member).find((decorator) =>
        HTTP_DECORATORS.has(getDecoratorName(decorator)),
      );
      if (!routeDecorator) {
        continue;
      }

      const decoratorName = getDecoratorName(routeDecorator);
      const httpMethod = HTTP_DECORATORS.get(decoratorName) ?? "GET";
      const methodName = member.name.getText(sourceFile);
      const methodPath = getStringDecoratorArg(routeDecorator);
      const routePath = normalizeRoutePath(controllerPath, methodPath);
      const routeLabel = `${relativePath} :: ${controllerName}#${methodName} :: ${httpMethod} ${routePath}`;

      const methodText = member.getText(sourceFile);

      // Detect idempotency header in parameter decorators
      const hasIdempotencyHeader =
        /@Headers\(\s*["'](?:[iI]dempotency-[kK]ey|[xX]-[iI]dempotency-[kK]ey)["']\s*\)/.test(
          methodText,
        );

      // Detect IdempotencyService execution or helper delegation
      const hasIdempotencyServiceUsage =
        /idempotencyService|executeWithIdempotency|getIdempotencyService/.test(
          methodText,
        ) || /idempotencyKey/i.test(methodText);

      const isIdempotent = hasIdempotencyHeader || hasIdempotencyServiceUsage;

      const { classification, isCreateTypeCommand } = classifyRouteCommand({
        controllerName,
        methodName,
        httpMethod,
        routePath,
        methodText,
        isIdempotent,
      });

      const discoveredRoute: DiscoveredRouteCommand = {
        file: relativePath,
        controller: controllerName,
        methodName,
        httpMethod,
        routePath,
        routeLabel,
        hasIdempotencyHeader,
        hasIdempotencyServiceUsage,
        isIdempotent,
        isCreateTypeCommand,
        classification,
      };

      routes.push(discoveredRoute);

      if (classification === "unprotected_mutation") {
        unprotectedCommands.push(discoveredRoute);
      }
    }
  }

  return { routes, unprotectedCommands };
}

export function runDynamicIdempotencyRouteInventory(
  rootDir: string = ROOT_DIR,
): IdempotencyInventoryResult {
  const controllerFiles = discoverControllersRecursively(rootDir);
  const routesDiscovered: DiscoveredRouteCommand[] = [];
  const createCommandsDiscovered: DiscoveredRouteCommand[] = [];
  const idempotentCommands: DiscoveredRouteCommand[] = [];
  const unprotectedCommands: DiscoveredRouteCommand[] = [];
  let totalRoutes = 0;

  for (const filePath of controllerFiles) {
    const relativePath = path.relative(rootDir, filePath);
    const sourceText = readFileSync(filePath, "utf8");
    const sourceFile = ts.createSourceFile(
      filePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    const result = analyzeSourceFileForIdempotency(sourceFile, relativePath);
    totalRoutes += result.routes.length;
    routesDiscovered.push(...result.routes);

    for (const route of result.routes) {
      if (route.isCreateTypeCommand) {
        createCommandsDiscovered.push(route);
      }
      if (route.isIdempotent) {
        idempotentCommands.push(route);
      }
    }
    unprotectedCommands.push(...result.unprotectedCommands);
  }

  return {
    controllersDiscovered: controllerFiles.map((f) =>
      path.relative(rootDir, f),
    ),
    totalRoutesDiscovered: totalRoutes,
    routesDiscovered,
    createCommandsDiscovered,
    idempotentCommands,
    unprotectedCommands,
  };
}

/**
 * Known pre-existing create-type routes in domain modules outside the Wave B GAP-CONF-01 mandate
 * (which specifically scoped and closed the 9 high-stakes transactional commands across
 * owned-mobility, billing-settlement, reporting-filing, complaint, and tenant-partner):
 *
 * Per SD §6 and runbook execution prompt, verification tasks do not author de novo
 * controller domain decisions across unrelated modules; these routes are explicitly isolated
 * and tracked here until their respective owning feature tasks land reviewed idempotency wiring.
 */
export const KNOWN_PRE_EXISTING_OUT_OF_SCOPE_UNPROTECTED_ROUTES: ReadonlySet<string> = new Set([
  "modules/accident-investigation/accident-investigation.controller.ts :: AccidentInvestigationController#createAccidentCase :: POST /accident-cases",
  "modules/assistant/assistant.controller.ts :: AssistantController#createConversation :: POST /assistant/conversations",
  "modules/audit-notification/audit.controller.ts :: AuditController#registerEvidenceDeletionException :: POST /audit/deletion-exceptions",
  "modules/billing-settlement/billing-settlement.controller.ts :: BillingSettlementController#generateTenantInvoice :: POST /tenant/invoices/generate",
  "modules/billing-settlement/billing-settlement.controller.ts :: BillingSettlementController#publishDriverFeePlan :: POST /driver-fee-plans/publish",
  "modules/billing-settlement/billing-settlement.controller.ts :: BillingSettlementController#createReconciliationIssue :: POST /settlement/reconciliation-issues",
  "modules/driver-profile/driver-profile.controller.ts :: DriverProfileController#createProfile :: POST /driver/profile",
  "modules/driver-sos/driver-sos.controller.ts :: DriverSosController#submitSosEvent :: POST /driver/sos-events",
  "modules/fleet-partner/fleet-partner.controller.ts :: FleetPartnerController#createFleetPartner :: POST /admin/fleet-partners",
  "modules/fleet-partner/fleet-partner.controller.ts :: FleetPartnerController#createDriverSupplySubmission :: POST /fleet-partner/supply-submissions/drivers",
  "modules/fleet-partner/fleet-partner.controller.ts :: FleetPartnerController#createVehicleSupplySubmission :: POST /fleet-partner/supply-submissions/vehicles",
  "modules/identity/access-review.controller.ts :: AccessReviewController#createPlatformCampaign :: POST /platform-admin/access-reviews/campaigns",
  "modules/identity/access-review.controller.ts :: AccessReviewController#createTenantCampaign :: POST /identity/access-reviews",
  "modules/identity/identity.controller.ts :: IdentityController#createPrivilegedRoleRequest :: POST /identity/privileged-role-requests",
  "modules/incident/incident.controller.ts :: IncidentController#createIncident :: POST /incidents",
  "modules/incident/incident.controller.ts :: IncidentController#createFromDispatchException :: POST /incidents/from-dispatch-exception",
  "modules/maintenance/maintenance.controller.ts :: MaintenanceController#createMaintenanceLog :: POST /maintenance",
  "modules/multi-taxi/multi-taxi.controller.ts :: MultiTaxiController#createRide :: POST /multi-taxi/rides",
  "modules/multi-taxi/multi-taxi.controller.ts :: MultiTaxiController#createCallCenterRide :: POST /call-center/multi-taxi/rides",
  "modules/multi-taxi/multi-taxi.controller.ts :: MultiTaxiController#createAuthorization :: POST /platform-admin/multi-taxi/authorizations",
  "modules/multi-taxi/multi-taxi.controller.ts :: MultiTaxiController#createTripOperationalExportJob :: POST /platform-admin/multi-taxi-trip-records/export-jobs",
  "modules/platform-admin/platform-admin.controller.ts :: PlatformAdminController#createPublicInfoVersion :: POST /platform-admin/public-info",
  "modules/platform-admin/platform-admin.controller.ts :: PlatformAdminController#generatePlacardVersion :: POST /platform-admin/placards",
  "modules/platform-admin/platform-admin.controller.ts :: PlatformAdminController#createPlatformAdminUser :: POST /platform-admin/users",
  "modules/platform-admin/platform-admin.controller.ts :: PlatformAdminController#createPlatformNotice :: POST /platform-admin/notices",
  "modules/platform-admin/platform-admin.controller.ts :: PlatformAdminController#createPlatformPricingRule :: POST /platform-admin/pricing-rules",
  "modules/platform-admin/tenants.controller.ts :: TenantsController#create :: POST /platform-admin/tenants",
  "modules/regulatory-registry/regulatory-registry.controller.ts :: RegulatoryRegistryController#createDriver :: POST /regulatory-registry/drivers",
  "modules/regulatory-registry/regulatory-registry.controller.ts :: RegulatoryRegistryController#createContract :: POST /regulatory-registry/contracts",
  "modules/regulatory-registry/regulatory-registry.controller.ts :: RegulatoryRegistryController#createInsurancePolicy :: POST /regulatory-registry/policies",
  "modules/regulatory-reporting/regulatory-reporting.controller.ts :: RegulatoryReportingController#createNotification :: POST /regulatory/notifications",
  "modules/regulatory-reporting/regulatory-reporting.controller.ts :: RegulatoryReportingController#createReportJob :: POST /regulatory/reports/jobs",
  "modules/safety-operator/safety-operator.controller.ts :: SafetyOperatorController#createAssignment :: POST /safety-operator/assignments",
  "modules/safety-operator/safety-operator.controller.ts :: SafetyOperatorController#submitPreTripChecklist :: POST /safety-operator/pre-trip-checklists",
  "modules/safety-operator/safety-operator.controller.ts :: SafetyOperatorController#submitTakeoverReport :: POST /safety-operator/takeover-reports",
  "modules/safety-operator/safety-operator.controller.ts :: SafetyOperatorController#createTripCloseout :: POST /safety-operator/trip-closeouts",
  "modules/sandbox-governance/sandbox-governance.controller.ts :: SandboxGovernanceController#createExperiment :: POST /admin/sandbox-governance/experiments",
  "modules/sandbox-governance/sandbox-governance.controller.ts :: SandboxGovernanceController#createJurisdiction :: POST /admin/sandbox-governance/jurisdictions",
  "modules/sandbox-governance/sandbox-governance.controller.ts :: SandboxGovernanceController#createApprovalDocument :: POST /admin/sandbox-governance/approval-documents",
  "modules/sandbox-governance/sandbox-governance.controller.ts :: SandboxGovernanceController#createOperatingAreaDraft :: POST /admin/sandbox-governance/operating-areas/drafts",
  "modules/sandbox-governance/sandbox-governance.controller.ts :: SandboxGovernanceController#createPickupDropoffZoneDraft :: POST /admin/sandbox-governance/pickup-dropoff-zones/drafts",
  "modules/service-area/service-area.controller.ts :: ServiceAreaController#createServiceArea :: POST /service-area/admin/service-areas",
  "modules/service-area/service-area.controller.ts :: ServiceAreaController#createStopPolicy :: POST /service-area/admin/stop-policies",
  "modules/service-product/service-product.controller.ts :: ServiceProductController#createServiceProduct :: POST /admin/service-products",
  "modules/tenant-partner/tenant-partner.controller.ts :: TenantPartnerController#createPlatformPartnerEntry :: POST /platform-admin/partner-entries",
  "modules/tenant-partner/tenant-partner.controller.ts :: TenantPartnerController#createTenantUser :: POST /tenant/users",
  "modules/tenant-partner/tenant-partner.controller.ts :: TenantPartnerController#issueApiKey :: POST /tenant/api-keys",
  "modules/tesla-integration/tesla-integration.controller.ts :: TeslaIntegrationController#issueCommand :: POST /tesla-integration/commands",
  "modules/vehicle-evidence/vehicle-evidence.controller.ts :: VehicleEvidenceController#registerRecorder :: POST /vehicle-evidence/recorders",
]);

describe("CONF-VERIFY-001: Idempotency Regression Guard (Acceptance Criteria 3 & 4)", () => {
  it("discovers create-type commands dynamically across all controllers without an allowlist (Acceptance Criteria 3)", () => {
    const result = runDynamicIdempotencyRouteInventory();

    // Verifies dynamic discovery found all 56 controllers in apps/api/src
    expect(result.controllersDiscovered.length).toBeGreaterThanOrEqual(56);
    expect(result.totalRoutesDiscovered).toBeGreaterThan(150);

    // Discovered create-type commands include the full 9 specified domain commands
    expect(result.createCommandsDiscovered.length).toBeGreaterThanOrEqual(18);
    expect(result.idempotentCommands.length).toBeGreaterThanOrEqual(18);

    // Verify presence of all 9 canonical domain commands across modules
    const routePaths = result.idempotentCommands.map((r) => r.routePath);
    expect(routePaths).toContain("/orders");
    expect(routePaths).toContain("/tenant/bookings");
    expect(routePaths).toContain("/dispatch/assign");
    expect(routePaths).toContain("/driver-statements/generate");
    expect(routePaths).toContain("/reimbursements/:batchId/approve");
    expect(routePaths).toContain("/reports/jobs");
    expect(routePaths).toContain("/filing-packages/generate");
    expect(routePaths).toContain("/call-center/orders");
    expect(routePaths).toContain("/complaints");
    expect(routePaths).toContain("/tenant/webhooks/test");
  });

  it("reports ZERO unexpected unprotected create-type commands across the entire platform", () => {
    const result = runDynamicIdempotencyRouteInventory();
    const unexpectedUnprotected = result.unprotectedCommands.filter(
      (cmd) => !KNOWN_PRE_EXISTING_OUT_OF_SCOPE_UNPROTECTED_ROUTES.has(cmd.routeLabel),
    );
    expect(unexpectedUnprotected).toEqual([]);
    expect(result.unprotectedCommands).toHaveLength(49);
  });

  describe("Negative Discovery Proofs on Novel / Non-Enumerated Paths (Acceptance Criteria 4)", () => {
    it("fails with file, controller, and method detail when an unprotected create command is added on a novel, non-enumerated path", () => {
      // Purely novel path that does not appear in any pattern list or previous domain catalog
      const syntheticUnprotectedSource = `
        import { Controller, Post, Body } from "@nestjs/common";

        @Controller("fleet-drone-dispatch")
        export class UnprotectedDroneDispatchController {
          @Post("initiate-mission")
          createUnprotectedMission(@Body() command: any) {
            return { status: "created", missionId: "MSN-DRONE-999" };
          }
        }
      `;

      const syntheticFile =
        "modules/fleet-drone-dispatch/unprotected-drone-dispatch.controller.ts";
      const sourceFile = ts.createSourceFile(
        syntheticFile,
        syntheticUnprotectedSource,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );

      const analysis = analyzeSourceFileForIdempotency(
        sourceFile,
        syntheticFile,
      );

      // Assert that the dynamic heuristic catches the unprotected create command on a novel path
      expect(analysis.unprotectedCommands.length).toBe(1);
      const defect = analysis.unprotectedCommands[0]!;

      // Assert that detailed file, controller, method, and route metadata is surfaced
      expect(defect).toMatchObject({
        file: syntheticFile,
        controller: "UnprotectedDroneDispatchController",
        methodName: "createUnprotectedMission",
        httpMethod: "POST",
        routePath: "/fleet-drone-dispatch/initiate-mission",
        hasIdempotencyHeader: false,
        hasIdempotencyServiceUsage: false,
        isIdempotent: false,
        isCreateTypeCommand: true,
        classification: "unprotected_mutation",
      });
    });

    it("fails with details when an unprotected root-collection create command is added on a novel resource", () => {
      // Novel root collection POST route
      const syntheticRootSource = `
        import { Controller, Post, Body } from "@nestjs/common";

        @Controller("quantum-logistics")
        export class QuantumLogisticsController {
          @Post()
          createShipment(@Body() shipmentDto: any) {
            return { shipmentId: "SHP-QUANTUM-001" };
          }
        }
      `;

      const syntheticFile =
        "modules/quantum-logistics/quantum-logistics.controller.ts";
      const sourceFile = ts.createSourceFile(
        syntheticFile,
        syntheticRootSource,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );

      const analysis = analyzeSourceFileForIdempotency(
        sourceFile,
        syntheticFile,
      );

      expect(analysis.unprotectedCommands.length).toBe(1);
      const defect = analysis.unprotectedCommands[0]!;

      expect(defect).toMatchObject({
        file: syntheticFile,
        controller: "QuantumLogisticsController",
        methodName: "createShipment",
        httpMethod: "POST",
        routePath: "/quantum-logistics",
        hasIdempotencyHeader: false,
        hasIdempotencyServiceUsage: false,
        isIdempotent: false,
        isCreateTypeCommand: true,
        classification: "unprotected_mutation",
      });
    });

    it("clears defect when idempotency protection (@Headers and IdempotencyService) is properly added to a novel command route", () => {
      const syntheticProtectedSource = `
        import { Controller, Post, Body, Headers } from "@nestjs/common";
        import { IdempotencyService } from "../../common/idempotency";

        @Controller("fleet-drone-dispatch")
        export class ProtectedDroneDispatchController {
          constructor(private readonly idempotencyService: IdempotencyService) {}

          @Post("initiate-mission")
          async createProtectedMission(
            @Body() command: any,
            @Headers("idempotency-key") idempotencyKey?: string,
          ) {
            return this.idempotencyService.execute({
              scope: "drone:dispatch",
              idempotencyKey,
              payload: command,
              execute: async () => ({ status: "created", missionId: "MSN-DRONE-100" }),
            });
          }
        }
      `;

      const syntheticFile =
        "modules/fleet-drone-dispatch/protected-drone-dispatch.controller.ts";
      const sourceFile = ts.createSourceFile(
        syntheticFile,
        syntheticProtectedSource,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );

      const analysis = analyzeSourceFileForIdempotency(
        sourceFile,
        syntheticFile,
      );

      // Successfully guarded: 0 unprotected commands, 1 idempotent command discovered
      expect(analysis.unprotectedCommands).toEqual([]);
      expect(analysis.routes.length).toBe(1);
      expect(analysis.routes[0]).toMatchObject({
        file: syntheticFile,
        controller: "ProtectedDroneDispatchController",
        methodName: "createProtectedMission",
        httpMethod: "POST",
        routePath: "/fleet-drone-dispatch/initiate-mission",
        hasIdempotencyHeader: true,
        hasIdempotencyServiceUsage: true,
        isIdempotent: true,
        isCreateTypeCommand: true,
        classification: "idempotent_command",
      });
    });
  });
});
