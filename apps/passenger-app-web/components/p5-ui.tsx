import React, { ReactNode, CSSProperties } from "react";
import { REALM_COLORS, STATUS_TONES } from "@drts/ui-tokens";

const pTokens = REALM_COLORS.tenant.light;

const P5 = {
  bg: STATUS_TONES.neutral.light.bg,
  surface: "#FFFFFF",
  ink: STATUS_TONES.neutral.dark.bg,
  mut: STATUS_TONES.neutral.light.fg,
  dim: STATUS_TONES.neutral.dark.fg,
  line: STATUS_TONES.neutral.light.border,
  lineSoft: STATUS_TONES.neutral.light.bg,
  brand: pTokens.fg,
  brandDark: REALM_COLORS.tenant.dark.bg,
  brandBg: pTokens.bg,
  ok: STATUS_TONES.success.light.fg,
  okBg: STATUS_TONES.success.light.bg,
  okBd: STATUS_TONES.success.light.border,
  warn: STATUS_TONES.warning.light.fg,
  warnBg: STATUS_TONES.warning.light.bg,
  warnBd: STATUS_TONES.warning.light.border,
  danger: STATUS_TONES.danger.light.fg,
  dangerBg: STATUS_TONES.danger.light.bg,
  dangerBd: STATUS_TONES.danger.light.border,
  mono: '"JetBrains Mono",ui-monospace,monospace',
};

const P5_ICONS: Record<string, string> = {
  car: "M4 13l2-5h12l2 5M4 13h16v5h-2.5M4 18h2.5M8 18h8M6.5 15.5h.01M17.5 15.5h.01",
  pin: "M12 21s-7-5.4-7-11a7 7 0 0114 0c0 5.6-7 11-7 11zM12 12a2 2 0 100-4 2 2 0 000 4",
  star: "M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.4l6.1-.8z",
  phone:
    "M5 4h4l2 5-2.5 1.5a12 12 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2",
  x: "M6 6l12 12M18 6L6 18",
  warn: "M12 3l10 18H2zM12 10v4M12 17.5v.01",
  info: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 11v5M12 8v.01",
  check: "M5 12l5 5L20 7",
  shield: "M12 3l8 3.5v5c0 5-3.5 7.5-8 9.5-4.5-2-8-4.5-8-9.5v-5z",
  belt: "M12 3a3 3 0 110 6 3 3 0 010-6zM5 21l9-9M13 21h6M8 12l8 9",
  doc: "M6 3h9l4 4v14H6zM14 3v5h5",
  share: "M12 3v12M8 7l4-4 4 4M5 13v7h14v-7",
  download: "M12 3v12M8 11l4 4 4-4M5 19h14",
  clock: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2",
  refresh: "M20 8A8 8 0 105 5.3M20 3v5h-5",
};

export function P5Icon({
  name,
  size = 15,
  style = {},
}: {
  name: string;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }}
    >
      <path d={P5_ICONS[name] || P5_ICONS.info} />
    </svg>
  );
}

