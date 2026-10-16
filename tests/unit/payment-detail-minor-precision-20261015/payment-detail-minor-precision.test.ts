// @vitest-environment jsdom
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import {
  BootstrapAuthGuard,
  type AuthenticatedRequestLike,
} from "../../../apps/api/src/common/auth";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementController } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.controller";
import { BillingSettlementRepository } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.repository";
import { BillingSettlementService } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import type { PaymentRecoveryPort } from "../../../apps/api/src/modules/billing-settlement/payment-recovery.port";
import { loadPaymentDetailModules, type RootLike } from "./production-detail";

type PaymentDbRow = {
  payment_id: string;
  order_id: string;
  trip_id: string | null;
  provider_payment_ref: string | null;
  status:
    | "not_selected"
    | "authorized"
    | "captured"
    | "failed"
    | "refunded"
    | "manual_recovery";
  amount_minor: string | number | null;
  currency: string;
  attempt_count: number;
  available_actions: unknown;
  recovery_state?: "processing" | "accepted" | "completed" | "failed" | null;
  last_recovery_action?: "retry_capture" | "begin_manual_recovery" | null;
  updated_at: string;
};

function buildPaymentRow(overrides: Partial<PaymentDbRow> = {}): PaymentDbRow {
  return {
    payment_id: "payment-c074-1250",
    order_id: "ORD-C074-1250",
    trip_id: "trip-c074-001",
    provider_payment_ref: "pay_provider_secret_88f2",
    status: "failed",
    amount_minor: "1250",
    currency: "TWD",
    attempt_count: 2,
    available_actions: [
      {
        action: "retry_capture",
        enabled: true,
        riskLevel: "medium",
      },
      {
        action: "begin_manual_recovery",
        enabled: true,
        requiresReason: true,
        riskLevel: "high",
      },
      {
        action: "mark_paid",
        enabled: true,
        riskLevel: "high",
      },
    ],
    recovery_state: null,
    last_recovery_action: null,
    updated_at: "2026-10-15T08:30:00.000Z",
    ...overrides,
  };
}

function createExecutionContext(
  request: AuthenticatedRequestLike,
  handler: keyof BillingSettlementController,
) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => BillingSettlementController.prototype[handler],
    getClass: () => BillingSettlementController,
  } as never;
}

function parseDisplayedMinor(display: string): number {
  const numericText = display
    .replace(/^[^0-9-]+/, "")
    .replaceAll(",", "")
    .trim();
  return Math.round(Number(numericText) * 100);
}

function getRenderedFieldValue(
  container: Element,
  label: string,
): string | null {
  const allDivs = Array.from(container.querySelectorAll("div"));
  const labelDiv = allDivs.find(
    (node) => node.childElementCount === 0 && node.textContent === label,
  );
  return labelDiv?.nextElementSibling?.textContent ?? null;
}

function findButtonByText(
  container: Element,
  matcher: string | RegExp,
): HTMLButtonElement | null {
  const buttons = Array.from(container.querySelectorAll("button"));
  return (
    buttons.find((btn) => {
      const text = btn.textContent ?? "";
      return typeof matcher === "string"
        ? text.includes(matcher)
        : matcher.test(text);
    }) ?? null
  );
}

const activeRoots: Array<{ root: RootLike; container: HTMLElement }> = [];

