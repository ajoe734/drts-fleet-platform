import Link from "next/link";
import type { ReactNode } from "react";
import {
  buildEmbedTheme,
  getEntryHost,
  type EmbedContext,
} from "@/lib/embed-context";
import {
  embedReceipt,
  embedResident,
  embedSavedPlaces,
  embedTrip,
  embedTripHistory,
  embedVehicles,
} from "@/lib/embed-fixtures";

function buildHref(context: EmbedContext, next: Record<string, string>) {
  const params = new URLSearchParams({
    entryHost: context.entry.entryHost?.trim() || "",
  });

  if (context.handoff.apiKey) {
    params.set("apiKey", context.handoff.apiKey);
  }
  if (context.handoff.partnerUserRef) {
    params.set("partnerUserRef", context.handoff.partnerUserRef);
  }

  for (const [key, value] of Object.entries(next)) {
    params.set(key, value);
  }

  return `/embed/${context.entry.entrySlug}?${params.toString()}`;
}

function toneStyle(theme: ReturnType<typeof buildEmbedTheme>, tone: string) {
  switch (tone) {
    case "success":
      return {
        color: theme.successFg,
        background: theme.successBg,
        borderColor: theme.successBorder,
      };
    case "warn":
      return {
        color: theme.warnFg,
        background: theme.warnBg,
        borderColor: theme.warnBorder,
      };
    case "danger":
      return {
        color: theme.dangerFg,
        background: theme.dangerBg,
        borderColor: theme.dangerBorder,
      };
    default:
      return {
        color: theme.infoFg,
        background: theme.infoBg,
        borderColor: theme.infoBorder,
      };
  }
}

