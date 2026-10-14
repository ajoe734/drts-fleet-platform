"use client";

import { RIDE_T as T } from "./translations";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AuthScreen,
  AuthAlert,
  P5Btn,
  P5Card,
  P5,
  inputStyle,
} from "../auth/ui";
import { P5Eta, P5VehicleCard, P5Icon } from "../p5-ui";
import {
  getDemoState,
  getDemoReceipt,
  isDemoMode,
  subscribeDemo,
  advanceDemoRide,
  cancelDemoRide,
  setDemoPaymentFailure,
  retryDemoPayment,
  rateDemoRide,
  addDemoComplaint,
} from "../../lib/demo/store";
import type { DemoComplaint, DemoRide, DemoState } from "../../lib/demo/types";
import { passengerFetch } from "../../lib/runtime-fetch";

export const DEMO_RIDE_LABELS: Record<DemoRide["status"], string> = {
  reserved: T.message001,
  assigned: T.message002,
  arrived: T.message003,
  in_progress: T.message004,
  completed: T.message005,
  cancelled: T.message006,
};
const STAGES: DemoRide["status"][] = [
  "reserved",
  "assigned",
  "arrived",
  "in_progress",
  "completed",
];
const NEXT_LABEL: Partial<Record<DemoRide["status"], string>> = {
  reserved: T.message007,
  assigned: T.message008,
  arrived: T.message009,
  in_progress: T.message010,
};
const money = (amount: number) => `NT$ ${amount.toLocaleString("zh-TW")}`;
export const rideTime = (time: string) =>
  new Date(time).toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    hour12: false,
  });

/** Wait for browser storage before choosing a transport, including on refresh. */
export function usePassengerMode() {
  const [mode, setMode] = useState<"loading" | "demo" | "live">("loading");
  useEffect(() => {
    const update = () => setMode(isDemoMode() ? "demo" : "live");
    update();
    return subscribeDemo(update);
  }, []);
  return mode;
}

export function useDemoSnapshot() {
  const [state, setState] = useState<DemoState | null>(null);
  useEffect(() => {
    const update = () => setState(getDemoState());
    update();
    return subscribeDemo(update);
  }, []);
  return state;
}

export function RideNavigation() {
  return (
    <nav
      aria-label={T.message011}
      style={{
        display: "flex",
        gap: 24,
        justifyContent: "center",
        padding: "12px 0",
      }}
    >
      <Link href="/">{T.message012}</Link>
      <Link href="/rides">{T.message013}</Link>
      <Link href="/account">{T.message014}</Link>
    </nav>
  );
}

export function RideScreen({ rideId }: { rideId: string }) {
  const mode = usePassengerMode();
  if (mode === "loading")
    return (
      <AuthScreen title={T.message015}>
        <p role="status">{T.message016}</p>
      </AuthScreen>
    );
  return mode === "demo" ? (
    <DemoRideScreen key={rideId} rideId={rideId} />
  ) : (
    <LiveRideScreen key={rideId} rideId={rideId} />
  );
}

