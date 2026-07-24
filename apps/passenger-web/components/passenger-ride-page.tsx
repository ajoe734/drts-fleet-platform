"use client";

import Link from "next/link";
import {
  startTransition,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  getPassengerFixtureSourceLabel,
  getPassengerSourceCallout,
  getToneRamp,
  passengerChrome,
  resolvePassengerRideFixture,
} from "@/lib/passenger-presentation";
import {
  resolvePassengerDataMode,
  type PassengerRideFixture,
} from "@/lib/passenger-fixtures";
import {
  fetchPassengerRideAuthority,
  fetchPassengerReceipt,
  mapPassengerCertificate,
  mapPassengerRideAuthorityToFixture,
  PassengerAuthorityError,
  requestPassengerRideAction,
  subscribePassengerRideAuthority,
} from "@/lib/passenger-live";

function readQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const monoFont = '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace';
const shellInset = 14;
const starTone = passengerChrome.driverRealm.fg;

function Shell({
  token,
  sourceMode,
  children,
}: {
  token: string;
  sourceMode: "fixture" | "live";
  children: ReactNode;
}) {
  const source = getPassengerSourceCallout(sourceMode);

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        justifyContent: "center",
        padding: "24px 12px",
        background: `linear-gradient(180deg, ${passengerChrome.background} 0%, ${passengerChrome.info.bg} 100%)`,
      }}
    >
      <div style={{ width: "100%", maxWidth: 430 }}>
        <div
          style={{
            marginBottom: 14,
            borderRadius: 18,
            background: source.tone.bg,
            color: source.tone.fg,
            border: `1px solid ${source.tone.border}`,
            padding: "12px 14px",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 800 }}>{source.title}</div>
          <div style={{ marginTop: 4, fontSize: 12.5, lineHeight: 1.55 }}>
            {source.detail}
          </div>
          <div style={{ marginTop: 6, fontSize: 11, opacity: 0.92 }}>
            token `{token}` · {getPassengerFixtureSourceLabel(sourceMode)}
          </div>
        </div>
        <div
          style={{
            width: "100%",
            maxWidth: 390,
            margin: "0 auto",
            background: passengerChrome.background,
            borderRadius: 38,
            border: `10px solid ${passengerChrome.text}`,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            minHeight: 844,
            boxShadow: passengerChrome.shadow,
          }}
        >
          {children}
        </div>
      </div>
    </main>
  );
}

