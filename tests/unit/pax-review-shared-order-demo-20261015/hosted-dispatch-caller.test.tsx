// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { NextRequest } from "next/server";
import type { Page } from "@playwright/test";
import OpsReview from "../../../apps/ops-console-web/app/review/page";
import { LanguageProvider } from "../../../apps/ops-console-web/lib/i18n";
import * as bff from "../../../apps/ops-console-web/app/control-plane-proxy/[...path]/route";
import { dispatchResponseDiagnostic } from "../../e2e/pax-review-shared-order/dispatch-diagnostic";
import { deepToSnakeCase } from "../../../apps/api/src/common/snake-case.interceptor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// Run the actual spec helper against the real Ops DOM/SDK/BFF. Only the browser
// driver and upstream HTTP response are substituted. These cases verify failure
// diagnosis and preserve the rejection; they do not reproduce the hosted 409's
// unknown cause or claim that a production assignment has succeeded.
function hostedAssign() {
  const file = ts.createSourceFile(
    "journey.ts",
    readFileSync("tests/e2e/pax-review-shared-order-demo.spec.ts", "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const declaration = file.statements.find(
    (node): node is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(node) && node.name?.text === "assign",
  );
  if (!declaration) throw new Error("Missing actual hosted assign caller");
  const source = ts.transpileModule(declaration.getText(file), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(
    "expect",
    "camel",
    "dispatchResponseDiagnostic",
    `${source}; return assign;`,
  )(expect, (value: unknown) => value, dispatchResponseDiagnostic) as (
    page: Page,
    driver: string,
    reassign: boolean,
  ) => Promise<unknown>;
}

for (const reassign of [false, true]) {
  it.each([
    "success",
    "public-code",
    "reconciliation-code",
    "eligibility-reasons",
    "unknown-code",
    "non-json",
  ] as const)(
    "real Ops hosted caller: reassign=" + reassign + ", response=%s",
    async (scenario) => {
      vi.stubEnv("DRTS_ENV", "test");
      vi.stubEnv("NODE_ENV", "test");
      vi.stubEnv("DRTS_API_URL", "https://api.example");
      vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
      vi.stubEnv("JWT_SECRET", "synthetic-ops-dispatch-unit-key");
      vi.stubEnv("JWT_ISSUER", "drts-local");
      vi.stubEnv("JWT_AUDIENCE", "drts-api");
      const orderId = "533a6ed1-f265-4431-9bfd-26e75f91dc77";
      const dispatchJobId = "789393cb-ae33-4e9e-8f9f-5877fd43a039";
      const driverId = "pax-review-driver-b";
      const vehicleId = "pax-review-vehicle-b";
      const operation = reassign ? "reassign" : "assign";
      const path = `/control-plane-proxy/dispatch/${operation}`;
      type Reply = {
        url(): string;
        request(): { method(): string };
        status(): number;
        json(): Promise<unknown>;
      };
      let resolveResponse!: (value: Reply) => void;
      const response = new Promise<Reply>((resolve) => {
        resolveResponse = resolve;
      });
      const commands: {
        body: unknown;
        key: string | null;
        alternateKey: string | null;
      }[] = [];
      let predicateMatched = false;
      const success = (data: unknown) => Response.json({ success: true, data });
      vi.stubGlobal(
        "fetch",
        async (input: string | URL, init?: RequestInit): Promise<Response> => {
          const url = String(input);
          if (url.startsWith("/control-plane-proxy/")) {
            const method = (init?.method ?? "GET") as "GET" | "POST";
            const result = await bff[method](
              new NextRequest(`https://ops.example${url}`, {
                method,
                headers: new Headers(init?.headers),
                ...(init?.body ? { body: init.body } : {}),
              }),
              {
                params: Promise.resolve({
                  path: url.slice("/control-plane-proxy/".length).split("/"),
                }),
              },
            );
            if (url === path) {
              const copy = result.clone();
              resolveResponse({
                url: () => `https://ops.example${url}`,
                request: () => ({ method: () => method }),
                status: () => copy.status,
                json: () => copy.json(),
              });
            }
            return result;
          }
          const upstream = new URL(url);
          expect(upstream.origin).toBe("https://api.example");
          switch (upstream.pathname) {
            case "/api/ops/review-demo/config":
              return success({ enabled: true });
            case `/api/orders/${orderId}`:
              return success({
                orderId,
                status: "ready_for_dispatch",
                pickup: { address: "新北板橋" },
                dropoff: { address: "新北市府" },
              });
            case "/api/dispatch/tasks":
              return success({
                items: [
                  {
                    dispatchJobId,
                    orderId,
                    status: "pending",
                    createdAt: "2026-10-15T13:36:09.000Z",
                  },
                ],
              });
            case `/api/dispatch/tasks/${dispatchJobId}/candidates`:
              return success({ items: [{ driverId, vehicleId }] });
            case `/api/dispatch/${operation}`: {
              const headers = new Headers(init?.headers);
              commands.push({
                body: JSON.parse(
                  new TextDecoder().decode(init!.body as ArrayBuffer),
                ),
                key: headers.get("idempotency-key"),
                alternateKey: headers.get("x-idempotency-key"),
              });
              if (scenario === "success")
                return success({
                  assignmentId: "synthetic-assignment-response",
                });
              if (scenario === "non-json")
                return new Response("synthetic-private-proxy-message", {
                  status: 502,
                });
              return Response.json(
                deepToSnakeCase({
                  success: false,
                  error: {
                    code:
                      scenario === "public-code"
                        ? "P5_DRIVER_REGISTRATION_NOT_ACTIVE"
                        : scenario === "reconciliation-code"
                          ? "REDISPATCH_ASSIGNMENT_ALREADY_CLOSED"
                          : scenario === "eligibility-reasons"
                            ? "ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT"
                            : "synthetic-private-code",
                    message: "synthetic-private-message",
                    details: {
                      token: "synthetic-private-token",
                      reasonCodes: [
                        "synthetic-private-reason",
                        "DRIVER_TRAINING_INCOMPLETE",
                      ],
                      latestEligibility: {
                        driverId: "synthetic-private-driver",
                      },
                    },
                  },
                }),
                { status: 409 },
              );
            }
            default:
              throw new Error("Unexpected fixture request");
          }
        },
      );
      render(
        <LanguageProvider defaultLocale="zh">
          <OpsReview />
        </LanguageProvider>,
      );
      fireEvent.change(await screen.findByLabelText("訂單 UUID"), {
        target: { value: orderId },
      });
      fireEvent.click(screen.getByRole("button", { name: "讀回同單" }));
      await screen.findByRole("button", {
        name: `指派 ${driverId}`,
      });
      const page = {
        waitForResponse: async (predicate: (reply: Reply) => boolean) => {
          const reply = await response;
          predicateMatched = predicate(reply);
          expect(predicateMatched).toBe(true);
          return reply;
        },
        getByRole: (
          role: "button",
          options: { name: string; exact: boolean },
        ) => ({
          click: async () => {
            const button = await screen.findByRole(role, {
              name: options.name,
            });
            await waitFor(() =>
              expect((button as HTMLButtonElement).disabled).toBe(false),
            );
            await act(async () => {
              fireEvent.click(button);
            });
          },
        }),
      } as unknown as Page;
      if (scenario === "success") {
        await expect(hostedAssign()(page, driverId, reassign)).resolves.toEqual(
          { assignmentId: "synthetic-assignment-response" },
        );
      } else {
        const message =
          scenario === "public-code"
            ? "code=P5_DRIVER_REGISTRATION_NOT_ACTIVE"
            : scenario === "reconciliation-code"
              ? "code=REDISPATCH_ASSIGNMENT_ALREADY_CLOSED"
              : scenario === "eligibility-reasons"
                ? "code=ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT reasons=DRIVER_TRAINING_INCOMPLETE"
                : "code=unclassified";
        const failure = await hostedAssign()(page, driverId, reassign).then(
          () => null,
          (error: Error) => error,
        );
        expect(failure).toBeInstanceOf(Error);
        expect(failure!.message).toContain(
          `Ops ${operation} status=${scenario === "non-json" ? 502 : 409} ${message}`,
        );
        expect(failure!.message).not.toContain("synthetic-private");
      }
      expect(predicateMatched).toBe(true);
      expect(commands).toHaveLength(1);
      expect(commands[0]!.body).toEqual({
        dispatchJobId,
        driverId,
        vehicleId,
        ...(reassign
          ? {
              reasonCode: "review_reassignment",
              reasonNote: "演練改派，請乘客重新核對車牌",
            }
          : {}),
      });
      expect(commands[0]!.key).toMatch(/^[0-9a-f-]{36}$/);
      expect(commands[0]!.alternateKey).toBe(commands[0]!.key);
    },
  );
}
