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
import { createRequire } from "node:module";
import { resolve } from "node:path";
import type { ReactNode } from "react";
import ts from "typescript";
import type { Page } from "@playwright/test";
import Home from "../../../apps/passenger-app-web/app/page";
import { ReviewDemoProvider } from "../../../apps/passenger-app-web/components/review-demo/review-context";
import { ReviewRideControls } from "../../../apps/passenger-app-web/components/review-demo/ride-controls";
import { bookingFixture } from "../pax-web-booking-ui-20261009/fixture";
import { apiWireResponse } from "../pax-web-shell-20261009/api-wire-fixtures";
import { bookingResponseDiagnostic } from "../../e2e/pax-review-shared-order/booking-diagnostic";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/link", () => ({ default: "a" }));
const appRequire = createRequire(
  resolve("apps/passenger-app-web/package.json"),
);
const { AppRouterContext } = appRequire(
  "next/dist/shared/lib/app-router-context.shared-runtime",
) as typeof import("next/dist/shared/lib/app-router-context.shared-runtime");
const { PathnameContext } = appRequire(
  "next/dist/shared/lib/hooks-client-context.shared-runtime",
) as typeof import("next/dist/shared/lib/hooks-client-context.shared-runtime");
function PageContext({ children }: { children: ReactNode }) {
  return (
    <AppRouterContext.Provider
      value={{
        ...navigation,
        bfcacheId: "synthetic-booking-navigation",
        replace: vi.fn(),
        back: vi.fn(),
        forward: vi.fn(),
        refresh: vi.fn(),
        prefetch: vi.fn(),
      }}
    >
      <PathnameContext.Provider value="/">
        <ReviewDemoProvider>{children}</ReviewDemoProvider>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  navigation.push.mockReset();
});

/** Socket-free DOM driver for the actual hosted book() caller. Only the browser
 * driver/assertion adapter and upstream HTTP are simulated: Home, review context,
 * SDK, BFF, disclosure, form and confirmation/payment controls are production.
 * Read the function from the spec rather than copying its operation sequence.
 */