function createHarness(options?: {
  row?: PaymentDbRow | null;
  dbEnabled?: boolean;
  actorHeaders?: Record<string, string>;
  recoverImpl?: PaymentRecoveryPort["recover"];
}) {
  const state = {
    row: options?.row === undefined ? buildPaymentRow() : options.row,
    dbEnabled: options?.dbEnabled ?? true,
    actorHeaders: options?.actorHeaders ?? {
      "x-actor-type": "platform_admin",
      "x-actor-id": "platform-finance-001",
      "x-realm": "platform",
      "x-roles": "platform_admin",
      "x-scopes": "billing:read,billing:write",
    },
    commands: new Map<
      string,
      {
        recovery_command_id: string;
        payment_id: string;
        order_id: string;
        action: "retry_capture" | "begin_manual_recovery";
        idempotency_key: string;
        state: "processing" | "accepted" | "completed" | "failed";
        action_receipt: unknown;
        created_at: string;
        updated_at: string;
      }
    >(),
    postRequests: [] as Array<{
      url: string;
      idempotencyKey: string | null;
      body: unknown;
    }>,
  };

  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("FROM billing.multi_taxi_passenger_payments")) {
      const requestedOrderId = String(params[0] ?? "");
      if (!state.row || state.row.order_id !== requestedOrderId) {
        return { rows: [] };
      }
      return { rows: [state.row] };
    }
    if (sql.includes("FROM admin.audit_logs")) {
      return {
        rows: [
          {
            audit_id: "audit-payment-001",
            actor_id: "payment-provider",
            actor_type: "system",
            action_name: "payment_capture_failed",
            request_id: "provider-request-003",
            created_at: "2026-10-15T08:30:00.000Z",
          },
        ],
      };
    }
    if (
      sql.includes("SELECT") &&
      sql.includes("FROM billing.multi_taxi_payment_recovery_commands")
    ) {
      const key = `${String(params[0])}:${String(params[1])}:${String(params[2])}`;
      const existing = state.commands.get(key);
      return { rows: existing ? [existing] : [] };
    }
    if (
      sql.includes("INSERT INTO billing.multi_taxi_payment_recovery_commands")
    ) {
      const key = `${String(params[1])}:${String(params[3])}:${String(params[4])}`;
      if (state.commands.has(key)) {
        return { rows: [] };
      }
      const created = {
        recovery_command_id: String(params[0]),
        payment_id: String(params[1]),
        order_id: String(params[2]),
        action: params[3] as "retry_capture" | "begin_manual_recovery",
        idempotency_key: String(params[4]),
        state: "processing" as const,
        action_receipt: null,
        created_at: "2026-10-15T08:35:00.000Z",
        updated_at: "2026-10-15T08:35:00.000Z",
      };
      state.commands.set(key, created);
      return { rows: [created] };
    }
    if (
      sql.includes("UPDATE billing.multi_taxi_payment_recovery_commands") &&
      sql.includes("state = 'failed'")
    ) {
      for (const cmd of state.commands.values()) {
        if (cmd.recovery_command_id === String(params[0])) {
          cmd.state = "failed";
        }
      }
      return { rows: [], rowCount: 1 };
    }
    return { rows: [] };
  });

  const connect = vi.fn(async () => ({
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (
        sql.includes(
          "SELECT drts_passenger_id FROM passenger.payment_charge_records",
        )
      ) {
        return { rows: [] };
      }
      if (sql.includes("UPDATE billing.multi_taxi_payment_recovery_commands")) {
        const commandId = String(params[0]);
        const nextState = params[1] as "accepted" | "completed";
        const receipt = JSON.parse(String(params[2]));
        for (const cmd of state.commands.values()) {
          if (cmd.recovery_command_id === commandId) {
            cmd.state = nextState;
            cmd.action_receipt = receipt;
          }
        }
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("UPDATE billing.multi_taxi_passenger_payments")) {
        const action = String(params[1]);
        const outcome = String(params[2]);
        if (state.row) {
          if (action === "begin_manual_recovery") {
            state.row = {
              ...state.row,
              status: "manual_recovery",
              recovery_state: outcome as "accepted" | "completed",
              last_recovery_action: "begin_manual_recovery",
            };
          } else if (action === "retry_capture" && outcome === "completed") {
            state.row = {
              ...state.row,
              status: "captured",
              attempt_count: state.row.attempt_count + 1,
              recovery_state: "completed",
              last_recovery_action: "retry_capture",
            };
          } else if (action === "retry_capture") {
            state.row = {
              ...state.row,
              recovery_state: outcome as "accepted" | "completed",
              last_recovery_action: "retry_capture",
            };
          }
        }
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  }));

  const repository = new BillingSettlementRepository({
    isEnabled: () => state.dbEnabled,
    query,
    connect,
  } as never);
  const auditService = new AuditNotificationService();
  const recoveryPort: PaymentRecoveryPort = {
    isAvailable: () => true,
    recover:
      options?.recoverImpl ??
      (async (action) => ({
        status: action === "retry_capture" ? "completed" : "accepted",
      })),
  };
  const service = new BillingSettlementService(
    auditService,
    repository,
    undefined,
    recoveryPort,
  );
  const controller = new BillingSettlementController(service);
  const { Reflector } = createRequire(resolve("apps/api/package.json"))(
    "@nestjs/core",
  ) as { Reflector: new () => never };
  const guard = new BootstrapAuthGuard(new Reflector());

  const dispatchToController = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const parsedUrl = new URL(rawUrl, "http://platform-admin.test");
    const method = (init?.method ?? "GET").toUpperCase();
    const requestHeaders: Record<string, string> = {
      ...state.actorHeaders,
    };
    if (init?.headers) {
      const h = new Headers(init.headers);
      h.forEach((value, key) => {
        requestHeaders[key.toLowerCase()] = value;
      });
    }

    const actionMatch = parsedUrl.pathname.match(
      /\/payment-exceptions\/([^/]+)\/actions\/([^/]+)$/,
    );
    const detailMatch = parsedUrl.pathname.match(
      /\/payment-exceptions\/([^/]+)$/,
    );

    try {
      if (method === "POST" && actionMatch) {
        const orderId = decodeURIComponent(actionMatch[1]!);
        const action = decodeURIComponent(actionMatch[2]!);
        const reqLike: AuthenticatedRequestLike = {
          headers: requestHeaders,
          method: "POST",
          originalUrl: `/api/payment-exceptions/${orderId}/actions/${action}`,
        };
        guard.canActivate(
          createExecutionContext(reqLike, "executeMultiTaxiPaymentRecovery"),
        );
        const parsedBody =
          typeof init?.body === "string" && init.body.length > 0
            ? JSON.parse(init.body)
            : undefined;
        state.postRequests.push({
          url: parsedUrl.pathname,
          idempotencyKey: requestHeaders["idempotency-key"] ?? null,
          body: parsedBody,
        });
        const envelope = await controller.executeMultiTaxiPaymentRecovery(
          orderId,
          action,
          parsedBody,
          (reqLike.identity as never) ?? null,
          requestHeaders["idempotency-key"],
          requestHeaders["x-request-id"] ?? "req-test-post",
        );
        return new Response(JSON.stringify(envelope), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (method === "GET" && detailMatch) {
        const orderId = decodeURIComponent(detailMatch[1]!);
        const reqLike: AuthenticatedRequestLike = {
          headers: requestHeaders,
          method: "GET",
          originalUrl: `/api/payment-exceptions/${orderId}`,
        };
        guard.canActivate(
          createExecutionContext(reqLike, "getMultiTaxiPaymentException"),
        );
        const envelope = await controller.getMultiTaxiPaymentException(
          orderId,
          (reqLike.identity as never) ?? null,
          requestHeaders["x-request-id"] ?? "req-test-get",
        );
        return new Response(JSON.stringify(envelope), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          error: {
            code: "NOT_FOUND",
            message: `Unhandled path ${parsedUrl.pathname}`,
          },
        }),
        { status: 404, headers: { "content-type": "application/json" } },
      );
    } catch (error) {
      if (error instanceof ApiRequestError) {
        return new Response(JSON.stringify(error.getResponse()), {
          status: error.getStatus(),
          headers: { "content-type": "application/json" },
        });
      }
      throw error;
    }
  };

  const fetchMock = vi.fn(dispatchToController);
  vi.stubGlobal("fetch", fetchMock);

  const modules = loadPaymentDetailModules();

  const flush = async (
    container?: HTMLElement,
    waitUntilNotLoading = true,
  ) => {
    for (let i = 0; i < 30; i += 1) {
      await modules.React.act(async () => {
        await new Promise((r) => setTimeout(r, 5));
      });
      if (
        !waitUntilNotLoading ||
        !container ||
        container.querySelector('[data-testid="payment-exception-loading"]') ===
          null
      ) {
        // One extra microtask flush inside act to ensure final state commit
        await modules.React.act(async () => {
          await new Promise((r) => setTimeout(r, 1));
        });
        break;
      }
    }
  };

  const mountDetail = async (
    orderId = "ORD-C074-1250",
    locale: "zh" | "en" = "zh",
    waitForLoad = true,
  ) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = modules.createRoot(container);
    activeRoots.push({ root, container });

    await modules.React.act(async () => {
      root.render(
        modules.React.createElement(
          modules.LanguageProvider,
          { defaultLocale: locale },
          modules.React.createElement(modules.PaymentExceptionDetail, {
            orderId,
          }),
        ),
      );
    });

    if (waitForLoad) {
      await flush(container, true);
    }

    return {
      container,
      flush: () => flush(container, true),
      click: async (button: HTMLElement) => {
        await modules.React.act(async () => {
          button.click();
        });
        await flush(container, true);
      },
      unmount: async () => {
        await modules.React.act(async () => {
          root.unmount();
        });
        container.remove();
      },
    };
  };

  return {
    state,
    query,
    repository,
    service,
    controller,
    fetchMock,
    modules,
    mountDetail,
  };
}