export function P5Phone({
  children,
  url = "ride.smarttransport.tw/r/••••K2",
}: {
  children: ReactNode;
  url?: string;
}) {
  return (
    <div
      style={{
        width: 390,
        height: 844,
        background: P5.bg,
        borderRadius: 38,
        border: `10px solid ${STATUS_TONES.neutral.dark.bg}`,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        fontFamily: '"Inter","Noto Sans TC",system-ui,sans-serif',
        color: P5.ink,
      }}
    >
      <div
        style={{
          height: 40,
          background: P5.brandDark,
          color: P5.surface,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          padding: "0 20px 5px",
          fontSize: 12,
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        <span style={{ fontFamily: P5.mono }}>14:29</span>
        <span style={{ opacity: 0.85, fontSize: 10.5, fontFamily: P5.mono }}>
          {url}
        </span>
        <span style={{ fontFamily: P5.mono }}>5G ▮▮▮</span>
      </div>
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function P5Header({
  status,
  order,
}: {
  status: string;
  order?: string;
}) {
  return (
    <div
      style={{
        background: P5.brandDark,
        color: P5.surface,
        padding: "10px 18px 14px",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            background: "rgba(255,255,255,.16)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <P5Icon name="car" size={14} />
        </span>
        <span style={{ fontSize: 13, fontWeight: 700 }}>智行叫車</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: P5.mono, fontSize: 10.5, opacity: 0.75 }}>
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
  );
}

export function P5Card({
  title,
  children,
  dimmed,
  tag,
  style = {},
}: {
  title?: ReactNode;
  children: ReactNode;
  dimmed?: boolean | undefined;
  tag?: ReactNode | undefined;
  style?: CSSProperties;
}) {
  return (
    <section
      style={{
        background: P5.surface,
        border: "1px solid " + P5.line,
        borderRadius: 14,
        margin: "0 14px 12px",
        overflow: "hidden",
        opacity: dimmed ? 0.55 : 1,
        position: "relative",
        ...style,
      }}
    >
      {title && (
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
      )}
      <div style={{ padding: "11px 16px 14px" }}>{children}</div>
    </section>
  );
}

export function P5Map({
  state = "missing",
  pickupAddress,
  updateNotice,
  routeSvgPath,
  carPosition,
  pinPosition,
}: {
  state?: "fresh" | "stale" | "missing";
  pickupAddress?: string;
  updateNotice?: string;
  routeSvgPath?: string;
  carPosition?: { left?: number | string; top?: number | string; right?: number | string; bottom?: number | string };
  pinPosition?: { left?: number | string; top?: number | string; right?: number | string; bottom?: number | string };
}) {
  return (
    <div
      style={{
        margin: "12px 14px",
        borderRadius: 14,
        overflow: "hidden",
        border: "1px solid " + P5.line,
        background: `linear-gradient(140deg, ${P5.brandBg}, ${STATUS_TONES.neutral.light.bg})`,
        height: 150,
        position: "relative",
        flexShrink: 0,
      }}
    >
      {state !== "missing" && (
        <>
          {routeSvgPath && carPosition && pinPosition && (
            <svg
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
              }}
            >
              <path
                d={routeSvgPath}
                fill="none"
                stroke={P5.brand}
                strokeWidth="3"
                strokeDasharray="1 7"
                strokeLinecap="round"
              />
            </svg>
          )}
          {carPosition && (
            <div
              style={{
                position: "absolute",
                ...carPosition,
                width: 26,
                height: 26,
                borderRadius: 13,
                background: P5.brand,
                border: `3px solid ${P5.surface}`,
                boxShadow: "0 2px 8px rgba(0,0,0,.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: P5.surface,
              }}
            >
              <P5Icon name="car" size={13} />
            </div>
          )}
          {pinPosition && (
            <div
              style={{
                position: "absolute",
                ...pinPosition,
                color: P5.danger,
              }}
            >
              <P5Icon name="pin" size={24} />
            </div>
          )}
        </>
      )}
      {state === "missing" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            color: P5.mut,
            fontSize: 12.5,
          }}
        >
          <P5Icon name="pin" size={20} />
          正在取得司機位置
        </div>
      )}
      <div
        style={{
          position: "absolute",
          left: 10,
          bottom: 10,
          fontSize: 10.5,
          background: "rgba(255,255,255,.92)",
          padding: "3px 9px",
          borderRadius: 6,
          color: P5.mut,
        }}
      >
        上車：{pickupAddress || "載入中..."}
      </div>
      {state === "fresh" && (
        <div
          style={{
            position: "absolute",
            right: 10,
            top: 10,
            fontSize: 10,
            background: "rgba(255,255,255,.92)",
            padding: "3px 8px",
            borderRadius: 6,
            color: P5.ok,
            fontWeight: 600,
          }}
        >
          {updateNotice || "位置已更新"}
        </div>
      )}
      {state === "stale" && (
        <div
          style={{
            position: "absolute",
            right: 10,
            top: 10,
            fontSize: 10.5,
            background: P5.warnBg,
            border: "1px solid " + P5.warnBd,
            padding: "3px 8px",
            borderRadius: 6,
            color: P5.warn,
            fontWeight: 600,
          }}
        >
          司機位置更新稍有延遲
        </div>
      )}
    </div>
  );
}

export function P5Eta({
  main,
  sub,
  tone = "brand",
}: {
  main: string;
  sub?: string;
  tone?: "brand" | "ok" | "warn";
}) {
  const c = tone === "ok" ? P5.ok : tone === "warn" ? P5.warn : P5.brand;
  return (
    <div style={{ margin: "0 14px 12px", textAlign: "center", flexShrink: 0 }}>
      <div
        style={{ fontSize: 24, fontWeight: 800, color: c, letterSpacing: -0.3 }}
      >
        {main}
      </div>
      {sub && (
        <div style={{ fontSize: 12.5, color: P5.mut, marginTop: 2 }}>{sub}</div>
      )}
    </div>
  );
}