export function DemoRideScreen({ rideId }: { rideId: string }) {
  const state = useDemoSnapshot();
  const ride = state?.rides.find((item) => item.id === rideId);
  const [cancelPrompt, setCancelPrompt] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  function action(operation: () => unknown, message: string) {
    setError("");
    try {
      operation();
      setNotice(message);
    } catch {
      setError(T.message017);
    }
  }
  if (!state)
    return (
      <AuthScreen title={T.message018}>
        <p role="status">{T.message019}</p>
        <RideNavigation />
      </AuthScreen>
    );
  if (!state.loggedIn)
    return (
      <AuthScreen title={T.message018}>
        <AuthAlert kind="info">{T.message020}</AuthAlert>
        <Link href="/login">{T.message021}</Link>
        <RideNavigation />
      </AuthScreen>
    );
  if (!ride)
    return (
      <AuthScreen title={T.message022}>
        <AuthAlert kind="warn">
          {rideId ? T.message023 : T.message024}
        </AuthAlert>
        <RideNavigation />
      </AuthScreen>
    );
  const canCancel = ["reserved", "assigned", "arrived"].includes(ride.status);
  const stageIndex = STAGES.indexOf(ride.status);
  return (
    <AuthScreen title={T.message025(DEMO_RIDE_LABELS[ride.status])} account>
      <div style={{ padding: "0 14px" }}>
        <AuthAlert kind="info">{T.message026}</AuthAlert>
      </div>
      <P5Eta main={DEMO_RIDE_LABELS[ride.status]} sub={ride.orderNo} />
      {ride.status !== "cancelled" && (
        <ol
          aria-label={T.message027}
          style={{
            margin: "0 14px",
            padding: 16,
            listStylePosition: "inside",
            display: "grid",
            gap: 8,
          }}
        >
          {STAGES.map((stage, index) => (
            <li
              key={stage}
              aria-current={index === stageIndex ? "step" : undefined}
              style={{
                color: index <= stageIndex ? P5.brand : P5.mut,
                fontWeight: index === stageIndex ? 700 : 400,
              }}
            >
              {DEMO_RIDE_LABELS[stage]}
              {index < stageIndex ? " ✓" : ""}
            </li>
          ))}
        </ol>
      )}
      <P5Card title={T.message028}>
        <dl style={{ display: "grid", gap: 8, margin: 0 }}>
          <dt>{T.message029}</dt>
          <dd style={{ margin: 0 }}>{ride.origin.address}</dd>
          <dt>{T.message030}</dt>
          <dd style={{ margin: 0 }}>{ride.destination.address}</dd>
          <dt>{T.message031}</dt>
          <dd style={{ margin: 0 }}>{rideTime(ride.scheduledAt)}</dd>
          <dt>{ride.status === "completed" ? T.message032 : T.message033}</dt>
          <dd style={{ margin: 0, fontWeight: 700 }}>
            {ride.status === "completed"
              ? money(ride.amount)
              : `${money(ride.estimatedMin)}–${money(ride.estimatedMax)}`}
          </dd>
        </dl>
      </P5Card>
      {!["reserved", "cancelled"].includes(ride.status) && (
        <P5VehicleCard
          driver={ride.driver.name}
          plate={ride.driver.plate}
          carModel={ride.driver.vehicle}
          carDetails={T.message034}
          tag={<span>DEMO</span>}
        />
      )}
      {NEXT_LABEL[ride.status] && (
        <P5Card title={T.message035}>
          <p>{T.message036}</p>
          <P5Btn
            kind="primary"
            onClick={() => action(() => advanceDemoRide(ride.id), T.message037)}
          >
            {NEXT_LABEL[ride.status]}
          </P5Btn>
        </P5Card>
      )}
      {canCancel && (
        <P5Card title={T.message038}>
          {cancelPrompt ? (
            <>
              <p>{T.message039}</p>
              <P5Btn
                danger
                onClick={() =>
                  action(() => {
                    cancelDemoRide(ride.id);
                    setCancelPrompt(false);
                  }, T.message040)
                }
              >
                {T.message041}
              </P5Btn>
              <P5Btn kind="ghost" onClick={() => setCancelPrompt(false)}>
                {T.message042}
              </P5Btn>
            </>
          ) : (
            <P5Btn danger onClick={() => setCancelPrompt(true)}>
              {T.message043}
            </P5Btn>
          )}
        </P5Card>
      )}
      {ride.status === "completed" && (
        <>
          <P5Card title={T.message044}>
            <p>
              {ride.paymentStatus === "paid"
                ? T.message045(money(ride.amount))
                : ride.paymentStatus === "failed"
                  ? T.message046
                  : T.message047}
            </p>
            {ride.paymentStatus === "failed" ? (
              <P5Btn
                kind="primary"
                onClick={() =>
                  action(() => retryDemoPayment(ride.id), T.message048)
                }
              >
                {T.message049}
              </P5Btn>
            ) : (
              <P5Btn
                onClick={() =>
                  action(() => setDemoPaymentFailure(ride.id), T.message050)
                }
              >
                {T.message051}
              </P5Btn>
            )}
          </P5Card>
          <DemoReceiptCard ride={ride} />
          <DemoRatingCard ride={ride} />
        </>
      )}
      <DemoComplaintCard ride={ride} />
      {notice && (
        <p role="status" style={{ margin: "0 28px", color: P5.brand }}>
          {notice}
        </p>
      )}
      {error && (
        <div style={{ margin: "0 14px" }}>
          <AuthAlert>{error}</AuthAlert>
        </div>
      )}
      <RideNavigation />
    </AuthScreen>
  );
}