describe("PAYMENT-DETAIL-MINOR-PRECISION-20261015: canonical minor-unit amount precision in PaymentExceptionDetail", () => {
  beforeEach(() => {
    (
      globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
  });

  afterEach(async () => {
    while (activeRoots.length > 0) {
      const entry = activeRoots.pop()!;
      try {
        entry.root.unmount();
      } catch {
        // ignore if already unmounted
      }
      entry.container.remove();
    }
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("retains exact 1250/TWD (12.50 major) canonical minor precision in both zh and en locales without rounding to 13", async () => {
    const h = createHarness({
      row: buildPaymentRow({
        order_id: "ORD-C074-1250",
        amount_minor: "1250",
        currency: "TWD",
      }),
    });

    const repoRecord =
      await h.repository.findMultiTaxiPaymentException("ORD-C074-1250");
    expect(repoRecord?.amountMinor).toBe(1250);
    expect(repoRecord?.currency).toBe("TWD");

    const zhRender = await h.mountDetail("ORD-C074-1250", "zh");
    expect(
      zhRender.container.querySelector(
        '[data-testid="payment-exception-detail"]',
      ),
    ).not.toBeNull();
    const zhAmountLabel = h.modules.paymentExceptionCopy("zh", "amount");
    const zhAmountText = getRenderedFieldValue(
      zhRender.container,
      zhAmountLabel,
    );
    expect(zhAmountText).toBe("$12.50");
    expect(zhAmountText).not.toBe("$13");
    expect(parseDisplayedMinor(zhAmountText!)).toBe(1250);
    await zhRender.unmount();

    const enRender = await h.mountDetail("ORD-C074-1250", "en");
    expect(
      enRender.container.querySelector(
        '[data-testid="payment-exception-detail"]',
      ),
    ).not.toBeNull();
    const enAmountLabel = h.modules.paymentExceptionCopy("en", "amount");
    const enAmountText = getRenderedFieldValue(
      enRender.container,
      enAmountLabel,
    );
    expect(enAmountText).toBe("NT$12.50");
    expect(enAmountText).not.toBe("NT$13");
    expect(parseDisplayedMinor(enAmountText!)).toBe(1250);
    await enRender.unmount();
  });

  it.each([
    [1205, "TWD", "$12.05", "NT$12.05"],
    [1, "TWD", "$0.01", "NT$0.01"],
    [1250, "NTD", "NTD\u00a012.50", "NTD\u00a012.50"],
    [123456789, "TWD", "$1,234,567.89", "NT$1,234,567.89"],
  ])(
    "preserves non-whole minor amount %i %s across zh (%s) and en (%s)",
    async (amountMinor, currency, expectedZh, expectedEn) => {
      const orderId = `ORD-MINOR-${amountMinor}-${currency}`;
      const h = createHarness({
        row: buildPaymentRow({
          order_id: orderId,
          amount_minor: amountMinor,
          currency,
        }),
      });

      const zhView = await h.mountDetail(orderId, "zh");
      const zhText = getRenderedFieldValue(
        zhView.container,
        h.modules.paymentExceptionCopy("zh", "amount"),
      );
      expect(zhText).toBe(expectedZh);
      expect(parseDisplayedMinor(zhText!)).toBe(amountMinor);
      await zhView.unmount();

      const enView = await h.mountDetail(orderId, "en");
      const enText = getRenderedFieldValue(
        enView.container,
        h.modules.paymentExceptionCopy("en", "amount"),
      );
      expect(enText).toBe(expectedEn);
      expect(parseDisplayedMinor(enText!)).toBe(amountMinor);
      await enView.unmount();
    },
  );

  it.each([
    [1200, "TWD", "$12", "NT$12"],
    [35500, "NTD", "NTD\u00a0355", "NTD\u00a0355"],
    [0, "TWD", "$0", "NT$0"],
  ])(
    "preserves whole-unit and zero amount %i %s in zh (%s) and en (%s)",
    async (amountMinor, currency, expectedZh, expectedEn) => {
      const orderId = `ORD-WHOLE-${amountMinor}-${currency}`;
      const h = createHarness({
        row: buildPaymentRow({
          order_id: orderId,
          amount_minor: amountMinor,
          currency,
        }),
      });

      const zhView = await h.mountDetail(orderId, "zh");
      const zhText = getRenderedFieldValue(
        zhView.container,
        h.modules.paymentExceptionCopy("zh", "amount"),
      );
      expect(zhText).toBe(expectedZh);
      expect(parseDisplayedMinor(zhText!)).toBe(amountMinor);
      await zhView.unmount();

      const enView = await h.mountDetail(orderId, "en");
      const enText = getRenderedFieldValue(
        enView.container,
        h.modules.paymentExceptionCopy("en", "amount"),
      );
      expect(enText).toBe(expectedEn);
      expect(parseDisplayedMinor(enText!)).toBe(amountMinor);
      await enView.unmount();
    },
  );

  it("renders localized unavailable label when amount is null and preserves masked provider reference without mark-paid controls", async () => {
    const h = createHarness({
      row: buildPaymentRow({
        order_id: "ORD-NULL-AMOUNT",
        amount_minor: null,
        provider_payment_ref: "pay_provider_secret_88f2",
      }),
    });

    const zhView = await h.mountDetail("ORD-NULL-AMOUNT", "zh");
    expect(
      getRenderedFieldValue(
        zhView.container,
        h.modules.paymentExceptionCopy("zh", "amount"),
      ),
    ).toBe(h.modules.paymentExceptionCopy("zh", "unavailable"));
    expect(
      getRenderedFieldValue(
        zhView.container,
        h.modules.paymentExceptionCopy("zh", "providerReference"),
      ),
    ).toBe("pay_...88f2");
    expect(zhView.container.textContent).not.toContain(
      "pay_provider_secret_88f2",
    );
    const recoveryActionsEl = zhView.container.querySelector(
      '[data-testid="payment-recovery-actions"]',
    )!;
    expect(recoveryActionsEl.textContent).not.toContain("mark_paid");
    expect(recoveryActionsEl.textContent).not.toContain("mark-paid");
    await zhView.unmount();

    const enView = await h.mountDetail("ORD-NULL-AMOUNT", "en");
    expect(
      getRenderedFieldValue(
        enView.container,
        h.modules.paymentExceptionCopy("en", "amount"),
      ),
    ).toBe(h.modules.paymentExceptionCopy("en", "unavailable"));
    await enView.unmount();
  });

  it("retains initial loading, orderId match check, invalid response, 404 not_found, 503 unavailable, and authoritative retry", async () => {
    let releaseInitialRead: (() => void) | undefined;
    const h = createHarness({
      row: null,
      dbEnabled: false,
    });
    const baseImpl = h.fetchMock.getMockImplementation()!;
    h.fetchMock.mockImplementationOnce(
      (input, init) =>
        new Promise<Response>((resolveResponse) => {
          releaseInitialRead = () => {
            void baseImpl(input, init).then(resolveResponse);
          };
        }),
    );

    // 1. Initial loading state before promise settles, then 503 unavailable
    const view = await h.mountDetail("ORD-C074-1250", "en", false);
    expect(
      view.container.querySelector('[data-testid="payment-exception-loading"]'),
    ).not.toBeNull();
    releaseInitialRead?.();
    await view.flush();
    expect(
      view.container.querySelector(
        '[data-testid="payment-exception-unavailable"]',
      ),
    ).not.toBeNull();
    expect(view.container.textContent).not.toContain("12.50");

    // 2. Enable DB but order still missing -> 404 not_found on retry
    h.state.dbEnabled = true;
    await view.click(
      findButtonByText(
        view.container,
        h.modules.paymentExceptionCopy("en", "retry"),
      )!,
    );
    expect(
      view.container.querySelector(
        '[data-testid="payment-exception-not-found"]',
      ),
    ).not.toBeNull();

    // 3. Mismatched orderId in response payload -> fail-closed invalid response
    h.fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            paymentId: "payment-forged",
            orderId: "DIFFERENT-ORDER-ID",
            tripId: "trip-001",
            status: "failed",
            amount: { amountMinor: 1250, currency: "TWD" },
            safeProviderReference: "pay_...88f2",
            attemptCount: 1,
            recoveryState: null,
            lastRecoveryAction: null,
            updatedAt: "2026-10-15T08:30:00.000Z",
            availableActions: [],
            auditTimeline: [],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    await view.click(
      findButtonByText(
        view.container,
        h.modules.paymentExceptionCopy("en", "retry"),
      )!,
    );
    expect(
      view.container.querySelector('[data-testid="payment-exception-invalid"]'),
    ).not.toBeNull();
    expect(view.container.textContent).not.toContain("12.50");

    // 4. Authoritative matching row becomes available -> retry loads exact 12.50 amount
    h.state.row = buildPaymentRow({
      order_id: "ORD-C074-1250",
      amount_minor: 1250,
      currency: "TWD",
    });
    await view.click(
      findButtonByText(
        view.container,
        h.modules.paymentExceptionCopy("en", "retry"),
      )!,
    );
    expect(
      view.container.querySelector('[data-testid="payment-exception-detail"]'),
    ).not.toBeNull();
    expect(
      getRenderedFieldValue(
        view.container,
        h.modules.paymentExceptionCopy("en", "amount"),
      ),
    ).toBe("NT$12.50");
    await view.unmount();
  });

  it("denies missing or insufficient authority with 403 forbidden without exposing any amount or retry button, and disables recovery actions for read-only actors", async () => {
    const h = createHarness({
      row: buildPaymentRow({
        order_id: "ORD-C074-1250",
        amount_minor: 1250,
        currency: "TWD",
      }),
      actorHeaders: {
        "x-actor-type": "platform_admin",
        "x-actor-id": "platform-no-billing-scope",
        "x-realm": "platform",
        "x-roles": "platform_admin",
        "x-scopes": "foundation:read",
      },
    });

    const forbiddenView = await h.mountDetail("ORD-C074-1250", "zh");
    expect(
      forbiddenView.container.querySelector(
        '[data-testid="payment-exception-forbidden"]',
      ),
    ).not.toBeNull();
    expect(forbiddenView.container.textContent).not.toContain("12.50");
    expect(forbiddenView.container.textContent).not.toContain("13");
    expect(forbiddenView.container.textContent).not.toContain("pay_...88f2");
    expect(
      findButtonByText(
        forbiddenView.container,
        h.modules.paymentExceptionCopy("zh", "retry"),
      ),
    ).toBeNull();
    await forbiddenView.unmount();

    // Read-only billing:read actor sees exact amount but recovery actions are disabled by backend
    h.state.actorHeaders = {
      "x-actor-type": "platform_admin",
      "x-actor-id": "platform-readonly-001",
      "x-realm": "platform",
      "x-roles": "platform_admin",
      "x-scopes": "billing:read",
    };
    const readOnlyView = await h.mountDetail("ORD-C074-1250", "en");
    expect(
      readOnlyView.container.querySelector(
        '[data-testid="payment-exception-detail"]',
      ),
    ).not.toBeNull();
    const actionButtons = Array.from(
      readOnlyView.container
        .querySelector('[data-testid="payment-recovery-actions"]')!
        .querySelectorAll("button"),
    );
    expect(actionButtons.length).toBe(2);
    expect(actionButtons.every((btn) => btn.disabled)).toBe(true);
    expect(readOnlyView.container.textContent).toContain(
      "payment_recovery_write_authority_required",
    );
    expect(
      getRenderedFieldValue(
        readOnlyView.container,
        h.modules.paymentExceptionCopy("en", "amount"),
      ),
    ).toBe("NT$12.50");
    await readOnlyView.unmount();
  });

  it("preserves confirmation, reason prompt validation, idempotency key reuse/reset, receipt banner, and reload on recovery actions", async () => {
    let recoverCallCount = 0;
    const h = createHarness({
      row: buildPaymentRow({
        order_id: "ORD-C074-1250",
        amount_minor: 1250,
        currency: "TWD",
      }),
      recoverImpl: async (action) => {
        recoverCallCount += 1;
        if (recoverCallCount === 1) {
          throw new Error("Simulated transient provider error");
        }
        return {
          status: action === "retry_capture" ? "completed" : "accepted",
        };
      },
    });

    const view = await h.mountDetail("ORD-C074-1250", "en");
    expect(
      view.container.querySelector('[data-testid="payment-exception-detail"]'),
    ).not.toBeNull();

    // 1. requiresReason action with blank reason fails closed without calling POST
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValueOnce("   ");
    await view.click(
      findButtonByText(view.container, /Begin manual recovery/i)!,
    );
    expect(promptSpy).toHaveBeenCalledOnce();
    expect(h.state.postRequests).toHaveLength(0);
    expect(view.container.textContent).toContain(
      h.modules.paymentExceptionCopy("en", "commandFailed"),
    );

    // 2. retry_capture with window.confirm: first attempt fails at provider, second reuses Idempotency-Key and succeeds
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    await view.click(findButtonByText(view.container, /Retry capture/i)!);
    expect(h.state.postRequests).toHaveLength(1);
    const firstKey = h.state.postRequests[0]!.idempotencyKey;
    expect(firstKey).toMatch(/^payment-recovery-retry_capture-/);
    expect(view.container.textContent).toContain(
      h.modules.paymentExceptionCopy("en", "commandFailed"),
    );

    // Clear the failed command entry so the retry with the same intent key reaches provider and completes
    h.state.commands.clear();
    await view.click(findButtonByText(view.container, /Retry capture/i)!);
    expect(h.state.postRequests).toHaveLength(2);
    expect(h.state.postRequests[1]!.idempotencyKey).toBe(firstKey);
    expect(confirmSpy).toHaveBeenCalledTimes(2);

    expect(view.container.textContent).toContain(
      h.modules.paymentExceptionCopy("en", "commandAccepted"),
    );
    expect(view.container.textContent).toContain("Completed · captured");
    expect(
      getRenderedFieldValue(
        view.container,
        h.modules.paymentExceptionCopy("en", "amount"),
      ),
    ).toBe("NT$12.50");
    await view.unmount();
  });
});