function EmbedShell({
  context,
  children,
  footer,
}: {
  context: EmbedContext;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const theme = buildEmbedTheme(context.accent);
  const appName = context.strings.appName;
  const displayName = context.strings.displayName;

  return (
    <div
      style={{
        ["--embed-accent" as string]: theme.accent,
        ["--embed-accent-soft" as string]: theme.accentSoft,
        ["--embed-neutral-fg" as string]: theme.neutralFg,
        ["--embed-neutral-bg" as string]: theme.neutralBg,
        ["--embed-neutral-border" as string]: theme.neutralBorder,
        ["--embed-danger-fg" as string]: theme.dangerFg,
        ["--embed-danger-bg" as string]: theme.dangerBg,
        minHeight: "100vh",
        background: theme.neutralBg,
        padding: "24px 12px",
        fontFamily: '"Noto Sans TC", "IBM Plex Sans", "Segoe UI", sans-serif',
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 392,
          margin: "0 auto",
          borderRadius: 28,
          overflow: "hidden",
          background: "white",
          border: `1px solid ${theme.neutralBorder}`,
          boxShadow:
            "0 20px 50px color-mix(in srgb, var(--embed-accent) 12%, transparent)",
        }}
      >
        <div
          style={{
            background: theme.accent,
            color: "white",
            padding: "14px 16px 12px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            <span>9:41</span>
            <span>webview</span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginTop: 10,
            }}
          >
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: 14,
                background: "color-mix(in srgb, white 18%, transparent)",
                display: "grid",
                placeItems: "center",
                fontSize: 22,
                fontWeight: 800,
              }}
            >
              {displayName.slice(0, 1)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>社區叫車</div>
              <div style={{ fontSize: 11, opacity: 0.9 }}>
                {appName} · {displayName}
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            padding: "8px 14px",
            fontSize: 11,
            color: theme.neutralFg,
            background: theme.neutralBg,
            borderBottom: `1px solid ${theme.neutralBorder}`,
          }}
        >
          embedded · /embed/{context.entry.entrySlug} ·{" "}
          {getEntryHost(context.entry)}
        </div>

        <div style={{ padding: 16, display: "grid", gap: 12 }}>{children}</div>

        {footer ? (
          <div
            style={{
              padding: 14,
              borderTop: `1px solid ${theme.neutralBorder}`,
              background: theme.neutralBg,
              display: "grid",
              gap: 10,
            }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section
      style={{
        border:
          "1px solid color-mix(in srgb, var(--embed-neutral-fg) 18%, transparent)",
        borderRadius: 18,
        background: "white",
        padding: 14,
        display: "grid",
        gap: 10,
      }}
    >
      {title ? (
        <div>
          <div style={{ fontSize: 14, fontWeight: 800 }}>{title}</div>
          {subtitle ? (
            <div style={{ fontSize: 11, color: "var(--embed-neutral-fg)" }}>
              {subtitle}
            </div>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function ActionLink({
  href,
  label,
  tone = "primary",
}: {
  href: string;
  label: string;
  tone?: "primary" | "ghost" | "danger";
}) {
  const palette =
    tone === "ghost"
      ? {
          background: "var(--embed-accent-soft)",
          color: "var(--embed-accent)",
          border:
            "1px solid color-mix(in srgb, var(--embed-accent) 18%, transparent)",
        }
      : tone === "danger"
        ? {
            background: "var(--embed-danger-fg)",
            color: "white",
            border: "1px solid var(--embed-danger-fg)",
          }
        : {
            background: "var(--embed-accent)",
            color: "white",
            border: "1px solid var(--embed-accent)",
          };

  return (
    <Link
      href={href}
      style={{
        display: "block",
        textAlign: "center",
        borderRadius: 999,
        padding: "12px 14px",
        fontWeight: 800,
        ...palette,
      }}
    >
      {label}
    </Link>
  );
}

function IdentityState({ context }: { context: EmbedContext }) {
  const theme = buildEmbedTheme(context.accent);
  const handoffRows = [
    ["社區簽章有效", "valid"],
    ["住戶身分已解析", embedResident.name],
    ["社區 / 戶別", embedResident.unit],
  ];
  const bodyByState = {
    handoff: {
      title: `以 ${context.strings.displayName} 身分為您準備叫車`,
      badge: "handoff · 已交接",
      tone: "success",
      footer: (
        <ActionLink
          href={buildHref(context, { screen: "book" })}
          label="開始叫車"
        />
      ),
    },
    reauth: {
      title: "登入狀態已逾時",
      badge: "reauth_required",
      tone: "warn",
      footer: (
        <>
          <ActionLink
            href={buildHref(context, { state: "handoff" })}
            label={`回 ${context.strings.appName} 重新進入`}
          />
          <ActionLink
            href={buildHref(context, { state: "fallback" })}
            label="稍後再試"
            tone="ghost"
          />
        </>
      ),
    },
    unsupported: {
      title: "無法在此環境開啟",
      badge: "unsupported_host · 已封鎖",
      tone: "danger",
      footer: (
        <ActionLink
          href={buildHref(context, { state: "fallback" })}
          label="前往獨立叫車網站"
        />
      ),
    },
    consent: {
      title: "授權使用叫車服務",
      badge: "consent_required",
      tone: "info",
      footer: (
        <>
          <ActionLink
            href={buildHref(context, { state: "handoff", screen: "book" })}
            label="同意並開始"
          />
          <ActionLink
            href={buildHref(context, { state: "fallback" })}
            label="暫不使用"
            tone="ghost"
          />
        </>
      ),
    },
    fallback: {
      title: "內嵌服務暫時無法使用",
      badge: "fallback_to_web · 改用網站",
      tone: "warn",
      footer: (
        <>
          <ActionLink
            href={buildHref(context, { state: "fallback", screen: "receipt" })}
            label="前往獨立叫車網站"
          />
          <ActionLink
            href={buildHref(context, { state: "handoff" })}
            label="回社區 App"
            tone="ghost"
          />
        </>
      ),
    },
  } as const;

  const current = bodyByState[context.state];
  const tone = toneStyle(theme, current.tone);

  return (
    <EmbedShell context={context} footer={current.footer}>
      <div
        style={{
          ...tone,
          border: `1px solid ${tone.borderColor}`,
          borderRadius: 999,
          padding: "6px 10px",
          width: "fit-content",
          fontSize: 11,
          fontWeight: 800,
        }}
      >
        {current.badge}
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.25 }}>
        {current.title}
      </div>
      <Card title="身分交接摘要" subtitle="signed handoff token">
        {handoffRows.map(([label, value]) => (
          <div
            key={label}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              fontSize: 13,
            }}
          >
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            fontSize: 13,
          }}
        >
          <span>DRTS Passenger</span>
          <strong>{context.session?.drtsPassengerId || "未建立"}</strong>
        </div>
      </Card>
      <Card>
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
          {context.state === "unsupported"
            ? "目前來源不在授權宿主白名單內，基於安全考量已阻擋內嵌載入。"
            : context.state === "reauth"
              ? `為保護您的住戶帳號，請回到 ${context.strings.appName} 重新進入叫車。`
              : context.state === "consent"
                ? "首次使用需確認授權範圍，行程與收據會綁定既有住戶身分。"
                : context.state === "fallback"
                  ? "目前無法在社區 App 內完成叫車，改用獨立網站後仍可找回行程與收據。"
                  : `免再登入，由 ${context.strings.appName} 安全帶入住戶身分。`}
        </div>
      </Card>
    </EmbedShell>
  );
}

function FlowNav({ context }: { context: EmbedContext }) {
  const screens: Array<[string, string]> = [
    ["book", "叫車"],
    ["trip", "進行中"],
    ["trips", "歷史"],
    ["receipt", "收據"],
    ["completed", "完成"],
    ["cancelled", "取消"],
  ];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {screens.map(([screen, label]) => (
        <Link
          key={screen}
          href={buildHref(context, { state: "handoff", screen })}
          style={{
            borderRadius: 999,
            padding: "6px 10px",
            fontSize: 11,
            fontWeight: 700,
            border:
              "1px solid color-mix(in srgb, var(--embed-accent) 18%, transparent)",
            background:
              context.screen === screen ? "var(--embed-accent-soft)" : "white",
          }}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}

function CompactFlow({ context }: { context: EmbedContext }) {
  const footer = (() => {
    switch (context.screen) {
      case "trip":
        return (
          <>
            <ActionLink
              href={buildHref(context, { screen: "receipt" })}
              label="聯絡司機 / 查看收據"
            />
            <ActionLink
              href={buildHref(context, { screen: "cancelled" })}
              label={`取消行程 · 剩 ${embedTrip.cancelWindowMin} 分鐘`}
              tone="danger"
            />
          </>
        );
      case "receipt":
        return (
          <ActionLink
            href={buildHref(context, { screen: "trips" })}
            label="查看歷史行程"
          />
        );
      case "completed":
        return (
          <ActionLink
            href={buildHref(context, { screen: "receipt" })}
            label="查看收據"
          />
        );
      case "cancelled":
        return (
          <ActionLink
            href={buildHref(context, { screen: "book" })}
            label="重新叫車"
          />
        );
      case "nosupply":
      case "ineligible":
      case "denied":
      case "degraded":
        return (
          <>
            <ActionLink
              href={buildHref(context, { screen: "book" })}
              label="返回叫車表單"
            />
            <ActionLink
              href={buildHref(context, { screen: "trip" })}
              label="查看既有行程"
              tone="ghost"
            />
          </>
        );
      default:
        return (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 13,
              }}
            >
              <span>預估車資</span>
              <strong>約 NT$ 290</strong>
            </div>
            <ActionLink
              href={buildHref(context, { screen: "trip" })}
              label="確認叫車"
            />
          </>
        );
    }
  })();

  return (
    <EmbedShell context={context} footer={footer}>
      <FlowNav context={context} />
      {context.screen === "book" ? (
        <>
          <Card
            title={`${embedResident.name} · ${embedResident.unit}`}
            subtitle={context.strings.displayName}
          >
            <div style={{ fontSize: 13, color: "var(--embed-neutral-fg)" }}>
              已綁定 referral handoff session：
              {context.session?.drtsPassengerId}
            </div>
          </Card>
          <Card title="行程" subtitle="上車 · 下車 · 時間">
            <div>上車地點：御和雲峰 A 棟 1F 大廳</div>
            <div>下車地點：台北榮民總醫院 · 門診大樓</div>
            <div>用車時間：現在出發</div>
            <div>常用地點：{embedSavedPlaces.join(" · ")}</div>
          </Card>
          <Card title="車種" subtitle="owned mobility">
            {embedVehicles.map((vehicle) => (
              <div
                key={vehicle.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <span>{vehicle.name}</span>
                <span>{vehicle.note}</span>
              </div>
            ))}
          </Card>
          <Card title="測試負向狀態">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {["nosupply", "ineligible", "denied", "degraded"].map(
                (screen) => (
                  <Link
                    key={screen}
                    href={buildHref(context, { screen })}
                    style={{
                      borderRadius: 999,
                      padding: "6px 10px",
                      border:
                        "1px solid color-mix(in srgb, var(--embed-neutral-fg) 18%, transparent)",
                    }}
                  >
                    {screen}
                  </Link>
                ),
              )}
            </div>
          </Card>
        </>
      ) : null}

      {context.screen === "trip" ? (
        <>
          <Card
            title={`行程 ${embedTrip.id}`}
            subtitle={`${embedTrip.status} · ${embedTrip.statusCode}`}
          >
            <div>上車：{embedTrip.from}</div>
            <div>下車：{embedTrip.to}</div>
            <div>ETA：{embedTrip.etaMin} 分鐘</div>
            <div>
              司機：{embedTrip.driver} · {embedTrip.plate}
            </div>
          </Card>
          <Card>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              此行程已綁定您的 referral passenger 身分。重開社區 App 後仍可透過
              handoff session 找回。
            </div>
          </Card>
        </>
      ) : null}

      {context.screen === "trips" ? (
        <Card title="歷史行程" subtitle="持久身分 · reopen-safe">
          {embedTripHistory.map((trip) => (
            <div
              key={trip.id}
              style={{
                display: "grid",
                gap: 2,
                padding: "8px 0",
                borderBottom:
                  "1px solid color-mix(in srgb, var(--embed-neutral-border) 70%, transparent)",
              }}
            >
              <strong>
                {trip.id} · {trip.status}
              </strong>
              <span>
                {trip.date} · {trip.from} → {trip.to}
              </span>
              <span>{trip.fare}</span>
            </div>
          ))}
        </Card>
      ) : null}

      {context.screen === "receipt" ? (
        <Card title="收據" subtitle={embedReceipt.id}>
          <div>完成時間：{embedReceipt.completedAt}</div>
          <div>
            乘客：{embedReceipt.passenger} · {embedReceipt.maskedPhone}
          </div>
          <div>
            路線：{embedReceipt.from} → {embedReceipt.to}
          </div>
          <div>
            車輛：{embedReceipt.vehicle} · {embedReceipt.plate}
          </div>
          <div>付款：{embedReceipt.pay}</div>
          <div style={{ fontWeight: 900 }}>合計：{embedReceipt.total}</div>
        </Card>
      ) : null}

      {context.screen === "completed" ? (
        <Card title="行程已完成" subtitle="completed">
          <div>本次行程已順利結束，可直接查看收據與歷史行程。</div>
        </Card>
      ) : null}

      {context.screen === "cancelled" ? (
        <Card title="行程已取消" subtitle="cancelled">
          <div>已保留取消結果與來源脈絡，不會丟失既有 handoff 乘客身分。</div>
        </Card>
      ) : null}

      {["nosupply", "ineligible", "denied", "degraded"].includes(
        context.screen,
      ) ? (
        <Card
          title={`負向狀態 · ${context.screen}`}
          subtitle={context.strings.supportPhone}
        >
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            {context.screen === "nosupply"
              ? "附近暫無可派車輛，請稍後重試或改約時間。"
              : null}
            {context.screen === "ineligible"
              ? "您的住戶身分目前未開通叫車服務，請洽社區管理中心。"
              : null}
            {context.screen === "denied"
              ? "此次叫車請求未通過，請確認上下車地點是否在服務範圍內。"
              : null}
            {context.screen === "degraded"
              ? "服務目前回應較慢，系統恢復後會自動繼續。"
              : null}
          </div>
        </Card>
      ) : null}
    </EmbedShell>
  );
}

export function PassengerEmbed({ context }: { context: EmbedContext }) {
  if (context.state === "handoff" && context.screen !== "book") {
    return <CompactFlow context={context} />;
  }

  if (context.state === "handoff" && context.screen === "book") {
    return <CompactFlow context={context} />;
  }

  return <IdentityState context={context} />;
}
