"use client";
import { passengerFetch } from "../../lib/runtime-fetch";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type {
  FareQuoteResponse,
  FareVersion,
  PassengerAccount,
  PassengerBookingSettingsResponse,
} from "@drts/contracts";
import {
  PassengerBookingClient,
  PassengerApiError,
  fromLocalDateTime,
  isBookingTimeAllowed,
  PASSENGER_APP_CONFIRMATION_ROWS,
  PASSENGER_SUPPORT_PHONE,
  proposedBookingTime,
} from "@drts/passenger-client";
import { AuthAlert, P5Btn, P5 } from "../auth/ui";
import { P5Icon, P5Map, P5RouteFare } from "../p5-ui";
import { BookingForm, type BookingDraft } from "./booking-form";
import { FeeDisclosure } from "./disclosure";
import { BookingConfirmationSheet } from "./confirmation-sheet";
import {
  FEES_PATH,
  PLAN,
  PlanLink,
  PlanScreen,
  useFramedDevice,
} from "./plan-screen";
import { BOOK_T as T } from "../../lib/booking/translations";
import {
  useReviewDemo,
  useReviewDemoPending,
  useTrialMode,
} from "../review-demo/review-context";
import {
  clearBookingRecovery,
  readBookingRecovery,
  saveBookingRecovery,
  type PendingBooking,
} from "./booking-draft-recovery";

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
  /** Account-level notice (e.g. an unpaid trip) shown above the content. */
  notice?: ReactNode;
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
const PROPOSED_TIME_REFRESH_MS = 15_000;
/** A picked time that can still be booked stays; anything else gets a proposal. */
function withBookableTime(
  draft: BookingDraft,
  settings: PassengerBookingSettingsResponse,
): BookingDraft {
  if (!draft.localTimeAuto) {
    try {
      const iso = fromLocalDateTime(draft.localTime);
      if (isBookingTimeAllowed(iso, settings)) return draft;
    } catch {
      /* Empty or unparsable: nothing worth keeping. */
    }
  }
  return {
    ...draft,
    localTime: proposedBookingTime(settings),
    localTimeAuto: true,
  };
}

