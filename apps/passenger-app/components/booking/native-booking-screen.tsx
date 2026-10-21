import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type {
  CreatePassengerRideCommand,
  FareQuoteResponse,
  FareVersion,
  GeocodeCandidate,
  GeoPoint,
  PassengerAccount,
  PassengerBookingSettingsResponse,
  PassengerPaymentMethod,
  PassengerRideResponse,
  ResolvedAddressPayload,
} from "@drts/contracts";
import {
  type PassengerBookingClient,
  type PassengerPaymentClient,
  PassengerApiError,
  earliestBookingTime,
  fromLocalDateTime,
  isBookingTimeAllowed,
  paymentMethodExpired,
  paymentMethodLabel,
  PASSENGER_FEE_ROWS,
  PASSENGER_CONFIRMATION_ROWS,
  PASSENGER_FREE_CANCELLATION_NOTICE,
  PASSENGER_SUPPORT_PHONE,
} from "@drts/passenger-client";
import { PASSENGER_P5_COLORS as p5 } from "@drts/ui-tokens";

type Field = "origin" | "destination";
type Quote = Extract<FareQuoteResponse, { serviceAreaResult: "serviceable" }>;
type Ride = PassengerRideResponse["ride"];
interface Draft {
  origin: ResolvedAddressPayload | null;
  destination: ResolvedAddressPayload | null;
  localTime: string;
}
interface Recovery {
  command: CreatePassengerRideCommand;
  requestId: string;
  paymentLabel: string;
  unknown: boolean;
}
export type NativeBookingMapAvailability =
  | { status: "unavailable" }
  | {
      status: "ready";
      kind: "native" | "synthetic";
      render(input: {
        origin: ResolvedAddressPayload | null;
        destination: ResolvedAddressPayload | null;
        disabled: boolean;
        onPick(field: Field, point: GeoPoint): Promise<void>;
      }): React.ReactNode;
    };
export interface NativeBookingScreenProps {
  client: PassengerBookingClient;
  paymentClient: PassengerPaymentClient;
  mode: "configured" | "demo";
  map: NativeBookingMapAvailability;
  /** Native platform UUID, one per new command; recovery never requests a new one. */
  newRequestId(): string;
  now?: () => number;
  onCreated(ride: Ride): void | Promise<void>;
  onAccount(): void | Promise<void>;
  onPaymentMethods(): void | Promise<void>;
  onSessionUnavailable(): void | Promise<void>;
  onSupport(): void | Promise<void>;
}
const EMPTY: Draft = { origin: null, destination: null, localTime: "" };
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
      disabled={disabled}
      accessibilityState={{ disabled }}
      style={[styles.button, disabled ? styles.disabled : null]}
      onPress={onPress}
    >
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}
function validAddress(value: ResolvedAddressPayload) {
  return (
    !!value.address && Number.isFinite(value.lat) && Number.isFinite(value.lng)
  );
}
function message(reason: unknown): string {
  const code =
    reason instanceof PassengerApiError
      ? reason.code.toLowerCase()
      : reason instanceof Error
        ? reason.message
        : "unavailable";
  if (["invalid_booking_time", "booking_lead_invalid"].includes(code))
    return "請選擇符合最短提前時間的有效預約時間。";
  if (
    ["quote_expired", "fare_quote_expired", "fare_quote_not_found"].includes(
      code,
    )
  )
    return "試算已逾期，請重新試算。";
  if (code === "pending_payment_block")
    return "尚有未付款行程。更新卡片不代表款項已結清，請聯絡客服處理。";
  if (code === "account_changed") return "帳號資料已變更，請重新讀取後預約。";
  return "目前無法完成此操作，原預約資料已保留，請重試。";
}

