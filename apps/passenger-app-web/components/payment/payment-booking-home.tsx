"use client";
import { passengerFetch } from "../../lib/runtime-fetch";
import { useEffect, useRef, useState } from "react";
import type { PassengerPaymentMethod } from "@drts/contracts";
import {
  PaymentAwareBookingClient,
  PassengerPaymentClient,
  paymentMethodExpired,
  paymentMethodLabel,
} from "@drts/passenger-client";
import {
  BookingScreen,
  type BookingPaymentSelection,
} from "../booking/booking-screen";
import { AuthAlert, P5Btn } from "../auth/ui";
import { PaymentMethodChoice, UnpaidPaymentNotice } from "./payment-summary";
import { PAY_T as T } from "../../lib/payment/translations";

export function PaymentBookingHome() {
  const [actorId, setActorId] = useState<string>();
  const actor = useRef<string | undefined>(undefined);
  const [methods, setMethods] = useState<PassengerPaymentMethod[]>();
  const [selection, setSelection] = useState<BookingPaymentSelection>();
  const [unpaid, setUnpaid] = useState(false);
  const [failure, setFailure] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const epoch = useRef(0);
  const alive = useRef(true);
  const [paymentClient] = useState(
    () =>
      new PassengerPaymentClient({
        baseUrl: "",
        fetchFn: passengerFetch,
      }),
  );
  const [bookingClient] = useState(
    () =>
      new PaymentAwareBookingClient(
        { baseUrl: "", fetchFn: passengerFetch },
        {
          account: (account) => {
            if (!alive.current) return;
            const id =
              account?.status === "active"
                ? account.drtsPassengerId
                : undefined;
            if (actor.current !== id) {
              epoch.current++;
              actor.current = id;
              setActorId(id);
              setMethods(undefined);
              setSelection(undefined);
              setUnpaid(false);
            }
          },
          unpaid: () => {
            if (alive.current) {
              setUnpaid(true);
              setSelection(undefined);
            }
          },
          unauthorized: () => {
            epoch.current++;
            actor.current = undefined;
            if (alive.current) {
              setActorId(undefined);
              setMethods(undefined);
              setSelection(undefined);
              setUnpaid(false);
            }
          },
        },
      ),
  );
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      epoch.current++;
    };
  }, []);
  useEffect(() => {
    if (!actorId) return;
    const request = ++epoch.current;
    let stopped = false;
    setFailure(false);
    void (async () => {
      try {
        const before = await bookingClient.getAccount();
        if (before.account.drtsPassengerId !== actorId) return;
        const response = await paymentClient.getMethods();
        const after = await bookingClient.getAccount();
        if (
          stopped ||
          request !== epoch.current ||
          actor.current !== actorId ||
          after.account.drtsPassengerId !== actorId
        )
          return;
        setMethods(response.methods);
        setSelection((current) => {
          if (
            current &&
            response.methods.some(
              (method) =>
                method.paymentMethodId === current.paymentMethodId &&
                !paymentMethodExpired(method),
            )
          )
            return current;
          const preferred = response.methods.find(
            (method) => method.isDefault && !paymentMethodExpired(method),
          );
          return preferred
            ? {
                paymentMethodId: preferred.paymentMethodId,
                label: paymentMethodLabel(preferred),
              }
            : undefined;
        });
      } catch {
        if (!stopped && request === epoch.current) {
          setMethods(undefined);
          setSelection(undefined);
          setFailure(true);
        }
      }
    })();
    return () => {
      stopped = true;
    };
  }, [actorId, refresh, bookingClient, paymentClient]);
  const slot = unpaid ? (
    <UnpaidPaymentNotice />
  ) : methods ? (
    <PaymentMethodChoice
      methods={methods}
      selectedId={selection?.paymentMethodId}
      onSelect={(method) =>
        setSelection({
          paymentMethodId: method.paymentMethodId,
          label: paymentMethodLabel(method),
        })
      }
    />
  ) : (
    <>
      <AuthAlert kind="warn">{failure ? T.failed : T.loading}</AuthAlert>
      <P5Btn
        disabled={!failure}
        onClick={() => setRefresh((value) => value + 1)}
      >
        {T.retry}
      </P5Btn>
    </>
  );
  return (
    <>
      {unpaid && <UnpaidPaymentNotice />}
      <BookingScreen
        client={bookingClient}
        {...(!unpaid && selection ? { paymentSelection: selection } : {})}
        paymentSlot={slot}
      />
    </>
  );
}
