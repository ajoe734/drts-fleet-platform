"use client";
import { passengerFetch } from "../../lib/runtime-fetch";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type {
  CreatePassengerRideCommand,
  FareQuoteResponse,
  FareVersion,
  PassengerAccount,
  PassengerBookingSettingsResponse,
} from "@drts/contracts";
import {
  PassengerBookingClient,
  PassengerApiError,
  earliestBookingTime,
  fromLocalDateTime,
  isBookingTimeAllowed,
  PASSENGER_CONFIRMATION_ROWS,
  PASSENGER_FREE_CANCELLATION_NOTICE,
  PASSENGER_SUPPORT_PHONE,
} from "@drts/passenger-client";
import { AuthScreen, AuthAlert, P5Btn, P5Card, P5 } from "../auth/ui";
import { P5Map, P5RouteFare } from "../p5-ui";
import { BookingForm, type BookingDraft } from "./booking-form";
import { FeeDisclosure } from "./disclosure";
import { BookingConfirmationSheet } from "./confirmation-sheet";
import { BOOK_T as T } from "../../lib/booking/translations";

type ServiceableQuote = Extract<
  FareQuoteResponse,
  { serviceAreaResult: "serviceable" }
>;
/** The separately owned Payment UI supplies only an opaque owned method ID/label. */
export interface BookingPaymentSelection {
  paymentMethodId: string;
  label: string;
}
export interface BookingScreenProps {
  client?: PassengerBookingClient;
  paymentSelection?: BookingPaymentSelection;
  paymentSlot?: ReactNode;
}
export function createBookingClient() {
  return new PassengerBookingClient({
    baseUrl: "",
    fetchFn: passengerFetch,
  });
}
const emptyDraft: BookingDraft = {
  origin: null,
  destination: null,
  localTime: "",
};

