// @vitest-environment jsdom
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { resolve } from "node:path";
import { act, cleanup, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as canvas from "../../../packages/ui-web/src/index";
import { t } from "../../../apps/platform-admin-web/lib/translations";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { PlatformAdminService } from "../../../apps/api/src/modules/platform-admin/platform-admin.service";
import { sourceModuleLoader } from "./source-module-loader";
import { wireHarness, principal } from "./wire-harness";
import {
  PATH_METADATA,
  METHOD_METADATA,
} from "../../../apps/api/node_modules/@nestjs/common/constants";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const entry = "apps/api/src/modules/platform-admin/platform-admin.service.ts";
const moduleEntry =
  "apps/api/src/modules/feature-flags/feature-flags.module.ts";
const page = "apps/platform-admin-web/app/notices/page.tsx";
describe("same behavioral assertions on immutable original entries and fixed entries", () => {
  it("C109-F4 command creates selected in-app routing records, without a fabricated delivery", () => {
    const load = sourceModuleLoader({}, [entry]);
    const Service = load<{ PlatformAdminService: typeof PlatformAdminService }>(
      resolve(entry),
    ).PlatformAdminService;
    const service = new Service(new AuditNotificationService());
    const result = service.createPlatformNotice({
      title: "Original route probe",
      body: "Selected driver",
      severity: "critical",
      targetAudience: "drivers",
      reason: "Incident",
      confirmed: true,
    });
    expect(result.outcomes).toEqual([
      expect.objectContaining({
        audience: "drivers",
        state: "routed",
        notificationId: null,
      }),
    ]);
    expect(result.storageMode).toBe("process_memory");
  });
  it("C109-F5 actual registered feature-flags module contains an own-tenant production GET", () => {
    const load = sourceModuleLoader({}, [moduleEntry]);
    const Module = load<{ FeatureFlagsModule: object }>(
      resolve(moduleEntry),
    ).FeatureFlagsModule;
    const controllers = Reflect.getMetadata("controllers", Module) as {
      prototype: object;
    }[];
    const hasOwnRead = controllers.some((controller) => {
      const prefix = Reflect.getMetadata(PATH_METADATA, controller);
      return (
        prefix === "tenant/feature-flags" &&
        Object.getOwnPropertyNames(controller.prototype).some((key) => {
          const method = Reflect.get(controller.prototype, key);
          return (
            typeof method === "function" &&
            Reflect.getMetadata(METHOD_METADATA, method) === 0
          );
        })
      );
    });
    expect(hasOwnRead).toBe(true);
  });
  it("C109-F6 actual mounted admin page rereads authoritative notices at original 30s", async () => {
    vi.stubEnv(
      "JWT_SECRET",
      "notice-unit-secret-at-least-thirty-two-characters",
    );
    vi.stubEnv("JWT_KEY_RING_JSON", "");
    vi.stubEnv("JWT_PRIVATE_KEY", "");
    vi.stubEnv("JWT_PUBLIC_KEY", "");
    vi.stubEnv("JWT_ALGORITHM", "HS256");
    vi.stubEnv("JWT_ALGORITHMS", "HS256");
    vi.stubEnv("APP_ENV", "test");
    vi.stubEnv("NODE_ENV", "test");
    vi.useFakeTimers();
    const h = wireHarness();
    const client = h.client(principal("platform"));
    const load = sourceModuleLoader(
      {
        react: React,
        "react/jsx-runtime": jsxRuntime,
        "@drts/ui-web": canvas,
        "@/lib/admin-client": {
          usePlatformAdminClient: () => client,
          formatDateTime: (v: string) => v,
        },
        "@/lib/i18n": {
          useTranslation: () => ({
            locale: "en",
            t: (key: string) => t(key, "en"),
          }),
        },
        "@/components/assistant/route-context": {
          usePlatformAdminAssistantPage: () => {},
        },
      },
      [page],
    );
    const Page = load<{ default: React.ComponentType }>(resolve(page)).default;
    const view = render(<Page />);
    await act(async () => {
      for (let i = 0; i < 60; i++) await Promise.resolve();
    });
    h.service.createPlatformNotice({
      title: "External 30s proof",
      body: "Another legitimate command",
      severity: "info",
      targetAudience: "ops",
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(
      within(view.container).queryByText("External 30s proof"),
    ).not.toBeNull();
  });
});