function TopChrome({
  token,
  status,
  order,
}: {
  token: string;
  status: string;
  order: string;
}) {
  return (
    <>
      <div
        style={{
          height: 40,
          background: passengerChrome.shellDark,
          color: passengerChrome.invert,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          padding: "0 20px 5px",
          fontSize: 12,
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        <span style={{ fontFamily: monoFont }}>14:29</span>
        <span style={{ opacity: 0.85, fontSize: 10.5, fontFamily: monoFont }}>
          ride.zhixing.tw/r/{token.slice(0, 4)}••
        </span>
        <span style={{ fontFamily: monoFont }}>5G ▮▮▮</span>
      </div>
      <div
        style={{
          background: passengerChrome.shellDark,
          color: passengerChrome.invert,
          padding: "10px 18px 14px",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            aria-hidden="true"
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              background: "rgba(255,255,255,.16)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            車
          </span>
          <span style={{ fontSize: 13, fontWeight: 700 }}>智行叫車</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontFamily: monoFont, fontSize: 10.5, opacity: 0.78 }}>
            {order}
          </span>
        </div>
        <div
          style={{
            fontSize: 19,
            fontWeight: 800,
            marginTop: 8,
            letterSpacing: 0.2,
          }}
        >
          {status}
        </div>
      </div>
    </>
  );
}

function Card({
  title,
  tag,
  children,
  dimmed,
  style,
}: {
  title?: string | undefined;
  tag?: ReactNode | undefined;
  children: ReactNode;
  dimmed?: boolean | undefined;
  style?: CSSProperties | undefined;
}) {
  return (
    <section
      style={{
        background: passengerChrome.card,
        border: `1px solid ${passengerChrome.border}`,
        borderRadius: 14,
        margin: `0 ${shellInset}px 12px`,
        overflow: "hidden",
        opacity: dimmed ? 0.55 : 1,
        ...style,
      }}
    >
      {title ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "11px 16px 0",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {title}
          {tag}
        </div>
      ) : null}
      <div style={{ padding: "11px 16px 14px" }}>{children}</div>
    </section>
  );
}

function EmptyState({
  tone,
  title,
  detail,
}: {
  tone: ReturnType<typeof getToneRamp>;
  title: string;
  detail: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: "0 28px",
        textAlign: "center",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          background: tone.bg,
          color: tone.fg,
          border: `1px solid ${tone.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 24,
          fontWeight: 700,
        }}
      >
        !
      </span>
      <div style={{ fontSize: 17, fontWeight: 800 }}>{title}</div>
      <div
        style={{
          fontSize: 12.5,
          color: passengerChrome.muted,
          lineHeight: 1.6,
        }}
      >
        {detail}
      </div>
    </div>
  );
}

function ProgressCard({ title, detail }: { title: string; detail: string }) {
  return (
    <Card>
      <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
        <span
          aria-hidden="true"
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            border: `3px solid ${passengerChrome.info.bg}`,
            borderTopColor: passengerChrome.shell,
            flexShrink: 0,
          }}
        />
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>{title}</div>
          <div
            style={{
              fontSize: 11.5,
              color: passengerChrome.muted,
              marginTop: 2,
            }}
          >
            {detail}
          </div>
        </div>
      </div>
    </Card>
  );
}

function InlineBanner({ fixture }: { fixture: PassengerRideFixture }) {
  if (!fixture.banner) return null;
  const tone = getToneRamp(fixture.banner.tone);
  const bordered = fixture.banner.tone !== "warning";

  return (
    <div
      style={{
        margin: "12px 14px 0",
        display: "flex",
        gap: 9,
        alignItems: "center",
        background: tone.bg,
        border: bordered
          ? `1px solid ${tone.border}`
          : `1px solid ${tone.border}`,
        borderRadius: 12,
        padding: "10px 14px",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          color: tone.fg,
          fontSize: 15,
          fontWeight: 800,
          flexShrink: 0,
        }}
      >
        {fixture.banner.tone === "success" ? "✓" : "!"}
      </span>
      <div style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: tone.fg }}>
        {fixture.banner.title}
      </div>
      {fixture.banner.meta ? (
        <span
          style={{
            fontSize: 10.5,
            color: passengerChrome.muted,
            fontFamily: monoFont,
          }}
        >
          {fixture.banner.meta}
        </span>
      ) : null}
    </div>
  );
}

function MapCard({ fixture }: { fixture: PassengerRideFixture }) {
  return (
    <div
      style={{
        margin: "12px 14px",
        borderRadius: 14,
        overflow: "hidden",
        border: `1px solid ${passengerChrome.border}`,
        background: `linear-gradient(140deg, ${passengerChrome.info.bg}, ${passengerChrome.card})`,
        height: 150,
        position: "relative",
        flexShrink: 0,
      }}
    >
      {fixture.mapState !== "missing" ? (
        <>
          <svg
            aria-hidden="true"
            width="100%"
            height="100%"
            viewBox="0 0 320 150"
            style={{ position: "absolute", inset: 0 }}
          >
            <path
              d="M50 120 C 120 90, 200 100, 310 44"
              fill="none"
              stroke={passengerChrome.shell}
              strokeWidth="3"
              strokeDasharray="1 7"
              strokeLinecap="round"
            />
          </svg>
          <div
            style={{
              position: "absolute",
              left: 38,
              top: 108,
              width: 26,
              height: 26,
              borderRadius: 13,
              background: passengerChrome.shell,
              border: `3px solid ${passengerChrome.invert}`,
              boxShadow: `0 2px 8px ${passengerChrome.info.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: passengerChrome.invert,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            車
          </div>
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              right: 64,
              top: 30,
              width: 22,
              height: 22,
              borderRadius: 11,
              background: passengerChrome.danger.fg,
            }}
          />
        </>
      ) : (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            color: passengerChrome.muted,
            fontSize: 12.5,
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 18 }}>
            ⌖
          </span>
          正在取得司機位置
        </div>
      )}
      <div
        style={{
          position: "absolute",
          left: 10,
          bottom: 10,
          fontSize: 10.5,
          background: passengerChrome.invert,
          padding: "3px 9px",
          borderRadius: 6,
          color: passengerChrome.muted,
        }}
      >
        上車：{fixture.pickupLabel}
      </div>
      {fixture.mapState === "fresh" ? (
        <div
          style={{
            position: "absolute",
            right: 10,
            top: 10,
            fontSize: 10,
            background: passengerChrome.invert,
            padding: "3px 8px",
            borderRadius: 6,
            color: passengerChrome.success.fg,
            fontWeight: 700,
          }}
        >
          位置更新於 5 秒前
        </div>
      ) : null}
      {fixture.mapState === "stale" ? (
        <div
          style={{
            position: "absolute",
            right: 10,
            top: 10,
            fontSize: 10.5,
            background: passengerChrome.warning.bg,
            border: `1px solid ${passengerChrome.warning.border}`,
            padding: "3px 8px",
            borderRadius: 6,
            color: passengerChrome.warning.fg,
            fontWeight: 700,
          }}
        >
          司機位置更新稍有延遲
        </div>
      ) : null}
    </div>
  );
}

function EtaBlock({ fixture }: { fixture: PassengerRideFixture }) {
  if (!fixture.etaMain) return null;
  const tone =
    fixture.etaTone === "success"
      ? passengerChrome.success.fg
      : passengerChrome.shell;

  return (
    <div
      style={{
        margin: "0 14px 12px",
        textAlign: "center",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          fontSize: 24,
          fontWeight: 800,
          color: tone,
          letterSpacing: -0.3,
        }}
      >
        {fixture.etaMain}
      </div>
      {fixture.etaSub ? (
        <div
          style={{
            fontSize: 12.5,
            color: passengerChrome.muted,
            marginTop: 2,
          }}
        >
          {fixture.etaSub}
        </div>
      ) : null}
    </div>
  );
}

function StatusSubline({ fixture }: { fixture: PassengerRideFixture }) {
  if (!fixture.statusSubline) return null;
  return (
    <div
      style={{
        margin: "0 14px 12px",
        textAlign: "center",
        fontSize: 12.5,
        color: passengerChrome.muted,
      }}
    >
      {fixture.statusSubline}
    </div>
  );
}

