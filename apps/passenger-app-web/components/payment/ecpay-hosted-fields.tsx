"use client";

import { useEffect, useRef, useState } from "react";
import type { BindPaymentMethodCommand } from "@drts/contracts";
import type {
  PassengerPaymentFieldsAvailability,
  PassengerPaymentFieldsPort,
} from "@drts/passenger-client";
import { passengerFetch } from "../../lib/runtime-fetch";
import { P5 } from "../auth/ui";
import {
  ECPAY_ACTION_ORIGINS,
  ECPAY_JQUERY_URL,
  ECPAY_WEB_SDK_URLS,
} from "./ecpay-csp";

export interface EcpayBindingSession {
  provider?: "ecpay";
  merchantToken?: string;
  token: string;
  tokenExpireDate: string;
  serverType: "Stage" | "Prod";
  approvedActionOrigins?: readonly string[];
}

export interface EcpayPayTokenCallbackResult {
  BindCardPayToken?: string;
  MerchantTradeNo?: string;
  RtnCode?: number | string;
  RtnMsg?: string;
}

export interface EcpaySdkGlobal {
  Language?: {
    zhTW?: string;
    enUS?: string;
  };
  initialize(
    serverType: "Stage" | "Prod",
    isLoading: number,
    callback: (errorMessage?: string) => void,
  ): void;
  addBindingCard(
    merchantToken: string,
    language: string,
    callback: (errorMessage?: string) => void,
  ): void;
  getBindCardPayToken(
    callback: (
      result?: EcpayPayTokenCallbackResult,
      errorMessage?: string,
    ) => void,
  ): void;
}

declare global {
  interface Window {
    ECPay?: EcpaySdkGlobal;
    jQuery?: unknown;
  }
}

export function createEcpayHostedFieldsPort(options: {
  getSdk: () => EcpaySdkGlobal | undefined;
}): PassengerPaymentFieldsPort {
  let disposed = false;
  return {
    kind: "hosted",
    async collectCredential(): Promise<BindPaymentMethodCommand> {
      if (disposed) {
        throw new Error("ecpay_fields_disposed");
      }
      const sdk = options.getSdk();
      if (!sdk || typeof sdk.getBindCardPayToken !== "function") {
        throw new Error("ecpay_sdk_unavailable");
      }
      return new Promise<BindPaymentMethodCommand>((resolve, reject) => {
        try {
          sdk.getBindCardPayToken((result, errorMessage) => {
            if (disposed) {
              reject(new Error("ecpay_fields_disposed"));
              return;
            }
            if (errorMessage) {
              reject(new Error(`ecpay_pay_token_failed:${errorMessage}`));
              return;
            }
            const hasExplicitRtnCode =
              result?.RtnCode !== undefined &&
              result?.RtnCode !== null &&
              String(result.RtnCode).trim() !== "";
            const rtnCode = hasExplicitRtnCode ? Number(result?.RtnCode) : 1;
            const payToken =
              typeof result?.BindCardPayToken === "string"
                ? result.BindCardPayToken.trim()
                : "";
            if (
              rtnCode !== 1 ||
              payToken.length < 16 ||
              payToken.length > 2048 ||
              !/^[A-Za-z0-9_.:-]+$/.test(payToken) ||
              /^[0-9 -]+$/.test(payToken)
            ) {
              reject(
                new Error(
                  `ecpay_pay_token_invalid:${String(result?.RtnMsg ?? result?.RtnCode ?? "invalid")}`,
                ),
              );
              return;
            }
            resolve({ providerToken: payToken });
          });
        } catch (err) {
          reject(err instanceof Error ? err : new Error("ecpay_sdk_exception"));
        }
      });
    },
    dispose() {
      disposed = true;
    },
  };
}

export async function fetchEcpayBindingSession(
  fetchFn: (
    url: string,
    init?: RequestInit,
  ) => Promise<Response> = passengerFetch,
): Promise<EcpayBindingSession> {
  const response = await fetchFn(
    "/api/passenger-app/payment-methods?binding_session=1",
    {
      method: "GET",
      headers: { Accept: "application/json" },
    },
  );
  if (!response.ok) {
    throw new Error(`ecpay_binding_session_http_${response.status}`);
  }
  const body = (await response.json()) as {
    data?: EcpayBindingSession;
  } & Partial<EcpayBindingSession>;
  const session = body?.data ?? body;
  const resolvedToken =
    typeof session?.merchantToken === "string" && session.merchantToken.trim()
      ? session.merchantToken.trim()
      : typeof session?.token === "string" && session.token.trim()
        ? session.token.trim()
        : "";
  if (
    !session ||
    (session.provider !== undefined && session.provider !== "ecpay") ||
    !resolvedToken ||
    (session.serverType !== "Stage" && session.serverType !== "Prod")
  ) {
    throw new Error("ecpay_binding_session_invalid");
  }
  const approvedActionOrigins =
    Array.isArray(session.approvedActionOrigins) &&
    session.approvedActionOrigins.length > 0
      ? session.approvedActionOrigins.filter(
          (origin): origin is string =>
            typeof origin === "string" && origin.trim().length > 0,
        )
      : ECPAY_ACTION_ORIGINS;
  return {
    provider: "ecpay",
    merchantToken: resolvedToken,
    token: resolvedToken,
    tokenExpireDate: String(session.tokenExpireDate ?? ""),
    serverType: session.serverType,
    approvedActionOrigins,
  };
}