export function P5VehicleCard({
  rating,
  ratingScore,
  ratingCount,
  dimmed,
  plateChanged,
  plate,
  driver,
  carModel,
  carDetails,
  registration,
  registrationValid,
  tag,
}: {
  rating?: "rated" | "new";
  ratingScore?: string;
  ratingCount?: number;
  dimmed?: boolean;
  plateChanged?: boolean;
  plate?: string;
  driver?: string;
  carModel?: string;
  carDetails?: string;
  registration?: string;
  registrationValid?: boolean;
  tag?: ReactNode;
}) {
  return (
    <P5Card title="您的車輛與駕駛" dimmed={dimmed} tag={tag}>
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
            {carModel || "載入中..."}
          </div>
          <div style={{ fontSize: 11.5, color: P5.mut, marginTop: 2 }}>
            {carDetails || ""}
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontFamily: P5.mono,
              fontSize: 27,
              fontWeight: 700,
              letterSpacing: 1.5,
              color: P5.ink,
              border: "1.5px solid " + P5.line,
              borderRadius: 8,
              padding: "4px 12px",
              background: P5.bg,
            }}
          >
            {plate || "---"}
          </div>
          {plateChanged ? (
            <div
              style={{
                fontSize: 10,
                color: P5.warn,
                fontWeight: 700,
                marginTop: 3,
              }}
            >
              ⚠ 車牌已更新，請重新核對
            </div>
          ) : (
            <div style={{ fontSize: 10, color: P5.dim, marginTop: 3 }}>
              上車前請核對車牌
            </div>
          )}
        </div>
      </div>
      <div
        style={{
          borderTop: "1px solid " + P5.lineSoft,
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
            background: P5.brandBg,
            color: P5.brand,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 15,
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          {driver ? driver.slice(0, 1) : "-"}
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
            <span style={{ fontSize: 14, fontWeight: 700 }}>{driver || "未知"}</span>
            {registrationValid === true && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: P5.ok,
                  background: P5.okBg,
                  border: "1px solid " + P5.okBd,
                  padding: "2px 8px",
                  borderRadius: 999,
                }}
              >
                <P5Icon name="shield" size={10} />
                執登有效
              </span>
            )}
            {registrationValid === false && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: P5.danger,
                  background: P5.dangerBg,
                  border: "1px solid " + P5.dangerBd,
                  padding: "2px 8px",
                  borderRadius: 999,
                }}
              >
                <P5Icon name="warn" size={10} />
                執登已失效
              </span>
            )}
          </div>
          {registration && (
            <div
              style={{
                fontSize: 11,
                color: P5.mut,
                marginTop: 3,
                fontFamily: P5.mono,
              }}
            >
              {registration}
            </div>
          )}
          <div style={{ marginTop: 6 }}>
            {rating === "rated" && ratingScore ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "baseline",
                  gap: 6,
                }}
              >
                <span
                  style={{
                    color: STATUS_TONES.warning.light.fg,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                  }}
                >
                  <P5Icon name="star" size={13} style={{ fill: STATUS_TONES.warning.light.fg }} />
                  <b style={{ fontSize: 15, color: P5.ink }}>{ratingScore}</b>
                </span>
                <span style={{ fontSize: 11, color: P5.mut }}>{ratingCount || 0} 則評價</span>
              </span>
            ) : rating === "new" ? (
              <span
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: P5.brand,
                    background: P5.brandBg,
                    padding: "2px 9px",
                    borderRadius: 999,
                  }}
                >
                  新進駕駛
                </span>
                <span style={{ fontSize: 11, color: P5.mut }}>
                  尚無乘車評價
                </span>
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </P5Card>
  );
}

