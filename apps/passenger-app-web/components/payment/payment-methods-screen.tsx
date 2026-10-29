"use client";
import { passengerFetch } from "../../lib/runtime-fetch";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type {
  PassengerAccount,
  PassengerPaymentMethod,
  PaymentMethodResponse,
} from "@drts/contracts";
import {
  PassengerClient,
  PassengerPaymentClient,
  PassengerApiError,
} from "@drts/passenger-client";
import { approvedPaymentActionUrl } from "../../lib/payment/action-url";
import {
  paymentMethodExpired,
  paymentMethodLabel,
} from "../../../../packages/passenger-client/src/payment/state";
import type { PassengerPaymentFieldsAvailability } from "@drts/passenger-client";
import { AuthScreen, AuthAlert, P5Btn, P5Card, P5 } from "../auth/ui";
import { PAY_T as T } from "../../lib/payment/translations";
import { ECPAY_ACTION_ORIGINS } from "./ecpay-csp";
import { EcpayHostedFields } from "./ecpay-hosted-fields";

export const MAX_BOUND_CARDS = 5;
export const CARD_LIMIT_MESSAGE =
  "每個會員最多可綁定 5 張信用卡。如需新增第 6 張卡片，請先移除既有卡片。";

export interface PaymentMethodsScreenProps {
  client?: PassengerPaymentClient;
  accountClient?: Pick<PassengerClient, "getAccount">;
  fields?: PassengerPaymentFieldsAvailability;
  hostedFieldsView?: ReactNode;
  approvedActionOrigins?: readonly string[];
}
export function PaymentMethodsScreen({
  client: supplied,
  accountClient: accountSupplied,
  fields: fieldsProp,
  hostedFieldsView: hostedFieldsViewProp,
  approvedActionOrigins,
}: PaymentMethodsScreenProps) {
  const useManagedEcpay =
    fieldsProp === undefined &&
    hostedFieldsViewProp === undefined &&
    process.env.NEXT_PUBLIC_PAYMENT_FIELDS_PROVIDER === "ecpay";
  const [managedFields, setManagedFields] =
    useState<PassengerPaymentFieldsAvailability>({ status: "unavailable" });
  const fields = fieldsProp ?? (useManagedEcpay ? managedFields : { status: "unavailable" });
  const hostedFieldsView =
    hostedFieldsViewProp ??
    (useManagedEcpay ? (
      <EcpayHostedFields onReady={setManagedFields} />
    ) : undefined);
  const effectiveActionOrigins =
    approvedActionOrigins ?? (useManagedEcpay ? ECPAY_ACTION_ORIGINS : []);
  const router = useRouter();
  const [client] = useState(
    () =>
      supplied ??
      new PassengerPaymentClient({
        baseUrl: "",
        fetchFn: passengerFetch,
      }),
  );
  const [accountClient] = useState(
    () =>
      accountSupplied ??
      new PassengerClient({
        baseUrl: "",
        fetchFn: passengerFetch,
      }),
  );
  const [methods, setMethods] = useState<PassengerPaymentMethod[]>();
  const [view, setView] = useState<"list" | "add" | "delete">("list");
  const [target, setTarget] = useState<PassengerPaymentMethod>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [actionUrl, setActionUrl] = useState<string>();
  const actor = useRef<string | undefined>(undefined);
  const invalidIdentity = useRef(false);
  const currentFields = useRef(fields);
  const fieldsRevision = useRef(0);
  const previousFields = currentFields.current;
  if (
    previousFields.status !== fields.status ||
    (previousFields.status === "ready" &&
      fields.status === "ready" &&
      previousFields.port !== fields.port)
  )
    fieldsRevision.current += 1;
  currentFields.current = fields;
  const lock = useRef(false);
  const alive = useRef(true);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [view]);
  function identityFence() {
    invalidIdentity.current = true;
    actor.current = undefined;
    setMethods(undefined);
    setTarget(undefined);
    setActionUrl(undefined);
    setPending(false);
    if (currentFields.current.status === "ready")
      currentFields.current.port.dispose();
    router.push("/login");
  }
  async function account(): Promise<PassengerAccount> {
    if (!alive.current || invalidIdentity.current)
      throw new Error("payment_screen_unmounted_or_invalid");
    const value = await accountClient.getAccount();
    if (!alive.current) throw new Error("payment_screen_unmounted");
    if (
      value.status !== "active" ||
      !value.drtsPassengerId ||
      (actor.current && actor.current !== value.drtsPassengerId)
    ) {
      identityFence();
      throw new Error("payment_account_changed");
    }
    actor.current = value.drtsPassengerId;
    return value;
  }
  async function readOwnedMethods() {
    const me = await account();
    const result = await client.getMethods();
    await account();
    if (actor.current !== me.drtsPassengerId || !alive.current)
      throw new Error("payment_account_changed");
    setMethods(result.methods);
    return result.methods;
  }
  function report(reason: unknown, message: string) {
    if (!alive.current) return;
    if (reason instanceof PassengerApiError && reason.status === 401)
      identityFence();
    setError(message);
  }
  async function refresh() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await readOwnedMethods();
    } catch (reason) {
      report(reason, T.failed);
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  // The provider wrapper owns mount/dispose. A React effect probe must not
  // destroy an injected live port; detached continuations still cannot bind.
  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
    };
  }, [client, accountClient]);
  function defer(result: PaymentMethodResponse) {
    setPending(true);
    if (result.status === "action_required") {
      setActionUrl(result.nextActionUrl);
      setError(T.verify);
    } else setError(T.pending);
  }
  async function bind() {
    if (lock.current || pending || fields.status !== "ready") return;
    if (methods !== undefined && methods.length >= MAX_BOUND_CARDS) {
      setError(CARD_LIMIT_MESSAGE);
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    let sent = false;
    const port = fields.port;
    const revision = fieldsRevision.current;
    const requireLivePort = () => {
      if (
        !alive.current ||
        invalidIdentity.current ||
        fieldsRevision.current !== revision ||
        currentFields.current.status !== "ready" ||
        currentFields.current.port !== port
      )
        throw new Error("payment_fields_changed");
    };
    try {
      await account();
      requireLivePort();
      const command = await port.collectCredential();
      requireLivePort();
      await account();
      // No await is allowed between this live-provider fence and the send.
      // Reattaching a previously detached port cannot revive its credential.
      requireLivePort();
      sent = true;
      const result = await client.bindMethod(command);
      await account();
      if (result.status !== "completed") {
        defer(result);
        return;
      }
      const current = await readOwnedMethods();
      if (
        !current.some(
          (method) => method.paymentMethodId === result.method.paymentMethodId,
        )
      ) {
        setPending(true);
        setError(T.unknown);
        return;
      }
      setView("list");
    } catch (reason) {
      if (!alive.current || invalidIdentity.current) return;
      if (reason instanceof PassengerApiError && reason.status === 401) {
        report(reason, T.failed);
        return;
      }
      if (
        reason instanceof PassengerApiError &&
        reason.code.toLowerCase() === "card_limit_exceeded"
      ) {
        report(reason, CARD_LIMIT_MESSAGE);
        return;
      }
      const declined =
        reason instanceof PassengerApiError &&
        reason.code.toLowerCase() === "card_declined" &&
        reason.status >= 400 &&
        reason.status < 500;
      if (sent && !declined) {
        setPending(true);
        report(reason, T.unknown);
      } else report(reason, T.bindingFailed);
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function change(
    kind: "default" | "delete",
    method: PassengerPaymentMethod,
  ) {
    if (lock.current || pending) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await account();
      if (kind === "delete") {
        const result = await client.removeMethod(method.paymentMethodId);
        await account();
        if (!result.success) {
          setError(T.updateFailed);
          return;
        }
      } else {
        const result = await client.setDefault(method.paymentMethodId);
        await account();
        if (result.status !== "completed") {
          defer(result);
          return;
        }
      }
      const current = await readOwnedMethods();
      const changed =
        kind === "delete"
          ? !current.some(
              (row) => row.paymentMethodId === method.paymentMethodId,
            )
          : current.some(
              (row) =>
                row.paymentMethodId === method.paymentMethodId && row.isDefault,
            );
      if (!changed) {
        setError(T.updateFailed);
        return;
      }
      setTarget(undefined);
      setView("list");
    } catch (reason) {
      const unpaid =
        reason instanceof PassengerApiError &&
        reason.status >= 400 &&
        reason.status < 500 &&
        reason.code.toLowerCase() === "pending_payment_block";
      report(reason, unpaid ? `${T.unpaid} ${T.unpaidHelp}` : T.updateFailed);
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const title =
    view === "add" ? T.addTitle : view === "delete" ? T.removeTitle : T.title;
  const approvedUrl = actionUrl
    ? approvedPaymentActionUrl(actionUrl, effectiveActionOrigins)
    : null;
  const atCardLimit =
    methods !== undefined && methods.length >= MAX_BOUND_CARDS;
  const fieldsReady =
    fields.status === "ready" &&
    (fields.port.kind === "synthetic" || hostedFieldsView !== undefined);
  if (invalidIdentity.current)
    return (
      <AuthScreen title={T.title}>
        <AuthAlert>{T.failed}</AuthAlert>
        <a href="/login">{T.login}</a>
      </AuthScreen>
    );
  return (
    <AuthScreen title={title} account={view === "list"}>
      <h1
        ref={heading}
        tabIndex={-1}
        style={{ fontSize: 18, margin: "0 14px" }}
      >
        {title}
      </h1>
      {error && <AuthAlert>{error}</AuthAlert>}
      {error && !pending && <a href="tel:02-2944-0985">{T.support}</a>}
      {pending && (
        <>
          {actionUrl &&
            (approvedUrl ? (
              <a href={approvedUrl} rel="noopener noreferrer">
                {T.verifyLink}
              </a>
            ) : (
              <AuthAlert kind="warn">{T.verifyUnavailable}</AuthAlert>
            ))}
          <a href="tel:02-2944-0985">{T.support}</a>
        </>
      )}
      {view === "list" ? (
        <>
          <P5Card title={T.creditCards}>
            {methods === undefined ? (
              <>
                {(busy || !error) && <p>{T.loading}</p>}
                <P5Btn disabled={busy} onClick={() => void refresh()}>
                  {T.retry}
                </P5Btn>
              </>
            ) : methods.length === 0 ? (
              <p>{T.empty}</p>
            ) : (
              methods.map((method) => (
                <div
                  key={method.paymentMethodId}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 0",
                    borderBottom: `1px solid ${P5.line}`,
                  }}
                >
                  <div>
                    <div style={{ fontFamily: P5.mono, fontWeight: 700 }}>
                      {paymentMethodLabel(method)}
                    </div>
                    <p style={{ color: P5.mut, fontSize: 12 }}>
                      {T.expiry} {method.expiryMonth}/{method.expiryYear}
                      {paymentMethodExpired(method) ? ` · ${T.expired}` : ""}
                    </p>
                    {method.isDefault && <p>{T.default}</p>}
                  </div>
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 8 }}
                  >
                    {!method.isDefault && (
                      <P5Btn
                        disabled={
                          busy || pending || paymentMethodExpired(method)
                        }
                        onClick={() => void change("default", method)}
                      >
                        {T.makeDefault}
                      </P5Btn>
                    )}
                    <P5Btn
                      danger
                      disabled={busy || pending}
                      onClick={() => {
                        setTarget(method);
                        setError("");
                        setView("delete");
                      }}
                    >
                      {T.remove}
                    </P5Btn>
                  </div>
                </div>
              ))
            )}
          </P5Card>
          <div style={{ margin: "0 14px", display: "flex", flexDirection: "column", gap: 12 }}>
            {atCardLimit && <AuthAlert kind="warn">{CARD_LIMIT_MESSAGE}</AuthAlert>}
            <P5Btn
              kind="primary"
              disabled={busy || pending || methods === undefined || atCardLimit}
              onClick={() => {
                setError("");
                setView("add");
              }}
            >
              {T.add}
            </P5Btn>
          </div>
        </>
      ) : view === "delete" && target ? (
        <>
          <h2>{T.removeQuestion}</h2>
          <p style={{ fontFamily: P5.mono, fontWeight: 700 }}>
            {paymentMethodLabel(target)}
          </p>
          <P5Btn
            disabled={busy}
            onClick={() => {
              setView("list");
              setTarget(undefined);
              setError("");
            }}
          >
            {T.cancel}
          </P5Btn>
          <P5Btn
            kind="primary"
            danger
            disabled={busy || pending}
            onClick={() => void change("delete", target)}
          >
            {T.confirmRemove}
          </P5Btn>
        </>
      ) : (
        <>
          <div
            style={{
              background: P5.lineSoft,
              border: `1px dashed ${P5.dim}`,
              minHeight: 160,
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: P5.mut,
            }}
          >
            {hostedFieldsView ?? T.fieldsPlaceholder}
          </div>
          {atCardLimit && (
            <AuthAlert kind="warn">{CARD_LIMIT_MESSAGE}</AuthAlert>
          )}
          {fields.status === "ready" && fields.port.kind === "synthetic" && (
            <AuthAlert kind="warn">{T.synthetic}</AuthAlert>
          )}
          {!fieldsReady && (
            <AuthAlert kind="warn">{T.fieldsUnavailable}</AuthAlert>
          )}
          <P5Btn
            kind="primary"
            disabled={busy || pending || !fieldsReady || atCardLimit}
            onClick={() => void bind()}
          >
            {T.bind}
          </P5Btn>
          <P5Btn disabled={busy} onClick={() => setView("list")}>
            {T.back}
          </P5Btn>
        </>
      )}
    </AuthScreen>
  );
}
