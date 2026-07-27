"use client";

import { type CSSProperties, useState, useTransition } from "react";
import type {
  BookingRecord,
  OwnedOrderRecord,
  OwnedOrderStatus,
} from "@drts/contracts";
import {
  AIRPORT_FAQ,
  AIRPORT_FEATURES,
  AIRPORT_STEPS,
  AIRPORT_VEHICLES,
  type AirportBank,
} from "@/lib/airport-site-data";
import { useTranslation } from "@/lib/i18n";
import "./airport-transfer-site.css";

// Faithful React port of the design canvas
// docs/05-ui/drts-design-canvas/bank-sites (機場接送 Bank Sites.html + at-app.js).
// `mode="site"` = the per-bank official airport-transfer website (desktop).
// `mode="embed"` = the same site inside the bank's online-banking app webview.

type Mode = "site" | "embed";

export type AirportTransferBookingSubmission = {
  address: string;
  date: string;
  direction: "out" | "in";
  flightNo: string;
  luggageCount: number;
  passengerName: string;
  phone: string;
  terminal: string;
  time: string;
  reservationWindowStart?: string;
  reservationWindowEnd?: string;
  vehicleId: string;
  vehicleName: string;
};

export type AirportTransferBookingResult = {
  bookingId: string;
  orderId: string;
  eligibilityVerificationId: string | null;
  confirmation: BookingRecord;
  receipt: OwnedOrderRecord;
};