function DemoReceiptCard({ ride }: { ride: DemoRide }) {
  if (ride.paymentStatus !== "paid")
    return (
      <P5Card title={T.message062}>
        <p>{T.receiptWaitingForPayment}</p>
      </P5Card>
    );
  const receipt = getDemoReceipt(ride.id);
  const rows = [
    [T.receiptNumber, receipt.id],
    [T.receiptOrder, receipt.orderNo],
    [T.receiptOperator, receipt.operator],
    [T.receiptDriver, receipt.driverName],
    [T.receiptCredential, receipt.driverCredential],
    [T.receiptPlate, receipt.vehiclePlate],
    [T.message029, receipt.pickup],
    [T.message030, receipt.destination],
    [T.message031, rideTime(receipt.scheduledAt)],
    [T.receiptCompleted, rideTime(receipt.completedAt)],
    [T.receiptIssued, rideTime(receipt.issuedAt)],
    [T.receiptPayment, receipt.paymentMethod],
  ];
  const escapeHtml = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[character]!,
    );
  const htmlRows = rows
    .map(
      ([label, value]) =>
        `<tr><th>${escapeHtml(label!)}</th><td>${escapeHtml(value!)}</td></tr>`,
    )
    .join("");
  const htmlFees = receipt.lines
    .map(
      (line) =>
        `<tr><th>${escapeHtml(line.label)}</th><td>${escapeHtml(money(line.amount))}</td></tr>`,
    )
    .join("");
  const html = `<!doctype html><html lang="zh-TW"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(T.message052)}</title><style>body{font-family:system-ui,sans-serif;max-width:720px;margin:32px auto;padding:16px;color:${P5.ink}}h1{font-size:22px}table{width:100%;border-collapse:collapse;margin:24px 0}th,td{text-align:left;border-bottom:1px solid ${P5.line};padding:10px}th{width:40%}.notice{border:2px solid ${P5.brand};padding:12px}@media print{body{margin:0}}</style><h1>${escapeHtml(T.message052)}</h1><p class="notice">${escapeHtml(receipt.notice)}</p><table>${htmlRows}${htmlFees}<tr><th>${escapeHtml(T.receiptTotal)}</th><td>${escapeHtml(money(receipt.amount))}</td></tr></table><p>${escapeHtml(T.receiptPrintHint)}</p></html>`;
  return (
    <P5Card title={T.message062}>
      <p>{T.message063}</p>
      <dl style={{ margin: 0, display: "grid", gap: 6 }}>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt style={{ color: P5.mut, fontSize: 12 }}>{label}</dt>
            <dd style={{ margin: "2px 0 8px", overflowWrap: "anywhere" }}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <table style={{ width: "100%", margin: "12px 0", textAlign: "left" }}>
        <caption>{T.receiptBreakdown}</caption>
        <tbody>
          {receipt.lines.map((line) => (
            <tr key={line.label}>
              <th scope="row">{line.label}</th>
              <td>{money(line.amount)}</td>
            </tr>
          ))}
          <tr>
            <th scope="row">{T.receiptTotal}</th>
            <td>{money(receipt.amount)}</td>
          </tr>
        </tbody>
      </table>
      <a
        href={`data:text/html;charset=utf-8,${encodeURIComponent(html)}`}
        download={`${ride.orderNo}.html`}
        style={{ color: P5.brand, fontWeight: 700 }}
      >
        {T.message064}
      </a>
      <p>{T.receiptPrintHint}</p>
    </P5Card>
  );
}

