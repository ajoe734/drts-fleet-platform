"use client";
import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useRouter } from "next/navigation";
import type { PassengerBookingClient } from "@drts/passenger-client";
import type { PassengerBookingSettingsResponse } from "@drts/contracts";
import { earliestBookingTime, PassengerApiError } from "@drts/passenger-client";
import {
  AddressMapPicker,
  buildCanvasTheme,
  type AddressPayload,
} from "@drts/ui-web";
import { REALM_COLORS } from "@drts/ui-tokens";
import { P5, P5Btn, P5Card } from "../auth/ui";
import { BOOK_T as T } from "../../lib/booking/translations";
import { DEMO_ADDRESSES, isDemoMode } from "../../lib/demo/store";
import { DEMO_T } from "../../lib/demo/translations";
import { PAX_REVIEW_STOPS } from "@drts/api-client";
import { useReviewDemo, useTrialMode } from "../review-demo/review-context";
import { TRIAL_STOPS, trialT } from "../trial/translations";
import { CurrentLocationButton } from "./current-location-button";
import { PLAN } from "./plan-screen";

export interface BookingDraft {
  origin: AddressPayload | null;
  destination: AddressPayload | null;
  reviewAddressMode?: "fixed" | "standard";
  /** Always datetime-local, never a UTC ISO value passed into that control. */
  localTime: string;
}
const realm = REALM_COLORS.passenger.light;
const theme = {
  ...buildCanvasTheme({ surface: "platform", density: "comfy" }),
  accent: realm.fg,
  accentHi: realm.headerBg,
  accentBg: realm.bg,
  accentBorder: realm.bg,
  surfaceName: T.realmName,
};
const labels = T.picker;