function VehicleCard({
  fixture,
  dimmed,
  tag,
  plateChanged,
}: {
  fixture: PassengerRideFixture;
  dimmed?: boolean;
  tag?: ReactNode;
  plateChanged?: boolean;
}) {
  if (!fixture.assignment) return null;
  const assignment = fixture.assignment;
  const rated = assignment.rating.displayState === "rated";
  const vehicleDetails = [
    `${assignment.vehicle.modelYear} 年出廠`,
    `${assignment.vehicle.doorCount} 門`,
    assignment.vehicle.color,
  ].filter((value): value is string => Boolean(value));

  return (
    <Card title="您的車輛與駕駛" dimmed={dimmed} tag={tag}>
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700 }}>
            {assignment.vehicle.make} {assignment.vehicle.model}
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: passengerChrome.muted,
              marginTop: 2,
            }}
          >
            {vehicleDetails.join(" · ")}
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontFamily: monoFont,
              fontSize: 27,
              fontWeight: 700,
              letterSpacing: 1.5,
              color: passengerChrome.text,
              border: `1.5px solid ${passengerChrome.border}`,
              borderRadius: 8,
              padding: "4px 12px",
              background: passengerChrome.background,
            }}
          >
            {assignment.vehicle.plateNo}
          </div>
          <div
            style={{
              fontSize: 10,
              color: plateChanged
                ? passengerChrome.warning.fg
                : passengerChrome.dim,
              fontWeight: plateChanged ? 700 : 400,
              marginTop: 3,
            }}
          >
            {plateChanged ? "車牌已更新，請重新核對" : "上車前請核對車牌"}
          </div>
        </div>
      </div>
      <div
        style={{
          borderTop: `1px solid ${passengerChrome.border}`,
          paddingTop: 10,
          display: "flex",
          gap: 12,
          alignItems: "flex-start",
        }}
      >
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            background: passengerChrome.info.bg,
            color: passengerChrome.shell,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 15,
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          {(assignment.driver.displayName || "駕").slice(0, 1)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 700 }}>
              {assignment.driver.displayName || "駕駛姓名未提供"}
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 10.5,
                fontWeight: 700,
                color: passengerChrome.success.fg,
                background: passengerChrome.success.bg,
                border: `1px solid ${passengerChrome.success.border}`,
                padding: "2px 8px",
                borderRadius: 999,
              }}
            >
              執登有效
            </span>
          </div>
          <div
            style={{
              fontSize: 11,
              color: passengerChrome.muted,
              marginTop: 3,
              fontFamily: monoFont,
            }}
          >
            {assignment.driver.registrationMaskedDisplay} · 有效至{" "}
            {assignment.driver.registrationEffectiveUntil}
          </div>
          <div style={{ marginTop: 6 }}>
            {rated ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "baseline",
                  gap: 6,
                }}
              >
                <span
                  style={{
                    color: starTone,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                  }}
                >
                  <span aria-hidden="true">★</span>
                  <b style={{ fontSize: 15, color: passengerChrome.text }}>
                    {assignment.rating.averageRating === null
                      ? "評價資料未提供"
                      : assignment.rating.averageRating.toFixed(1)}
                  </b>
                </span>
                <span style={{ fontSize: 11, color: passengerChrome.muted }}>
                  {assignment.rating.ratingCount} 則評價
                </span>
              </span>
            ) : (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: passengerChrome.shell,
                    background: passengerChrome.info.bg,
                    padding: "2px 9px",
                    borderRadius: 999,
                  }}
                >
                  新進駕駛
                </span>
                <span style={{ fontSize: 11, color: passengerChrome.muted }}>
                  尚無乘車評價
                </span>
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function FareCard({
  fixture,
  publicMode,
}: {
  fixture: PassengerRideFixture;
  publicMode?: boolean;
}) {
  if (publicMode && fixture.fareVersion) {
    return (
      <>
        <Card
          title="現行計費表"
          tag={
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: passengerChrome.success.fg,
                background: passengerChrome.success.bg,
                border: `1px solid ${passengerChrome.success.border}`,
                padding: "2px 8px",
                borderRadius: 999,
              }}
            >
              已生效
            </span>
          }
        >
          <div
            style={{
              fontSize: 11,
              color: passengerChrome.muted,
              marginBottom: 6,
            }}
          >
            版本 F-2026-03 · 生效日 2026/07/01 · 備查{" "}
            {fixture.fareVersion.authorityFilingRef}
          </div>
          {[
            ["起程運價（1.25 公里）", "NT$ 85"],
            ["續程運價（每 200 公尺）", "NT$ 5"],
            ["延滯計時（每 80 秒）", "NT$ 5"],
            ["夜間加成（23:00–06:00）", "+20%"],
          ].map(([label, value], index) => (
            <div
              key={label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "8px 0",
                borderBottom:
                  index < 3 ? `1px solid ${passengerChrome.border}` : undefined,
                fontSize: 12.5,
              }}
            >
              <span style={{ color: passengerChrome.muted }}>{label}</span>
              <b style={{ fontFamily: monoFont }}>{value}</b>
            </div>
          ))}
        </Card>
        <Card title="車資變更規則">
          <div
            style={{
              fontSize: 12,
              color: passengerChrome.muted,
              lineHeight: 1.65,
            }}
          >
            若乘客要求變更目的地、增加停靠點，或因依法需支付通行費，實際車資可能調整。固定報價行程以確認時之應付金額為準。
          </div>
        </Card>
      </>
    );
  }

  const isAnomaly = fixture.routeFareMode === "anomaly";
  return (
    <Card title="預估路線與車資">
      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            paddingTop: 4,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              border: `2px solid ${passengerChrome.shell}`,
            }}
          />
          <span
            style={{
              flex: 1,
              width: 2,
              background: passengerChrome.border,
              margin: "3px 0",
              minHeight: 14,
            }}
          />
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: passengerChrome.shell,
            }}
          />
        </div>
        <div style={{ flex: 1, fontSize: 12.5 }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>
            {fixture.pickupLabel}
          </div>
          <div style={{ fontWeight: 600 }}>{fixture.dropoffLabel}</div>
        </div>
        <div
          style={{
            fontSize: 11,
            color: passengerChrome.muted,
            textAlign: "right",
          }}
        >
          {fixture.routeDistanceKm}
          <br />
          {fixture.routeDurationMinutes}
        </div>
      </div>
      <div
        style={{
          borderTop: `1px solid ${passengerChrome.border}`,
          paddingTop: 10,
        }}
      >
        {isAnomaly ? (
          <div
            style={{
              background: passengerChrome.warning.bg,
              border: `1px solid ${passengerChrome.warning.border}`,
              borderRadius: 9,
              padding: "9px 12px",
            }}
          >
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 700,
                color: passengerChrome.warning.fg,
              }}
            >
              {fixture.routeFareText}
            </div>
            <div
              style={{
                fontSize: 11,
                color: passengerChrome.muted,
                marginTop: 2,
              }}
            >
              請稍後重試或聯絡客服
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 16.5, fontWeight: 800 }}>
              {fixture.routeFareText}
            </div>
            <div
              style={{
                fontSize: 11,
                color: passengerChrome.muted,
                marginTop: 2,
              }}
            >
              {fixture.routeFareHint}
            </div>
          </>
        )}
        {!isAnomaly ? (
          <div
            style={{
              fontSize: 10.5,
              color: passengerChrome.dim,
              marginTop: 8,
              lineHeight: 1.55,
            }}
          >
            若乘客要求變更目的地、增加停靠點，或因依法需支付通行費，實際車資可能調整。
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function PaymentCard({ fixture }: { fixture: PassengerRideFixture }) {
  if (!fixture.payment) return null;
  const tone = getToneRamp(fixture.payment.tone);
  return (
    <Card title="付款狀態">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "flex-start",
        }}
      >
        <div>
          <div style={{ color: tone.fg, fontSize: 13.5, fontWeight: 800 }}>
            {fixture.payment.label}
          </div>
          <div
            style={{
              color: passengerChrome.muted,
              fontSize: 11.5,
              lineHeight: 1.55,
              marginTop: 3,
            }}
          >
            {fixture.payment.detail}
          </div>
        </div>
        {fixture.payment.amountText ? (
          <b style={{ flexShrink: 0, fontFamily: monoFont, fontSize: 14 }}>
            {fixture.payment.amountText}
          </b>
        ) : null}
      </div>
    </Card>
  );
}