function DemoRatingCard({ ride }: { ride: DemoRide }) {
  const [rating, setRating] = useState(ride.rating ?? 4);
  const [tags, setTags] = useState(
    ride.ratingTags.length ? ride.ratingTags : T.ratingPositiveTags.slice(0, 3),
  );
  const [comment, setComment] = useState(ride.ratingComment);
  const [contact, setContact] = useState(ride.contactRequested);
  const [error, setError] = useState("");
  const low = rating <= 2;
  const star = (score: number, selected: number) => (
    <P5Icon
      name="star"
      size={34}
      style={{
        color: score <= selected ? P5.warn : P5.line,
        fill: score <= selected ? P5.warn : "none",
      }}
    />
  );
  if (ride.rating !== null)
    return (
      <P5Card title={T.message065}>
        <p>
          {T.message066}
          {ride.rating} {T.message067}
        </p>
        <div
          role="img"
          aria-label={`${ride.rating} ${T.message069}`}
          style={{ display: "flex", justifyContent: "center", gap: 10 }}
        >
          {[1, 2, 3, 4, 5].map((score) => (
            <span key={score}>{star(score, ride.rating!)}</span>
          ))}
        </div>
        <ul
          aria-label={T.ratingSavedTags}
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 7,
            listStyle: "none",
            padding: 0,
          }}
        >
          {ride.ratingTags.map((tag) => (
            <li
              key={tag}
              style={{
                color: P5.brand,
                background: P5.brandBg,
                border: `1px solid ${P5.brand}`,
                borderRadius: 999,
                padding: "7px 12px",
                fontSize: 12,
              }}
            >
              {tag}
            </li>
          ))}
        </ul>
        <p>{ride.ratingComment || T.ratingNoComment}</p>
        {ride.rating <= 2 && (
          <p>
            {ride.contactRequested
              ? T.ratingContactRequested
              : T.ratingContactNotRequested}
          </p>
        )}
        <p style={{ color: P5.mut, fontSize: 12 }}>{T.ratingImmutable}</p>
      </P5Card>
    );
  const positive = { title: T.ratingPositive, options: T.ratingPositiveTags };
  const improvement = {
    title: T.ratingImprovement,
    options: T.ratingImprovementTags,
  };
  return (
    <P5Card title={T.message065}>
      <fieldset style={{ border: 0, padding: 0, margin: "0 0 12px" }}>
        <legend>{T.message068}</legend>
        <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
          {[1, 2, 3, 4, 5].map((score) => (
            <button
              key={score}
              type="button"
              aria-label={`${score} ${T.message069}`}
              aria-pressed={rating === score}
              onClick={() => {
                const nextLow = score <= 2;
                setRating(score);
                if (nextLow !== low) {
                  const preferred = nextLow
                    ? T.ratingImprovementTags
                    : T.ratingPositiveTags;
                  setTags((current) =>
                    current.filter((tag) => preferred.includes(tag)),
                  );
                }
                if (score > 2) setContact(false);
              }}
              style={{
                width: 46,
                height: 46,
                padding: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: 0,
                background: "transparent",
                cursor: "pointer",
              }}
            >
              {star(score, rating)}
            </button>
          ))}
        </div>
        <p
          style={{
            textAlign: "center",
            fontSize: 12.5,
            fontWeight: 700,
            color: low ? P5.danger : P5.warn,
            marginTop: 4,
          }}
        >
          {rating} {T.ratingLevels[rating - 1]}
        </p>
      </fieldset>
      {(low ? [improvement, positive] : [positive, improvement]).map(
        (group) => (
          <fieldset
            key={group.title}
            style={{ border: 0, padding: 0, margin: "12px 0" }}
          >
            <legend
              style={{
                fontSize: 11.5,
                fontWeight: 700,
                color: P5.mut,
                marginBottom: 6,
              }}
            >
              {group.title}
            </legend>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {group.options.map((tag) => {
                const selected = tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      setTags((current) =>
                        selected
                          ? current.filter((value) => value !== tag)
                          : [...current, tag],
                      )
                    }
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      padding: "7px 12px",
                      borderRadius: 999,
                      border: `1px solid ${selected ? P5.brand : P5.line}`,
                      color: selected ? P5.brand : P5.mut,
                      background: selected ? P5.brandBg : P5.surface,
                      cursor: "pointer",
                    }}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ),
      )}
      <label style={{ display: "grid", gap: 8 }}>
        {T.message070}
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value.slice(0, 200))}
          maxLength={200}
          rows={3}
          style={inputStyle}
        />
      </label>
      <p
        style={{
          textAlign: "right",
          fontSize: 10.5,
          color: P5.dim,
          marginTop: 3,
        }}
      >
        {comment.length} / 200
      </p>
      {low && (
        <div
          style={{
            margin: "10px 0",
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: P5.warnBg,
            border: `1px solid ${P5.warnBd}`,
            borderRadius: 10,
            padding: "10px 12px",
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>
              {T.ratingContactTitle}
            </div>
            <div style={{ fontSize: 10.5, color: P5.mut, marginTop: 1 }}>
              {T.ratingContactHint}
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-label={T.message071}
            aria-checked={contact}
            onClick={() => setContact((value) => !value)}
            style={{
              width: 40,
              height: 22,
              borderRadius: 11,
              background: contact ? P5.brand : P5.line,
              position: "relative",
              flexShrink: 0,
              border: 0,
              padding: 0,
              cursor: "pointer",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                left: contact ? 20 : 2,
                top: 2,
                width: 18,
                height: 18,
                borderRadius: 9,
                background: P5.surface,
              }}
            />
          </button>
        </div>
      )}
      <P5Btn
        kind="primary"
        icon="check"
        onClick={() => {
          setError("");
          try {
            rateDemoRide(ride.id, rating, comment, low && contact, tags);
          } catch {
            setError(T.message073);
          }
        }}
      >
        {T.message074}
      </P5Btn>
      <p style={{ color: P5.mut, fontSize: 12 }}>{T.ratingImmutable}</p>
      {error && <AuthAlert>{error}</AuthAlert>}
    </P5Card>
  );
}