export function P5RouteFare({
  mode = "range",
  pickup,
  dropoff,
  distance,
  duration,
  fareRange,
  fareFixed,
}: {
  mode?: "range" | "fixed" | "anomaly";
  pickup?: string;
  dropoff?: string;
  distance?: string;
  duration?: string;
  fareRange?: string;
  fareFixed?: string;
}) {
  return (
    <P5Card title="預估路線與車資">
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
              border: "2px solid " + P5.brand,
            }}
          />
          <span
            style={{
              flex: 1,
              width: 2,
              background: P5.line,
              margin: "3px 0",
              minHeight: 14,
            }}
          />
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: P5.brand,
            }}
          />
        </div>
        <div style={{ flex: 1, fontSize: 12.5 }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>
            {pickup || "-"}
          </div>
          <div style={{ fontWeight: 600 }}>{dropoff || "-"}</div>
        </div>
        <div style={{ fontSize: 11, color: P5.mut, textAlign: "right" }}>
          {distance || ""}
          <br />{duration || ""}
        </div>
      </div>
      <div style={{ borderTop: "1px solid " + P5.lineSoft, paddingTop: 10 }}>
        {mode === "range" && (
          <>
            <div style={{ fontSize: 16.5, fontWeight: 800 }}>
              {fareRange || "預估車資計算中"}
            </div>
            <div style={{ fontSize: 11, color: P5.mut, marginTop: 2 }}>
              依計費表實際金額收費
            </div>
          </>
        )}
        {mode === "fixed" && (
          <>
            <div style={{ fontSize: 16.5, fontWeight: 800 }}>
              {fareFixed || "本趟應付計算中"}
            </div>
            <div style={{ fontSize: 11, color: P5.mut, marginTop: 2 }}>
              固定報價 · 已確認
            </div>
          </>
        )}
        {mode === "anomaly" && (
          <div
            style={{
              background: P5.warnBg,
              border: "1px solid " + P5.warnBd,
              borderRadius: 9,
              padding: "9px 12px",
            }}
          >
            <div style={{ fontSize: 12.5, fontWeight: 700, color: P5.warn }}>
              目前無法取得正式報價
            </div>
            <div style={{ fontSize: 11, color: P5.mut, marginTop: 2 }}>
              請稍後重試或聯絡客服
            </div>
          </div>
        )}
        {mode !== "anomaly" && (
          <div
            style={{
              fontSize: 10.5,
              color: P5.dim,
              marginTop: 8,
              lineHeight: 1.55,
            }}
          >
            若乘客要求變更目的地、增加停靠點，或因依法需支付通行費，實際車資可能調整。
          </div>
        )}
      </div>
    </P5Card>
  );
}

export function P5Btn({
  kind = "secondary",
  icon,
  children,
  danger,
  onClick,
}: {
  kind?: "primary" | "secondary" | "ghost";
  icon?: string;
  children: ReactNode;
  danger?: boolean;
  onClick?: (() => void) | undefined;
}) {
  const s: CSSProperties = {
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
    fontFamily: "inherit",
    border: "1px solid transparent",
  };
  const v =
    kind === "primary"
      ? { ...s, background: danger ? P5.danger : P5.brand, color: "#fff" }
      : kind === "ghost"
        ? {
            ...s,
            background: "transparent",
            color: danger ? P5.danger : P5.mut,
          }
        : {
            ...s,
            background: P5.surface,
            color: danger ? P5.danger : P5.ink,
            borderColor: danger ? P5.dangerBd : P5.line,
          };
  return (
    <button style={v} onClick={onClick}>
      {icon && <P5Icon name={icon} size={15} />}
      {children}
    </button>
  );
}

export function P5Actions({
  cancelNote,
  contact = "ready",
  onContact,
  onCancel,
}: {
  cancelNote?: string;
  contact?: "ready" | "loading" | "hidden";
  onContact?: () => void;
  onCancel?: () => void;
}) {
  return (
    <div
      style={{
        margin: "0 14px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        flexShrink: 0,
      }}
    >
      {contact === "ready" && (
        <P5Btn kind="primary" icon="phone" onClick={onContact}>
          聯絡司機
        </P5Btn>
      )}
      {contact === "loading" && (
        <P5Btn kind="primary" icon="phone" onClick={onContact}>
          正在建立安全通話…
        </P5Btn>
      )}
      <P5Btn icon="x" danger onClick={onCancel}>
        取消行程
      </P5Btn>
      {cancelNote && (
        <div style={{ textAlign: "center", fontSize: 11, color: P5.mut }}>
          {cancelNote}
        </div>
      )}
    </div>
  );
}

export function P5Seatbelt() {
  return (
    <div
      role="status"
      style={{
        margin: "0 14px 12px",
        display: "flex",
        gap: 11,
        alignItems: "flex-start",
        background: P5.warnBg,
        border: "1px solid " + P5.warnBd,
        borderRadius: 12,
        padding: "11px 14px",
        flexShrink: 0,
      }}
    >
      <span style={{ color: P5.warn, marginTop: 1 }}>
        <P5Icon name="belt" size={18} />
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          上車後請全程繫妥安全帶
        </div>
        <div style={{ fontSize: 11.5, color: P5.mut, marginTop: 2 }}>
          前後座乘客都需要繫安全帶。
        </div>
      </div>
      <span style={{ color: P5.dim, cursor: "pointer" }}>
        <P5Icon name="x" size={14} />
      </span>
    </div>
  );
}

export function P5Notice() {
  return (
    <div
      style={{
        margin: "auto 14px 14px",
        paddingTop: 6,
        fontSize: 10.5,
        color: P5.dim,
        textAlign: "center",
        flexShrink: 0,
      }}
    >
      客服 02-2944-0985 · 主管機關申訴 1999
      <br />
      本服務僅提供預約叫車
    </div>
  );
}