export function BookingScreen({
  client: supplied,
  paymentSelection,
  paymentSlot,
  notice,
}: BookingScreenProps) {
  const router = useRouter();
  const review = useReviewDemo();
  const reviewPending = useReviewDemoPending();
  const trial = useTrialMode();
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
  const [paymentOpen, setPaymentOpen] = useState(false);
  const paymentListId = useId();
  const framed = useFramedDevice();
  const lock = useRef(false);
  const submitted = useRef(false);
  const mounted = useRef(true);
  // Unknown create acknowledgement retries retain the identical request key AND body.
  const pending = useRef<PendingBooking | null>(null);
  const recoveryAccount = useRef<string | undefined>(undefined);
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
      const restored =
        recoveryAccount.current !== me.account.drtsPassengerId
          ? readBookingRecovery(me.account.drtsPassengerId)
          : null;
      recoveryAccount.current = me.account.drtsPassengerId;
      if (restored) {
        pending.current = restored.pending;
        // A pending command is immutable; an unsent draft needs a bookable time.
        setDraft(
          restored.pending
            ? restored.draft
            : withBookableTime(restored.draft, configuration),
        );
        setQuote(restored.quote);
        setChecked(!!restored.pending);
        setMode(restored.pending ? "unavailable" : "form");
        if (restored.pending) setError(T.unknownCreate);
        return;
      }
      setDraft((current) => withBookableTime(current, configuration));
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
    if (
      account &&
      account.drtsPassengerId === recoveryAccount.current &&
      !submitted.current
    )
      saveBookingRecovery(account.drtsPassengerId, {
        draft,
        pending: pending.current,
        quote,
      });
  }, [account, draft, quote]);

  useEffect(() => {
    // Only on the form: the confirmation sheet's quote is bound to its time.
    if (mode !== "form" || busy || !settings || !draft.localTimeAuto) return;
    const refresh = () => {
      const localTime = proposedBookingTime(settings);
      setDraft((current) =>
        current.localTimeAuto && current.localTime !== localTime
          ? { ...current, localTime }
          : current,
      );
    };
    refresh();
    const timer = setInterval(refresh, PROPOSED_TIME_REFRESH_MS);
    return () => clearInterval(timer);
  }, [mode, busy, settings, draft.localTimeAuto]);

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

  useEffect(() => {
    // Each sheet opens collapsed; without a usable card the list stays open.
    if (mode !== "confirm") setPaymentOpen(false);
    else if (!paymentSelection) setPaymentOpen(true);
  }, [mode, paymentSelection]);

  async function currentAccount() {
    const me = await client.getAccount();
    if (
      me.account?.status !== "active" ||
      me.account.drtsPassengerId !== account?.drtsPassengerId
    ) {
      pending.current = null;
      recoveryAccount.current = undefined;
      clearBookingRecovery();
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
  function scheduledAt(localTime = draft.localTime) {
    if (!settings) throw new Error("booking_settings_unavailable");
    const iso = fromLocalDateTime(localTime);
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
      // Fresh at the click: a sleeping tab can miss the refresh timer.
      const localTime = draft.localTimeAuto
        ? proposedBookingTime(settings)
        : draft.localTime;
      const time = scheduledAt(localTime);
      setDraft((current) => ({ ...current, localTime }));
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
      // Persist before the network send, including the original quote and key.
      // Re-mounting must recover this command rather than create a second one.
      saveBookingRecovery(account!.drtsPassengerId, {
        draft,
        pending: pending.current,
        quote,
      });
      const result = await client.createRide(
        pending.current.command,
        pending.current.requestId,
      );
      if (!result.ride?.order?.orderId)
        throw new Error("unknown_create_acknowledgement");
      submitted.current = true;
      pending.current = null;
      clearBookingRecovery();
      router.push(
        review
          ? `/rides/${encodeURIComponent(result.ride.order.orderId)}`
          : `/ride?rideId=${encodeURIComponent(result.ride.order.orderId)}`,
      );
    } catch (reason) {
      const code =
        reason instanceof PassengerApiError
          ? reason.code.toLowerCase()
          : reason instanceof Error
            ? reason.message
            : "unavailable";
      if (reason instanceof PassengerApiError && reason.status === 401) {
        // Expiry only means this request is unauthenticated. An earlier
        // unknown acknowledgement may already have committed. Keep its
        // account-bound record until real login confirms the same/different
        // account; never replay it under an unverified identity.
        if (!pending.current?.outcomeUnknown) clearBookingRecovery();
        pending.current = null;
        recoveryAccount.current = undefined;
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
        [
          "booking_lead_invalid",
          "invalid_booking_time",
          "too_soon_to_book",
        ].includes(code)
      ) {
        pending.current = null;
        setMode("form");
        setError(draft.localTimeAuto ? T.timeRefreshed : T.shortLead);
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
      if (
        !submitted.current &&
        account &&
        account.drtsPassengerId === recoveryAccount.current
      )
        saveBookingRecovery(account.drtsPassengerId, {
          draft,
          pending: pending.current,
          quote,
        });
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
  // The supplement (E-19a) puts 費用與優惠說明 at the top of the home screen
  // as a fixed entry, before any booking input.
  const feesLink = (
    <a
      href={FEES_PATH}
      style={{
        ...PLAN.card,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "11px 14px",
        color: P5.ink,
        textDecoration: "none",
        fontSize: 13.5,
        fontWeight: 700,
      }}
    >
      <P5Icon name="info" size={16} style={{ color: P5.brand }} />
      <span style={{ flex: 1 }}>{T.fullFees}</span>
      <span aria-hidden="true" style={{ color: P5.brand }}>
        ›
      </span>
    </a>
  );
  const topNotices = (
    <>
      {notice && <div style={PLAN.inset}>{notice}</div>}
      {error && (mode !== "confirm" || !quote) && (
        <div style={PLAN.inset}>
          <AuthAlert>{error}</AuthAlert>
        </div>
      )}
    </>
  );
  function sheet(current: ServiceableQuote) {
    const recovering = !!pending.current;
    const paymentLabel =
      pending.current?.paymentLabel ?? paymentSelection?.label;
    // The selected card is the 支付方式 row; the card list opens from it and
    // stays open whenever no usable card is selected.
    const canChoose = !!paymentSlot && !recovering && !submitted.current;
    const expanded = canChoose && (paymentOpen || !paymentSelection);
    const rows: [string, ReactNode, boolean][] = [
      [T.sheetPickup, draft.origin?.address ?? "", false],
      [T.sheetDropoff, draft.destination?.address ?? "", false],
      [T.time, scheduleLabel(draft.localTime), true],
      [
        T.estimatedFare,
        `NT$ ${current.estimatedMin}–${current.estimatedMax}`,
        true,
      ],
      [
        T.payment,
        canChoose ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={paymentListId}
            aria-label={T.changePayment(paymentLabel ?? T.paymentNone)}
            // Without a usable card the list cannot be collapsed.
            onClick={() => setPaymentOpen(paymentSelection ? !expanded : true)}
            style={{
              border: 0,
              padding: 0,
              background: "transparent",
              font: "inherit",
              color: "inherit",
              cursor: "pointer",
              textAlign: "right",
            }}
          >
            {paymentLabel ?? T.paymentNone}
            <span aria-hidden="true" style={{ color: P5.brand }}>
              {expanded ? " ˄" : " ›"}
            </span>
          </button>
        ) : (
          (paymentLabel ?? T.paymentNone)
        ),
        true,
      ],
    ];
    return (
      <BookingConfirmationSheet
        contained={framed}
        canDismiss={!busy && !recovering && !submitted.current}
        onDismiss={() => {
          setChecked(false);
          setMode("form");
        }}
      >
        {error && (
          <div style={{ marginBottom: 10 }}>
            <AuthAlert>{error}</AuthAlert>
          </div>
        )}
        <dl
          style={{
            border: `1px solid ${P5.line}`,
            borderRadius: 14,
            padding: "6px 16px",
            margin: 0,
          }}
        >
          {rows.map(([label, value, mono]) => (
            <div
              key={label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 12,
                padding: "6px 0",
              }}
            >
              <dt style={{ color: P5.mut, flexShrink: 0 }}>{label}</dt>
              <dd
                style={{
                  margin: 0,
                  fontWeight: 700,
                  textAlign: "right",
                  ...(mono ? { fontFamily: P5.mono } : {}),
                }}
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <p
          style={{
            fontSize: 11,
            color: P5.dim,
            textAlign: "right",
            margin: "4px 4px 8px",
          }}
        >
          {T.quoteValidUntil(clockLabel(current.expiresAt))}
        </p>
        {expanded && (
          <div
            id={paymentListId}
            style={{
              border: `1px solid ${P5.line}`,
              borderRadius: 14,
              padding: "12px 14px",
              marginBottom: 10,
            }}
          >
            <fieldset
              disabled={busy || recovering || submitted.current}
              style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
            >
              {paymentSlot}
            </fieldset>
          </div>
        )}
        {!paymentSlot && !paymentLabel && (
          <p style={{ ...PLAN.muted, margin: "0 4px 10px" }}>
            {T.paymentPending}
          </p>
        )}
        <section
          style={{
            border: `1px solid ${P5.line}`,
            borderRadius: 14,
            padding: "12px 16px",
            marginBottom: 12,
          }}
        >
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 8px" }}>
            {T.rules}
          </h3>
          {PASSENGER_APP_CONFIRMATION_ROWS.map((row) => (
            <p
              key={row}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                margin: "0 0 4px",
              }}
            >
              <P5Icon name="check" size={15} style={{ color: P5.ok }} />
              {row}
            </p>
          ))}
          <div style={{ textAlign: "right", marginTop: 8 }}>
            <PlanLink href={FEES_PATH} newTab>
              {T.fullFees}
            </PlanLink>
          </div>
        </section>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 14,
            fontWeight: 700,
            margin: "0 2px 12px",
          }}
        >
          <input
            type="checkbox"
            checked={checked}
            disabled={busy || recovering}
            style={{
              width: 22,
              height: 22,
              margin: 0,
              accentColor: P5.brand,
            }}
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
              (!recovering && !paymentSelection?.paymentMethodId)
            }
            onClick={() => void submit()}
          >
            {T.confirm}
          </P5Btn>
          <P5Btn
            disabled={busy || recovering || submitted.current}
            onClick={() => {
              setChecked(false);
              setMode("form");
            }}
          >
            {T.modify}
          </P5Btn>
        </div>
        {!recovering && (!checked || !paymentSelection?.paymentMethodId) && (
          <p
            style={{
              fontSize: 12.5,
              color: P5.warn,
              textAlign: "center",
              margin: "10px 0 0",
            }}
          >
            {checked ? T.choosePaymentFirst : T.checkFirst}
          </p>
        )}
        <p
          style={{
            fontSize: 11.5,
            color: P5.dim,
            textAlign: "center",
            margin: "8px 0 0",
          }}
        >
          {T.confirmationFooter}
        </p>
      </BookingConfirmationSheet>
    );
  }
  function currentView(): {
    title: string;
    right?: string;
    body: ReactNode;
    overlay?: ReactNode;
  } {
    if (reviewPending)
      return {
        title: T.book,
        body: (
          <>
            {topNotices}
            {feesLink}
            <p role="status" style={{ ...PLAN.muted, margin: "0 16px 12px" }}>
              {T.loadingSettings}
            </p>
          </>
        ),
      };
    if (!account || !fare || !settings)
      return {
        title: T.book,
        body: (
          <>
            {topNotices}
            {feesLink}
            <div style={PLAN.card}>
              <p style={{ margin: "0 0 12px", color: P5.mut }}>
                {busy ? T.loadingSettings : T.missingSettings}
              </p>
              <P5Btn disabled={busy} onClick={() => void load()}>
                {T.retrySettings}
              </P5Btn>
            </div>
          </>
        ),
      };
    if (!acknowledged && !pending.current)
      // E-19a: the first-use 費用與優惠說明 gate.
      return {
        title: T.disclosure,
        right: T.publicInfo,
        body: (
          <>
            {topNotices}
            <FeeDisclosure fare={fare} />
            <div style={{ margin: "0 14px 8px" }}>
              <P5Btn
                kind="primary"
                icon="check"
                disabled={busy}
                onClick={() => void acknowledge()}
              >
                {T.acknowledge}
              </P5Btn>
            </div>
            <p style={{ ...PLAN.stamp, textAlign: "center" }}>
              {T.disclosureFooter}
            </p>
          </>
        ),
      };
    if (!phoneReady && !pending.current)
      return {
        title: T.book,
        body: (
          <>
            {topNotices}
            {feesLink}
            <div style={PLAN.inset}>
              <AuthAlert>{T.phone(settings.requireSmsVerification)}</AuthAlert>
              <a href="/account" style={{ ...PLAN.linkButton, marginTop: 12 }}>
                {T.account}
              </a>
            </div>
          </>
        ),
      };
    if (mode === "confirm" && quote)
      // E-19b: the sheet over the dimmed 建立乘車需求 screen.
      return { title: T.book, body: null, overlay: sheet(quote) };
    if (mode === "unavailable")
      return {
        title: T.book,
        body: (
          <>
            {topNotices}
            {feesLink}
            <P5Map
              state="missing"
              pickupAddress={draft.origin?.address ?? ""}
            />
            <P5RouteFare
              mode="anomaly"
              pickup={draft.origin?.address ?? ""}
              dropoff={draft.destination?.address ?? ""}
            />
            <div
              style={{
                margin: "0 14px 12px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <P5Btn
                kind="primary"
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
              <a
                href={`tel:${PASSENGER_SUPPORT_PHONE}`}
                style={PLAN.linkButton}
              >
                {T.support}
              </a>
              <P5Btn
                disabled={busy || !!pending.current}
                onClick={() => setMode("form")}
              >
                {T.modify}
              </P5Btn>
            </div>
          </>
        ),
      };
    if (mode === "quoting")
      return {
        title: T.book,
        body: (
          <>
            {topNotices}
            {feesLink}
            <P5RouteFare
              pickup={draft.origin?.address ?? ""}
              dropoff={draft.destination?.address ?? ""}
            />
            <p role="status" style={{ ...PLAN.muted, margin: "0 16px 12px" }}>
              {T.quoting}
            </p>
          </>
        ),
      };
    return {
      title: T.book,
      body: (
        <>
          {topNotices}
          {feesLink}
          {/* A trial account signed in with its verified test phone. */}
          {!account.contactPhoneVerified &&
            !settings.requireSmsVerification &&
            !trial && (
              <div style={PLAN.inset}>
                <AuthAlert kind="warn">
                  <span>{T.unverifiedPhone}</span>
                  <a
                    href="/account"
                    style={{
                      display: "block",
                      marginTop: 6,
                      color: "inherit",
                      fontWeight: 700,
                    }}
                  >
                    {T.account}
                  </a>
                </AuthAlert>
              </div>
            )}
          <BookingForm
            client={client}
            settings={settings}
            draft={draft}
            onChange={setDraft}
            busy={busy}
            onQuote={() => void getQuote()}
          />
          <div style={{ margin: "0 14px 4px" }}>
            <P5Btn kind="ghost" disabled={busy} onClick={() => void load()}>
              {T.refreshSettings}
            </P5Btn>
          </div>
        </>
      ),
    };
  }
  const view = currentView();
  return (
    <PlanScreen title={view.title} right={view.right} overlay={view.overlay}>
      {view.body}
    </PlanScreen>
  );
}

/** 「今日 14:45」 style for the browser-local datetime-local draft value. */
export function scheduleLabel(local: string, now = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!match) return local.replace("T", " ");
  const [, year, month, day, hour, minute] = match;
  const pad = (value: number) => String(value).padStart(2, "0");
  const key = (date: Date) =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const tomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  );
  const date = `${year}-${month}-${day}`;
  const time = `${hour}:${minute}`;
  if (date === key(now)) return `${T.today} ${time}`;
  if (date === key(tomorrow)) return `${T.tomorrow} ${time}`;
  return `${year}/${month}/${day} ${time}`;
}

/** Local wall-clock of an API instant (「18:23」, with the date if not today). */
export function clockLabel(iso: string, now = new Date()) {
  const instant = new Date(iso);
  if (!Number.isFinite(instant.getTime())) return "—";
  const pad = (value: number) => String(value).padStart(2, "0");
  const time = `${pad(instant.getHours())}:${pad(instant.getMinutes())}`;
  return instant.toDateString() === now.toDateString()
    ? time
    : `${instant.getMonth() + 1}/${instant.getDate()} ${time}`;
}