function CertificateCard({
  fixture,
  token,
}: {
  fixture: PassengerRideFixture;
  token: string;
}) {
  const [certificate, setCertificate] = useState(fixture.certificate);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    setCertificate(fixture.certificate);
  }, [fixture.certificate]);

  if (!certificate) return null;

  const retryRead = () => {
    if (fixture.canReadReceipt !== true || retrying) return;
    setRetrying(true);
    void fetchPassengerReceipt(token)
      .then((receipt) => {
        setCertificate(mapPassengerCertificate(receipt, true));
        setRetrying(false);
      })
      .catch((error: unknown) => {
        if (
          error instanceof PassengerAuthorityError &&
          error.code === "PASSENGER_RECEIPT_NOT_READY"
        ) {
          setCertificate({ state: "pending" });
        } else {
          setCertificate({
            state: "error",
            errorCode:
              error instanceof PassengerAuthorityError
                ? error.code
                : "PASSENGER_RECEIPT_REQUEST_FAILED",
          });
        }
        setRetrying(false);
      });
  };

  if (certificate.state === "pending") {
    return (
      <Card title="電子乘車證明">
        <div style={{ fontSize: 13.5, fontWeight: 800 }}>乘車證明準備中</div>
        <div
          style={{
            color: passengerChrome.muted,
            fontSize: 11.5,
            lineHeight: 1.55,
            marginTop: 4,
          }}
        >
          證明尚未產生。可重新讀取，但此頁不會要求後端重新開立。
        </div>
        {fixture.canReadReceipt === true ? (
          <button
            type="button"
            style={{ ...buttonStyle("secondary"), marginTop: 12 }}
            onClick={retryRead}
            disabled={retrying}
          >
            {retrying ? "讀取中..." : "重新讀取乘車證明"}
          </button>
        ) : null}
      </Card>
    );
  }

  if (certificate.state === "error") {
    return (
      <Card title="電子乘車證明">
        <div
          style={{
            border: `1px solid ${passengerChrome.danger.border}`,
            borderRadius: 10,
            background: passengerChrome.danger.bg,
            color: passengerChrome.danger.fg,
            padding: "10px 12px",
          }}
        >
          <div style={{ fontSize: 13.5, fontWeight: 800 }}>
            無法讀取完整乘車證明
          </div>
          <div style={{ fontSize: 11.5, lineHeight: 1.55, marginTop: 4 }}>
            系統不會以展示資料補齊缺少欄位。錯誤代碼：
            <span style={{ fontFamily: monoFont }}>
              {certificate.errorCode || "PASSENGER_RECEIPT_REQUEST_FAILED"}
            </span>
          </div>
        </div>
        {fixture.canReadReceipt === true ? (
          <button
            type="button"
            style={{ ...buttonStyle("secondary"), marginTop: 12 }}
            onClick={retryRead}
            disabled={retrying}
          >
            {retrying ? "讀取中..." : "重試讀取"}
          </button>
        ) : null}
      </Card>
    );
  }

  const rows = certificate.rows ?? [];
  return (
    <Card title="電子乘車證明">
      {rows.map((row, index) => (
        <div
          key={`${row.label}-${index}`}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            padding: "8px 0",
            borderBottom:
              index < rows.length - 1
                ? `1px solid ${passengerChrome.border}`
                : undefined,
            fontSize: 12.5,
          }}
        >
          <span style={{ color: passengerChrome.muted }}>{row.label}</span>
          <span
            style={{
              fontWeight: 600,
              fontFamily: row.mono ? monoFont : undefined,
              textAlign: "right",
            }}
          >
            {row.value}
          </span>
        </div>
      ))}
    </Card>
  );
}

