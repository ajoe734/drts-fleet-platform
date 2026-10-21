import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type {
  PassengerPaymentMethod,
  PaymentMethodResponse,
} from "@drts/contracts";
import {
  PassengerApiError,
  type PassengerPaymentClient,
  type PassengerPaymentFieldsAvailability,
  paymentMethodExpired,
  paymentMethodLabel,
} from "@drts/passenger-client";
import { PASSENGER_P5_COLORS as p5 } from "@drts/ui-tokens";

/** The App adapter opens the existing provider action; return is not payment proof. */
export type NativePaymentBrowserAvailability =
  | { status: "unavailable" }
  | {
      status: "ready";
      kind: "hosted" | "synthetic";
      port: {
        openAction(url: string): Promise<{ type: "returned" | "cancelled" }>;
      };
    };
export interface NativePaymentMethodsScreenProps {
  client: PassengerPaymentClient;
  fields: PassengerPaymentFieldsAvailability;
  hostedFieldsView?: React.ReactNode;
  browser: NativePaymentBrowserAvailability;
  onSupport(): void | Promise<void>;
}
type Intent =
  | { kind: "bind"; beforeIds: string[]; expectedId?: string }
  | { kind: "default" | "remove"; targetId: string };
interface Outstanding {
  intent: Intent;
  phase: "pending" | "action_required";
  actionUrl?: string;
}

function Button({
  id,
  label,
  disabled = false,
  onPress,
}: {
  id: string;
  label: string;
  disabled?: boolean;
  onPress(): void | Promise<void>;
}) {
  return (
    <Pressable
      testID={id}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled ? styles.disabled : null]}
    >
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}
function failureMessage(reason: unknown): string {
  if (reason instanceof PassengerApiError) {
    if (
      reason.code.toLowerCase() === "card_declined" &&
      reason.status >= 400 &&
      reason.status < 500
    )
      return "卡片綁定未完成，請確認卡片或改用其他付款方式。";
    if (reason.code.toLowerCase() === "pending_payment_block")
      return "尚有未付款行程，請先處理款項或聯絡客服。";
    if (reason.code === "invalid_payment_credential")
      return "尚未取得付款憑證，請重試。";
    if (reason.code === "invalid_payment_response")
      return "付款資料暫時無法確認，請重新查詢。";
  }
  return "付款操作未完成，請重新查詢狀態或聯絡客服。";
}
function resolved(intent: Intent, methods: PassengerPaymentMethod[]): boolean {
  if (intent.kind === "bind")
    return intent.expectedId
      ? methods.some((method) => method.paymentMethodId === intent.expectedId)
      : methods.some(
          (method) => !intent.beforeIds.includes(method.paymentMethodId),
        );
  if (intent.kind === "remove")
    return !methods.some(
      (method) => method.paymentMethodId === intent.targetId,
    );
  return methods.some(
    (method) => method.paymentMethodId === intent.targetId && method.isDefault,
  );
}