/** Original booking SDK, portable time/fee/payment helpers and real command bodies. */
export function NativeBookingScreen({
  client,
  paymentClient,
  mode,
  map,
  newRequestId,
  now = Date.now,
  onCreated,
  onAccount,
  onPaymentMethods,
  onSessionUnavailable,
  onSupport,
}: NativeBookingScreenProps) {
  const [account, setAccount] = useState<PassengerAccount>();
  const [fare, setFare] = useState<FareVersion>();
  const [settings, setSettings] = useState<PassengerBookingSettingsResponse>();
  const [methods, setMethods] = useState<PassengerPaymentMethod[]>([]);
  const [selected, setSelected] = useState("");
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [queries, setQueries] = useState({ origin: "", destination: "" });
  const [candidates, setCandidates] = useState<
    Record<Field, GeocodeCandidate[]>
  >({ origin: [], destination: [] });
  const [quote, setQuote] = useState<Quote>();
  const [checked, setChecked] = useState(false);
  const [feeExpanded, setFeeExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recovering, setRecovering] = useState(false);
  const [created, setCreated] = useState<Ride>();
  const generation = useRef(0);
  const alive = useRef(false);
  const lock = useRef<number | null>(null);
  const pending = useRef<Recovery | null>(null);
  const committed = useRef<Ride | null>(null);
  function live(ticket: number) {
    return alive.current && generation.current === ticket;
  }
  function begin() {
    const ticket = generation.current;
    if (!alive.current || lock.current === ticket) return null;
    lock.current = ticket;
    setBusy(true);
    setError("");
    return ticket;
  }
  function finish(ticket: number) {
    if (lock.current === ticket) {
      lock.current = null;
      if (live(ticket)) setBusy(false);
    }
  }
  function clearIdentity() {
    pending.current = null;
    setRecovering(false);
    setQuote(undefined);
    setChecked(false);
    setDraft(EMPTY);
    setQueries({ origin: "", destination: "" });
    setCandidates({ origin: [], destination: [] });
    setAccount(undefined);
    setFare(undefined);
    setSettings(undefined);
    setMethods([]);
    setSelected("");
  }
  async function report(ticket: number, reason: unknown) {
    if (!live(ticket)) return;
    if (reason instanceof PassengerApiError && reason.status === 401) {
      clearIdentity();
      setError("登入已失效，請重新登入。");
      try {
        await onSessionUnavailable();
      } catch {
        /* Existing App login port remains unavailable. */
      }
    } else setError(message(reason));
  }
  async function load() {
    if (pending.current || committed.current) return;
    const ticket = begin();
    if (ticket === null) return;
    try {
      const [me, fares, configuration, cards] = await Promise.all([
        client.getAccount(),
        client.getFares(),
        client.getSettings(),
        paymentClient.getMethods(),
      ]);
      if (!live(ticket)) return;
      if (
        !me.account.drtsPassengerId ||
        me.account.status !== "active" ||
        !fares.currentVersion?.version
      )
        throw new Error("booking_unavailable");
      setAccount(me.account);
      setFare(fares.currentVersion);
      setSettings(configuration);
      setMethods(cards.methods);
      setSelected(
        cards.methods.find(
          (m) => m.isDefault && !paymentMethodExpired(m, new Date(now())),
        )?.paymentMethodId ?? "",
      );
      setDraft((current) => ({
        ...current,
        localTime:
          current.localTime || earliestBookingTime(configuration, now()),
      }));
      setQuote(undefined);
      setChecked(false);
    } catch (reason) {
      await report(ticket, reason);
    } finally {
      finish(ticket);
    }
  }
  useEffect(() => {
    generation.current += 1;
    alive.current = true;
    pending.current = null;
    committed.current = null;
    clearIdentity();
    setCreated(undefined);
    void load();
    return () => {
      alive.current = false;
      generation.current += 1;
    };
  }, [client, paymentClient]);
  useEffect(() => {
    if (!quote || pending.current || committed.current) return;
    let timer: ReturnType<typeof setTimeout>;
    function expire() {
      if (pending.current || committed.current) return;
      const remaining = Date.parse(quote!.expiresAt) - now();
      if (remaining > 0) {
        timer = setTimeout(expire, Math.min(remaining, 2_147_483_647));
        return;
      }
      setQuote(undefined);
      setChecked(false);
      setError("試算已逾期，請重新試算。");
    }
    expire();
    return () => clearTimeout(timer);
  }, [quote, now]);
  async function currentAccount(ticket: number) {
    const result = await client.getAccount();
    if (!live(ticket)) return false;
    if (
      result.account.status !== "active" ||
      result.account.drtsPassengerId !== account?.drtsPassengerId
    ) {
      clearIdentity();
      throw new Error("account_changed");
    }
    setAccount(result.account);
    if (
      !pending.current &&
      result.account.feeAcknowledgementVersion !== fare?.version
    ) {
      setQuote(undefined);
      setChecked(false);
      return false;
    }
    return true;
  }
  async function acknowledge() {
    if (!account || !fare || pending.current) return;
    const ticket = begin();
    if (ticket === null) return;
    try {
      const me = await client.updateAccount({
        feeAcknowledgementVersion: fare.version,
      });
      if (!live(ticket)) return;
      if (
        me.account.drtsPassengerId !== account.drtsPassengerId ||
        me.account.feeAcknowledgementVersion !== fare.version
      )
        throw new Error("acknowledgement_not_saved");
      setAccount(me.account);
    } catch (reason) {
      await report(ticket, reason);
    } finally {
      finish(ticket);
    }
  }
  function editable() {
    return (
      lock.current !== generation.current &&
      !pending.current &&
      !committed.current
    );
  }
  function changeDraft(next: Draft) {
    if (!editable()) return;
    setDraft(next);
    setQuote(undefined);
    setChecked(false);
  }
  function queryChanged(field: Field, value: string) {
    if (!editable()) return;
    setQueries((current) => ({ ...current, [field]: value }));
    setCandidates((current) => ({ ...current, [field]: [] }));
    changeDraft({ ...draft, [field]: null });
  }
  async function search(field: Field) {
    if (!editable() || !queries[field].trim()) return;
    const ticket = begin();
    if (ticket === null) return;
    try {
      const result = await client.search({ q: queries[field].trim() });
      if (live(ticket))
        setCandidates((old) => ({ ...old, [field]: result.candidates }));
    } catch (reason) {
      await report(ticket, reason);
    } finally {
      finish(ticket);
    }
  }
  async function address(field: Field, input: GeocodeCandidate | GeoPoint) {
    if (!editable()) return;
    const ticket = begin();
    if (ticket === null) return;
    try {
      const result =
        "candidateId" in input
          ? await client.resolve({
              candidateId: input.candidateId,
              addressText: input.address,
              surface: "passenger_entry",
              ...(input.location ? { selectedPoint: input.location } : {}),
            })
          : await client.reverse({
              location: input,
              surface: "passenger_entry",
            });
      if (!live(ticket)) return;
      if (!validAddress(result.address)) throw new Error("address_unavailable");
      setDraft((old) => ({ ...old, [field]: result.address }));
      setQueries((old) => ({ ...old, [field]: result.address.address }));
      setCandidates((old) => ({ ...old, [field]: [] }));
      setQuote(undefined);
      setChecked(false);
    } catch (reason) {
      await report(ticket, reason);
    } finally {
      finish(ticket);
    }
  }
  function scheduledAt() {
    if (!settings) throw new Error("booking_settings_unavailable");
    const iso = fromLocalDateTime(draft.localTime);
    if (!isBookingTimeAllowed(iso, settings, now()))
      throw new Error("booking_lead_invalid");
    return iso;
  }
  async function getQuote() {
    if (
      !editable() ||
      !draft.origin ||
      !draft.destination ||
      !settings ||
      !fare
    )
      return;
    const ticket = begin();
    if (ticket === null) return;
    setChecked(false);
    setQuote(undefined);
    try {
      if (!(await currentAccount(ticket))) return;
      const result = await client.getFareQuote({
        originLat: draft.origin.lat,
        originLng: draft.origin.lng,
        destinationLat: draft.destination.lat,
        destinationLng: draft.destination.lng,
        scheduledAt: scheduledAt(),
      });
      if (!live(ticket)) return;
      if (result.serviceAreaResult === "not_serviceable") {
        setError("所選地址不在服務範圍內，請修改地址。");
        return;
      }
      if (result.fareVersion !== fare.version) {
        setError("運價版本已變更，請重新讀取費率。");
        return;
      }
      if (
        !result.fareSnapshotId ||
        !Number.isFinite(result.estimatedMin) ||
        !Number.isFinite(result.estimatedMax) ||
        result.estimatedMin < 0 ||
        result.estimatedMax < result.estimatedMin ||
        !Number.isFinite(Date.parse(result.expiresAt))
      )
        throw new Error("invalid_quote");
      if (Date.parse(result.expiresAt) <= now())
        throw new Error("quote_expired");
      setQuote(result);
    } catch (reason) {
      await report(ticket, reason);
    } finally {
      finish(ticket);
    }
  }
  async function openCreated(ride: Ride, ticket: number) {
    try {
      await onCreated(ride);
    } catch {
      if (live(ticket))
        setError("行程已建立，但無法開啟行程畫面；請重試開啟，勿重新預約。");
    }
  }
  async function submit() {
    if (
      committed.current ||
      (!pending.current &&
        (!checked ||
          !quote ||
          !selected ||
          !draft.origin ||
          !draft.destination))
    )
      return;
    const ticket = begin();
    if (ticket === null) return;
    try {
      if (!(await currentAccount(ticket))) return;
      if (!pending.current) {
        if (!quote || !draft.origin || !draft.destination) return;
        if (Date.parse(quote.expiresAt) <= now())
          throw new Error("quote_expired");
        const card = methods.find(
          (m) =>
            m.paymentMethodId === selected &&
            !paymentMethodExpired(m, new Date(now())),
        );
        if (!card) throw new Error("payment_method_unavailable");
        pending.current = {
          requestId: newRequestId(),
          paymentLabel: paymentMethodLabel(card),
          unknown: false,
          command: {
            scheduledAt: scheduledAt(),
            origin: {
              lat: draft.origin.lat,
              lng: draft.origin.lng,
              address: draft.origin.address,
            },
            destination: {
              lat: draft.destination.lat,
              lng: draft.destination.lng,
              address: draft.destination.address,
            },
            paymentMethodId: card.paymentMethodId,
            fareSnapshotId: quote.fareSnapshotId,
            passengerConfirmedAt: new Date(now()).toISOString(),
          },
        };
      }
      const result = await client.createRide(
        pending.current.command,
        pending.current.requestId,
      );
      if (!live(ticket)) return;
      if (!result.ride?.order?.orderId)
        throw new Error("unknown_create_acknowledgement");
      committed.current = result.ride;
      pending.current = null;
      setRecovering(false);
      setCreated(result.ride);
      setQuote(undefined);
      await openCreated(result.ride, ticket);
    } catch (reason) {
      if (!live(ticket)) return;
      if (reason instanceof PassengerApiError && reason.status === 401) {
        await report(ticket, reason);
        return;
      }
      if (pending.current?.unknown) {
        setRecovering(true);
        setError("建立结果尚未確認，請重試同一筆預約，勿重新填單。");
        return;
      }
      const code =
        reason instanceof PassengerApiError
          ? reason.code.toLowerCase()
          : reason instanceof Error
            ? reason.message
            : "unavailable";
      const expired = [
        "quote_expired",
        "fare_quote_expired",
        "fare_quote_not_found",
        "booking_lead_invalid",
        "invalid_booking_time",
      ].includes(code);
      if (
        expired ||
        (reason instanceof PassengerApiError &&
          reason.status >= 400 &&
          reason.status < 500)
      ) {
        pending.current = null;
        setRecovering(false);
        if (expired) {
          setQuote(undefined);
          setChecked(false);
        }
        await report(ticket, reason);
      } else if (pending.current) {
        pending.current.unknown = true;
        setRecovering(true);
        setError("建立結果尚未確認，請重試同一筆預約，勿重新填單。");
      } else await report(ticket, reason);
    } finally {
      finish(ticket);
    }
  }
  async function navigate(action: () => void | Promise<void>) {
    try {
      await action();
    } catch {
      if (alive.current) setError("無法開啟此畫面，請重試或聯絡客服。");
    }
  }
  const ready = account && fare && settings;
  const acknowledged =
    ready && account.feeAcknowledgementVersion === fare.version;
  const phoneReady =
    ready &&
    (settings.requireSmsVerification
      ? !!account.contactPhone && account.contactPhoneVerified
      : !!(account.contactPhone || account.verifiedPhone));
  const disabled = busy || recovering || created !== undefined;
  const fees = fare && (
    <View testID="booking-fee-rows" style={styles.card}>
      <Text style={styles.note}>
        運價版本 {fare.version} · 生效 {fare.effectiveAt}
      </Text>
      <Text testID="booking-current-fare" style={styles.text}>
        起程 {fare.baseDistanceMeters} 公尺 NT${fare.baseFare}；延滯每{" "}
        {fare.delayIncrementSeconds} 秒 NT${fare.delayRate}；夜間 NT$
        {fare.nightSurcharge}
      </Text>
      {PASSENGER_FEE_ROWS.map(([label, content]) => (
        <Text key={label} style={styles.note}>
          {label}：{content}
        </Text>
      ))}
      <Text testID="booking-free-cancellation" style={styles.note}>
        {PASSENGER_FREE_CANCELLATION_NOTICE}
      </Text>
    </View>
  );
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.heading}>
        預約叫車
      </Text>
      <Text testID="booking-reservation-only" style={styles.note}>
        本服務僅提供預約叫車。
      </Text>
      {mode === "demo" && (
        <Text testID="booking-demo-notice" style={styles.note}>
          示意模式：地址、地圖及外部服務由模擬介面提供，未預約真實車輛。
        </Text>
      )}
      {busy && (
        <View testID="booking-loading">
          <ActivityIndicator />
          <Text style={styles.note}>正在讀取或確認預約資料…</Text>
        </View>
      )}
      {error && (
        <Text
          testID="booking-error"
          accessibilityRole="alert"
          style={styles.note}
        >
          {error}
        </Text>
      )}
      {created ? (
        <View testID="booking-created">
          <Text style={styles.text}>行程已建立：{created.order.orderId}</Text>
          <Button
            id="booking-open-created"
            label="開啟已建立行程"
            disabled={busy}
            onPress={() => navigate(() => onCreated(created))}
          />
        </View>
      ) : !ready ? (
        <Button
          id="booking-reload"
          label="重新讀取預約資料"
          disabled={busy}
          onPress={load}
        />
      ) : !acknowledged && !recovering ? (
        <>
          {fees}
          <Button
            id="booking-acknowledge-fees"
            label="我已閱讀費用說明"
            disabled={busy}
            onPress={acknowledge}
          />
        </>
      ) : !phoneReady && !recovering ? (
        <>
          <Text testID="booking-phone-unavailable" style={styles.note}>
            {settings.requireSmsVerification
              ? "請先完成聯絡手機驗證。"
              : "請先填寫聯絡手機；目前可使用未驗證手機。"}
          </Text>
          <Button
            id="booking-account"
            label="更新聯絡資料"
            onPress={() => navigate(onAccount)}
          />
        </>
      ) : (
        <>
          {!account.contactPhoneVerified &&
            !settings.requireSmsVerification && (
              <Text testID="booking-unverified-phone" style={styles.note}>
                聯絡手機尚未驗證。
              </Text>
            )}
          {map.status === "ready" ? (
            <View testID="booking-map">
              {map.render({
                origin: draft.origin,
                destination: draft.destination,
                disabled,
                onPick: address,
              })}
              {map.kind === "synthetic" && (
                <Text testID="booking-map-demo" style={styles.note}>
                  地圖為模擬示意。
                </Text>
              )}
            </View>
          ) : (
            <Text testID="booking-map-unavailable" style={styles.note}>
              原生地圖尚未提供，此步驟略過；仍可搜尋及選擇地址。
            </Text>
          )}
          {(["origin", "destination"] as const).map((field) => (
            <View key={field} style={styles.card}>
              <Text style={styles.text}>
                {field === "origin" ? "上車地址" : "下車地址"}
              </Text>
              <TextInput
                testID={`booking-${field}-query`}
                accessibilityLabel={
                  field === "origin" ? "上車地址" : "下車地址"
                }
                value={queries[field]}
                editable={!disabled}
                onChangeText={(value) => queryChanged(field, value)}
                style={styles.input}
              />
              <Button
                id={`booking-${field}-search`}
                label="搜尋地址"
                disabled={disabled || !queries[field].trim()}
                onPress={() => search(field)}
              />
              {draft[field] && (
                <Text testID={`booking-${field}-selected`} style={styles.note}>
                  {draft[field].address}
                </Text>
              )}
              {candidates[field].map((candidate) => (
                <Button
                  key={candidate.candidateId}
                  id={`booking-${field}-candidate-${candidate.candidateId}`}
                  label={candidate.displayName || candidate.address}
                  disabled={disabled}
                  onPress={() => address(field, candidate)}
                />
              ))}
            </View>
          ))}
          <TextInput
            testID="booking-time"
            accessibilityLabel="預約時間 YYYY-MM-DDTHH:mm"
            value={draft.localTime}
            editable={!disabled}
            onChangeText={(localTime) => changeDraft({ ...draft, localTime })}
            style={styles.input}
          />
          <Text testID="booking-lead-policy" style={styles.note}>
            請至少提前 {settings.minLeadTimeMinutes} 分鐘預約。
          </Text>
          <Button
            id="booking-fee-expand"
            label={feeExpanded ? "收合完整費用" : "展開完整費用"}
            onPress={() => setFeeExpanded((value) => !value)}
          />
          {feeExpanded && !quote && fees}
          <Button
            id="booking-quote"
            label="試算並確認預約"
            disabled={
              disabled ||
              !draft.origin ||
              !draft.destination ||
              !draft.localTime
            }
            onPress={getQuote}
          />
          {recovering && (
            <View testID="booking-recovery">
              <Text style={styles.note}>
                保留同一筆預約及付款方式：{pending.current?.paymentLabel}
              </Text>
              <Button
                id="booking-retry-create"
                label="重試同一筆預約"
                disabled={busy}
                onPress={submit}
              />
            </View>
          )}
          {quote && !recovering && (
            <Modal
              transparent
              visible
              accessibilityViewIsModal
              onRequestClose={() => {
                if (!disabled && !pending.current) {
                  setQuote(undefined);
                  setChecked(false);
                }
              }}
            >
              <View testID="booking-e19b" style={styles.sheet}>
                <Text accessibilityRole="header" style={styles.heading}>
                  確認預約 E-19b
                </Text>
                <Text testID="booking-confirm-route" style={styles.text}>
                  {draft.origin?.address} → {draft.destination?.address}
                </Text>
                <Text testID="booking-confirm-time" style={styles.text}>
                  {draft.localTime.replace("T", " ")}
                </Text>
                <Text testID="booking-confirm-fare" style={styles.text}>
                  預估 NT$ {quote.estimatedMin}–{quote.estimatedMax}
                </Text>
                <Text testID="booking-confirm-payment" style={styles.text}>
                  付款方式：
                  {pending.current?.paymentLabel ??
                    (methods.find(
                      (method) => method.paymentMethodId === selected,
                    )
                      ? paymentMethodLabel(
                          methods.find(
                            (method) => method.paymentMethodId === selected,
                          )!,
                        )
                      : "尚未選擇")}
                </Text>
                <Text style={styles.note}>
                  試算版本 {quote.fareVersion} · 到期 {quote.expiresAt}
                </Text>
                {PASSENGER_CONFIRMATION_ROWS.map((row) => (
                  <Text key={row} style={styles.note}>
                    {row}
                  </Text>
                ))}
                <Text style={styles.note}>
                  {PASSENGER_FREE_CANCELLATION_NOTICE}
                </Text>
                <Button
                  id="booking-confirm-fees"
                  label="展開完整費用說明"
                  onPress={() => setFeeExpanded((value) => !value)}
                />
                {feeExpanded && fees}
                {methods
                  .filter(
                    (method) => !paymentMethodExpired(method, new Date(now())),
                  )
                  .map((method) => (
                    <Button
                      key={method.paymentMethodId}
                      id={`booking-card-${method.paymentMethodId}`}
                      label={`${selected === method.paymentMethodId ? "已選擇 " : ""}${paymentMethodLabel(method)}`}
                      disabled={disabled || !!pending.current}
                      onPress={() => {
                        if (editable()) setSelected(method.paymentMethodId);
                      }}
                    />
                  ))}
                {!selected && (
                  <Text testID="booking-payment-missing" style={styles.note}>
                    請選擇付款方式後送出。
                  </Text>
                )}
                <Button
                  id="booking-manage-payment"
                  label="管理付款方式"
                  disabled={disabled}
                  onPress={() => navigate(onPaymentMethods)}
                />
                <Pressable
                  testID="booking-confirm-checkbox"
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked, disabled }}
                  disabled={disabled}
                  onPress={() => {
                    if (editable()) setChecked((value) => !value);
                  }}
                >
                  <Text style={styles.text}>
                    我已確認地址、時間及費用規則。
                  </Text>
                </Pressable>
                <Button
                  id="booking-submit"
                  label="確認預約"
                  disabled={disabled || !checked || !selected}
                  onPress={submit}
                />
                <Button
                  id="booking-modify"
                  label="修改預約"
                  disabled={disabled || !!pending.current}
                  onPress={() => {
                    if (editable()) {
                      setQuote(undefined);
                      setChecked(false);
                    }
                  }}
                />
              </View>
            </Modal>
          )}
          <Button
            id="booking-refresh"
            label="重新讀取費率與付款方式"
            disabled={disabled}
            onPress={load}
          />
        </>
      )}
      <Button
        id="booking-support"
        label={`聯絡客服 ${PASSENGER_SUPPORT_PHONE}`}
        onPress={() => navigate(onSupport)}
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
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: p5.line,
    borderRadius: 12,
  },
  button: {
    padding: 12,
    borderWidth: 1,
    borderColor: p5.line,
    borderRadius: 8,
  },
  disabled: { opacity: 0.45 },
  input: {
    padding: 12,
    borderWidth: 1,
    borderColor: p5.line,
    borderRadius: 8,
    color: p5.ink,
  },
  sheet: {
    marginTop: "auto",
    padding: 16,
    gap: 10,
    backgroundColor: p5.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
});