function RatingStars({
  selectedScore,
  onSelect,
}: {
  selectedScore: number;
  onSelect: (score: number) => void;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
      {[1, 2, 3, 4, 5].map((value) => (
        <button
          key={value}
          type="button"
          aria-label={`${value} 星`}
          aria-pressed={selectedScore === value}
          onClick={() => onSelect(value)}
          style={{
            width: 46,
            height: 46,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: starTone,
            fontSize: 32,
            lineHeight: 1,
            border: 0,
            background: "transparent",
            cursor: "pointer",
            opacity: value <= selectedScore ? 1 : 0.28,
          }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function RatingCard({
  fixture,
  token,
  onSubmit,
}: {
  fixture: PassengerRideFixture;
  token: string;
  onSubmit?: (score: number) => void;
}) {
  const [selectedScore, setSelectedScore] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [submittedScore, setSubmittedScore] = useState<number | null>(null);
  if (!fixture.ratingSummary) return null;
  if (submittedScore !== null) {
    return (
      <Card>
        <div
          aria-live="polite"
          style={{ padding: "8px 0", textAlign: "center" }}
        >
          <div
            style={{
              color: passengerChrome.success.fg,
              fontSize: 16,
              fontWeight: 800,
            }}
          >
            評價已送出
          </div>
          <div
            style={{
              color: passengerChrome.muted,
              fontSize: 12,
              marginTop: 4,
            }}
          >
            本趟評價為 {submittedScore} 星；重整後仍以伺服器已評價狀態為準。
          </div>
        </div>
      </Card>
    );
  }
  const submitRating = () => {
    if (onSubmit) {
      onSubmit(selectedScore);
      return;
    }
    if (fixture.canRate === undefined) {
      setSubmittedScore(selectedScore);
      return;
    }
    if (fixture.canRate !== true || submitting) {
      return;
    }
    setSubmitting(true);
    void requestPassengerRideAction<{ score: number }>(token, "ratings", {
      score: selectedScore,
    })
      .then((rating) => {
        setSubmittedScore(rating.score);
        setSubmitting(false);
      })
      .catch((error: unknown) => {
        window.alert(
          error instanceof Error ? error.message : "PASSENGER_ACTION_FAILED",
        );
        setSubmitting(false);
      });
  };
  return (
    <Card>
      <div style={{ textAlign: "center", padding: "6px 0 2px" }}>
        <div style={{ fontSize: 17, fontWeight: 800 }}>這趟服務如何？</div>
        <div
          style={{ fontSize: 11.5, color: passengerChrome.muted, marginTop: 3 }}
        >
          {fixture.ratingSummary.countText}
        </div>
      </div>
      <div style={{ margin: "12px 0 4px" }}>
        <RatingStars
          selectedScore={selectedScore}
          onSelect={setSelectedScore}
        />
        <div
          style={{
            textAlign: "center",
            fontSize: 12.5,
            fontWeight: 700,
            color: starTone,
            marginTop: 4,
          }}
        >
          {selectedScore} 星
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 7,
          justifyContent: "center",
          marginTop: 8,
        }}
      >
        {fixture.ratingSummary.chips?.map((chip, index) => (
          <span
            key={chip}
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: "7px 13px",
              borderRadius: 999,
              border: `1px solid ${index < 2 ? passengerChrome.shell : passengerChrome.border}`,
              color: index < 2 ? passengerChrome.shell : passengerChrome.muted,
              background:
                index < 2 ? passengerChrome.info.bg : passengerChrome.card,
            }}
          >
            {chip}
          </span>
        ))}
      </div>
      <button
        type="button"
        style={{ ...buttonStyle("primary"), marginTop: 12 }}
        onClick={submitRating}
        disabled={fixture.canRate === false || submitting}
      >
        {fixture.canRate === false
          ? "目前無法評價"
          : submitting
            ? "送出中..."
            : "送出評價"}
      </button>
    </Card>
  );
}

function CompletedThanks() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: "0 30px",
        textAlign: "center",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          background: passengerChrome.success.bg,
          color: passengerChrome.success.fg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 26,
          fontWeight: 800,
        }}
      >
        ✓
      </span>
      <div style={{ fontSize: 18, fontWeight: 800 }}>感謝您的評價</div>
      <div style={{ fontSize: 12.5, color: passengerChrome.muted }}>
        您的意見會協助我們維持服務品質。
      </div>
    </div>
  );
}

