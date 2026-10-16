"use client";
import { useEffect, useMemo, useState } from "react";
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
import { P5Btn, P5Card, inputStyle } from "../auth/ui";
import { BOOK_T as T } from "../../lib/booking/translations";
import { DEMO_ADDRESSES, isDemoMode } from "../../lib/demo/store";
import { DEMO_T } from "../../lib/demo/translations";
import { PAX_REVIEW_STOPS } from "@drts/api-client";
import { useReviewDemo } from "../review-demo/review-context";
import { CurrentLocationButton } from "./current-location-button";

export interface BookingDraft {
  origin: AddressPayload | null;
  destination: AddressPayload | null;
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
  onChange: (draft: BookingDraft) => void;
  onQuote: () => void;
  busy: boolean;
}) {
  // Optional provider health/evaluator operations are deliberately omitted.
  // Real search/resolve/reverse failures surface through the real shared picker.
  const router = useRouter();
  const review = useReviewDemo();
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
  if (demo === null) return <p>{DEMO_T.addressLoading}</p>;
  function demoAddress(field: "origin" | "destination") {
    const addresses = review ? PAX_REVIEW_STOPS : DEMO_ADDRESSES;
    return (
      <>
        <p>
          {review
            ? "模擬新北選址；試算與建單仍呼叫真 API，費率與服務範圍由後端判定。"
            : DEMO_T.addressHint}
        </p>
        <select
          aria-label={field === "origin" ? DEMO_T.pickup : DEMO_T.dropoff}
          style={inputStyle}
          disabled={busy}
          value={draft[field]?.addressId ?? ""}
          onChange={(event) =>
            onChange({
              ...draft,
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
  return (
    <>
      <P5Card title={T.pickup}>
        {demo || review ? (
          demoAddress("origin")
        ) : (
          <>
            <CurrentLocationButton
              value={draft.origin}
              reverse={provider.reverse}
              disabled={busy}
              onSelect={(origin) => onChange({ ...draft, origin })}
            />
            <AddressMapPicker
              id="booking-origin"
              provider={provider}
              surface="passenger_entry"
              theme={theme}
              labels={labels}
              value={draft.origin}
              onChange={(change) =>
                onChange({
                  ...draft,
                  origin: change.dispatchReady ? change.address : null,
                })
              }
              enableServiceabilityPreview={false}
            />
          </>
        )}
      </P5Card>
      <P5Card title={T.dropoff}>
        {demo || review ? (
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
              onChange({
                ...draft,
                destination: change.dispatchReady ? change.address : null,
              })
            }
            enableServiceabilityPreview={false}
          />
        )}
      </P5Card>
      <P5Card title={T.time}>
        <label>
          {T.time}
          <input
            aria-label={T.time}
            type="datetime-local"
            style={inputStyle}
            value={draft.localTime}
            min={earliestBookingTime(settings)}
            disabled={busy}
            onChange={(event) =>
              onChange({ ...draft, localTime: event.target.value })
            }
          />
        </label>
        <p>{T.lead(settings.minLeadTimeMinutes)}</p>
      </P5Card>
      <P5Btn
        kind="primary"
        disabled={
          busy || !draft.origin || !draft.destination || !draft.localTime
        }
        onClick={onQuote}
      >
        {busy ? T.quoting : T.quote}
      </P5Btn>
    </>
  );
}
