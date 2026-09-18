import { afterEach, describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import { EventEmitter } from "node:events";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { BootstrapAuthGuard } from "../../apps/api/src/common/auth/bootstrap-auth.guard";
import { resolveRouteAuthPolicy } from "../../apps/api/src/common/auth/auth.policy";
import type { BootstrapRequestIdentity } from "../../apps/api/src/common/auth/auth.types";
import { DriverProfileService } from "../../apps/api/src/modules/driver-profile/driver-profile.service";
import { DriverSettingsController } from "../../apps/api/src/modules/driver-settings/driver-settings.controller";
import { DriverSettingsService } from "../../apps/api/src/modules/driver-settings/driver-settings.service";
import { DriverSosController } from "../../apps/api/src/modules/driver-sos/driver-sos.controller";
import { DriverSosService } from "../../apps/api/src/modules/driver-sos/driver-sos.service";
import { PlatformPresenceController } from "../../apps/api/src/modules/platform-presence/platform-presence.controller";
import { PlatformPresenceService } from "../../apps/api/src/modules/platform-presence/platform-presence.service";
import { PlatformEarningsController } from "../../apps/api/src/modules/platform-earnings/platform-earnings.controller";
import { PlatformEarningsService } from "../../apps/api/src/modules/platform-earnings/platform-earnings.service";
import { DriverHeartbeatController } from "../../apps/api/src/modules/regulatory-registry/driver-heartbeat.controller";
import { RegulatoryRegistryService } from "../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { OwnedMobilityController } from "../../apps/api/src/modules/owned-mobility/owned-mobility.controller";
import { OwnedMobilityService } from "../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { OwnedMobilityTaskEventsService } from "../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { SafetyOperatorController } from "../../apps/api/src/modules/safety-operator/safety-operator.controller";
import { SafetyOperatorService } from "../../apps/api/src/modules/safety-operator/safety-operator.service";
import { DriverDeviceSessionService } from "../../apps/api/src/modules/auth/driver-device-session.service";
import { NotificationsController } from "../../apps/api/src/modules/audit-notification/notifications.controller";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { OpsDispatchEventsService } from "../../apps/api/src/common/ops-dispatch-events.service";
import { CallcenterService } from "../../apps/api/src/modules/callcenter/callcenter.service";
import { IdempotencyService } from "../../apps/api/src/common/idempotency";

const ROOT_DIR = path.resolve(__dirname, "../../apps/api/src");

const HTTP_DECORATORS = new Map<string, string>([
  ["Get", "GET"],
  ["Post", "POST"],
  ["Put", "PUT"],
  ["Patch", "PATCH"],
  ["Delete", "DELETE"],
  ["Head", "HEAD"],
  ["Options", "OPTIONS"],
  ["Sse", "GET"],
]);

interface DiscoveredDriverRoute {
  file: string;
  controller: string;
  methodName: string;
  httpMethod: string;
  routePath: string;
  effectiveOpen: boolean;
  effectiveRealms: string[];
  effectiveScopes: string[];
  hasCentralPolicy: boolean;
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

function getArrayDecoratorArgs(decorator: ts.Decorator): string[] {
  const expression = decorator.expression;
  if (!ts.isCallExpression(expression)) {
    return [];
  }
  const args: string[] = [];
  for (const argument of expression.arguments) {
    if (
      ts.isStringLiteral(argument) ||
      ts.isNoSubstitutionTemplateLiteral(argument)
    ) {
      args.push(argument.text);
    } else if (ts.isArrayLiteralExpression(argument)) {
      for (const element of argument.elements) {
        if (
          ts.isStringLiteral(element) ||
          ts.isNoSubstitutionTemplateLiteral(element)
        ) {
          args.push(element.text);
        }
      }
    }
  }
  return args;
}

function normalizeRoutePath(controllerPath: string, methodPath: string): string {
  const cleanController = controllerPath.replace(/^\/+|\/+$/g, "");
  const cleanMethod = methodPath.replace(/^\/+|\/+$/g, "");
  if (!cleanController && !cleanMethod) {
    return "/";
  }
  if (!cleanController) {
    return `/${cleanMethod}`;
  }
  if (!cleanMethod) {
    return `/${cleanController}`;
  }
  return `/${cleanController}/${cleanMethod}`;
}

function discoverAllDriverRoutes(): DiscoveredDriverRoute[] {
  const files: string[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".controller.ts")) {
        files.push(fullPath);
      }
    }
  }
  walk(ROOT_DIR);

  const driverRoutes: DiscoveredDriverRoute[] = [];

  for (const filePath of files) {
    const relativePath = path.relative(ROOT_DIR, filePath);
    const content = readFileSync(filePath, "utf-8");
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
    );

    for (const statement of sourceFile.statements) {
      if (!ts.isClassDeclaration(statement)) continue;
      const classDecorators = getDecorators(statement);
      const controllerDec = classDecorators.find(
        (d) => getDecoratorName(d) === "Controller",
      );
      if (!controllerDec) continue;

      const controllerName = statement.name?.getText(sourceFile) ?? "AnonymousController";
      const controllerPath = getStringDecoratorArg(controllerDec);

      const classRealmsDec = classDecorators.find(
        (d) => getDecoratorName(d) === "RequireRealms",
      );
      const classScopesDec = classDecorators.find(
        (d) => getDecoratorName(d) === "RequireScopes",
      );
      const classOpenDec = classDecorators.find(
        (d) => getDecoratorName(d) === "OpenRoute",
      );

      const classRealms = classRealmsDec ? getArrayDecoratorArgs(classRealmsDec) : [];
      const classScopes = classScopesDec ? getArrayDecoratorArgs(classScopesDec) : [];
      const isClassOpen = Boolean(classOpenDec);

      for (const member of statement.members) {
        if (!ts.isMethodDeclaration(member)) continue;
        const memberDecorators = getDecorators(member);
        const routeDecorator = memberDecorators.find((d) =>
          HTTP_DECORATORS.has(getDecoratorName(d)),
        );
        if (!routeDecorator) continue;

        const decoratorName = getDecoratorName(routeDecorator);
        const httpMethod = HTTP_DECORATORS.get(decoratorName)!;
        const methodName = member.name.getText(sourceFile);
        const methodPath = getStringDecoratorArg(routeDecorator);
        const routePath = normalizeRoutePath(controllerPath, methodPath);

        const methodRealmsDec = memberDecorators.find(
          (d) => getDecoratorName(d) === "RequireRealms",
        );
        const methodScopesDec = memberDecorators.find(
          (d) => getDecoratorName(d) === "RequireScopes",
        );
        const methodOpenDec = memberDecorators.find(
          (d) => getDecoratorName(d) === "OpenRoute",
        );

        const methodRealms = methodRealmsDec ? getArrayDecoratorArgs(methodRealmsDec) : [];
        const methodScopes = methodScopesDec ? getArrayDecoratorArgs(methodScopesDec) : [];
        const effectiveOpen = Boolean(methodOpenDec) || isClassOpen;
        const effectiveRealms = methodRealms.length > 0 ? methodRealms : classRealms;
        const effectiveScopes = methodScopes.length > 0 ? methodScopes : classScopes;

        const strippedRoute = routePath.replace(/^\/+/, "");
        const centralPolicy = resolveRouteAuthPolicy(httpMethod, strippedRoute);

        const isDriverFacing =
          effectiveRealms.includes("driver") ||
          (centralPolicy && centralPolicy.allowedRealms.includes("driver")) ||
          strippedRoute.startsWith("driver/") ||
          strippedRoute.startsWith("driver-") ||
          strippedRoute.startsWith("safety-operator") ||
          strippedRoute.startsWith("platform-presence") ||
          strippedRoute.startsWith("platform-earnings") ||
          strippedRoute.startsWith("shift-attendance") ||
          strippedRoute.startsWith("auth/driver/device");

        if (isDriverFacing) {
          driverRoutes.push({
            file: relativePath,
            controller: controllerName,
            methodName,
            httpMethod,
            routePath,
            effectiveOpen,
            effectiveRealms,
            effectiveScopes,
            hasCentralPolicy: Boolean(centralPolicy),
          });
        }
      }
    }
  }

  return driverRoutes;
}