function ContactUnavailableCard({
  fixture,
}: {
  fixture: PassengerRideFixture;
}) {
  if (!fixture.contactSafetyNote) return null;
  return (
    <div
      style={{
        margin: `0 ${shellInset}px 12px`,
        background: passengerChrome.card,
        border: `1px solid ${passengerChrome.border}`,
        borderRadius: 12,
        padding: "12px 14px",
      }}
    >
      <div style={{ display: "flex", gap: 9 }}>
        <span
          aria-hidden="true"
          style={{
            color: passengerChrome.shell,
            marginTop: 1,
            fontWeight: 800,
          }}
        >
          i
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            目前無法直接聯絡司機
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: passengerChrome.muted,
              marginTop: 2,
            }}
          >
            請改聯絡客服，我們會協助轉達。
          </div>
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <button type="button" style={buttonStyle("primary")}>
          聯絡客服 0800-090-000
        </button>
      </div>
    </div>
  );
}

function SeatbeltNotice() {
  return (
    <div
      role="status"
      style={{
        margin: `0 ${shellInset}px 12px`,
        display: "flex",
        gap: 11,
        alignItems: "flex-start",
        background: passengerChrome.warning.bg,
        border: `1px solid ${passengerChrome.warning.border}`,
        borderRadius: 12,
        padding: "11px 14px",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          color: passengerChrome.warning.fg,
          marginTop: 1,
          fontWeight: 800,
        }}
      >
        !
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          上車後請全程繫妥安全帶
        </div>
        <div
          style={{ fontSize: 11.5, color: passengerChrome.muted, marginTop: 2 }}
        >
          前後座乘客都需要繫安全帶。
        </div>
      </div>
      <span aria-hidden="true" style={{ color: passengerChrome.dim }}>
        ×
      </span>
    </div>
  );
}

function FooterNotice() {
  return (
    <div
      style={{
        margin: "auto 14px 14px",
        paddingTop: 6,
        fontSize: 10.5,
        color: passengerChrome.dim,
        textAlign: "center",
        flexShrink: 0,
      }}
    >
      本服務僅提供預約叫車
      <br />
      聯絡與申訴資訊以本趟權威資料為準
    </div>
  );
}

function buttonStyle(kind: "primary" | "secondary" | "ghost", danger = false) {
  const base: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    width: "100%",
    minHeight: 46,
    borderRadius: 12,
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    border: "1px solid transparent",
    fontFamily: "inherit",
  };

  if (kind === "primary") {
    return {
      ...base,
      background: danger ? passengerChrome.danger.fg : passengerChrome.shell,
      color: passengerChrome.invert,
    } satisfies CSSProperties;
  }

  if (kind === "ghost") {
    return {
      ...base,
      background: "transparent",
      color: danger ? passengerChrome.danger.fg : passengerChrome.muted,
    } satisfies CSSProperties;
  }

  return {
    ...base,
    background: passengerChrome.card,
    color: danger ? passengerChrome.danger.fg : passengerChrome.text,
    borderColor: danger
      ? passengerChrome.danger.border
      : passengerChrome.border,
  } satisfies CSSProperties;
}

function ActionGroup({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        margin: `0 ${shellInset}px 12px`,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {children}
    </div>
  );
}