function loadExternalScript(src: string): Promise<void> {
  if (typeof document === "undefined") {
    return Promise.reject(new Error("document_unavailable"));
  }
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`script_load_failed:${src}`));
    document.head.appendChild(script);
  });
}

export interface EcpayHostedFieldsProps {
  serverType?: "Stage" | "Prod";
  merchantToken?: string;
  fetchSession?: () => Promise<EcpayBindingSession>;
  sdk?: EcpaySdkGlobal;
  onReady?: (availability: PassengerPaymentFieldsAvailability) => void;
  onSessionLoaded?: (session: EcpayBindingSession) => void;
  onError?: (errorMessage: string) => void;
}

export function EcpayHostedFields({
  serverType: initialServerType,
  merchantToken: initialMerchantToken,
  fetchSession = fetchEcpayBindingSession,
  sdk: injectedSdk,
  onReady,
  onSessionLoaded,
  onError,
}: EcpayHostedFieldsProps) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [statusMessage, setStatusMessage] = useState(
    "正在載入綠界 ECPay 安全刷卡元件…",
  );
  const portRef = useRef<PassengerPaymentFieldsPort | null>(null);
  const onReadyRef = useRef(onReady);
  const onSessionLoadedRef = useRef(onSessionLoaded);
  const onErrorRef = useRef(onError);
  onReadyRef.current = onReady;
  onSessionLoadedRef.current = onSessionLoaded;
  onErrorRef.current = onError;

  useEffect(() => {
    let active = true;

    async function mountSdk() {
      try {
        let token = initialMerchantToken?.trim() ?? "";
        let serverType: "Stage" | "Prod" = initialServerType ?? "Stage";

        if (!token) {
          const session = await fetchSession();
          if (!active) return;
          token = session.token;
          serverType = session.serverType;
          onSessionLoadedRef.current?.(session);
        }

        let sdk =
          injectedSdk ??
          (typeof window !== "undefined" ? window.ECPay : undefined);
        if (!sdk) {
          if (typeof window !== "undefined" && !window.jQuery) {
            await loadExternalScript(ECPAY_JQUERY_URL);
            if (!active) return;
          }
          await loadExternalScript(ECPAY_WEB_SDK_URLS[serverType]);
          if (!active) return;
          sdk = typeof window !== "undefined" ? window.ECPay : undefined;
        }

        if (
          !sdk ||
          typeof sdk.initialize !== "function" ||
          typeof sdk.addBindingCard !== "function"
        ) {
          throw new Error("ecpay_sdk_unavailable");
        }

        await new Promise<void>((resolve, reject) => {
          sdk!.initialize(serverType, 1, (errMsg) => {
            if (errMsg) {
              reject(new Error(errMsg));
              return;
            }
            resolve();
          });
        });
        if (!active) return;

        const sdkLanguage = sdk.Language?.zhTW ?? "zh-TW";
        await new Promise<void>((resolve, reject) => {
          sdk!.addBindingCard(token, sdkLanguage, (errMsg) => {
            if (errMsg) {
              reject(new Error(errMsg));
              return;
            }
            resolve();
          });
        });
        if (!active) return;

        const port = createEcpayHostedFieldsPort({
          getSdk: () =>
            injectedSdk ??
            (typeof window !== "undefined" ? window.ECPay : undefined),
        });
        portRef.current = port;
        setStatus("ready");
        setStatusMessage("綠界 ECPay 站內付 2.0 安全刷卡元件已就緒");
        onReadyRef.current?.({ status: "ready", port });
      } catch (err) {
        if (!active) return;
        const msg =
          err instanceof Error && err.message
            ? err.message
            : "無法載入綠界 ECPay 刷卡元件";
        setStatus("error");
        setStatusMessage("無法載入綠界 ECPay 安全刷卡元件，請稍後再試。");
        onReadyRef.current?.({ status: "unavailable" });
        onErrorRef.current?.(msg);
      }
    }

    void mountSdk();

    return () => {
      active = false;
      if (portRef.current) {
        portRef.current.dispose();
        portRef.current = null;
      }
      onReadyRef.current?.({ status: "unavailable" });
    };
  }, [fetchSession, initialMerchantToken, initialServerType, injectedSdk]);

  return (
    <div
      style={{
        width: "100%",
        padding: 12,
        background: P5.surface,
        borderRadius: 12,
        border: `1px solid ${P5.line}`,
        color: P5.ink,
      }}
    >
      <div
        id="ECPayPayment"
        data-testid="ecpay-hosted-fields-container"
        style={{ minHeight: 120 }}
      />
      <p
        style={{
          margin: "8px 0 0",
          fontSize: 12,
          color: status === "error" ? P5.danger : P5.mut,
        }}
      >
        {statusMessage}
      </p>
    </div>
  );
}