export function BookingScreen({
  client: supplied,
  paymentSelection,
  paymentSlot,
}: BookingScreenProps) {
  const router = useRouter();
  const [client] = useState(() => supplied ?? createBookingClient());
  const [account, setAccount] = useState<PassengerAccount>();
  const [fare, setFare] = useState<FareVersion>();
  const [settings, setSettings] = useState<PassengerBookingSettingsResponse>();
  const [draft, setDraft] = useState<BookingDraft>(emptyDraft);
  const [quote, setQuote] = useState<ServiceableQuote>();
  const [mode, setMode] = useState<
    "loading" | "form" | "quoting" | "confirm" | "unavailable"
  >("loading");
  const [error, setError] = useState("");
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const submitted = useRef(false);
  const mounted = useRef(true);
  // Unknown create acknowledgement retries retain the identical request key AND body.
  const pending = useRef<{
    command: CreatePassengerRideCommand;
    requestId: string;
    paymentLabel: string;
    outcomeUnknown: boolean;
  } | null>(null);
  function report(reason: unknown, fallback: string) {
    if (reason instanceof PassengerApiError && reason.status === 401)
      router.push("/login");
    setError(fallback);
  }
  async function load() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setMode("loading");
    try {
      const [me, fares, configuration] = await Promise.all([
        client.getAccount(),
        client.getFares(),
        client.getSettings(),
      ]);
      if (!mounted.current) return;
      if (
        !me.account?.drtsPassengerId ||
        me.account.status !== "active" ||
        !fares.currentVersion?.version
      )
        throw new Error("booking_unavailable");
      setAccount(me.account);
      setFare(fares.currentVersion);
      setSettings(configuration);
      setDraft((current) => ({
        ...current,
        localTime: current.localTime || earliestBookingTime(configuration),
      }));
      setMode("form");
    } catch (reason) {
      if (mounted.current) report(reason, T.settingsError);
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [client]);

  useEffect(() => {
    if (mode !== "confirm" || !quote || pending.current) return;
    let timer: ReturnType<typeof setTimeout>;
    function expire() {
      // A sent request may already have committed. Expiry only invalidates an
      // unsent quote, never the immutable recovery command or its confirmation.
      if (pending.current || submitted.current) return;
      const remaining = Date.parse(quote!.expiresAt) - Date.now();
      if (remaining > 0) {
        timer = setTimeout(expire, Math.min(remaining, 2_147_483_647));
        return;
      }
      setQuote(undefined);
      setChecked(false);
      setMode("form");
      setError(T.expired);
    }
    expire();
    return () => clearTimeout(timer);
  }, [mode, quote]);

  async function currentAccount() {
    const me = await client.getAccount();
    if (
      me.account?.status !== "active" ||
      me.account.drtsPassengerId !== account?.drtsPassengerId
    ) {
      pending.current = null;
      setQuote(undefined);
      setChecked(false);
      setDraft(emptyDraft);
      setAccount(undefined);
      setSettings(undefined);
      setFare(undefined);
      setMode("loading");
      throw new Error("account_changed");
    }
    setAccount(me.account);
    if (
      !pending.current &&
      me.account.feeAcknowledgementVersion !== fare?.version
    ) {
      setQuote(undefined);
      setChecked(false);
      setMode("form");
      return false;
    }
    return true;
  }
  async function acknowledge() {
    if (lock.current || !account || !fare) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const me = await client.updateAccount({
        feeAcknowledgementVersion: fare.version,
      });
      if (
        me.account.drtsPassengerId !== account.drtsPassengerId ||
        me.account.feeAcknowledgementVersion !== fare.version
      )
        throw new Error("acknowledgement_not_saved");
      setAccount(me.account);
    } catch (reason) {
      report(reason, T.acknowledgementError);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function scheduledAt() {
    if (!settings) throw new Error("booking_settings_unavailable");
    const iso = fromLocalDateTime(draft.localTime);
    if (!isBookingTimeAllowed(iso, settings))
      throw new Error("booking_lead_invalid");
    return iso;
  }
  async function getQuote() {
    if (
      lock.current ||
      !draft.origin ||
      !draft.destination ||
      !settings ||
      pending.current
    )
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    setChecked(false);
    try {
      if (!(await currentAccount())) return;
      const time = scheduledAt();
      setMode("quoting");
      const result = await client.getFareQuote({
        originLat: draft.origin.lat!,
        originLng: draft.origin.lng!,
        destinationLat: draft.destination.lat!,
        destinationLng: draft.destination.lng!,
        scheduledAt: time,
      });
      if (result.serviceAreaResult === "not_serviceable") {
        setQuote(undefined);
        setMode("form");
        setError(T.notServiceable);
        return;
      }
      if (result.fareVersion !== fare?.version) {
        setQuote(undefined);
        setMode("form");
        setError(T.changedFare);
        return;
      }
      if (
        !result.fareSnapshotId ||
        !Number.isFinite(result.estimatedMin) ||
        !Number.isFinite(result.estimatedMax) ||
        result.estimatedMax < result.estimatedMin ||
        result.estimatedMin < 0 ||
        !Number.isFinite(Date.parse(result.expiresAt))
      )
        throw new Error("invalid_quote");
      if (Date.parse(result.expiresAt) <= Date.now()) {
        setMode("form");
        setError(T.expired);
        return;
      }
      setQuote(result);
      setMode("confirm");
    } catch (reason) {
      if (
        reason instanceof Error &&
        ["booking_lead_invalid", "invalid_booking_time"].includes(
          reason.message,
        )
      ) {
        setMode("form");
        setError(T.shortLead);
      } else {
        setMode("unavailable");
        report(reason, T.noQuote);
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function submit() {
    if (lock.current || submitted.current) return;
    if (
      !pending.current &&
      (!checked ||
        !quote ||
        !paymentSelection?.paymentMethodId ||
        !draft.origin ||
        !draft.destination)
    )
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (!(await currentAccount())) return;
      if (!pending.current) {
        if (
          !quote ||
          !paymentSelection?.paymentMethodId ||
          !draft.origin ||
          !draft.destination
        )
          return;
        const time = scheduledAt();
        if (Date.parse(quote.expiresAt) <= Date.now())
          throw new Error("quote_expired");
        pending.current = {
          requestId: crypto.randomUUID(),
          paymentLabel: paymentSelection.label,
          outcomeUnknown: false,
          command: {
            scheduledAt: time,
            origin: {
              lat: draft.origin.lat!,
              lng: draft.origin.lng!,
              address: draft.origin.address,
            },
            destination: {
              lat: draft.destination.lat!,
              lng: draft.destination.lng!,
              address: draft.destination.address,
            },
            paymentMethodId: paymentSelection.paymentMethodId,
            fareSnapshotId: quote.fareSnapshotId,
            passengerConfirmedAt: new Date().toISOString(),
          },
        };
      }
      const result = await client.createRide(
        pending.current.command,
        pending.current.requestId,
      );
      if (!result.ride?.order?.orderId)
        throw new Error("unknown_create_acknowledgement");
      submitted.current = true;
      pending.current = null;
      router.push(
        `/ride?rideId=${encodeURIComponent(result.ride.order.orderId)}`,
      );
    } catch (reason) {
      const code =
        reason instanceof PassengerApiError
          ? reason.code.toLowerCase()
          : reason instanceof Error
            ? reason.message
            : "unavailable";
      if (reason instanceof PassengerApiError && reason.status === 401) {
        pending.current = null;
        setQuote(undefined);
        setChecked(false);
        setDraft(emptyDraft);
        setAccount(undefined);
        setSettings(undefined);
        setFare(undefined);
        setMode("loading");
        report(reason, T.noCreate);
      } else if (pending.current?.outcomeUnknown) {
        // A retry refusal may precede the backend's idempotency lookup. It
        // cannot establish that the first sent request never committed.
        // Only an authoritative success or the identity fence ends recovery.
        setMode("unavailable");
        report(reason, T.unknownCreate);
      } else if (
        [
          "quote_expired",
          "fare_quote_expired",
          "fare_quote_not_found",
        ].includes(code)
      ) {
        pending.current = null;
        setQuote(undefined);
        setChecked(false);
        setMode("form");
        setError(T.expired);
      } else if (
        ["booking_lead_invalid", "invalid_booking_time"].includes(code)
      ) {
        pending.current = null;
        setMode("form");
        setError(T.shortLead);
      } else if (
        reason instanceof PassengerApiError &&
        reason.status >= 400 &&
        reason.status < 500
      ) {
        pending.current = null;
        setMode("confirm");
        report(reason, T.noCreate);
      } else {
        if (pending.current) pending.current.outcomeUnknown = true;
        setMode("unavailable");
        report(reason, T.unknownCreate);
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const phoneReady =
    account &&
    settings &&
    (settings.requireSmsVerification
      ? !!account.contactPhone && account.contactPhoneVerified
      : !!(account.contactPhone || account.verifiedPhone));
  const acknowledged =
    account && fare && account.feeAcknowledgementVersion === fare.version;
  return (
    <AuthScreen title={T.book}>
      {error && (mode !== "confirm" || !quote) && (
        <AuthAlert>{error}</AuthAlert>
      )}
      {!account || !fare || !settings ? (
        <>
          <p>{busy ? T.loadingSettings : T.missingSettings}</p>
          <P5Btn disabled={busy} onClick={() => void load()}>
            {T.retrySettings}
          </P5Btn>
        </>
      ) : !acknowledged && !pending.current ? (
        <>
          <FeeDisclosure fare={fare} />
          <P5Btn
            kind="primary"
            disabled={busy}
            onClick={() => void acknowledge()}
          >
            {T.acknowledge}
          </P5Btn>
          <p>{T.disclosureFooter}</p>
        </>
      ) : !phoneReady && !pending.current ? (
        <>
          <AuthAlert>{T.phone(settings.requireSmsVerification)}</AuthAlert>
          <a href="/account">{T.account}</a>
        </>
      ) : mode === "confirm" && quote ? (
        <BookingConfirmationSheet
          canDismiss={!busy && !pending.current && !submitted.current}
          onDismiss={() => {
            setChecked(false);
            setMode("form");
          }}
        >
          {error && <AuthAlert>{error}</AuthAlert>}
          <dl
            style={{
              border: `1px solid ${P5.line}`,
              borderRadius: 12,
              padding: "8px 14px",
              margin: "0 0 10px",
            }}
          >
            {[
              [T.pickup, draft.origin?.address ?? ""],
              [T.dropoff, draft.destination?.address ?? ""],
              [T.time, draft.localTime.replace("T", " ")],
              [
                T.estimatedFare,
                `NT$ ${quote.estimatedMin}–${quote.estimatedMax}`,
              ],
              [
                T.payment,
                pending.current?.paymentLabel ??
                  paymentSelection?.label ??
                  T.paymentPending,
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "6px 0",
                  fontSize: 12.5,
                }}
              >
                <dt style={{ color: P5.mut }}>{label}</dt>
                <dd style={{ margin: 0, fontWeight: 600, textAlign: "right" }}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <p>{T.quoteVersion(quote.fareVersion, quote.expiresAt)}</p>
          <P5Card title={T.rules}>
            {PASSENGER_CONFIRMATION_ROWS.map((row) => (
              <p key={row}>{row}</p>
            ))}
            <p>{PASSENGER_FREE_CANCELLATION_NOTICE}</p>
            <a href="/fares" target="_blank" rel="noopener noreferrer">
              {T.fullFees}
            </a>
          </P5Card>
          <P5Card title={T.payment}>
            <fieldset
              disabled={busy || !!pending.current || submitted.current}
              style={{ border: 0, padding: 0, margin: 0 }}
            >
              {pending.current ? (
                <p>{pending.current.paymentLabel}</p>
              ) : (
                (paymentSlot ??
                (paymentSelection ? (
                  <p>{paymentSelection.label}</p>
                ) : (
                  <p>{T.paymentPending}</p>
                )))
              )}
            </fieldset>
          </P5Card>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              fontSize: 12.5,
              fontWeight: 600,
              marginBottom: 10,
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={busy || !!pending.current}
              style={{ width: 20, height: 20, accentColor: P5.brand }}
              onChange={(event) => setChecked(event.target.checked)}
            />
            {T.checkbox}
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <P5Btn
              kind="primary"
              disabled={
                !checked ||
                busy ||
                submitted.current ||
                (!pending.current && !paymentSelection?.paymentMethodId)
              }
              onClick={() => void submit()}
            >
              {T.confirm}
            </P5Btn>
            <P5Btn
              disabled={busy || !!pending.current || submitted.current}
              onClick={() => {
                setChecked(false);
                setMode("form");
              }}
            >
              {T.modify}
            </P5Btn>
          </div>
          <p>{T.confirmationFooter}</p>
        </BookingConfirmationSheet>
      ) : mode === "unavailable" ? (
        <>
          <P5Map state="missing" pickupAddress={draft.origin?.address ?? ""} />
          <P5RouteFare
            mode="anomaly"
            pickup={draft.origin?.address ?? ""}
            dropoff={draft.destination?.address ?? ""}
          />
          <P5Btn
            disabled={busy}
            onClick={() => {
              if (pending.current) {
                setMode("confirm");
                void submit();
              } else void getQuote();
            }}
          >
            {pending.current ? T.retrySame : T.retryQuote}
          </P5Btn>
          <a href={`tel:${PASSENGER_SUPPORT_PHONE}`}>{T.support}</a>
          <P5Btn
            disabled={busy || !!pending.current}
            onClick={() => setMode("form")}
          >
            {T.modify}
          </P5Btn>
        </>
      ) : mode === "quoting" ? (
        <>
          <P5RouteFare
            pickup={draft.origin?.address ?? ""}
            dropoff={draft.destination?.address ?? ""}
          />
          <p>{T.quoting}</p>
        </>
      ) : (
        <>
          {!account.contactPhoneVerified &&
            !settings.requireSmsVerification && (
              <AuthAlert kind="warn">{T.unverifiedPhone}</AuthAlert>
            )}
          <BookingForm
            client={client}
            settings={settings}
            draft={draft}
            onChange={setDraft}
            busy={busy}
            onQuote={() => void getQuote()}
          />
          <P5Btn disabled={busy} onClick={() => void load()}>
            {T.refreshSettings}
          </P5Btn>
        </>
      )}
      <a href={`tel:${PASSENGER_SUPPORT_PHONE}`}>
        {T.supportPhone(PASSENGER_SUPPORT_PHONE)}
      </a>
    </AuthScreen>
  );
}