function DemoComplaintCard({ ride }: { ride: DemoRide }) {
  const [category, setCategory] =
    useState<DemoComplaint["category"]>("service");
  const [content, setContent] = useState("");
  const [contactConsent, setContactConsent] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  return (
    <P5Card title={T.message075}>
      <p>{T.message076}</p>
      <div style={{ display: "grid", gap: 8 }}>
        <label htmlFor={`demo-complaint-category-${ride.id}`}>
          {T.message077}
        </label>
        <select
          id={`demo-complaint-category-${ride.id}`}
          value={category}
          onChange={(event) =>
            setCategory(event.target.value as DemoComplaint["category"])
          }
          style={inputStyle}
        >
          <option value="service">{T.message078}</option>
          <option value="lost_item">{T.message079}</option>
        </select>
      </div>
      <label style={{ display: "grid", gap: 8, marginTop: 12 }}>
        {category === "lost_item" ? T.message080 : T.message081}
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={3}
          maxLength={2000}
          style={inputStyle}
        />
      </label>
      <label style={{ display: "flex", gap: 8, margin: "12px 0" }}>
        <input
          type="checkbox"
          checked={contactConsent}
          onChange={(event) => setContactConsent(event.target.checked)}
        />
        {T.message082}
      </label>
      <P5Btn
        disabled={!content.trim()}
        onClick={() => {
          setError("");
          try {
            const record = addDemoComplaint(ride.id, {
              category,
              content: content.trim(),
              ...(category === "lost_item"
                ? { lostItemDescription: content.trim() }
                : {}),
              contactConsent,
            });
            setNotice(T.message083(record.id));
            setContent("");
          } catch {
            setError(T.message084);
          }
        }}
      >
        {T.message085}
      </P5Btn>
      {notice && <p role="status">{notice}</p>}
      {error && <AuthAlert>{error}</AuthAlert>}
      {ride.complaints.length > 0 && (
        <ul aria-label={T.message086}>
          {ride.complaints.map((record) => (
            <li key={record.id}>
              {record.id} · {record.content}
            </li>
          ))}
        </ul>
      )}
    </P5Card>
  );
}