function Actions({
  fixture,
  token,
  onCancel,
  onContact,
}: {
  fixture: PassengerRideFixture;
  token: string;
  onCancel?: () => void;
  onContact?: () => void;
}) {
  const [actionPending, setActionPending] = useState(false);
  const runLiveAction = (
    action: "cancel" | "contact",
    callback: (() => void) | undefined,
  ) => {
    if (callback) {
      callback();
      return;
    }
    if (fixture.canCancel === undefined || actionPending) {
      return;
    }
    if (action === "cancel" && !window.confirm("確定要取消這趟行程嗎？")) {
      return;
    }
    setActionPending(true);
    void requestPassengerRideAction<{
      contactUri?: string | null;
    }>(token, action)
      .then((result) => {
        if (action === "contact" && result.contactUri) {
          window.location.href = result.contactUri;
          return;
        }
        window.location.reload();
      })
      .catch((error: unknown) => {
        window.alert(
          error instanceof Error ? error.message : "PASSENGER_ACTION_FAILED",
        );
        setActionPending(false);
      });
  };
  const cancel = () => runLiveAction("cancel", onCancel);
  const contact = () => runLiveAction("contact", onContact);

  if (fixture.screenId === "P5-01") {
    return (
      <ActionGroup>
        <button
          type="button"
          style={buttonStyle("secondary", true)}
          onClick={cancel}
          disabled={fixture.canCancel === false || actionPending}
        >
          取消行程
        </button>
        <div
          style={{
            textAlign: "center",
            fontSize: 11,
            color: passengerChrome.muted,
          }}
        >
          指派前取消不收費
        </div>
      </ActionGroup>
    );
  }

  if (fixture.screenId === "P5-04") {
    return (
      <ActionGroup>
        <button
          type="button"
          style={buttonStyle("secondary", true)}
          onClick={cancel}
          disabled={fixture.canCancel === false || actionPending}
        >
          取消行程
        </button>
        <div
          style={{
            textAlign: "center",
            fontSize: 11,
            color: passengerChrome.muted,
          }}
        >
          改派期間取消不收費
        </div>
      </ActionGroup>
    );
  }

  if (fixture.screenId === "P5-08") return null;

  if (fixture.screenId === "P5-09") {
    return (
      <ActionGroup>
        <Link href={`/ride/${token}/receipt`} style={buttonStyle("secondary")}>
          查看電子乘車證明
        </Link>
        <Link href="/" style={buttonStyle("ghost")}>
          回到首頁
        </Link>
      </ActionGroup>
    );
  }

  if (fixture.screenId === "P5-10") {
    return (
      <ActionGroup>
        <Link href={`/ride/${token}`} style={buttonStyle("ghost")}>
          返回行程
        </Link>
      </ActionGroup>
    );
  }

  if (fixture.screenId === "P5-11") {
    return (
      <ActionGroup>
        <button type="button" style={buttonStyle("primary")}>
          重新整理
        </button>
        <button type="button" style={buttonStyle("secondary")}>
          聯絡客服
        </button>
      </ActionGroup>
    );
  }

  if (fixture.screenId === "P5-12") {
    return (
      <div style={{ margin: `0 ${shellInset}px 12px` }}>
        <button
          type="button"
          style={buttonStyle("secondary", true)}
          onClick={cancel}
          disabled={fixture.canCancel === false || actionPending}
        >
          取消行程
        </button>
      </div>
    );
  }

  if (fixture.screenId === "A04") {
    return (
      <>
        <ActionGroup>
          <button type="button" style={buttonStyle("primary")}>
            重新取得報價
          </button>
          <button type="button" style={buttonStyle("secondary")}>
            聯絡客服
          </button>
        </ActionGroup>
        <div
          style={{
            margin: "0 14px",
            fontSize: 10.5,
            color: passengerChrome.dim,
            textAlign: "center",
          }}
        >
          正式報價完成前不會為您確認訂單
        </div>
      </>
    );
  }

  const contactLabel =
    fixture.actionMode === "support_only" ? "聯絡客服" : "聯絡司機";

  return (
    <ActionGroup>
      <button
        type="button"
        style={buttonStyle("primary")}
        onClick={contact}
        disabled={fixture.canContact === false || actionPending}
      >
        {contactLabel}
      </button>
      <button
        type="button"
        style={buttonStyle("secondary", true)}
        onClick={cancel}
        disabled={fixture.canCancel === false || actionPending}
      >
        {fixture.actionLabel || "取消行程"}
      </button>
      {fixture.cancelNote ? (
        <div
          style={{
            textAlign: "center",
            fontSize: 11,
            color: passengerChrome.muted,
          }}
        >
          {fixture.cancelNote}
        </div>
      ) : null}
    </ActionGroup>
  );
}

