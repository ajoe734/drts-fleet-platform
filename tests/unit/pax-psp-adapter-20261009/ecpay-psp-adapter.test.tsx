// @vitest-environment jsdom
import React from "react";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  cleanup,
  fireEvent,
  render as renderComponent,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PassengerAccount, PassengerPaymentMethod } from "@drts/contracts";
import type {
  PassengerClient,
  PassengerPaymentClient,
  PassengerPaymentFieldsAvailability,
} from "@drts/passenger-client";
import {
  EcpayHostedFields,
  createEcpayHostedFieldsPort,
  type EcpaySdkGlobal,
} from "../../../apps/passenger-app-web/components/payment/ecpay-hosted-fields";
import {
  CARD_LIMIT_MESSAGE,
  MAX_BOUND_CARDS,
  PaymentMethodsScreen,
} from "../../../apps/passenger-app-web/components/payment/payment-methods-screen";
import PaymentMethodsPage from "../../../apps/passenger-app-web/app/account/payment-methods/page";
import { POST as bffPost } from "../../../apps/passenger-app-web/app/api/passenger-app/[...path]/route";
import {
  isEcpayHostedFieldsRuntime,
  paymentFieldsForRuntime,
} from "../../../apps/passenger-app-web/lib/payment/runtime-fields";

vi.mock(
  "@drts/passenger-client",
  async () => import("../../../packages/passenger-client/src/index"),
);
vi.mock(
  "@drts/ui-web",
  async () => import("../../../packages/ui-web/src/index"),
);

const navigation = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};
const appRequire = createRequire(
  resolve("apps/passenger-app-web/package.json"),
);
const { AppRouterContext } = appRequire(
  "next/dist/shared/lib/app-router-context.shared-runtime",
) as typeof import("next/dist/shared/lib/app-router-context.shared-runtime");
const { NextRequest } = appRequire(
  "next/server",
) as typeof import("next/server");
const render = (element: React.ReactElement) =>
  renderComponent(
    <AppRouterContext.Provider value={navigation}>
      {element}
    </AppRouterContext.Provider>,
  );

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  delete window.ECPay;
});

const ACTIVE_ACCOUNT: PassengerAccount = {
  drtsPassengerId: "pax_ecpay_ui_test_001",
  status: "active",
  displayName: "測試乘客",
  phone: null,
  email: "pax@example.com",
  termsAcceptedAt: "2026-10-24T00:00:00.000Z",
};

function makeCard(index: number): PassengerPaymentMethod {
  return {
    paymentMethodId: `00000000-0000-4000-8000-00000000000${index}`,
    last4: `100${index}`,
    cardType: "VISA",
    expiryMonth: "12",
    expiryYear: "2099",
    isDefault: index === 1,
  };
}