export interface LiveRideSummary {
  id: string;
  orderNo: string;
  status: string;
  pickup: string;
  dropoff: string;
  scheduledAt: string;
  canCancel: boolean;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(T.message088);
  return value as Record<string, unknown>;
}
/** Only fields needed by the live summary; accept the formal snake_case wire. */
export function liveRideSummary(value: unknown): LiveRideSummary {
  const ride = object(value);
  const order = object(ride.order);
  const pickup = object(order.pickup);
  const dropoff = object(order.dropoff);
  const id = order.order_id ?? order.orderId;
  const orderNo = order.order_no ?? order.orderNo;
  const scheduledAt = order.requested_pickup_at ?? order.requestedPickupAt;
  if (
    typeof id !== "string" ||
    typeof orderNo !== "string" ||
    typeof order.status !== "string" ||
    typeof scheduledAt !== "string" ||
    typeof pickup.address !== "string" ||
    typeof dropoff.address !== "string"
  )
    throw new Error(T.message088);
  const actions = object(ride.actions);
  return {
    id,
    orderNo,
    status: order.status,
    pickup: pickup.address,
    dropoff: dropoff.address,
    scheduledAt,
    canCancel: (actions.can_cancel ?? actions.canCancel) === true,
  };
}
export async function readLiveRideData(
  path: string,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  const response = await passengerFetch(`/api/passenger-app/${path}`, init);
  if (!response.ok)
    throw new Error(response.status === 401 ? T.message087 : T.message088);
  return object(object(await response.json()).data);
}
export function liveRideStatus(status: string) {
  const labels: Record<string, string> = {
    reserved: T.message089,
    created: T.message090,
    submitted: T.message001,
    matching: T.message091,
    assigned: T.message092,
    driver_accepted: T.message002,
    enroute_pickup: T.message093,
    arrived_pickup: T.message003,
    on_trip: T.message004,
    proof_pending: T.message094,
    completed: T.message095,
    cancelled: T.message096,
    redispatch_required: T.message097,
    dispatch_failed: T.message098,
    dispatch_timeout: T.message099,
    no_supply: T.message100,
    delayed_queue: T.message001,
    exception_hold: T.message101,
  };
  return labels[status] ?? status;
}
function LiveRideScreen({ rideId }: { rideId: string }) {
  const [ride, setRide] = useState<LiveRideSummary | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [cancelPrompt, setCancelPrompt] = useState(false);
  useEffect(() => {
    if (!rideId) return;
    let active = true;
    setError("");
    setRide(null);
    void readLiveRideData(`rides/${encodeURIComponent(rideId)}`)
      .then((data) => {
        if (active) setRide(liveRideSummary(data.ride));
      })
      .catch((reason: unknown) => {
        if (active)
          setError(reason instanceof Error ? reason.message : T.message102);
      });
    return () => {
      active = false;
    };
  }, [rideId, refresh]);
  return (
    <AuthScreen title={T.message015} account>
      {!rideId ? (
        <AuthAlert kind="info">{T.message103}</AuthAlert>
      ) : error ? (
        <>
          <AuthAlert>{error}</AuthAlert>
          <Link href="/login">{T.message021}</Link>
          <P5Btn onClick={() => setRefresh((value) => value + 1)}>
            {T.message104}
          </P5Btn>
        </>
      ) : !ride ? (
        <p role="status">{T.message105}</p>
      ) : (
        <>
          <P5Eta main={liveRideStatus(ride.status)} sub={ride.orderNo} />
          <P5Card title={T.message028}>
            <p>
              {T.message106}
              {ride.pickup}
            </p>
            <p>
              {T.message107}
              {ride.dropoff}
            </p>
            <p>
              {T.message108}
              {rideTime(ride.scheduledAt)}
            </p>
            <P5Btn onClick={() => setRefresh((value) => value + 1)}>
              {T.message109}
            </P5Btn>
          </P5Card>
          {ride.canCancel && (
            <P5Card title={T.message038}>
              {cancelPrompt ? (
                <>
                  <p>{T.message110}</p>
                  <P5Btn
                    disabled={busy}
                    danger
                    onClick={() => {
                      setBusy(true);
                      void readLiveRideData(
                        `rides/${encodeURIComponent(ride.id)}/cancel`,
                        {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            rideId: ride.id,
                            reason: "passenger_requested",
                          }),
                        },
                      )
                        .then(() => {
                          setCancelPrompt(false);
                          setRefresh((value) => value + 1);
                        })
                        .catch((reason: unknown) =>
                          setError(
                            reason instanceof Error
                              ? reason.message
                              : T.message111,
                          ),
                        )
                        .finally(() => setBusy(false));
                    }}
                  >
                    {T.message041}
                  </P5Btn>
                  <P5Btn
                    disabled={busy}
                    kind="ghost"
                    onClick={() => setCancelPrompt(false)}
                  >
                    {T.message042}
                  </P5Btn>
                </>
              ) : (
                <P5Btn danger onClick={() => setCancelPrompt(true)}>
                  {T.message043}
                </P5Btn>
              )}
            </P5Card>
          )}
        </>
      )}
      <RideNavigation />
    </AuthScreen>
  );
}