function RideContent({
  fixture,
  token,
}: {
  fixture: PassengerRideFixture;
  token: string;
}) {
  if (fixture.screenId === "P5-11") {
    return (
      <>
        <EmptyState
          tone={passengerChrome.warning}
          title="派車資訊尚未完整"
          detail="系統正在重新確認車輛與駕駛資料，尚未完成指派。完成後會立即通知您。"
        />
        <Actions fixture={fixture} token={token} />
      </>
    );
  }

  if (fixture.screenId === "P5-09") {
    return (
      <>
        <CompletedThanks />
        <PaymentCard fixture={fixture} />
        <CertificateCard fixture={fixture} token={token} />
        <Actions fixture={fixture} token={token} />
      </>
    );
  }

  if (fixture.screenId === "P5-10") {
    return (
      <>
        <PaymentCard fixture={fixture} />
        <CertificateCard fixture={fixture} token={token} />
        <Actions fixture={fixture} token={token} />
      </>
    );
  }

  if (fixture.screenId === "A03") {
    return (
      <>
        <FareCard fixture={fixture} publicMode />
        <div
          style={{
            margin: "0 14px",
            fontSize: 10.5,
            color: passengerChrome.dim,
            textAlign: "center",
          }}
        >
          本頁依主管機關備查之現行版本公告
        </div>
      </>
    );
  }

  if (fixture.screenId === "P5-01") {
    return (
      <>
        <MapCard fixture={fixture} />
        <ProgressCard
          title="正在為您安排合適的車輛"
          detail="預約時間 今日 14:45 · 通常 1–3 分鐘完成指派"
        />
        <FareCard fixture={fixture} />
        <Actions fixture={fixture} token={token} />
      </>
    );
  }

  if (fixture.screenId === "P5-04") {
    return (
      <>
        <MapCard fixture={fixture} />
        <ProgressCard
          title="正在為您安排另一輛車"
          detail="原車輛無法完成本趟服務，車資與行程不受影響"
        />
        <VehicleCard
          fixture={fixture}
          dimmed
          tag={
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: passengerChrome.muted,
                background: passengerChrome.background,
                border: `1px solid ${passengerChrome.border}`,
                padding: "2px 8px",
                borderRadius: 999,
              }}
            >
              已取消指派
            </span>
          }
        />
        <Actions fixture={fixture} token={token} />
      </>
    );
  }

  if (fixture.screenId === "A04") {
    return (
      <>
        <MapCard fixture={fixture} />
        <FareCard fixture={fixture} />
        <Actions fixture={fixture} token={token} />
      </>
    );
  }

  if (fixture.screenId === "P5-08") {
    return (
      <>
        <RatingCard fixture={fixture} token={token} />
        <Card>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 13,
            }}
          >
            <span style={{ color: passengerChrome.muted }}>本趟車資</span>
            <b>
              {fixture.payment?.amountText ||
                fixture.routeFareText ||
                "車資資料尚未提供"}
            </b>
          </div>
        </Card>
        <PaymentCard fixture={fixture} />
        <CertificateCard fixture={fixture} token={token} />
      </>
    );
  }

  if (fixture.screenId === "P5-05") {
    return (
      <>
        <InlineBanner fixture={fixture} />
        <MapCard fixture={fixture} />
        <EtaBlock fixture={fixture} />
        <VehicleCard fixture={fixture} plateChanged />
        <PaymentCard fixture={fixture} />
        <Actions fixture={fixture} token={token} />
      </>
    );
  }

  if (fixture.screenId === "P5-06") {
    return (
      <>
        <MapCard fixture={fixture} />
        <EtaBlock fixture={fixture} />
        <VehicleCard fixture={fixture} />
        <SeatbeltNotice />
        <PaymentCard fixture={fixture} />
        <Actions fixture={fixture} token={token} />
      </>
    );
  }

  if (fixture.screenId === "P5-07") {
    return (
      <>
        <MapCard fixture={fixture} />
        <EtaBlock fixture={fixture} />
        <SeatbeltNotice />
        <VehicleCard fixture={fixture} />
        <FareCard fixture={fixture} />
        <PaymentCard fixture={fixture} />
      </>
    );
  }

  if (fixture.screenId === "P5-12") {
    return (
      <>
        <MapCard fixture={fixture} />
        <EtaBlock fixture={fixture} />
        <VehicleCard fixture={fixture} />
        <ContactUnavailableCard fixture={fixture} />
        <Actions fixture={fixture} token={token} />
      </>
    );
  }

  return (
    <>
      <MapCard fixture={fixture} />
      <EtaBlock fixture={fixture} />
      <StatusSubline fixture={fixture} />
      <VehicleCard fixture={fixture} />
      <FareCard fixture={fixture} />
      <PaymentCard fixture={fixture} />
      <Actions fixture={fixture} token={token} />
    </>
  );
}

function PassengerScreen({
  fixture,
  token,
}: {
  fixture: PassengerRideFixture;
  token: string;
}) {
  return (
    <>
      <TopChrome
        token={token}
        status={fixture.status}
        order={
          fixture.screenId === "A03"
            ? "公開資訊"
            : fixture.orderNo || "行程資訊"
        }
      />
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <RideContent fixture={fixture} token={token} />
        <FooterNotice />
      </div>
    </>
  );
}

export function PassengerRidePage({
  token,
  searchParams,
  kind,
}: {
  token: string;
  searchParams: Record<string, string | string[] | undefined>;
  kind: "ride" | "fares" | "receipt";
}) {
  const sourceMode = resolvePassengerDataMode(
    readQueryValue(searchParams.mode),
  );
  const [liveFixture, setLiveFixture] = useState<PassengerRideFixture | null>(
    null,
  );
  const [authorityError, setAuthorityError] = useState<string | null>(null);

  useEffect(() => {
    if (sourceMode !== "live") {
      return;
    }
    let active = true;
    let unsubscribe: () => void = () => {};
    void fetchPassengerRideAuthority(token)
      .then((view) => {
        if (!active) return;
        startTransition(() => {
          setLiveFixture(mapPassengerRideAuthorityToFixture(view, token, kind));
          setAuthorityError(null);
        });
        unsubscribe = subscribePassengerRideAuthority(
          token,
          (nextView) => {
            if (!active) return;
            startTransition(() => {
              setLiveFixture(
                mapPassengerRideAuthorityToFixture(nextView, token, kind),
              );
            });
          },
          () => undefined,
        );
      })
      .catch((error: unknown) => {
        if (!active) return;
        setAuthorityError(
          error instanceof Error
            ? error.message
            : "PASSENGER_AUTHORITY_UNAVAILABLE",
        );
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [kind, sourceMode, token]);

  const fixture =
    sourceMode === "fixture"
      ? resolvePassengerRideFixture(token, kind, searchParams.screen)
      : liveFixture;

  if (!fixture) {
    return (
      <Shell token={token} sourceMode={sourceMode}>
        <div style={{ minHeight: 760, display: "flex" }}>
          <EmptyState
            tone={
              authorityError ? passengerChrome.danger : passengerChrome.info
            }
            title={authorityError ? "無法取得行程資料" : "正在載入行程"}
            detail={
              authorityError
                ? `系統未使用展示資料替代。錯誤代碼：${authorityError}`
                : "正在向派遣權威服務確認最新狀態。"
            }
          />
        </div>
      </Shell>
    );
  }

  return (
    <Shell token={token} sourceMode={sourceMode}>
      <PassengerScreen fixture={fixture} token={token} />
    </Shell>
  );
}