export function BookingForm({
  client,
  settings,
  draft,
  onChange,
  onQuote,
  busy,
}: {
  client: PassengerBookingClient;
  settings: PassengerBookingSettingsResponse;
  draft: BookingDraft;
  onChange: Dispatch<SetStateAction<BookingDraft>>;
  onQuote: () => void;
  busy: boolean;
}) {
  // Optional provider health/evaluator operations are deliberately omitted.
  // Real search/resolve/reverse failures surface through the real shared picker.
  const router = useRouter();
  const review = useReviewDemo();
  const trial = useTrialMode();
  const [demo, setDemo] = useState<boolean | null>(null);
  useEffect(() => setDemo(isDemoMode()), []);
  const provider = useMemo(() => {
    async function authenticated<T>(operation: Promise<T>): Promise<T> {
      try {
        return await operation;
      } catch (reason) {
        if (reason instanceof PassengerApiError && reason.status === 401)
          router.push("/login");
        throw reason;
      }
    }
    return {
      search: (query: Parameters<PassengerBookingClient["search"]>[0]) =>
        authenticated(client.search(query)),
      resolve: (command: Parameters<PassengerBookingClient["resolve"]>[0]) =>
        authenticated(client.resolve(command)),
      reverse: (command: Parameters<PassengerBookingClient["reverse"]>[0]) =>
        authenticated(client.reverse(command)),
    };
  }, [client, router]);
  if (demo === null)
    return (
      <p role="status" style={{ ...PLAN.muted, margin: "0 16px 12px" }}>
        {DEMO_T.addressLoading}
      </p>
    );
  const fixedAddresses =
    demo || (review && draft.reviewAddressMode !== "standard");
  function patchDraft(update: Partial<BookingDraft>) {
    onChange((current) => ({ ...current, ...update }));
  }
  function demoAddress(field: "origin" | "destination") {
    const addresses: readonly AddressPayload[] = trial
      ? TRIAL_STOPS
      : review
        ? PAX_REVIEW_STOPS
        : DEMO_ADDRESSES;
    return (
      <>
        {!trial && (
          <p style={{ ...PLAN.muted, margin: "0 0 8px" }}>
            {review
              ? "模擬新北選址；試算與建單仍呼叫真 API，費率與服務範圍由後端判定。"
              : DEMO_T.addressHint}
          </p>
        )}
        <select
          aria-label={field === "origin" ? DEMO_T.pickup : DEMO_T.dropoff}
          style={PLAN.field}
          disabled={busy}
          value={draft[field]?.addressId ?? ""}
          onChange={(event) =>
            patchDraft({
              [field]:
                addresses.find(
                  (address) => address.addressId === event.target.value,
                ) ?? null,
            })
          }
        >
          <option value="">{DEMO_T.selectAddress}</option>
          {addresses.map((address) => (
            <option key={address.addressId} value={address.addressId ?? ""}>
              {address.address}
            </option>
          ))}
        </select>
      </>
    );
  }
  const addressMode = trial ? trialT.addressMode : T.reviewAddressMode;
  return (
    <>
      {review && (
        <P5Card title={addressMode}>
          <select
            aria-label={addressMode}
            style={PLAN.field}
            value={draft.reviewAddressMode ?? "fixed"}
            disabled={busy}
            onChange={(event) => {
              const reviewAddressMode = event.target.value;
              if (
                reviewAddressMode !== "fixed" &&
                reviewAddressMode !== "standard"
              )
                return;
              patchDraft({
                origin: null,
                destination: null,
                reviewAddressMode,
              });
            }}
          >
            <option value="fixed">
              {trial ? trialT.fixedAddresses : T.reviewFixedAddresses}
            </option>
            <option value="standard">
              {trial ? trialT.standardAddresses : T.reviewStandardAddresses}
            </option>
          </select>
          <p style={PLAN.muted}>
            {trial ? trialT.addressNotice : T.reviewAddressNotice}
          </p>
        </P5Card>
      )}
      <P5Card title={<StopTitle kind="pickup">{T.pickup}</StopTitle>}>
        {fixedAddresses ? (
          demoAddress("origin")
        ) : (
          <>
            <CurrentLocationButton
              value={draft.origin}
              reverse={provider.reverse}
              disabled={busy}
              onSelect={(origin) => patchDraft({ origin })}
            />
            <AddressMapPicker
              id="booking-origin"
              provider={provider}
              surface="passenger_entry"
              theme={theme}
              labels={labels}
              value={draft.origin}
              onChange={(change) =>
                patchDraft({
                  origin: change.dispatchReady ? change.address : null,
                })
              }
              enableServiceabilityPreview={false}
            />
          </>
        )}
      </P5Card>
      <P5Card title={<StopTitle kind="dropoff">{T.dropoff}</StopTitle>}>
        {fixedAddresses ? (
          demoAddress("destination")
        ) : (
          <AddressMapPicker
            id="booking-destination"
            provider={provider}
            surface="passenger_entry"
            theme={theme}
            labels={labels}
            value={draft.destination}
            onChange={(change) =>
              patchDraft({
                destination: change.dispatchReady ? change.address : null,
              })
            }
            enableServiceabilityPreview={false}
          />
        )}
      </P5Card>
      <P5Card title={T.time}>
        <input
          aria-label={T.time}
          type="datetime-local"
          style={PLAN.field}
          value={draft.localTime}
          min={earliestBookingTime(settings)}
          disabled={busy}
          onChange={(event) => patchDraft({ localTime: event.target.value })}
        />
        <p style={PLAN.muted}>{T.lead(settings.minLeadTimeMinutes)}</p>
      </P5Card>
      <div style={{ margin: "4px 14px 8px" }}>
        <P5Btn
          kind="primary"
          disabled={
            busy || !draft.origin || !draft.destination || !draft.localTime
          }
          onClick={onQuote}
        >
          {busy ? T.quoting : T.quote}
        </P5Btn>
      </div>
    </>
  );
}

/** Card title with the route markers of the plan's 預估路線 card. */
function StopTitle({
  kind,
  children,
}: {
  kind: "pickup" | "dropoff";
  children: string;
}) {
  return (
    <>
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          flexShrink: 0,
          boxSizing: "border-box",
          borderRadius: kind === "pickup" ? 4 : 2,
          border: `2px solid ${P5.brand}`,
          background: kind === "pickup" ? "transparent" : P5.brand,
        }}
      />
      {children}
    </>
  );
}
