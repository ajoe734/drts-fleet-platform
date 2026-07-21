import Link from "next/link";
import type { ReactNode } from "react";
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

function readQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

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

const monoFont = '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace';

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
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              background: passengerChrome.info.bg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
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
        <div style={{ fontSize: 19, fontWeight: 800, marginTop: 8 }}>
          {status}
        </div>
      </div>
    </>
  );
}

function Card({
  title,
  children,
  tag,
}: {
  title?: string;
  children: ReactNode;
  tag?: ReactNode;
}) {
  return (
    <section
      style={{
        background: passengerChrome.card,
        border: `1px solid ${passengerChrome.border}`,
        borderRadius: 14,
        margin: "0 14px 12px",
        overflow: "hidden",
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

function Banner({ fixture }: { fixture: PassengerRideFixture }) {
  if (!fixture.banner) return null;
  const tone = getToneRamp(fixture.banner.tone);

  return (
    <div
      style={{
        margin: "12px 14px 0",
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        borderRadius: 12,
        padding: "10px 14px",
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: tone.fg }}>
          {fixture.banner.title}
        </div>
        {fixture.banner.detail ? (
          <div
            style={{
              marginTop: 2,
              fontSize: 11.5,
              lineHeight: 1.55,
              color: passengerChrome.muted,
            }}
          >
            {fixture.banner.detail}
          </div>
        ) : null}
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
  const note =
    fixture.mapState === "missing"
      ? "正在取得司機位置"
      : fixture.mapState === "stale"
        ? "司機位置更新稍有延遲"
        : "位置更新於 5 秒前";
  const noteTone =
    fixture.mapState === "stale"
      ? passengerChrome.warning
      : fixture.mapState === "missing"
        ? passengerChrome.neutral
        : passengerChrome.success;

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
      }}
    >
      {fixture.mapState !== "missing" ? (
        <>
          <div
            style={{
              position: "absolute",
              left: 40,
              top: 98,
              width: 24,
              height: 24,
              borderRadius: 12,
              background: passengerChrome.shell,
              border: `3px solid ${passengerChrome.invert}`,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 54,
              top: 112,
              width: 220,
              borderTop: `3px dashed ${passengerChrome.shell}`,
              transform: "rotate(-18deg)",
              transformOrigin: "left center",
            }}
          />
          <div
            style={{
              position: "absolute",
              right: 62,
              top: 30,
              width: 18,
              height: 18,
              borderRadius: 9,
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
            alignItems: "center",
            justifyContent: "center",
            color: passengerChrome.muted,
            fontSize: 12.5,
          }}
        >
          {note}
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
      <div
        style={{
          position: "absolute",
          right: 10,
          top: 10,
          fontSize: 10.5,
          background: noteTone.bg,
          border: `1px solid ${noteTone.border}`,
          padding: "3px 8px",
          borderRadius: 6,
          color: noteTone.fg,
          fontWeight: 700,
        }}
      >
        {note}
      </div>
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
    <div style={{ margin: "0 14px 12px", textAlign: "center" }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: tone }}>
        {fixture.etaMain}
      </div>
      {fixture.etaSub ? (
        <div
          style={{ fontSize: 12.5, color: passengerChrome.muted, marginTop: 2 }}
        >
          {fixture.etaSub}
        </div>
      ) : null}
    </div>
  );
}

function VehicleCard({ fixture }: { fixture: PassengerRideFixture }) {
  if (!fixture.assignment) {
    return null;
  }
  const rated = fixture.driver.ratingState === "rated";
  return (
    <Card title="您的車輛與駕駛">
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
            {fixture.driver.vehicle}
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: passengerChrome.muted,
              marginTop: 2,
            }}
          >
            2024 年出廠 · 4 門 · {fixture.driver.color}
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
            {fixture.driver.plateNo}
          </div>
          <div
            style={{ fontSize: 10, color: passengerChrome.dim, marginTop: 3 }}
          >
            上車前請核對車牌
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
            background: passengerChrome.driverRealm.bg,
            color: passengerChrome.driverRealm.fg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 15,
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          {fixture.driver.name.slice(0, 1)}
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 700 }}>
              {fixture.driver.name}
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
            {fixture.driver.registrationMaskedDisplay} · 有效至{" "}
            {fixture.driver.registrationEffectiveUntil}
          </div>
          <div style={{ marginTop: 6, fontSize: 11.5 }}>
            {rated ? (
              <span style={{ color: passengerChrome.text }}>
                <strong>4.9</strong> · 328 則評價
              </span>
            ) : (
              <span style={{ color: passengerChrome.muted }}>
                新進駕駛 · 尚無乘車評價
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function FareCard({ fixture }: { fixture: PassengerRideFixture }) {
  if (fixture.screenId === "P5-10" || fixture.screenId === "P5-09") {
    return null;
  }

  const isAnomaly = fixture.routeFareMode === "anomaly";
  return (
    <Card title={fixture.screenId === "A03" ? "現行計費表" : "預估路線與車資"}>
      {fixture.screenId === "A03" && fixture.fareVersion ? (
        <>
          <div
            style={{
              fontSize: 11,
              color: passengerChrome.muted,
              marginBottom: 6,
            }}
          >
            版本 {fixture.fareVersion.displayName} · 生效日 2026/07/01 · 備查{" "}
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
              <strong style={{ fontFamily: monoFont }}>{value}</strong>
            </div>
          ))}
        </>
      ) : (
        <>
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
              {fixture.dropoffLabel ? (
                <div style={{ fontWeight: 600 }}>{fixture.dropoffLabel}</div>
              ) : null}
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
                {fixture.routeFareHint ? (
                  <div
                    style={{
                      fontSize: 11,
                      color: passengerChrome.muted,
                      marginTop: 2,
                    }}
                  >
                    {fixture.routeFareHint}
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                <div style={{ fontSize: 16.5, fontWeight: 800 }}>
                  {fixture.routeFareText}
                </div>
                {fixture.routeFareHint ? (
                  <div
                    style={{
                      fontSize: 11,
                      color: passengerChrome.muted,
                      marginTop: 2,
                    }}
                  >
                    {fixture.routeFareHint}
                  </div>
                ) : null}
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
              </>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

function Actions({
  fixture,
  token,
}: {
  fixture: PassengerRideFixture;
  token: string;
}) {
  const secondaryButton = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    minHeight: 46,
    borderRadius: 12,
    fontSize: 14,
    fontWeight: 700,
    border: `1px solid ${passengerChrome.border}`,
    background: passengerChrome.card,
    color: passengerChrome.text,
  } as const;
  const primaryButton = {
    ...secondaryButton,
    background: passengerChrome.shell,
    color: passengerChrome.invert,
    border: "1px solid transparent",
  };

  if (fixture.screenId === "P5-09") {
    return (
      <div
        style={{
          margin: "0 14px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <Link href={`/ride/${token}?screen=P5-10`} style={secondaryButton}>
          查看電子乘車證明
        </Link>
        <Link
          href="/"
          style={{
            ...secondaryButton,
            color: passengerChrome.muted,
            border: "1px solid transparent",
          }}
        >
          回到首頁
        </Link>
      </div>
    );
  }

  if (fixture.screenId === "P5-10") {
    return (
      <div
        style={{
          margin: "0 14px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <button type="button" style={primaryButton}>
          下載 PDF
        </button>
        <button type="button" style={secondaryButton}>
          分享
        </button>
        <Link
          href={`/ride/${token}?screen=P5-09`}
          style={{
            ...secondaryButton,
            color: passengerChrome.muted,
            border: "1px solid transparent",
          }}
        >
          返回行程
        </Link>
      </div>
    );
  }

  if (fixture.screenId === "P5-08") {
    return (
      <div style={{ margin: "0 14px 10px" }}>
        <button type="button" style={primaryButton}>
          送出評價
        </button>
      </div>
    );
  }

  if (fixture.actionMode === "support_only") {
    return (
      <div
        style={{
          margin: "0 14px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <button type="button" style={primaryButton}>
          {fixture.screenId === "A04" || fixture.screenId === "P5-11"
            ? "重新取得報價"
            : "聯絡客服"}
        </button>
        <button type="button" style={secondaryButton}>
          聯絡客服
        </button>
        {fixture.screenId === "P5-12" ? (
          <button
            type="button"
            style={{ ...secondaryButton, color: passengerChrome.danger.fg }}
          >
            取消行程
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      style={{
        margin: "0 14px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <button type="button" style={primaryButton}>
        聯絡司機
      </button>
      <button
        type="button"
        style={{ ...secondaryButton, color: passengerChrome.danger.fg }}
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
    </div>
  );
}

function SeatbeltNotice() {
  return (
    <div
      role="status"
      style={{
        margin: "0 14px 12px",
        display: "flex",
        gap: 11,
        alignItems: "flex-start",
        background: passengerChrome.warning.bg,
        border: `1px solid ${passengerChrome.warning.border}`,
        borderRadius: 12,
        padding: "11px 14px",
      }}
    >
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
    </div>
  );
}

function ReceiptCard({ fixture }: { fixture: PassengerRideFixture }) {
  const receiptRows = fixture.receiptRows;
  if (!receiptRows) return null;
  return (
    <Card>
      {receiptRows.map((row, index) => (
        <div
          key={`${row.label}-${index}`}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            padding: "8px 0",
            borderBottom:
              index < receiptRows.length - 1
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
      <div style={{ fontSize: 10, color: passengerChrome.dim, marginTop: 4 }}>
        證明編號 RC-2607••-0186 · 個資已遮碼
      </div>
    </Card>
  );
}

function RatingCard({ fixture }: { fixture: PassengerRideFixture }) {
  if (!fixture.ratingSummary) return null;
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
      <div style={{ margin: "12px 0 4px", textAlign: "center" }}>
        <div style={{ fontSize: 34, color: passengerChrome.driverRealm.fg }}>
          ★★★★★
        </div>
        <div
          style={{
            textAlign: "center",
            fontSize: 12.5,
            fontWeight: 700,
            color: passengerChrome.driverRealm.fg,
            marginTop: 4,
          }}
        >
          {fixture.ratingSummary.scoreText}
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
    </Card>
  );
}

function SafetyInfo({ fixture }: { fixture: PassengerRideFixture }) {
  if (!fixture.contactSafetyNote && !fixture.disclosureBlockReason) return null;
  return (
    <div
      style={{
        margin: "0 14px 12px",
        background: passengerChrome.card,
        border: `1px solid ${passengerChrome.border}`,
        borderRadius: 12,
        padding: "12px 14px",
      }}
    >
      {fixture.contactSafetyNote ? (
        <>
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
            {fixture.contactSafetyNote}
          </div>
        </>
      ) : null}
      {fixture.disclosureBlockReason ? (
        <div
          style={{
            fontSize: 11,
            color: passengerChrome.dim,
            marginTop: fixture.contactSafetyNote ? 10 : 0,
            fontFamily: monoFont,
          }}
        >
          fail-closed: {fixture.disclosureBlockReason}
        </div>
      ) : null}
    </div>
  );
}

function TimelineFooter({ fixture }: { fixture: PassengerRideFixture }) {
  return (
    <div
      style={{
        margin: "auto 14px 14px",
        paddingTop: 6,
        fontSize: 10.5,
        color: passengerChrome.dim,
        textAlign: "center",
      }}
    >
      客服 0800-090-000 · 主管機關申訴 1999
      <br />
      本服務僅提供預約叫車 · 事件{" "}
      {fixture.timeline
        .map((event) => `${event.happenedAt} ${event.summary}`)
        .join(" / ")}
    </div>
  );
}

function ScreenRail({
  token,
  active,
}: {
  token: string;
  active: PassengerRideFixture["screenId"];
}) {
  const screens = [
    "P5-01",
    "P5-02",
    "P5-03",
    "P5-04",
    "P5-05",
    "P5-06",
    "P5-07",
    "P5-08",
    "P5-09",
    "P5-10",
    "P5-11",
    "P5-12",
    "A03",
    "A04",
  ] as const;
  return (
    <div
      style={{
        margin: "0 14px 12px",
        display: "flex",
        gap: 6,
        overflowX: "auto",
        paddingBottom: 2,
      }}
    >
      {screens.map((screenId) => (
        <Link
          key={screenId}
          href={
            screenId === "A03"
              ? `/ride/${token}/fares?screen=A03`
              : `/ride/${token}?screen=${screenId}`
          }
          style={{
            flexShrink: 0,
            borderRadius: 999,
            padding: "6px 10px",
            border: `1px solid ${active === screenId ? passengerChrome.info.border : passengerChrome.border}`,
            background:
              active === screenId
                ? passengerChrome.info.bg
                : passengerChrome.card,
            color:
              active === screenId
                ? passengerChrome.shell
                : passengerChrome.muted,
            fontSize: 11,
            fontWeight: 700,
            fontFamily: monoFont,
          }}
        >
          {screenId}
        </Link>
      ))}
    </div>
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
        order={fixture.screenId === "A03" ? "公開資訊" : "ZX-240720-0186"}
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
        <Banner fixture={fixture} />
        <ScreenRail token={token} active={fixture.screenId} />
        {!["P5-09", "P5-10", "A03"].includes(fixture.screenId) ? (
          <MapCard fixture={fixture} />
        ) : null}
        <EtaBlock fixture={fixture} />
        <RatingCard fixture={fixture} />
        <VehicleCard fixture={fixture} />
        {fixture.seatbeltNotice ? <SeatbeltNotice /> : null}
        <SafetyInfo fixture={fixture} />
        <FareCard fixture={fixture} />
        <ReceiptCard fixture={fixture} />
        <Actions fixture={fixture} token={token} />
        <TimelineFooter fixture={fixture} />
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
  kind: "ride" | "fares";
}) {
  const sourceMode = resolvePassengerDataMode(
    readQueryValue(searchParams.mode),
  );
  const fixture = resolvePassengerRideFixture(token, kind, searchParams.screen);

  return (
    <Shell token={token} sourceMode={sourceMode}>
      <PassengerScreen fixture={fixture} token={token} />
    </Shell>
  );
}