function hostedBook() {
  const file = ts.createSourceFile(
    "journey.ts",
    readFileSync("tests/e2e/pax-review-shared-order-demo.spec.ts", "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const declaration = file.statements.find(
    (node): node is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(node) && node.name?.text === "book",
  );
  if (!declaration) throw new Error("Missing actual hosted book caller");
  const source = ts.transpileModule(declaration.getText(file), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const assertion = (value: unknown, message?: string) =>
    Object.assign(expect(value, message), {
      toBeVisible: async () => {
        await waitFor(() =>
          expect((value as DomLocator).element()).not.toBeNull(),
        );
      },
      toHaveURL: async (pattern: RegExp) => {
        await waitFor(() =>
          expect(navigation.push).toHaveBeenCalledWith(
            expect.stringMatching(pattern),
          ),
        );
      },
      toHaveText: async (text: string) => {
        await waitFor(() =>
          expect((value as DomLocator).element()?.textContent).toBe(text),
        );
      },
    });
  return new Function(
    "expect",
    "PAX",
    "camel",
    "bookingResponseDiagnostic",
    `${source}; return book;`,
  )(
    assertion,
    "https://ride.example.test",
    (value: unknown) => value,
    bookingResponseDiagnostic,
  ) as (page: Page, method: string) => Promise<string>;
}

class DomLocator {
  constructor(private readonly query: () => HTMLElement | null) {}
  element() {
    return this.query();
  }
  async isVisible() {
    return this.query() !== null;
  }
  async count() {
    return this.query() ? 1 : 0;
  }
  or(other: DomLocator) {
    return new DomLocator(() => this.query() ?? other.element());
  }
  first() {
    return this;
  }
  last() {
    return this;
  }
  async use(operation: (element: HTMLElement) => void) {
    let element: HTMLElement | null = null;
    await waitFor(() => {
      element = this.query();
      expect(element).not.toBeNull();
    });
    await act(async () => operation(element!));
  }
  async click() {
    await this.use((element) => {
      expect((element as HTMLButtonElement).disabled).not.toBe(true);
      fireEvent.click(element);
    });
  }
  async check() {
    await this.click();
  }
  async selectOption(value: string) {
    await this.use((element) => {
      fireEvent.change(element, { target: { value } });
    });
  }
  async fill(value: string) {
    await this.selectOption(value);
  }
}

it.each([
  { acknowledged: false, failure: undefined },
  { acknowledged: true, failure: undefined },
  { acknowledged: true, failure: "MULTI_TAXI_SERVICE_PRODUCT_NOT_ALLOWED" },
  { acknowledged: true, failure: "MULTI_TAXI_AUTHORIZATION_UNAVAILABLE" },
])(
  "actual hosted booking caller: prior acknowledgement=$acknowledged, HTTP failure=$failure",
  async ({ acknowledged, failure }) => {
    const fixture = bookingFixture();
    if (!acknowledged) delete fixture.account.feeAcknowledgementVersion;
    fixture.settings = { minLeadTimeMinutes: 1, requireSmsVerification: false };
    const method = "synthetic-bound-review-method";
    const order = "30b74447-a5a5-4e99-b7ec-3090625e47a7";
    const upstream = globalThis.fetch;
    const created: Record<string, unknown>[] = [];
    let resolveCreated: (response: {
      url(): string;
      request(): { method(): string };
      status(): number;
      json(): Promise<unknown>;
    }) => void;
    const response = new Promise<
      Parameters<NonNullable<typeof resolveCreated>>[0]
    >((resolve) => {
      resolveCreated = resolve;
    });
    fixture.createResponder = async () =>
      failure
        ? Response.json(
            {
              success: false,
              error: {
                code: failure,
                message: "synthetic-private-response-message",
                details: { token: "synthetic-private-response-token" },
              },
            },
            { status: 409 },
          )
        : apiWireResponse({ ride: { order: { orderId: order } } });
    vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
      const url = new URL(input, "https://ride.example.test");
      if (url.origin === "https://api.example.test") {
        if (url.pathname.endsWith("/payment-methods"))
          return apiWireResponse({
            methods: [
              {
                paymentMethodId: method,
                last4: "0042",
                cardType: "SIM",
                expiryMonth: "12",
                expiryYear: "2099",
                isDefault: false,
              },
              {
                paymentMethodId: "synthetic-other-default-method",
                last4: "0043",
                cardType: "SIM",
                expiryMonth: "12",
                expiryYear: "2099",
                isDefault: true,
              },
            ],
          });
        if (url.pathname.endsWith("/review-demo/config"))
          return apiWireResponse({ enabled: true });
      }
      let result = await upstream(input, init);
      if (
        url.origin === "https://api.example.test" &&
        url.pathname.endsWith("/quotes")
      ) {
        const payload = await result.json();
        result = Response.json({
          ...payload,
          data: { ...payload.data, estimated_min: 85, estimated_max: 85 },
        });
      }
      if (input === "/api/passenger-app/rides" && init?.method === "POST") {
        created.push(JSON.parse(String(init.body)));
        const payload = await result.clone().json();
        const { decodeBookingWire } =
          await import("../../../packages/passenger-client/src/booking/wire");
        resolveCreated!({
          url: () => `https://ride.example.test${input}`,
          request: () => ({ method: () => "POST" }),
          status: () => result.status,
          json: async () => decodeBookingWire(payload),
        });
      }
      return result;
    });
    const page = {
      goto: async () => {
        render(
          <PageContext>
            <Home />
          </PageContext>,
        );
      },
      getByRole: (
        role: Parameters<typeof screen.queryByRole>[0],
        options: Parameters<typeof screen.queryByRole>[1],
      ) => new DomLocator(() => screen.queryByRole(role, options)),
      getByText: (
        text: Parameters<typeof screen.queryByText>[0],
        options: Parameters<typeof screen.queryByText>[1],
      ) => new DomLocator(() => screen.queryByText(text, options)),
      getByLabel: (text: string, options: { exact: boolean }) =>
        new DomLocator(() => screen.queryByLabelText(text, options)),
      getByTestId: (id: string) =>
        new DomLocator(() => screen.queryByTestId(id)),
      locator: (selector: string) =>
        new DomLocator(() => document.querySelector(selector)),
      evaluate: async (operation: () => unknown) => operation(),
      waitForResponse: async (
        predicate: (value: Awaited<typeof response>) => boolean,
      ) => {
        const result = await response;
        expect(predicate(result)).toBe(true);
        return result;
      },
    } as unknown as Page;
    navigation.push.mockImplementation((url: string) => {
      cleanup();
      render(
        <PageContext>
          <ReviewRideControls orderId={url.split("/").at(-1)!} />
        </PageContext>,
      );
    });
    if (failure) {
      // Exercise the actual spec function through Home, SDK and BFF. A 409
      // must still fail, now with only its known public code in the assertion.
      const error = await hostedBook()(page, method).then(
        () => null,
        (reason: unknown) => reason,
      );
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(
        `Passenger booking status=409 code=${failure}`,
      );
      expect((error as Error).message).not.toContain("synthetic-private");
      expect(navigation.push).not.toHaveBeenCalled();
    } else expect(await hostedBook()(page, method)).toBe(order);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ paymentMethodId: method });
    expect(
      fixture.calls.filter((call) => call.path.endsWith("/quotes")),
    ).toHaveLength(1);
    expect(fixture.account.feeAcknowledgementVersion).toBe(
      fixture.fare.version,
    );
  },
);
