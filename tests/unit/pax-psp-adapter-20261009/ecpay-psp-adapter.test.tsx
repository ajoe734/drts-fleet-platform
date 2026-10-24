// @vitest-environment jsdom
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

afterEach(() => {
  cleanup();
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
  it("mounts #ECPayPayment container with zero raw card input elements and collects opaque BindCardPayToken", async () => {
    const mockSdk: EcpaySdkGlobal = {
      initialize: vi.fn((_serverType, _isLoading, cb) => cb()),
      addBindingCard: vi.fn((_token, _lang, cb) => cb()),
      getBindCardPayToken: vi.fn((cb) =>
        cb({
          RtnCode: 1,
          RtnMsg: "Success",
          BindCardPayToken: "ecpay_bind_card_pay_token_synthetic_abc123",
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

  it("rejects digits-only PAN strings or disposed ports in createEcpayHostedFieldsPort", async () => {
    const badSdk: EcpaySdkGlobal = {
      initialize: vi.fn(),
      addBindingCard: vi.fn(),
      getBindCardPayToken: vi.fn((cb) =>
        cb({
          RtnCode: 1,
          BindCardPayToken: "4311952222222222",
        }),
      ),
    };
    const port = createEcpayHostedFieldsPort({ getSdk: () => badSdk });
    await expect(port.collectCredential()).rejects.toThrow(
      /ecpay_pay_token_invalid/,
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