/** Actual SDK commands and GET readback; collection/browser/navigation are App ports. */
export function NativePaymentMethodsScreen({
  client,
  fields,
  hostedFieldsView,
  browser,
  onSupport,
}: NativePaymentMethodsScreenProps) {
  const [methods, setMethods] = useState<
    PassengerPaymentMethod[] | undefined
  >();
  const [view, setView] = useState<"list" | "add" | "remove">("list");
  const [target, setTarget] = useState<PassengerPaymentMethod | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [outstanding, setOutstanding] = useState<Outstanding | null>(null);
  const outstandingRef = useRef<Outstanding | null>(null);
  const generation = useRef(0);
  const alive = useRef(false);
  const lock = useRef<number | null>(null);
  const fieldsRef = useRef(fields);
  const fieldsRevision = useRef(0);
  const previousFields = fieldsRef.current;
  if (
    previousFields.status !== fields.status ||
    (previousFields.status === "ready" &&
      fields.status === "ready" &&
      previousFields.port !== fields.port)
  )
    fieldsRevision.current += 1;
  fieldsRef.current = fields;
  const fieldsReady =
    fields.status === "ready" &&
    (fields.port.kind === "synthetic" || hostedFieldsView !== undefined);
  const fieldsReadyRef = useRef(fieldsReady);
  fieldsReadyRef.current = fieldsReady;
  const synthetic =
    (fields.status === "ready" && fields.port.kind === "synthetic") ||
    (browser.status === "ready" && browser.kind === "synthetic");

  function publishOutstanding(value: Outstanding | null) {
    outstandingRef.current = value;
    setOutstanding(value);
  }
  function live(ticket: number) {
    return alive.current && generation.current === ticket;
  }
  function begin(): number | null {
    const ticket = generation.current;
    if (!alive.current || lock.current === ticket) return null;
    lock.current = ticket;
    setBusy(true);
    setError("");
    setNotice("");
    return ticket;
  }
  function finish(ticket: number) {
    if (lock.current === ticket) {
      lock.current = null;
      if (live(ticket)) setBusy(false);
    }
  }
  async function readBack(ticket: number) {
    const result = await client.getMethods();
    if (!live(ticket)) return;
    setMethods(result.methods);
    const current = outstandingRef.current;
    if (current && resolved(current.intent, result.methods)) {
      publishOutstanding(null);
      setTarget(null);
      setView("list");
      setNotice("付款方式已依伺服器結果更新。");
    }
  }
  async function refresh() {
    const ticket = begin();
    if (ticket === null) return;
    try {
      await readBack(ticket);
    } catch (reason) {
      if (live(ticket)) setError(failureMessage(reason));
    } finally {
      finish(ticket);
    }
  }
  useEffect(() => {
    generation.current += 1;
    alive.current = true;
    setMethods(undefined);
    setView("list");
    setTarget(null);
    publishOutstanding(null);
    void refresh();
    return () => {
      alive.current = false;
      generation.current += 1;
    };
  }, [client]);

  async function acceptResult(
    ticket: number,
    result: PaymentMethodResponse,
    intent: Intent,
  ) {
    if (!live(ticket)) return;
    if (result.status !== "completed") {
      publishOutstanding({
        intent,
        phase: result.status,
        ...(result.status === "action_required"
          ? { actionUrl: result.nextActionUrl }
          : {}),
      });
      return;
    }
    const confirmedIntent: Intent =
      intent.kind === "bind"
        ? { ...intent, expectedId: result.method.paymentMethodId }
        : intent;
    publishOutstanding({ intent: confirmedIntent, phase: "pending" });
    await readBack(ticket);
    if (live(ticket) && outstandingRef.current)
      setError("結果尚未確認，請重新查詢；請勿重複送出。");
  }
  async function bind() {
    if (outstandingRef.current || !fieldsReady || fields.status !== "ready")
      return;
    const ticket = begin();
    if (ticket === null) return;
    const port = fields.port;
    const revision = fieldsRevision.current;
    const intent: Intent = {
      kind: "bind",
      beforeIds: (methods ?? []).map((m) => m.paymentMethodId),
    };
    let sent = false;
    try {
      const command = await port.collectCredential();
      if (!live(ticket)) return;
      if (
        fieldsRevision.current !== revision ||
        fieldsRef.current.status !== "ready" ||
        fieldsRef.current.port !== port ||
        !fieldsReadyRef.current
      ) {
        setError("付款資料收集介面已停用，請重試。");
        return;
      }
      sent = true;
      await acceptResult(ticket, await client.bindMethod(command), intent);
    } catch (reason) {
      if (!live(ticket)) return;
      const declined =
        reason instanceof PassengerApiError &&
        reason.code.toLowerCase() === "card_declined" &&
        reason.status >= 400 &&
        reason.status < 500;
      // The shared client rejects an empty credential locally, before its HTTP
      // request. That definite no-send result must allow a fresh collection.
      const noCredential =
        reason instanceof PassengerApiError &&
        reason.code === "invalid_payment_credential";
      // A completed response may already have captured its exact method ID
      // before the follow-up GET fails. Retain that reconciliation target.
      if (sent && !declined && !noCredential && !outstandingRef.current)
        publishOutstanding({ intent, phase: "pending" });
      setError(failureMessage(reason));
    } finally {
      finish(ticket);
    }
  }
  async function change(
    kind: "default" | "remove",
    method: PassengerPaymentMethod,
  ) {
    if (outstandingRef.current) return;
    const ticket = begin();
    if (ticket === null) return;
    const intent: Intent = { kind, targetId: method.paymentMethodId };
    try {
      if (kind === "default")
        await acceptResult(
          ticket,
          await client.setDefault(method.paymentMethodId),
          intent,
        );
      else {
        const result = await client.removeMethod(method.paymentMethodId);
        if (!live(ticket)) return;
        if (!result.success) {
          setError("付款方式尚未移除，請重試或聯絡客服。");
          return;
        }
        publishOutstanding({ intent, phase: "pending" });
        await readBack(ticket);
        if (live(ticket) && outstandingRef.current)
          setError("移除結果尚未確認，請重新查詢。");
      }
    } catch (reason) {
      if (live(ticket)) setError(failureMessage(reason));
    } finally {
      finish(ticket);
    }
  }
  async function verify() {
    const current = outstandingRef.current;
    if (!current?.actionUrl || browser.status !== "ready") return;
    const ticket = begin();
    if (ticket === null) return;
    try {
      const result = await browser.port.openAction(current.actionUrl);
      if (!live(ticket)) return;
      if (result.type === "cancelled") {
        setError("已取消驗證，付款結果尚未確認；可重新驗證或查詢。");
        return;
      }
      await readBack(ticket);
      if (live(ticket) && outstandingRef.current)
        setError("驗證已返回，付款結果仍待確認，請重新查詢。");
    } catch {
      if (live(ticket)) setError("外部驗證未完成，請重新驗證或查詢付款結果。");
    } finally {
      finish(ticket);
    }
  }
  async function support() {
    try {
      await onSupport();
    } catch {
      if (alive.current) setError("無法開啟客服，請撥 02-2944-0985。");
    }
  }
  const blocked = busy || outstanding !== null;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.heading}>
        付款方式
      </Text>
      {synthetic && (
        <Text testID="payment-demo-notice" style={styles.note}>
          付款示意模式：外部金流與驗證為模擬，未實際扣款。
        </Text>
      )}
      {busy && (
        <View testID="payment-loading">
          <ActivityIndicator />
          <Text style={styles.text}>正在確認付款資料…</Text>
        </View>
      )}
      {error !== "" && (
        <Text
          testID="payment-error"
          accessibilityRole="alert"
          style={styles.note}
        >
          {error}
        </Text>
      )}
      {notice !== "" && (
        <Text testID="payment-success" style={styles.note}>
          {notice}
        </Text>
      )}
      {outstanding && (
        <View testID="payment-outstanding">
          <Text testID="payment-pending" style={styles.text}>
            {outstanding.phase === "action_required"
              ? "尚需完成外部驗證，付款結果待確認。"
              : "付款結果待確認，請勿重複送出。"}
          </Text>
          {outstanding.actionUrl &&
            (browser.status === "ready" ? (
              <Button
                id="payment-verify"
                label="繼續付款驗證"
                disabled={busy}
                onPress={verify}
              />
            ) : (
              <Text testID="payment-browser-unavailable" style={styles.note}>
                外部驗證瀏覽器尚未提供，此步驟略過；請稍後查詢或聯絡客服。
              </Text>
            ))}
        </View>
      )}
      <Button
        id="payment-refresh"
        label="重新查詢付款方式"
        disabled={busy}
        onPress={refresh}
      />
      {view === "list" ? (
        <>
          {methods?.length === 0 && (
            <Text testID="payment-empty" style={styles.text}>
              尚未新增付款方式。
            </Text>
          )}
          {methods?.map((method) => (
            <View
              key={method.paymentMethodId}
              testID={`payment-method-${method.paymentMethodId}`}
              style={styles.card}
            >
              <Text
                testID={`payment-label-${method.paymentMethodId}`}
                style={styles.text}
              >
                {paymentMethodLabel(method)}
              </Text>
              <Text style={styles.note}>
                到期日 {method.expiryMonth}/{method.expiryYear}
                {paymentMethodExpired(method) ? " · 已過期" : ""}
              </Text>
              {method.isDefault ? (
                <Text
                  testID={`payment-default-${method.paymentMethodId}`}
                  style={styles.note}
                >
                  預設付款方式
                </Text>
              ) : (
                <Button
                  id={`payment-set-default-${method.paymentMethodId}`}
                  label="設為預設"
                  disabled={blocked || paymentMethodExpired(method)}
                  onPress={() => change("default", method)}
                />
              )}
              <Button
                id={`payment-remove-${method.paymentMethodId}`}
                label="移除付款方式"
                disabled={blocked}
                onPress={() => {
                  if (blocked) return;
                  setTarget(method);
                  setView("remove");
                  setError("");
                  setNotice("");
                }}
              />
            </View>
          ))}
          <Button
            id="payment-add"
            label="新增付款方式"
            disabled={blocked || methods === undefined}
            onPress={() => {
              if (blocked || methods === undefined) return;
              setView("add");
              setError("");
              setNotice("");
            }}
          />
        </>
      ) : view === "remove" && target ? (
        <>
          <Text testID="payment-remove-question" style={styles.text}>
            確定移除 {paymentMethodLabel(target)}？
          </Text>
          <Button
            id="payment-confirm-remove"
            label="確認移除"
            disabled={blocked}
            onPress={() => change("remove", target)}
          />
          <Button
            id="payment-back"
            label="返回付款方式"
            disabled={busy}
            onPress={() => {
              if (busy) return;
              setTarget(null);
              setView("list");
              setError("");
            }}
          />
        </>
      ) : (
        <>
          {fields.status === "ready" &&
            fields.port.kind === "hosted" &&
            hostedFieldsView !== undefined && (
              <View testID="payment-hosted-fields">{hostedFieldsView}</View>
            )}
          {fields.status === "ready" && fields.port.kind === "synthetic" && (
            <Text style={styles.note}>
              示意資料由模擬介面提供，沒有真實卡片輸入。
            </Text>
          )}
          {!fieldsReady && (
            <Text testID="payment-fields-unavailable" style={styles.note}>
              付款資料收集尚未提供，此步驟略過。
            </Text>
          )}
          <Button
            id="payment-bind"
            label="綁定付款方式"
            disabled={blocked || !fieldsReady}
            onPress={bind}
          />
          <Button
            id="payment-back"
            label="返回付款方式"
            disabled={busy}
            onPress={() => {
              if (busy) return;
              setView("list");
              setError("");
            }}
          />
        </>
      )}
      <Button
        id="payment-support"
        label="聯絡客服 02-2944-0985"
        onPress={support}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: p5.bg },
  content: { padding: 16, gap: 12 },
  heading: { fontSize: 22, fontWeight: "700", color: p5.ink },
  text: { fontSize: 16, color: p5.ink },
  note: { fontSize: 14, color: p5.mut },
  card: {
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: p5.line,
    borderRadius: 12,
  },
  button: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: p5.line,
  },
  disabled: { opacity: 0.45 },
});
