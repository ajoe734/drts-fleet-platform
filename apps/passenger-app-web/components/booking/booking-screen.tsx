"use client";
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
import { AuthScreen, AuthAlert, P5Btn, P5Card } from "../auth/ui";
import { P5Map, P5RouteFare } from "../p5-ui";
import { BookingForm, type BookingDraft } from "./booking-form";
import { FeeDisclosure } from "./disclosure";
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
    fetchFn: (url, init) => fetch(url, init),
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
  const mounted = useRef(true);
  // Unknown create acknowledgement retries retain the identical request key AND body.
  const pending = useRef<{
    command: CreatePassengerRideCommand;
    requestId: string;
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
    if (me.account.feeAcknowledgementVersion !== fare?.version) {
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
    if (
      lock.current ||
      !checked ||
      !quote ||
      !paymentSelection?.paymentMethodId ||
      !draft.origin ||
      !draft.destination
    )
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (!(await currentAccount())) return;
      if (!pending.current) {
        const time = scheduledAt();
        if (Date.parse(quote.expiresAt) <= Date.now())
          throw new Error("quote_expired");
        pending.current = {
          requestId: crypto.randomUUID(),
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
      if (
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
      } else if (reason instanceof PassengerApiError && reason.status < 500) {
        pending.current = null;
        setMode("confirm");
        report(reason, T.noCreate);
      } else {
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
    <AuthScreen title={mode === "confirm" ? T.confirm : T.book}>
      {error && <AuthAlert>{error}</AuthAlert>}
      {!account || !fare || !settings ? (
        <>
          <p>{busy ? T.loadingSettings : T.missingSettings}</p>
          <P5Btn disabled={busy} onClick={() => void load()}>
            {T.retrySettings}
          </P5Btn>
        </>
      ) : !acknowledged ? (
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
      ) : !phoneReady ? (
        <>
          <AuthAlert>{T.phone(settings.requireSmsVerification)}</AuthAlert>
          <a href="/account">{T.account}</a>
        </>
      ) : mode === "confirm" && quote ? (
        <>
          <P5RouteFare
            pickup={draft.origin?.address ?? ""}
            dropoff={draft.destination?.address ?? ""}
            fareRange={`NT$ ${quote.estimatedMin}–${quote.estimatedMax}`}
          />
          <p>{T.quoteVersion(quote.fareVersion, quote.expiresAt)}</p>
          <p>{T.timeValue(draft.localTime)}</p>
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
            {paymentSlot ??
              (paymentSelection ? (
                <p>{paymentSelection.label}</p>
              ) : (
                <p>{T.paymentPending}</p>
              ))}
          </P5Card>
          <label>
            <input
              type="checkbox"
              checked={checked}
              disabled={busy}
              onChange={(event) => setChecked(event.target.checked)}
            />
            {T.checkbox}
          </label>
          <P5Btn
            kind="primary"
            disabled={!checked || busy || !paymentSelection?.paymentMethodId}
            onClick={() => void submit()}
          >
            {T.confirm}
          </P5Btn>
          <P5Btn
            disabled={busy}
            onClick={() => {
              setChecked(false);
              setMode("form");
            }}
          >
            {T.modify}
          </P5Btn>
          <p>{T.confirmationFooter}</p>
        </>
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