function Ic({ d, s = 20, sw = 1.9 }: { d: string; s?: number; sw?: number }) {
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

const nf = (n: number) => "NT$ " + n.toLocaleString("en-US");

function formatReceiptEta(iso: string | null, locale: "en-US" | "zh-TW") {
  if (!iso) {
    return null;
  }

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat(locale, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function buildReservationWindowIso(
  date: string,
  time: string,
): {
  reservationWindowStart: string;
  reservationWindowEnd: string;
} {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const start = new Date(
    year || 1970,
    (month || 1) - 1,
    day || 1,
    hour || 0,
    minute || 0,
    0,
    0,
  );
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

  return {
    reservationWindowStart: start.toISOString(),
    reservationWindowEnd: end.toISOString(),
  };
}

function formatStatusLabel(
  status: OwnedOrderStatus | BookingRecord["orderStatus"] | null | undefined,
  t: (key: string) => string,
) {
  if (!status) {
    return "—";
  }

  const key = `airport.status.${status}`;
  const label = t(key);
  return label === key ? status : label;
}

export function AirportTransferSite({
  bank,
  mode = "site",
  onSubmitBooking,
  embedSessionReady = true,
  embeddedPassengerName,
  embeddedCardLast4,
  initialFlightNo,
  embedReferenceToken,
  embedBenefitReference,
  defaultRideDate,
}: {
  bank: AirportBank;
  mode?: Mode;
  onSubmitBooking?: (
    submission: AirportTransferBookingSubmission,
  ) => Promise<AirportTransferBookingResult>;
  embedSessionReady?: boolean;
  embeddedPassengerName?: string | null;
  embeddedCardLast4?: string | null;
  initialFlightNo?: string | null;
  embedReferenceToken?: string | null;
  embedBenefitReference?: string | null;
  defaultRideDate?: string;
}) {
  const { locale, t } = useTranslation();
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState(1);
  const [dir, setDir] = useState<"out" | "in">("out");
  const [vehId, setVehId] = useState("sedan");
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [bookingResult, setBookingResult] =
    useState<AirportTransferBookingResult | null>(null);
  const passengerName =
    embeddedPassengerName?.trim() || bank.holder.name || "Passenger";
  const [form, setForm] = useState({
    terminal: "桃園 T2 · 第二航廈",
    flight: initialFlightNo?.trim() || "BR198",
    addr: "台北市信義區松仁路 100 號",
    date: defaultRideDate ?? "",
    time: "05:30",
    bags: "2 件",
    phone: "0912-555-401",
  });

  // Canonical terminal / luggage option values stay stable (Taiwanese place
  // data); only the visible label is localized via the dictionary.
  const terminalOptions: { value: string; key: string }[] = [
    { value: "桃園 T1 · 第一航廈", key: "airport.terminal.t1" },
    { value: "桃園 T2 · 第二航廈", key: "airport.terminal.t2" },
    { value: "松山 TSA", key: "airport.terminal.tsa" },
  ];
  const bagOptions: { value: string; key: string }[] = [
    { value: "1 件", key: "airport.bags.1" },
    { value: "2 件", key: "airport.bags.2" },
    { value: "3 件", key: "airport.bags.3" },
    { value: "4 件以上", key: "airport.bags.4plus" },
  ];

  const veh =
    AIRPORT_VEHICLES.find((v) => v.id === vehId) ?? AIRPORT_VEHICLES[0]!;
  const rem = bank.quota.total - bank.quota.used;
  const out = dir === "out";

  function goStep(n: number) {
    setStep(n);
  }

  function buildSubmission(): AirportTransferBookingSubmission {
    const reservationWindow = buildReservationWindowIso(form.date, form.time);

    return {
      address: form.addr,
      date: form.date,
      direction: dir,
      flightNo: form.flight,
      luggageCount: Number.parseInt(form.bags.replace(/[^0-9]/g, ""), 10) || 0,
      passengerName,
      phone: form.phone,
      reservationWindowStart: reservationWindow.reservationWindowStart,
      reservationWindowEnd: reservationWindow.reservationWindowEnd,
      terminal: form.terminal,
      time: form.time,
      vehicleId: veh.id,
      vehicleName: veh.name,
    };
  }

  const themeVars = {
    "--primary": bank.co.primary,
    "--primary-dark": bank.co.primaryDark,
    "--accent": bank.co.accent,
    "--accent-soft": bank.co.accentSoft,
    "--tint": bank.co.tint,
  } as CSSProperties;

  const panelTitles: Record<number, [string, string]> = {
    1: [t("airport.panel.1.title"), t("airport.panel.1.sub")],
    2: [t("airport.panel.2.title"), t("airport.panel.2.sub")],
    3: [t("airport.panel.3.title"), t("airport.panel.3.sub")],
    4: [t("airport.panel.4.title"), t("airport.panel.4.sub")],
    5: [t("airport.panel.5.title"), t("airport.panel.5.sub")],
  };
  const [panelTitle, panelSub] = panelTitles[step] ?? panelTitles[1]!;

  const confirmRows: [string, string][] = [
    [
      t("airport.confirm.service"),
      t("airport.nav.service") +
        " · " +
        (out ? t("airport.confirm.outbound") : t("airport.confirm.inbound")),
    ],
    [t("airport.confirm.flightTerminal"), form.flight + " · " + form.terminal],
    [
      out ? t("airport.confirm.pickup") : t("airport.confirm.dropoff"),
      form.addr,
    ],
    [
      out ? t("airport.confirm.to") : t("airport.confirm.from"),
      form.terminal.split(" ")[0] + " " + t("airport.unit.airport"),
    ],
    [t("airport.confirm.time"), form.date + " " + form.time],
    [t("airport.confirm.vehiclePassenger"), veh.name + " · " + form.phone],
  ];
  const bookingId = bookingResult?.bookingId ?? "—";
  const receipt = bookingResult?.receipt ?? null;
  const confirmation = bookingResult?.confirmation ?? null;
  const receiptDistance = "—";
  const receiptStatus = formatStatusLabel(
    receipt?.status ?? confirmation?.orderStatus ?? "created",
    t,
  );
  const receiptEta =
    receipt?.etaSnapshot?.etaMinutes != null
      ? `${receipt.etaSnapshot.etaMinutes}`
      : null;
  const receiptReplyEta =
    receiptEta ??
    formatReceiptEta(
      receipt?.reservationWindowStart ??
        confirmation?.reservationWindowStart ??
        null,
      locale === "zh" ? "zh-TW" : "en-US",
    ) ??
    t("airport.success.within2min");
  const receiptRoute =
    receipt?.pickup.address && receipt?.dropoff.address
      ? `${receipt.pickup.address} -> ${receipt.dropoff.address}`
      : (receipt?.dropoff.address ?? form.terminal);
  const trackVehicle = receipt?.vehiclePreference ?? receipt?.notes ?? veh.name;

  const site = (
    <div className="site" id="top" data-program-surface={mode}>
      {/* nav */}
      <header className="nav">
        <div className="nav-in">
          <a className="brand" href="#top">
            <span className="mk">{bank.mark}</span>
            <span>
              <span className="bn">{bank.nameZh}</span>
              <span className="bs">{bank.nameEn}</span>
            </span>
            <span className="div" />
            <span className="svc">{t("airport.nav.service")}</span>
          </a>
          <nav className="nav-links">
            <a href="#service">{t("airport.nav.intro")}</a>
            <a href="#vehicles">{t("airport.nav.vehicles")}</a>
            <a href="#coverage">{t("airport.nav.coverage")}</a>
            <a href="#process">{t("airport.nav.process")}</a>
            <a href="#faq">{t("airport.nav.faq")}</a>
          </nav>
          <div className="nav-right">
            <span className="holder-chip">
              <span className="dot" />
              {passengerName} · {bank.card}
            </span>
            <a href="#book" className="btn btn-primary">
              {t("airport.nav.book")}
            </a>
          </div>
        </div>
      </header>

      {/* hero */}
      <section id="hero" className="hero">
        <div className="hero-in">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="ln" />
              {bank.tier} · {t("airport.hero.privilege")}
            </div>
            <h1 className={bank.serif ? "serif" : undefined}>{bank.hero}</h1>
            <p className="lede">{bank.heroSub}</p>
            <div className="hero-cta">
              <a href="#book" className="btn btn-primary btn-lg">
                {t("airport.hero.bookCta")}{" "}
                <span className="ar">
                  <Ic d="M5 12h14M13 6l6 6-6 6" s={17} sw={2.2} />
                </span>
              </a>
              <a href="#book" className="btn btn-outline btn-lg">
                {t("airport.hero.myTrips")}
              </a>
            </div>
            <div className="hero-perks">
              {bank.perks.map((p) => (
                <div className="pk" key={p}>
                  <Ic d="M5 12l5 5L20 7" s={17} sw={2.2} />
                  {p}
                </div>
              ))}
            </div>
            <div className="trust">
              <Ic
                d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z"
                s={15}
                sw={2}
              />
              {t("airport.hero.trustLead")}{" "}
              <span className="op">{t("airport.operator")}</span>{" "}
              {t("airport.hero.trustTail")}
            </div>
          </div>
          <div className="hero-vis">
            <div className="card-art">
              <div className="ct">
                <div className="tier">{bank.tier}</div>
                <div className="bk">{bank.nameZh}</div>
              </div>
              <div>
                <div className="chip" />
                <div className="num">
                  5412 •••• •••• {embeddedCardLast4 ?? bank.holder.last4}
                </div>
              </div>
              <div className="cb">
                <span className="nm">{passengerName}</span>
                <span className="vt">{bank.card}</span>
              </div>
            </div>
            <div className="quota-float">
              <div className="ql">{t("airport.quota.remaining")}</div>
              <div className="qn">
                <b>{rem}</b>
                <span>
                  / {bank.quota.total} {t("airport.unit.trips")}
                </span>
              </div>
              <div className="quota-bar">
                <i
                  style={{
                    width: Math.round((rem / bank.quota.total) * 100) + "%",
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* features */}
      <section id="service" className="blk">
        <div className="wrap">
          <div className="sec-head center">
            <div className="sec-kicker">{t("airport.features.kicker")}</div>
            <h2>{t("airport.features.title")}</h2>
            <p>{t("airport.features.body")}</p>
          </div>
          <div className="feat-grid">
            {AIRPORT_FEATURES.map((f) => (
              <div className="feat" key={f.t}>
                <div className="ic">
                  <Ic d={f.p} s={22} />
                </div>
                <h3>{f.t}</h3>
                <p>{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* vehicles */}
      <section id="vehicles" className="blk alt">
        <div className="wrap">
          <div className="sec-head">
            <div className="sec-kicker">Fleet</div>
            <h2>{t("airport.vehicles.title")}</h2>
            <p>{t("airport.vehicles.body")}</p>
          </div>
          <div className="veh-grid">
            {AIRPORT_VEHICLES.map((v) => (
              <div className="veh" key={v.id}>
                <div className="vh">
                  <span className="badge">{v.en}</span>
                  <svg
                    width="84"
                    height="44"
                    viewBox="0 0 84 44"
                    fill="none"
                    stroke="var(--primary)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M8 32h68M14 32l5-13h46l5 13M26 19v13M58 19v13" />
                    <circle cx="24" cy="32" r="5" fill="var(--bg)" />
                    <circle cx="60" cy="32" r="5" fill="var(--bg)" />
                  </svg>
                </div>
                <div className="vb">
                  <h3>{v.name}</h3>
                  <div className="en">{v.models}</div>
                  <div className="specs">
                    <div>
                      <span>{t("airport.spec.passengers")}</span>
                      <b>{v.seats}</b>
                    </div>
                    <div>
                      <span>{t("airport.spec.luggage")}</span>
                      <b>{v.luggage}</b>
                    </div>
                  </div>
                  <div className="note">{v.note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* coverage */}
      <section id="coverage" className="blk">
        <div className="wrap">
          <div className="cov">
            <div>
              <div className="sec-head" style={{ marginBottom: 26 }}>
                <div className="sec-kicker">Coverage</div>
                <h2>{t("airport.coverage.title")}</h2>
                <p>{t("airport.coverage.body")}</p>
              </div>
              <div className="cov-airports">
                <div className="ap">
                  <div className="t">{t("airport.coverage.airportsLabel")}</div>
                  <div className="n">{bank.airports[0]}</div>
                </div>
                <div className="ap">
                  <div className="t">{t("airport.coverage.cityLabel")}</div>
                  <div className="n">{bank.airports[1]}</div>
                </div>
              </div>
              <div className="cov-list">
                {bank.regions.map((r) => (
                  <div className="rg" key={r}>
                    <Ic
                      d="M12 21s7-5.4 7-11a7 7 0 10-14 0c0 5.6 7 11 7 11z"
                      s={15}
                      sw={2}
                    />
                    {r}
                  </div>
                ))}
              </div>
            </div>
            <div className="cov-map">
              <div className="mt">{t("airport.coverage.mapTitle")}</div>
              <div className="mh">
                {t("airport.coverage.mapHeadline")}
                <br />
                {t("airport.coverage.mapSub")}
              </div>
              <span className="pin" style={{ top: "24%", right: "30%" }} />
              <span className="pin" style={{ top: "40%", right: "36%" }} />
              <span className="pin" style={{ top: "62%", right: "42%" }} />
              <span className="pin" style={{ top: "78%", right: "30%" }} />
              <svg
                className="tw"
                viewBox="0 0 120 200"
                fill="rgba(255,255,255,.16)"
                aria-hidden
              >
                <path d="M70 8c10 14 14 30 18 52s10 50 4 74-22 44-34 52-22 4-30-8-10-32-6-58 14-58 22-86 16-40 26-26z" />
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* process */}
      <section id="process" className="blk alt">
        <div className="wrap">
          <div className="sec-head center">
            <div className="sec-kicker">{t("airport.process.kicker")}</div>
            <h2>{t("airport.process.title")}</h2>
          </div>
          <div className="steps">
            {AIRPORT_STEPS.map((s) => (
              <div className="step" key={s.n}>
                <div className="sn">{s.n}</div>
                <h4>{s.t}</h4>
                <p>{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* booking widget */}
      <section id="book" className="book">
        <div className="book-in">
          <div className="book-copy">
            <div className="sec-kicker" style={{ color: "var(--accent)" }}>
              {t("airport.book.kicker")}
            </div>
            <h2 className={bank.serif ? "serif" : undefined}>
              {t("airport.book.title")}
            </h2>
            <p>{t("airport.book.intro", { card: bank.card })}</p>
            <div className="bperk">
              <Ic d="M5 13l4 4L19 7" s={18} sw={2} /> {t("airport.book.perk1")}
            </div>
            <div className="bperk">
              <Ic d="M12 6v6l4 2" s={18} sw={2} /> {t("airport.book.perk2")}
            </div>
            <div className="bperk">
              <Ic d="M3 11l19-9-9 19-2-8z" s={18} sw={2} />{" "}
              {t("airport.book.perk3")}
            </div>
          </div>

          <div className="panel" id="book-panel">
            <div className="panel-head">
              <div>
                <div className="pt">{panelTitle}</div>
                <div className="ps">{panelSub}</div>
              </div>
              <div className="progress">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className={"pd" + (i < Math.min(step, 3) ? " on" : "")}
                  />
                ))}
              </div>
            </div>
            <div className="panel-body">
              {mode === "embed" ? (
                <div className="summ" style={{ marginBottom: "16px" }}>
                  <div className="sr">
                    <span className="k">
                      {t("program.embed.handoff.signature")}
                    </span>
                    <span className="v">issuer_signature</span>
                  </div>
                  <div className="sr">
                    <span className="k">
                      {t("program.embed.handoff.token")}
                    </span>
                    <span className="v">
                      {embedReferenceToken?.trim() || "ref_token"}
                    </span>
                  </div>
                  <div className="sr">
                    <span className="k">{t("airport.book.cardLast4")}</span>
                    <span className="v">
                      {embeddedCardLast4 ? `•••• ${embeddedCardLast4}` : "—"}
                    </span>
                  </div>
                  <div className="sr">
                    <span className="k">
                      {t("program.embed.handoff.benefit")}
                    </span>
                    <span className="v">
                      {embedBenefitReference?.trim() ||
                        t("program.embed.handoff.benefitValue")}
                    </span>
                  </div>
                </div>
              ) : null}
              {step === 1 && (
                <div className="bstep">
                  <div className="elig">
                    <div className="ek" />
                    <div className="et">
                      <div className="a">
                        {bank.nameZh} · {bank.card}
                      </div>
                      <div className="b">
                        {t("airport.book.cardLast4")} {bank.holder.last4} ·{" "}
                        {bank.holder.name}
                      </div>
                    </div>
                    <span className="ok">
                      <Ic d="M5 12l5 5L20 7" s={12} sw={3} />{" "}
                      {t("book.eligibility.ready")}
                    </span>
                  </div>
                  <div className="summ">
                    <div className="sr">
                      <span className="k">{t("airport.book.cardStatus")}</span>
                      <span className="v">{bank.tier}</span>
                    </div>
                    <div className="sr">
                      <span className="k">{t("airport.book.freeTrips")}</span>
                      <span className="v">
                        {rem} / {bank.quota.total} {t("airport.unit.trips")}
                      </span>
                    </div>
                    <div className="sr">
                      <span className="k">{t("airport.nav.coverage")}</span>
                      <span className="v">
                        {t("airport.book.coverageValue")}
                      </span>
                    </div>
                  </div>
                  <p className="fineprint">
                    {t("airport.book.step1.fineprint")}
                  </p>
                  <div className="bfoot">
                    <button
                      className="btn btn-primary btn-block btn-lg"
                      onClick={() => goStep(2)}
                    >
                      {t("airport.book.start")}{" "}
                      <span className="ar">
                        <Ic d="M5 12h14M13 6l6 6-6 6" s={16} sw={2.2} />
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="bstep">
                  <div className="seg">
                    <button aria-pressed={out} onClick={() => setDir("out")}>
                      {t("airport.book.dirOut")}
                    </button>
                    <button aria-pressed={!out} onClick={() => setDir("in")}>
                      {t("airport.book.dirIn")}
                    </button>
                  </div>
                  <div className="fgrid">
                    <div className="field">
                      <label>
                        {t("airport.field.terminal")}{" "}
                        <span className="rq">*</span>
                      </label>
                      <select
                        className="inp"
                        value={form.terminal}
                        onChange={(e) =>
                          setForm({ ...form, terminal: e.target.value })
                        }
                      >
                        {terminalOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {t(o.key)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>
                        {t("airport.field.flightNo")}{" "}
                        <span className="rq">*</span>
                      </label>
                      <input
                        className="inp"
                        value={form.flight}
                        onChange={(e) =>
                          setForm({ ...form, flight: e.target.value })
                        }
                      />
                    </div>
                    <div className="field col2">
                      <label>
                        {out
                          ? t("airport.field.pickupCity")
                          : t("airport.field.dropoffCity")}{" "}
                        <span className="rq">*</span>
                      </label>
                      <input
                        className="inp"
                        value={form.addr}
                        onChange={(e) =>
                          setForm({ ...form, addr: e.target.value })
                        }
                      />
                    </div>
                    <div className="field">
                      <label>
                        {t("airport.field.date")} <span className="rq">*</span>
                      </label>
                      <input
                        className="inp"
                        value={form.date}
                        onChange={(e) =>
                          setForm({ ...form, date: e.target.value })
                        }
                      />
                    </div>
                    <div className="field">
                      <label>
                        {t("airport.field.time")} <span className="rq">*</span>
                      </label>
                      <input
                        className="inp"
                        value={form.time}
                        onChange={(e) =>
                          setForm({ ...form, time: e.target.value })
                        }
                      />
                    </div>
                    <div className="field">
                      <label>{t("airport.field.bags")}</label>
                      <select
                        className="inp"
                        value={form.bags}
                        onChange={(e) =>
                          setForm({ ...form, bags: e.target.value })
                        }
                      >
                        {bagOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {t(o.key)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>
                        {t("airport.field.phone")} <span className="rq">*</span>
                      </label>
                      <input
                        className="inp"
                        value={form.phone}
                        onChange={(e) =>
                          setForm({ ...form, phone: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label>
                      {t("airport.field.vehicle")} <span className="rq">*</span>
                    </label>
                    <div className="vehpick">
                      {AIRPORT_VEHICLES.map((v) => (
                        <button
                          key={v.id}
                          aria-pressed={v.id === vehId}
                          onClick={() => setVehId(v.id)}
                        >
                          <div className="vn">{v.name}</div>
                          <div className="vs">{v.seats}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="bfoot">
                    <button
                      className="btn btn-outline"
                      onClick={() => goStep(1)}
                    >
                      {t("airport.btn.back")}
                    </button>
                    <button
                      className="btn btn-primary btn-block"
                      onClick={() => goStep(3)}
                    >
                      {t("airport.btn.toConfirm")}{" "}
                      <span className="ar">
                        <Ic d="M5 12h14M13 6l6 6-6 6" s={16} sw={2.2} />
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="bstep">
                  <div className="summ">
                    {confirmRows.map(([k, v]) => (
                      <div className="sr" key={k}>
                        <span className="k">{k}</span>
                        <span className="v">{v}</span>
                      </div>
                    ))}
                  </div>
                  <div className="summ">
                    <div className="sr">
                      <span className="k">{t("airport.fee.base")}</span>
                      <span className="v">{nf(veh.fare)}</span>
                    </div>
                    <div className="sr">
                      <span className="k">
                        {bank.card} {t("airport.fee.benefitDiscount")}
                      </span>
                      <span className="v">− {nf(veh.fare)}</span>
                    </div>
                    <div className="sr total">
                      <span className="k">{t("airport.fee.youPay")}</span>
                      <span className="v">
                        <span className="free-tag">
                          <Ic d="M5 12l5 5L20 7" s={12} sw={3} />{" "}
                          {t("airport.fee.free")}
                        </span>
                      </span>
                    </div>
                  </div>
                  <p className="fineprint">
                    {t("airport.book.step3.fineprintLead")} {bank.nameZh}{" "}
                    {t("airport.book.step3.fineprintTail")}
                  </p>
                  {submitError ? (
                    <p
                      className="fineprint"
                      style={{ color: "var(--primary-dark)" }}
                    >
                      {submitError}
                    </p>
                  ) : null}
                  <div className="bfoot">
                    <button
                      className="btn btn-outline"
                      onClick={() => goStep(2)}
                    >
                      {t("airport.btn.backEdit")}
                    </button>
                    <button
                      className="btn btn-primary btn-block"
                      onClick={() => {
                        if (!onSubmitBooking) {
                          setSubmitError(
                            t("airport.embed.error.submitUnavailable"),
                          );
                          return;
                        }
                        setSubmitError(null);
                        startTransition(async () => {
                          try {
                            const result =
                              await onSubmitBooking(buildSubmission());
                            setBookingResult(result);
                            setStep(4);
                          } catch (error) {
                            setSubmitError(
                              error instanceof Error
                                ? error.message
                                : t("airport.embed.error.submitFailed"),
                            );
                          }
                        });
                      }}
                    >
                      {isPending
                        ? t("airport.embed.submitting")
                        : t("airport.btn.submit")}
                    </button>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="bstep">
                  <div className="done-wrap">
                    <div className="done-ring">
                      <svg
                        width="36"
                        height="36"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#15803D"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h3>{t("airport.success.title")}</h3>
                    <div className="bk">{bookingId}</div>
                  </div>
                  <div className="summ">
                    <div className="sr">
                      <span className="k">{t("airport.label.status")}</span>
                      <span className="v">{receiptStatus}</span>
                    </div>
                    <div className="sr">
                      <span className="k">{t("airport.label.orderId")}</span>
                      <span className="v">{bookingResult?.orderId ?? "—"}</span>
                    </div>
                    <div className="sr">
                      <span className="k">
                        {t("airport.label.eligibility")}
                      </span>
                      <span className="v">
                        {bookingResult?.eligibilityVerificationId ?? "—"}
                      </span>
                    </div>
                    <div className="sr">
                      <span className="k">{t("airport.success.eta")}</span>
                      <span className="v">{receiptReplyEta}</span>
                    </div>
                    <div className="sr">
                      <span className="k">{t("airport.success.notify")}</span>
                      <span className="v">
                        {t("airport.success.notifyValue")}
                      </span>
                    </div>
                  </div>
                  <div className="bfoot">
                    <button
                      className="btn btn-primary btn-block btn-lg"
                      onClick={() => goStep(5)}
                    >
                      {t("airport.btn.track")}
                    </button>
                  </div>
                </div>
              )}

              {step === 5 && (
                <div className="bstep">
                  <div className="track-map">
                    <svg
                      width="100%"
                      height="100%"
                      viewBox="0 0 360 160"
                      preserveAspectRatio="none"
                      aria-hidden
                    >
                      <path
                        d="M30,130 L100,100 L180,86 L260,60 L330,30"
                        stroke="var(--primary)"
                        strokeWidth="3.5"
                        fill="none"
                        strokeLinecap="round"
                      />
                      <circle cx="30" cy="130" r="7" fill="var(--primary)" />
                      <circle
                        cx="330"
                        cy="30"
                        r="7"
                        fill="var(--accent)"
                        stroke="#fff"
                        strokeWidth="2"
                      />
                      <circle cx="180" cy="86" r="9" fill="var(--primary)" />
                      <circle
                        cx="180"
                        cy="86"
                        r="15"
                        fill="var(--primary)"
                        fillOpacity="0.2"
                      />
                    </svg>
                  </div>
                  <div className="track-row">
                    <div className="av">{t("airport.track.driverInitial")}</div>
                    <div className="ti">
                      <div className="a">{t("airport.track.driverName")}</div>
                      <div className="b">{trackVehicle}</div>
                    </div>
                    <div className="eta">
                      <b>{receiptEta ?? "—"}</b>
                      <span>{t("airport.track.minutesToArrival")}</span>
                    </div>
                  </div>
                  <div className="summ">
                    <div className="sr">
                      <span className="k">{t("airport.label.distance")}</span>
                      <span className="v">{receiptDistance}</span>
                    </div>
                    <div className="sr">
                      <span className="k">{t("airport.label.status")}</span>
                      <span className="v">{receiptStatus}</span>
                    </div>
                    <div className="sr">
                      <span className="k">{t("airport.label.route")}</span>
                      <span className="v">{receiptRoute}</span>
                    </div>
                    <div className="sr">
                      <span className="k">{t("airport.success.eta")}</span>
                      <span className="v">{receiptReplyEta}</span>
                    </div>
                    <div className="sr">
                      <span className="k">{t("airport.label.orderId")}</span>
                      <span className="v">
                        {receipt?.orderNo ?? bookingResult?.orderId ?? "—"}
                      </span>
                    </div>
                  </div>
                  <div className="bfoot">
                    <button
                      className="btn btn-outline"
                      onClick={() => goStep(1)}
                    >
                      {t("airport.btn.doneBack")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="blk">
        <div className="wrap">
          <div className="sec-head center">
            <div className="sec-kicker">FAQ</div>
            <h2>{t("airport.faq.title")}</h2>
          </div>
          <div className="faq">
            {AIRPORT_FAQ.map((f, i) => (
              <div className="qa" key={f.q} aria-expanded={faqOpen === i}>
                <button onClick={() => setFaqOpen(faqOpen === i ? null : i)}>
                  {f.q}
                  <span className="qi">
                    <Ic d="M12 5v14M5 12h14" s={20} sw={2} />
                  </span>
                </button>
                <div className="ans">
                  <p>{f.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="ctaband">
        <h2 className={bank.serif ? "serif" : undefined}>
          {t("airport.cta.title")}
        </h2>
        <p>
          {t("airport.cta.bodyLead")}
          {bank.card}
          {t("airport.cta.bodyTail")}
        </p>
        <a href="#book" className="btn btn-primary btn-lg">
          {t("airport.hero.bookCta")}
        </a>
      </section>

      {/* footer */}
      <footer className="foot">
        <div className="foot-in">
          <div className="foot-top">
            <div>
              <div className="cobrand">
                <span className="mk">{bank.mark}</span>
                <span>
                  <span className="bn">{bank.nameZh}</span>
                  <br />
                  <span className="bs">{t("airport.footer.brandLine")}</span>
                </span>
              </div>
              <p
                style={{
                  maxWidth: "30em",
                  fontSize: 13,
                  lineHeight: 1.7,
                  margin: "18px 0 0",
                }}
              >
                {t("airport.footer.descLead")}
                {bank.nameZh}
                {t("airport.footer.descTail")}
              </p>
            </div>
            <div className="foot-cols">
              <div className="foot-col">
                <div className="ct">{t("airport.footer.colService")}</div>
                <a href="#service">{t("airport.nav.intro")}</a>
                <a href="#vehicles">{t("airport.footer.vehiclesIntro")}</a>
                <a href="#coverage">{t("airport.nav.coverage")}</a>
                <a href="#book">{t("airport.footer.onlineBooking")}</a>
              </div>
              <div className="foot-col">
                <div className="ct">{t("airport.footer.colSupport")}</div>
                <a href="#faq">{t("airport.nav.faq")}</a>
                <div>
                  {t("airport.footer.hotline")} {bank.support}
                </div>
                <div>{t("airport.footer.allDay")}</div>
              </div>
              <div className="foot-col">
                <div className="ct">{t("airport.footer.colTerms")}</div>
                <a href="#terms">{t("airport.footer.terms")}</a>
                <a href="#privacy">{t("airport.footer.privacy")}</a>
                <a href="#rules">{t("airport.footer.rules")}</a>
              </div>
            </div>
          </div>
          <div className="foot-bottom">
            <span>
              © 2026 {bank.nameZh} · {t("airport.footer.copyrightTail")}
            </span>
            <span className="op">
              {t("airport.footer.poweredBy")} <b>{t("airport.operator")}</b>{" "}
              {t("airport.footer.operatorEn")}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );

  if (mode === "embed") {
    return (
      <div className="atsite embed" style={themeVars}>
        <div className="phone">
          <div className="notch" />
          <div className="screen">
            <div className="statusbar">
              <span>09:41</span>
              <span className="ico">
                <svg
                  width="17"
                  height="12"
                  viewBox="0 0 17 12"
                  fill="currentColor"
                  aria-hidden
                >
                  <rect x="0" y="7" width="3" height="5" rx="1" />
                  <rect x="4.5" y="4.5" width="3" height="7.5" rx="1" />
                  <rect x="9" y="2" width="3" height="10" rx="1" />
                  <rect
                    x="13.5"
                    y="0"
                    width="3"
                    height="12"
                    rx="1"
                    opacity=".4"
                  />
                </svg>
              </span>
            </div>
            <div className="appbar">
              <button className="ab-btn" aria-label={t("airport.embed.back")}>
                <Ic d="M15 6l-6 6 6 6" s={18} sw={2.2} />
              </button>
              <div className="ab-t">
                {t("airport.nav.service")}
                <small>
                  {bank.nameZh} · {t("airport.embed.mobileBank")}
                </small>
              </div>
              <div className="ab-host">
                <Ic d="M7 11V7a5 5 0 0110 0v4" s={11} sw={2} />
                <span>{bank.host}</span>
              </div>
            </div>
            {!embedSessionReady ? (
              <div
                style={{
                  padding: "12px 16px",
                  background: "var(--accent-soft)",
                  borderBottom: "1px solid var(--accent)",
                  color: "var(--primary-dark)",
                  fontSize: "12px",
                  lineHeight: 1.6,
                }}
              >
                {t("airport.embed.error.missingCredentials")}
              </div>
            ) : null}
            <div className="webview">{site}</div>
          </div>
          <div className="embed-hint">{t("airport.embed.hint")}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="atsite" style={themeVars}>
      {site}
    </div>
  );
}