describe("EcpayHostedFields & createEcpayHostedFieldsPort", () => {
  it("mounts #ECPayPayment container with zero raw card input elements and collects opaque BindCardPayToken from official PaymentInfo shape without RtnCode", async () => {
    const mockSdk: EcpaySdkGlobal = {
      Language: { zhTW: "zh-TW", enUS: "en-US" },
      initialize: vi.fn((_serverType, _isLoading, cb) => cb()),
      addBindingCard: vi.fn((_token, _lang, cb) => cb()),
      getBindCardPayToken: vi.fn((cb) =>
        cb({
          BindCardPayToken: "ecpay_bind_card_pay_token_synthetic_abc123",
          MerchantTradeNo: "DR202610240000000001",
        }),
      ),
    };
    let latestAvailability: PassengerPaymentFieldsAvailability = {
      status: "unavailable",
    };

    const { container, unmount } = render(
      <EcpayHostedFields
        serverType="Stage"
        merchantToken="ecpay_sdk_session_token_synthetic_001"
        sdk={mockSdk}
        onReady={(avail) => {
          latestAvailability = avail;
        }}
      />,
    );

    await waitFor(() => {
      expect(latestAvailability.status).toBe("ready");
    });

    expect(
      screen.getByTestId("ecpay-hosted-fields-container").getAttribute("id"),
    ).toBe("ECPayPayment");
    // Card numbers, expiry, and CVV never touch DRTS DOM inputs
    expect(container.querySelectorAll("input")).toHaveLength(0);
    expect(mockSdk.initialize).toHaveBeenCalledWith(
      "Stage",
      1,
      expect.any(Function),
    );
    expect(mockSdk.addBindingCard).toHaveBeenCalledWith(
      "ecpay_sdk_session_token_synthetic_001",
      "zh-TW",
      expect.any(Function),
    );

    if (latestAvailability.status !== "ready") {
      throw new Error("Expected ready fields port");
    }
    const command = await latestAvailability.port.collectCredential();
    expect(command).toEqual({
      providerToken: "ecpay_bind_card_pay_token_synthetic_abc123",
    });

    unmount();
    expect(latestAvailability.status).toBe("unavailable");
  });

  it("rejects digits-only PAN strings, explicit SDK errors, or disposed ports in createEcpayHostedFieldsPort", async () => {
    const badSdk: EcpaySdkGlobal = {
      initialize: vi.fn(),
      addBindingCard: vi.fn(),
      getBindCardPayToken: vi.fn((cb) =>
        cb({
          BindCardPayToken: "4311952222222222",
          MerchantTradeNo: "DR202610240000000002",
        }),
      ),
    };
    const port = createEcpayHostedFieldsPort({ getSdk: () => badSdk });
    await expect(port.collectCredential()).rejects.toThrow(
      /ecpay_pay_token_invalid/,
    );

    const errorSdk: EcpaySdkGlobal = {
      initialize: vi.fn(),
      addBindingCard: vi.fn(),
      getBindCardPayToken: vi.fn((cb) => cb(undefined, "Card check failed")),
    };
    const errorPort = createEcpayHostedFieldsPort({ getSdk: () => errorSdk });
    await expect(errorPort.collectCredential()).rejects.toThrow(
      /ecpay_pay_token_failed/,
    );

    port.dispose();
    await expect(port.collectCredential()).rejects.toThrow(
      /ecpay_fields_disposed/,
    );
  });
});