function createExecutionContext(
  handler: unknown,
  controllerClass: unknown,
  request: Record<string, unknown>,
) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => handler,
    getClass: () => controllerClass,
  } as any;
}

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("BE-DRV-AUTHZ-001: Driver Authorization Server-Side Enforcement", () => {
  const driverRoutes = discoverAllDriverRoutes();

  it("dynamically discovers driver routes and confirms non-empty runtime inventory", () => {
    expect(driverRoutes.length).toBeGreaterThanOrEqual(25);
  });

  describe("Criterion 4 & 5: Runtime Derivation & Zero Unguarded Endpoints", () => {
    it("verifies every driver-facing route has either explicit guard decorators or central policy (no unguarded routes)", () => {
      const publicRoutes = new Set([
        "/auth/driver/device/register",
        "/auth/driver/device/refresh",
      ]);

      for (const route of driverRoutes) {
        if (publicRoutes.has(route.routePath)) {
          expect(route.effectiveOpen).toBe(true);
          continue;
        }

        const isProtected =
          route.effectiveRealms.length > 0 || route.hasCentralPolicy;

        expect(
          isProtected,
          `Route ${route.httpMethod} ${route.routePath} (${route.controller}#${route.methodName}) must be protected with realm guard or central policy.`,
        ).toBe(true);

        expect(
          route.effectiveOpen,
          `Protected route ${route.httpMethod} ${route.routePath} must not be marked OpenRoute.`,
        ).toBe(false);
      }
    });
  });

  describe("Criterion 2: Unauthenticated Requests Rejected with 401", () => {
    const reflector = {
      getAllAndOverride: <T>(
        metadataKey: string,
        targets: (unknown | undefined)[],
      ): T | undefined => {
        for (const target of targets) {
          if (!target) continue;
          const value = Reflect.getMetadata(metadataKey, target as object);
          if (value !== undefined) {
            return value as T;
          }
        }
        return undefined;
      },
    };
    const guard = new BootstrapAuthGuard(reflector as any);

    it("rejects unauthenticated requests on all protected driver routes with 401 AUTH_REQUIRED", async () => {
      const publicRoutes = new Set([
        "/api/auth/driver/device/register",
        "/api/auth/driver/device/refresh",
      ]);

      for (const route of driverRoutes) {
        const fullPath = route.routePath.startsWith("/api")
          ? route.routePath
          : `/api${route.routePath}`;

        if (publicRoutes.has(fullPath)) continue;

        const req: Record<string, unknown> = {
          headers: {},
          method: route.httpMethod,
          originalUrl: fullPath,
          url: fullPath,
        };

        const ctx = createExecutionContext(() => {}, Object, req);

        let caughtError: any = null;
        try {
          await guard.canActivate(ctx);
        } catch (error: any) {
          caughtError = error;
        }

        expect(
          caughtError,
          `Expected 401 unauthenticated rejection on ${route.httpMethod} ${fullPath}`,
        ).toBeDefined();

        expect(
          caughtError.getStatus ? caughtError.getStatus() : caughtError.status,
        ).toBe(401);
      }
    });
  });

  describe("Criterion 3: Cross-Driver Resource Access Rejected with 403/404", () => {
    const driver1Identity: BootstrapRequestIdentity = {
      authMode: "bootstrap_headers",
      actorType: "driver_user",
      actorId: "drv-001",
      realm: "driver",
      tenantId: null,
      roles: ["driver_user"],
      scopes: ["driver:read", "driver:write", "incident:write", "dispatch:read"],
      roleFamilies: ["driver"],
      requestId: null,
    };

    it("OwnedMobilityController: rejects cross-driver access and filters tasks", async () => {
      const audit = new AuditNotificationService();
      const ops = new OpsDispatchEventsService(new EventEmitter() as never);
      const profile = new DriverProfileService(audit);
      const registry = new RegulatoryRegistryService(ops, audit, profile);
      const callcenter = new CallcenterService(audit);
      const taskEvents = new OwnedMobilityTaskEventsService(new EventEmitter() as never);
      const owned = new OwnedMobilityService(registry, audit, callcenter, taskEvents, ops);
      const idempotency = new IdempotencyService({} as any);
      const controller = new OwnedMobilityController(owned, idempotency);

      // 1. listDriverTasks: when drv-001 passes driverId=drv-002 -> throws 403 DRIVER_IDENTITY_MISMATCH
      expect(() => controller.listDriverTasks(driver1Identity, "drv-002")).toThrowError(ApiRequestError);
      try {
        controller.listDriverTasks(driver1Identity, "drv-002");
      } catch (err: any) {
        expect(err.getStatus()).toBe(403);
        expect(err.code).toBe("DRIVER_IDENTITY_MISMATCH");
      }

      // 2. streamDriverTaskEvents: when drv-001 requests drv-002 -> throws 403 DRIVER_IDENTITY_MISMATCH
      expect(() => controller.streamDriverTaskEvents(driver1Identity, "drv-002")).toThrowError(ApiRequestError);
      try {
        controller.streamDriverTaskEvents(driver1Identity, "drv-002");
      } catch (err: any) {
        expect(err.getStatus()).toBe(403);
        expect(err.code).toBe("DRIVER_IDENTITY_MISMATCH");
      }

      // Populate a task for drv-002
      (owned as any).driverTasks.push({
        taskId: "task-drv-002",
        driverId: "drv-002",
        orderId: "ord-999",
        vehicleId: "veh-1",
        pickupAddress: "Loc A",
        dropoffAddress: "Loc B",
        status: "assigned",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // 3. getDriverTask on drv-002 task -> throws 403 DRIVER_IDENTITY_MISMATCH
      expect(() => controller.getDriverTask("task-drv-002", driver1Identity)).toThrowError(ApiRequestError);
      try {
        controller.getDriverTask("task-drv-002", driver1Identity);
      } catch (err: any) {
        expect(err.getStatus()).toBe(403);
        expect(err.code).toBe("DRIVER_IDENTITY_MISMATCH");
      }

      // 4. Mutating actions on drv-002 task -> throws 403 DRIVER_IDENTITY_MISMATCH
      const now = new Date().toISOString();
      await expect(controller.acceptDriverTask("task-drv-002", { acceptedAt: now } as any, driver1Identity)).rejects.toThrowError(ApiRequestError);
      await expect(controller.rejectDriverTask("task-drv-002", { reasonCode: "vehicle_issue", rejectedAt: now } as any, driver1Identity)).rejects.toThrowError(ApiRequestError);
      await expect(controller.departDriverTask("task-drv-002", { departedAt: now } as any, driver1Identity)).rejects.toThrowError(ApiRequestError);
      await expect(controller.arrivePickup("task-drv-002", { arrivedAt: now } as any, driver1Identity)).rejects.toThrowError(ApiRequestError);
      await expect(controller.startDriverTask("task-drv-002", { startedAt: now } as any, driver1Identity)).rejects.toThrowError(ApiRequestError);
      await expect(controller.completeDriverTask("task-drv-002", { completedAt: now, actualDistanceKm: 10, actualDurationSec: 600 } as any, driver1Identity)).rejects.toThrowError(ApiRequestError);
    });

    it("PlatformPresenceController: rejects cross-driver presence query and updates", async () => {
      const presenceService = new PlatformPresenceService();
      const presenceController = new PlatformPresenceController(presenceService);

      // getSummary with drv-002 -> 403
      await expect(presenceController.getSummary(driver1Identity, "drv-002")).rejects.toThrowError(ApiRequestError);
      try {
        await presenceController.getSummary(driver1Identity, "drv-002");
      } catch (err: any) {
        expect(err.getStatus()).toBe(403);
        expect(err.code).toBe("DRIVER_IDENTITY_MISMATCH");
      }

      // setOnline with drv-002 -> 403
      await expect(presenceController.setOnline(driver1Identity, { platformCode: "uber" }, "drv-002")).rejects.toThrowError(ApiRequestError);
      try {
        await presenceController.setOnline(driver1Identity, { platformCode: "uber" }, "drv-002");
      } catch (err: any) {
        expect(err.getStatus()).toBe(403);
        expect(err.code).toBe("DRIVER_IDENTITY_MISMATCH");
      }

      // setOffline with drv-002 -> 403
      await expect(presenceController.setOffline(driver1Identity, { platformCode: "uber" }, "drv-002")).rejects.toThrowError(ApiRequestError);
      try {
        await presenceController.setOffline(driver1Identity, { platformCode: "uber" }, "drv-002");
      } catch (err: any) {
        expect(err.getStatus()).toBe(403);
        expect(err.code).toBe("DRIVER_IDENTITY_MISMATCH");
      }
    });

    it("PlatformEarningsController: rejects cross-driver earnings queries", async () => {
      const earningsService = new PlatformEarningsService();
      const earningsController = new PlatformEarningsController(earningsService);

      // getSummary with drv-002 -> 403
      await expect(earningsController.getSummary(driver1Identity, "drv-002")).rejects.toThrowError(ApiRequestError);
      try {
        await earningsController.getSummary(driver1Identity, "drv-002");
      } catch (err: any) {
        expect(err.getStatus()).toBe(403);
        expect(err.code).toBe("DRIVER_IDENTITY_MISMATCH");
      }

      // getByPlatform with drv-002 -> 403
      await expect(earningsController.getByPlatform(driver1Identity, "drv-002")).rejects.toThrowError(ApiRequestError);
      try {
        await earningsController.getByPlatform(driver1Identity, "drv-002");
      } catch (err: any) {
        expect(err.getStatus()).toBe(403);
        expect(err.code).toBe("DRIVER_IDENTITY_MISMATCH");
      }
    });

    it("DriverHeartbeatController: rejects cross-driver location batches and tracking status queries", async () => {
      const audit = new AuditNotificationService();
      const ops = new OpsDispatchEventsService(new EventEmitter() as never);
      const profile = new DriverProfileService(audit);
      const registry = new RegulatoryRegistryService(ops, audit, profile);
      const controller = new DriverHeartbeatController(registry);

      // recordHeartbeatBatch with another driver's item -> 403
      await expect(
        controller.recordHeartbeatBatch(
          {
            items: [
              {
                driverId: "drv-002",
                lat: 25.033,
                lng: 121.565,
                recordedAt: new Date().toISOString(),
              } as any,
            ],
          },
          driver1Identity,
        ),
      ).rejects.toThrowError(ApiRequestError);

      try {
        await controller.recordHeartbeatBatch(
          {
            items: [
              {
                driverId: "drv-002",
                lat: 25.033,
                lng: 121.565,
                recordedAt: new Date().toISOString(),
              } as any,
            ],
          },
          driver1Identity,
        );
      } catch (err: any) {
        expect(err.getStatus()).toBe(403);
        expect(err.code).toBe("DRIVER_IDENTITY_MISMATCH");
      }

      // getTrackingStatus with drv-002 -> 403
      await expect(controller.getTrackingStatus("drv-002", driver1Identity)).rejects.toThrowError(ApiRequestError);
      try {
        await controller.getTrackingStatus("drv-002", driver1Identity);
      } catch (err: any) {
        expect(err.getStatus()).toBe(403);
        expect(err.code).toBe("DRIVER_IDENTITY_MISMATCH");
      }
    });

    it("DriverSettingsController: non-leaking rejection on cross-driver settings queries and mutations", () => {
      const audit = new AuditNotificationService();
      const service = new DriverSettingsService(audit);
      const controller = new DriverSettingsController(service);

      // getSettings on drv-002 by drv-001 -> 404 DRIVER_SETTINGS_NOT_FOUND
      expect(() => controller.getSettings("drv-002", driver1Identity)).toThrowError(ApiRequestError);
      try {
        controller.getSettings("drv-002", driver1Identity);
      } catch (err: any) {
        expect(err.getStatus()).toBe(404);
        expect(err.code).toBe("DRIVER_SETTINGS_NOT_FOUND");
      }

      // updateSettings on drv-002 by drv-001 -> 404 DRIVER_SETTINGS_NOT_FOUND
      expect(() => controller.updateSettings("drv-002", { autoAcceptDispatch: true } as any, driver1Identity)).toThrowError(ApiRequestError);
      try {
        controller.updateSettings("drv-002", { autoAcceptDispatch: true } as any, driver1Identity);
      } catch (err: any) {
        expect(err.getStatus()).toBe(404);
        expect(err.code).toBe("DRIVER_SETTINGS_NOT_FOUND");
      }
    });

    it("DriverSosController: non-leaking rejection when accessing another driver's SOS event attachments", async () => {
      const audit = new AuditNotificationService();
      const mockIncident = {
        allocateIncidentId: () => "inc-001",
        registerPersistedIncident: () => {},
      };
      const service = new DriverSosService(audit, mockIncident as any);
      const controller = new DriverSosController(service);

      // drv-002 creates SOS event
      const driver2Identity: BootstrapRequestIdentity = {
        ...driver1Identity,
        actorId: "drv-002",
      };
      const event2Envelope = await controller.submitSosEvent(
        {
          clientEventId: randomUUID(),
          originalTriggeredAt: new Date().toISOString(),
          eventType: "security_incident",
          severity: "major",
          description: "Emergency on drv-002",
          location: {
            lat: 25.033,
            lng: 121.565,
            recordedAt: new Date().toISOString(),
          },
        } as any,
        driver2Identity,
      );
      const sosEventId = event2Envelope.data.event.sosEventId;

      // drv-001 tries to create attachment upload intent on drv-002 event -> 404 DRIVER_SOS_EVENT_NOT_FOUND
      await expect(
        controller.createAttachmentUploadIntent(
          sosEventId,
          {
            attachmentType: "audio",
            fileName: "record.aac",
            contentType: "audio/aac",
            byteSize: 1024,
            sha256: "abc",
          } as any,
          driver1Identity,
        ),
      ).rejects.toThrowError(ApiRequestError);

      try {
        await controller.createAttachmentUploadIntent(
          sosEventId,
          {
            attachmentType: "audio",
            fileName: "record.aac",
            contentType: "audio/aac",
            byteSize: 1024,
            sha256: "abc",
          } as any,
          driver1Identity,
        );
      } catch (err: any) {
        expect(err.getStatus()).toBe(404);
        expect(err.code).toBe("DRIVER_SOS_EVENT_NOT_FOUND");
      }
    });

    it("SafetyOperatorController: rejects cross-operator queries and mutations with 403", async () => {
      const audit = new AuditNotificationService();
      const service = new SafetyOperatorService(audit);
      const controller = new SafetyOperatorController(service);

      // checkQualification with another operator ID -> 403 SAFETY_OPERATOR_IDENTITY_MISMATCH
      expect(() =>
        controller.checkQualification("op-other", "sb-1", undefined, undefined, driver1Identity),
      ).toThrowError(ApiRequestError);

      try {
        controller.checkQualification("op-other", "sb-1", undefined, undefined, driver1Identity);
      } catch (err: any) {
        expect(err.getStatus()).toBe(403);
        expect(err.code).toBe("SAFETY_OPERATOR_IDENTITY_MISMATCH");
      }

      // createAssignment for another operator -> 403 SAFETY_OPERATOR_IDENTITY_MISMATCH
      await expect(
        controller.createAssignment(
          {
            safetyOperatorId: "op-other",
            sandboxProgramId: "sb-1",
            vehicleId: "veh-1",
            scheduledStart: new Date().toISOString(),
            scheduledEnd: new Date().toISOString(),
          } as any,
          driver1Identity,
        ),
      ).rejects.toThrowError(ApiRequestError);
    });

    it("NotificationsController: rejects acknowledging another user's notifications with 403", () => {
      const audit = new AuditNotificationService();
      const controller = new NotificationsController(audit);

      (audit as any).notifications.push({
        notificationId: "notif-usr-other",
        recipientUserId: "usr-other",
        title: "Security Alert",
        body: "Alert for other user",
        read: false,
        createdAt: new Date().toISOString(),
      });

      expect(() =>
        controller.markNotificationsRead(
          { notificationIds: ["notif-usr-other"] },
          driver1Identity,
        ),
      ).toThrowError(ApiRequestError);

      try {
        controller.markNotificationsRead(
          { notificationIds: ["notif-usr-other"] },
          driver1Identity,
        );
      } catch (err: any) {
        expect(err.getStatus()).toBe(403);
        expect(err.code).toBe("NOTIFICATION_ACTOR_MISMATCH");
      }
    });

    it("DriverDeviceSessionService: rejects revoking another driver's device binding with 403", async () => {
      const audit = new AuditNotificationService();
      const driverProfileService = new DriverProfileService(audit);
      const mockJwtAuthService = {
        sign: () => "mock-jwt-token",
        issueSessionToken: async () => ({ token: "mock-jwt-token", expiresAt: new Date().toISOString() }),
      };
      const service = new DriverDeviceSessionService(mockJwtAuthService as any, driverProfileService);

      const issued = await service.issueRegistrationInvitation({
        driverId: "drv-002",
      });

      const binding2 = await service.register({
        deviceId: "device-2",
        registrationCode: issued.registrationCode,
        platform: "android",
        appVersion: "1.0.0",
        deviceModel: "Pixel 7",
        osVersion: "13",
      } as any);

      await expect(
        service.revoke(
          { bindingId: binding2.bindingId, deviceId: "device-2" },
          driver1Identity,
        ),
      ).rejects.toThrowError(ApiRequestError);

      try {
        await service.revoke(
          { bindingId: binding2.bindingId, deviceId: "device-2" },
          driver1Identity,
        );
      } catch (err: any) {
        expect(err.getStatus()).toBe(403);
        expect(err.code).toBe("DRIVER_DEVICE_BINDING_FORBIDDEN");
      }
    });
  });
});