describe("PaymentMethodsScreen 5-card limit & ECPay Hosted Fields flow", () => {
  it("blocks adding a 6th card when 5 cards are already bound and shows clear explanation", async () => {
    const fiveCards = [1, 2, 3, 4, 5].map(makeCard);
    expect(fiveCards).toHaveLength(MAX_BOUND_CARDS);

    const client = {
      getMethods: vi.fn().mockResolvedValue({ methods: fiveCards }),
      bindMethod: vi.fn(),
      setDefault: vi.fn(),
      removeMethod: vi.fn(),
    } as unknown as PassengerPaymentClient;
    const accountClient = {
      getAccount: vi.fn().mockResolvedValue(ACTIVE_ACCOUNT),
    } as unknown as Pick<PassengerClient, "getAccount">;

    render(
      <PaymentMethodsScreen client={client} accountClient={accountClient} />,
    );

    await waitFor(() => {
      expect(screen.getByText(CARD_LIMIT_MESSAGE)).toBeTruthy();
    });

    const addBtn = screen.getByRole("button", { name: "新增信用卡" });
    expect(addBtn).toHaveProperty("disabled", true);
  });

  it("wires PaymentMethodsPage and runtime-fields to EcpayHostedFields when NEXT_PUBLIC_PAYMENT_FIELDS_PROVIDER=ecpay", async () => {
    vi.stubEnv("NEXT_PUBLIC_PAYMENT_FIELDS_PROVIDER", "ecpay");
    expect(isEcpayHostedFieldsRuntime({ reviewDemo: false })).toBe(true);
    expect(isEcpayHostedFieldsRuntime({ reviewDemo: true })).toBe(false);
    expect(paymentFieldsForRuntime({ reviewDemo: false })).toEqual({
      status: "unavailable",
    });

    const mockSdk: EcpaySdkGlobal = {
      Language: { zhTW: "zh-TW", enUS: "en-US" },
      initialize: vi.fn((_serverType, _isLoading, cb) => cb()),
      addBindingCard: vi.fn((_token, _lang, cb) => cb()),
      getBindCardPayToken: vi.fn((cb) =>
        cb({
          BindCardPayToken: "ecpay_page_bind_card_pay_token_001",
          MerchantTradeNo: "DR202610240000000003",
        }),
      ),
    };
    window.ECPay = mockSdk;
    expect(
      paymentFieldsForRuntime({ reviewDemo: false, ecpaySdk: mockSdk }).status,
    ).toBe("ready");

    let boundMethods: PassengerPaymentMethod[] = [];
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        const url = typeof input === "string" ? input : input.toString();
        const method = (init?.method ?? "GET").toUpperCase();
        if (url.endsWith("/api/passenger-app/me")) {
          return new Response(
            JSON.stringify({ data: { account: ACTIVE_ACCOUNT } }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (
          method === "GET" &&
          url.endsWith("/api/passenger-app/payment-methods?binding_session=1")
        ) {
          return new Response(
            JSON.stringify({
              data: {
                provider: "ecpay",
                merchantToken: "ecpay_page_session_token_001",
                tokenExpireDate: "2026/10/24 12:30:00",
                sandbox: true,
                serverType: "Stage",
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (
          method === "GET" &&
          url.endsWith("/api/passenger-app/payment-methods")
        ) {
          return new Response(
            JSON.stringify({ data: { methods: boundMethods } }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (
          method === "POST" &&
          url.endsWith("/api/passenger-app/payment-methods")
        ) {
          const payload = JSON.parse(String(init?.body ?? "{}")) as {
            providerToken?: string;
          };
          expect(payload).toEqual({
            providerToken: "ecpay_page_bind_card_pay_token_001",
          });
          const created = makeCard(1);
          boundMethods = [created];
          return new Response(
            JSON.stringify({
              data: { status: "completed", method: created },
            }),
            { status: 201, headers: { "Content-Type": "application/json" } },
          );
        }
        throw new Error(`Unexpected fetch: ${method} ${url}`);
      });

    const { container } = render(<PaymentMethodsPage />);
    const addBtn = await screen.findByRole("button", { name: "新增信用卡" });
    await waitFor(() => {
      expect((addBtn as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(
        screen.getByTestId("ecpay-hosted-fields-container").getAttribute("id"),
      ).toBe("ECPayPayment");
    });
    expect(container.querySelectorAll("input")).toHaveLength(0);

    const bindBtn = screen.getByRole("button", { name: "綁定卡片" });
    await waitFor(() => {
      expect((bindBtn as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(bindBtn);

    await screen.findByText("VISA •••• 1001");
    expect(mockSdk.getBindCardPayToken).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalled();
  });
});

describe("Passenger App BFF route ECPay ReturnURL callback, OrderResultURL browser return, and CSRF/session enforcement", () => {
  it("accepts external unauthenticated POST /api/passenger-app/payment-methods/ecpay/callback (ResultData form or JSON) and returns plain text 1|OK", async () => {
    vi.stubEnv("DRTS_API_URL", "http://api.internal:3000");
    vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(async (input, init) => {
        expect(String(input)).toBe(
          "http://api.internal:3000/api/passenger-app/payment-methods/ecpay/callback",
        );
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body ?? "{}"))).toEqual({
          MerchantID: "SYNTHETIC_MID_01",
          Data: "CIPHER",
        });
        return new Response("1|OK", {
          status: 200,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      });

    const req = new NextRequest(
      "https://ride.smarttransport.tw/api/passenger-app/payment-methods/ecpay/callback",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          host: "ride.smarttransport.tw",
          "x-forwarded-proto": "https",
        },
        body: "ResultData=%7B%22MerchantID%22%3A%22SYNTHETIC_MID_01%22%2C%22Data%22%3A%22CIPHER%22%7D",
      },
    );
    const res = await bffPost(req, {
      params: Promise.resolve({
        path: ["payment-methods", "ecpay", "callback"],
      }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(await res.text()).toBe("1|OK");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("accepts cross-origin 3DS form POST /api/passenger-app/payment-methods/ecpay/order-result and redirects browser 303 to /account/payment-methods?ecpay_3ds=completed|failed|unknown based on upstream data.status", async () => {
    vi.stubEnv("DRTS_API_URL", "http://api.internal:3000");
    vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
    vi.spyOn(globalThis, "fetch")
      .mockImplementationOnce(async (input, init) => {
        expect(String(input)).toBe(
          "http://api.internal:3000/api/passenger-app/payment-methods/ecpay/order-result",
        );
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body ?? "{}"))).toEqual({
          MerchantID: "SYNTHETIC_MID_01",
          Data: "CIPHER",
        });
        return new Response(
          JSON.stringify({
            data: {
              status: "completed",
              method: makeCard(1),
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      })
      .mockImplementationOnce(async () => {
        return new Response(
          JSON.stringify({
            data: {
              status: "failed",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      })
      .mockImplementationOnce(async () => {
        return new Response(
          JSON.stringify({
            data: {
              status: "unknown",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

    const makeOrderResultReq = () =>
      new NextRequest(
        "https://ride.smarttransport.tw/api/passenger-app/payment-methods/ecpay/order-result",
        {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            origin: "https://ecpg-stage.ecpay.com.tw",
            host: "ride.smarttransport.tw",
            "x-forwarded-proto": "https",
          },
          body: "ResultData=%7B%22MerchantID%22%3A%22SYNTHETIC_MID_01%22%2C%22Data%22%3A%22CIPHER%22%7D",
        },
      );

    const resCompleted = await bffPost(makeOrderResultReq(), {
      params: Promise.resolve({
        path: ["payment-methods", "ecpay", "order-result"],
      }),
    });
    expect(resCompleted.status).toBe(303);
    expect(resCompleted.headers.get("location")).toBe(
      "https://ride.smarttransport.tw/account/payment-methods?ecpay_3ds=completed",
    );

    const resFailed = await bffPost(makeOrderResultReq(), {
      params: Promise.resolve({
        path: ["payment-methods", "ecpay", "order-result"],
      }),
    });
    expect(resFailed.status).toBe(303);
    expect(resFailed.headers.get("location")).toBe(
      "https://ride.smarttransport.tw/account/payment-methods?ecpay_3ds=failed",
    );

    const resUnknown = await bffPost(makeOrderResultReq(), {
      params: Promise.resolve({
        path: ["payment-methods", "ecpay", "order-result"],
      }),
    });
    expect(resUnknown.status).toBe(303);
    expect(resUnknown.headers.get("location")).toBe(
      "https://ride.smarttransport.tw/account/payment-methods?ecpay_3ds=unknown",
    );
  });

  it("enforces same-origin CSRF and pax_session cookie on ordinary passenger payment POST routes", async () => {
    vi.stubEnv("DRTS_API_URL", "http://api.internal:3000");
    vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "");
    const crossOriginReq = new NextRequest(
      "https://ride.smarttransport.tw/api/passenger-app/payment-methods",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://evil.example.com",
          host: "ride.smarttransport.tw",
          "x-forwarded-proto": "https",
        },
        body: JSON.stringify({ providerToken: "tok_123" }),
      },
    );
    const csrfRes = await bffPost(crossOriginReq, {
      params: Promise.resolve({ path: ["payment-methods"] }),
    });
    expect(csrfRes.status).toBe(403);

    const unauthReq = new NextRequest(
      "https://ride.smarttransport.tw/api/passenger-app/payment-methods/binding-session",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://ride.smarttransport.tw",
          host: "ride.smarttransport.tw",
          "x-forwarded-proto": "https",
        },
        body: "{}",
      },
    );
    const unauthRes = await bffPost(unauthReq, {
      params: Promise.resolve({
        path: ["payment-methods", "binding-session"],
      }),
    });
    expect(unauthRes.status).toBe(401);
  });
});

describe("deploy-dev.yml ECPay 5-secret all-or-nothing contract", () => {
  const workflowRaw = readFileSync(".github/workflows/deploy-dev.yml", "utf8");

  function extractWorkflowStep(source: string, name: string): string {
    const start = source.indexOf(`      - name: ${name}\n`);
    if (start < 0) throw new Error(`Missing workflow step: ${name}`);
    const end = source.indexOf("\n      - ", start + 1);
    const block = source.slice(start, end < 0 ? undefined : end);
    const run = block.indexOf("        run: |\n");
    if (run < 0) throw new Error(`Missing executable script: ${name}`);
    return block
      .slice(run + "        run: |\n".length)
      .split("\n")
      .map((line) => (line.startsWith("          ") ? line.slice(10) : line))
      .join("\n")
      .split(/\n(?= {2}[a-z][a-z-]+:)/)[0]!;
  }

  function runOptionalSecretsStep(presentSecrets: readonly string[]) {
    const stepRun = extractWorkflowStep(
      workflowRaw,
      "Resolve passenger app optional secret mounts",
    );
    const dir = mkdtempSync(join(tmpdir(), "ecpay-deploy-test-"));
    try {
      const bin = join(dir, "gcloud");
      const output = join(dir, "github_output");
      writeFileSync(output, "");
      writeFileSync(
        bin,
        `#!/usr/bin/env bash
if [[ "$1" == "secrets" && "$2" == "describe" ]]; then
  secret="$3"
  for candidate in ${presentSecrets.map((s) => JSON.stringify(s)).join(" ")}; do
    if [[ "$candidate" == "$secret" ]]; then
      exit 0
    fi
  done
  exit 1
fi
exit 1
`,
      );
      chmodSync(bin, 0o755);
      const script = stepRun
        .replaceAll("${{ needs.prepare.outputs.secret_prefix }}", "drts-dev")
        .replaceAll("${{ needs.prepare.outputs.project_id }}", "drts-dev-proj");
      const stdout = execFileSync("bash", ["-c", script], {
        env: {
          ...process.env,
          PATH: `${dir}:${process.env.PATH}`,
          SECRET_PREFIX: "drts-dev",
          PROJECT_ID: "drts-dev-proj",
          GITHUB_OUTPUT: output,
        },
        encoding: "utf8",
      });
      return {
        stdout,
        githubOutput: readFileSync(output, "utf8"),
      };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  const allFiveEcpaySecrets = [
    "drts-dev-psp-merchant-id",
    "drts-dev-psp-hash-key",
    "drts-dev-psp-hash-iv",
    "drts-dev-psp-sandbox",
    "drts-dev-psp-token-encryption-key-name",
  ] as const;

  it("mounts all 5 ECPay payment secrets when all 5 exist in Secret Manager", () => {
    const res = runOptionalSecretsStep(allFiveEcpaySecrets);
    expect(res.githubOutput).toContain("payment_mounts_complete=true");
    expect(res.githubOutput).toContain(
      "PSP_MERCHANT_ID=drts-dev-psp-merchant-id:latest",
    );
    expect(res.githubOutput).toContain(
      "PSP_HASH_KEY=drts-dev-psp-hash-key:latest",
    );
    expect(res.githubOutput).toContain(
      "PSP_HASH_IV=drts-dev-psp-hash-iv:latest",
    );
    expect(res.githubOutput).toContain(
      "PSP_SANDBOX=drts-dev-psp-sandbox:latest",
    );
    expect(res.githubOutput).toContain(
      "PSP_TOKEN_ENCRYPTION_KEY_NAME=drts-dev-psp-token-encryption-key-name:latest",
    );
  });

  it.each(allFiveEcpaySecrets)(
    "mounts zero payment secrets when %s is missing",
    (missingSecret) => {
      const partial = allFiveEcpaySecrets.filter((s) => s !== missingSecret);
      const res = runOptionalSecretsStep(partial);
      expect(res.githubOutput).toContain("payment_mounts_complete=false");
      expect(res.githubOutput).not.toContain("PSP_MERCHANT_ID=");
      expect(res.githubOutput).not.toContain("PSP_HASH_KEY=");
      expect(res.githubOutput).not.toContain("PSP_HASH_IV=");
    },
  );
});
