"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { EmbedContext, EmbedState } from "@/lib/embed-context";
import { useTranslation } from "@/lib/i18n";
import {
  embedReceipt,
  embedResident,
  embedSavedPlaces,
  embedTrip,
  embedTripHistory,
  embedVehicles,
} from "@/lib/embed-fixtures";
import { buildEmbedTheme, getEntryHost } from "@/lib/embed-presentation";

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

const EMBED_MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, monospace';

// Minimal inline-SVG glyphs for the embedded webview chrome / hero so the
// passenger embed matches the canvas (passenger-embed-screens.jsx) without
// pulling the management icon set into the public passenger bundle.
const EMBED_GLYPHS: Record<string, string> = {
  chevL: "M15 6l-6 6 6 6",
  lock: "M7 10V7a5 5 0 0110 0v3 M5 10h14v9H5z",
  check: "M5 12l4 4 10-10",
  x: "M6 6l12 12 M18 6L6 18",
  clock: "M12 7v5l3 2 M12 21a9 9 0 100-18 9 9 0 000 18z",
  ban: "M6 6l12 12 M12 21a9 9 0 100-18 9 9 0 000 18z",
  ext: "M14 4h6v6 M20 4l-8 8 M18 13v6H5V6h6",
  shield: "M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z",
  bolt: "M13 3L5 13h6l-1 8 8-10h-6z",
  info: "M12 8h.02 M11 12h1v5h1 M12 21a9 9 0 100-18 9 9 0 000 18z",
};

function EmbedGlyph({
  name,
  size = 14,
  stroke = 2,
}: {
  name: string;
  size?: number;
  stroke?: number;
}) {
  const d = EMBED_GLYPHS[name] ?? EMBED_GLYPHS.info ?? "";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {d.split(" M").map((seg, index) => (
        <path key={index} d={index === 0 ? seg : `M${seg}`} />
      ))}
    </svg>
  );
}

function statusDotColor(
  theme: ReturnType<typeof buildEmbedTheme>,
  state: string,
) {
  if (state === "unsupported") return theme.dangerFg;
  if (state === "reauth" || state === "fallback") return theme.warnFg;
  return theme.successFg;
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
  const { t } = useTranslation();
  const dotColor = statusDotColor(theme, context.state);

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
        fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif',
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
        {/* iOS-style status bar (host device chrome) */}
        <div
          style={{
            background: theme.accent,
            color: "white",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            padding: "10px 18px 6px",
            fontSize: 12.5,
            fontWeight: 600,
          }}
        >
          <span>9:41</span>
          <span
            style={{
              display: "inline-flex",
              gap: 6,
              alignItems: "center",
              opacity: 0.9,
            }}
          >
            <EmbedGlyph name="bolt" size={12} />
            <EmbedGlyph name="shield" size={12} />
          </span>
        </div>

        {/* host app chrome: back affordance + title + entryHost lock chip */}
        <div
          style={{
            background: theme.accent,
            color: "white",
            padding: "4px 12px 12px",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              background: "color-mix(in srgb, white 16%, transparent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <EmbedGlyph name="chevL" size={16} />
          </span>
          <div style={{ flex: 1, lineHeight: 1.2, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700 }}>
              {t("embed.chrome.title")}
            </div>
            <div
              style={{
                fontSize: 10,
                opacity: 0.8,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {appName} · {displayName}
            </div>
          </div>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 9.5,
              fontFamily: EMBED_MONO,
              opacity: 0.85,
              background: "color-mix(in srgb, white 14%, transparent)",
              padding: "4px 8px",
              borderRadius: 999,
              maxWidth: 150,
            }}
          >
            <EmbedGlyph name="lock" size={10} />
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {getEntryHost(context.entry)}
            </span>
          </span>
        </div>

        {/* webview surface badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 14px",
            fontSize: 10.5,
            color: theme.neutralFg,
            background: theme.neutralBg,
            borderBottom: `1px solid ${theme.neutralBorder}`,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              background: dotColor,
              flexShrink: 0,
            }}
          />
          <span style={{ fontFamily: EMBED_MONO }}>
            {t("embed.chrome.webview")}
          </span>
          <span style={{ opacity: 0.7 }}>
            · embedded · /embed/{context.entry.entrySlug}
          </span>
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
  const { t } = useTranslation();
  const handoffRows: Array<[string, string]> = [
    [t("embed.field.signature"), "valid"],
    [t("embed.field.identity"), embedResident.name],
    [t("embed.field.unit"), embedResident.unit],
  ];
  const bodyByState = {
    handoff: {
      title: t("embed.state.handoff.title", {
        name: context.strings.displayName,
      }),
      badge: t("embed.state.handoff.badge"),
      tone: "success",
      icon: "check",
      footer: (
        <ActionLink
          href={buildHref(context, { screen: "book" })}
          label={t("embed.field.confirmRide")}
        />
      ),
      message: t("embed.message.handoff", { appName: context.strings.appName }),
    },
    reauth: {
      title: t("embed.state.reauth.title"),
      badge: t("embed.state.reauth.badge"),
      tone: "warn",
      icon: "clock",
      footer: (
        <>
          <ActionLink
            href={buildHref(context, { state: "handoff" })}
            label={t("embed.field.returnToEntry", {
              appName: context.strings.appName,
            })}
          />
          <ActionLink
            href={buildHref(context, { state: "fallback" })}
            label={t("embed.field.tryLater")}
            tone="ghost"
          />
        </>
      ),
      message: t("embed.message.reauth", { appName: context.strings.appName }),
    },
    unsupported: {
      title: t("embed.state.unsupported.title"),
      badge: t("embed.state.unsupported.badge"),
      tone: "danger",
      icon: "ban",
      footer: (
        <ActionLink
          href={buildHref(context, { state: "fallback" })}
          label={t("embed.field.openStandalone")}
        />
      ),
      message: t("embed.message.unsupported"),
    },
    consent: {
      title: t("embed.state.consent.title"),
      badge: t("embed.state.consent.badge"),
      tone: "info",
      icon: "shield",
      footer: (
        <>
          <ActionLink
            href={buildHref(context, { state: "handoff", screen: "book" })}
            label={t("embed.field.agree")}
          />
          <ActionLink
            href={buildHref(context, { state: "fallback" })}
            label={t("embed.field.notNow")}
            tone="ghost"
          />
        </>
      ),
      message: t("embed.message.consent"),
    },
    fallback: {
      title: t("embed.state.fallback.title"),
      badge: t("embed.state.fallback.badge"),
      tone: "warn",
      icon: "ext",
      footer: (
        <>
          <ActionLink
            href={buildHref(context, { state: "fallback", screen: "receipt" })}
            label={t("embed.field.openStandalone")}
          />
          <ActionLink
            href={buildHref(context, { state: "handoff" })}
            label={t("embed.field.returnToApp")}
            tone="ghost"
          />
        </>
      ),
      message: t("embed.message.fallback"),
    },
  } as const;

  const current = bodyByState[context.state];
  const tone = toneStyle(theme, current.tone);
  const isHandoff = context.state === "handoff";

  // canvas PE_Reauth / PE_Unsupported show a status card with failed (x) token
  // rows alongside the prose. Render the matching detection rows per state.
  const detectionByState: Partial<
    Record<EmbedState, { title: string; rows: Array<[string, string]> }>
  > = {
    reauth: {
      title: t("embed.token.connState"),
      rows: [
        [t("embed.token.partnerSession"), t("embed.token.partnerSessionValue")],
        [t("embed.token.handoffToken"), t("embed.token.handoffTokenValue")],
      ],
    },
    unsupported: {
      title: t("embed.token.detection"),
      rows: [
        [t("embed.token.originHost"), t("embed.token.originHostValue")],
        [
          t("embed.token.partnerSignature"),
          t("embed.token.partnerSignatureValue"),
        ],
      ],
    },
  };
  const detection = detectionByState[context.state];

  return (
    <EmbedShell context={context} footer={current.footer}>
      {/* hero: circular icon tile + title + posture pill (canvas PeHero) */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
          padding: "10px 0 2px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 58,
            height: 58,
            borderRadius: 29,
            background: tone.background,
            color: tone.color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <EmbedGlyph name={current.icon} size={28} stroke={2.2} />
        </div>
        <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1.25 }}>
          {current.title}
        </div>
        <div
          style={{
            ...tone,
            border: `1px solid ${tone.borderColor}`,
            borderRadius: 999,
            padding: "5px 12px",
            fontSize: 11,
            fontWeight: 800,
          }}
        >
          {current.badge}
        </div>
      </div>

      {isHandoff ? (
        <Card
          title={t("embed.card.handoffSummary")}
          subtitle={t("embed.card.handoffSubtitle")}
        >
          {handoffRows.map(([label, value]) => (
            <TokenRow
              key={label}
              ok
              theme={theme}
              label={label}
              value={value}
            />
          ))}
          <TokenRow
            theme={theme}
            ok
            label={t("embed.field.passengerId")}
            value={context.session?.drtsPassengerId || t("common.none")}
          />
        </Card>
      ) : null}

      <Card>
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>{current.message}</div>
      </Card>

      {detection ? (
        <Card title={detection.title}>
          {detection.rows.map(([label, value]) => (
            <TokenRow
              key={label}
              ok={false}
              theme={theme}
              label={label}
              value={value}
            />
          ))}
        </Card>
      ) : null}
    </EmbedShell>
  );
}

function TokenRow({
  theme,
  ok,
  label,
  value,
}: {
  theme: ReturnType<typeof buildEmbedTheme>;
  ok: boolean;
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 13,
      }}
    >
      <span
        style={{
          width: 19,
          height: 19,
          borderRadius: 10,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: ok ? theme.successBg : theme.dangerBg,
          color: ok ? theme.successFg : theme.dangerFg,
        }}
      >
        <EmbedGlyph name={ok ? "check" : "x"} size={11} stroke={3} />
      </span>
      <span style={{ flex: 1 }}>{label}</span>
      <strong style={{ fontFamily: EMBED_MONO, fontSize: 12 }}>{value}</strong>
    </div>
  );
}

function FlowNav({ context }: { context: EmbedContext }) {
  const { t } = useTranslation();
  const screens: Array<[string, string]> = [
    ["book", t("embed.nav.book")],
    ["trip", t("embed.nav.trip")],
    ["trips", t("embed.nav.trips")],
    ["receipt", t("embed.nav.receipt")],
    ["completed", t("embed.nav.completed")],
    ["cancelled", t("embed.nav.cancelled")],
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
  const { t } = useTranslation();

  const footer = (() => {
    switch (context.screen) {
      case "trip":
        return (
          <>
            <ActionLink
              href={buildHref(context, { screen: "receipt" })}
              label={t("embed.field.contact")}
            />
            <ActionLink
              href={buildHref(context, { screen: "cancelled" })}
              label={t("embed.field.cancelTrip", {
                minutes: embedTrip.cancelWindowMin,
              })}
              tone="danger"
            />
          </>
        );
      case "receipt":
        return (
          <ActionLink
            href={buildHref(context, { screen: "trips" })}
            label={t("embed.field.viewHistory")}
          />
        );
      case "completed":
        return (
          <ActionLink
            href={buildHref(context, { screen: "receipt" })}
            label={t("embed.field.viewReceipt")}
          />
        );
      case "cancelled":
        return (
          <ActionLink
            href={buildHref(context, { screen: "book" })}
            label={t("embed.field.rebook")}
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
              label={t("embed.field.backToBook")}
            />
            <ActionLink
              href={buildHref(context, { screen: "trip" })}
              label={t("embed.field.viewTrip")}
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
              <span>{t("common.estimatedFare")}</span>
              <strong>{t("common.approxNtd", { amount: 290 })}</strong>
            </div>
            <ActionLink
              href={buildHref(context, { screen: "trip" })}
              label={t("embed.field.confirmRide")}
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
            title={t("embed.book.subtitle", {
              name: embedResident.name,
              unit: embedResident.unit,
            })}
            subtitle={context.strings.displayName}
          >
            <div style={{ fontSize: 13, color: "var(--embed-neutral-fg)" }}>
              {t("embed.book.identity", {
                id: context.session?.drtsPassengerId || t("common.none"),
              })}
            </div>
          </Card>
          <Card
            title={t("embed.card.trip")}
            subtitle={t("embed.card.tripSubtitle")}
          >
            <div>
              {t("embed.field.pickup")}：{t("embed.book.pickup")}
            </div>
            <div>
              {t("embed.field.dropoff")}：{t("embed.book.dropoff")}
            </div>
            <div>
              {t("embed.field.when")}：{t("embed.book.now")}
            </div>
            <div>
              {t("embed.field.savedPlaces")}：
              {embedSavedPlaces
                .map((place) => t(`embed.place.${place}`))
                .join(" · ")}
            </div>
          </Card>
          <Card
            title={t("embed.card.vehicles")}
            subtitle={t("embed.card.vehiclesSubtitle")}
          >
            {embedVehicles.map((vehicle) => (
              <div
                key={vehicle.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <span>{t(`embed.vehicle.${vehicle.id}.name`)}</span>
                <span>{t(`embed.vehicle.${vehicle.id}.note`)}</span>
              </div>
            ))}
          </Card>
          <Card title={t("embed.card.negatives")}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {(["nosupply", "ineligible", "denied", "degraded"] as const).map(
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
                    {t(`embed.book.negative.${screen}`)}
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
            title={t("trip.snapshot.kicker", { id: embedTrip.id })}
            subtitle={`${t(`embed.trip.status.${embedTrip.statusCode}`)} · ${embedTrip.statusCode}`}
          >
            <div>
              {t("embed.field.pickup")}：{t("embed.book.pickup")}
            </div>
            <div>
              {t("embed.field.dropoff")}：{t("embed.book.dropoff")}
            </div>
            <div>
              {t("embed.field.eta")}：{embedTrip.etaMin}
            </div>
            <div>
              {t("embed.field.driver")}：{embedTrip.driver} · {embedTrip.plate}
            </div>
          </Card>
          <Card>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              {t("embed.trip.bound")}
            </div>
          </Card>
        </>
      ) : null}

      {context.screen === "trips" ? (
        <Card
          title={t("embed.card.history")}
          subtitle={t("embed.card.historySubtitle")}
        >
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
                {trip.id} · {t(`embed.history.${trip.status}`)}
              </strong>
              <span>
                {trip.date} · {t(`embed.place.${trip.from}`)} →{" "}
                {t(`embed.place.${trip.to}`)}
              </span>
              <span>{trip.fare}</span>
            </div>
          ))}
        </Card>
      ) : null}

      {context.screen === "receipt" ? (
        <Card title={t("embed.card.receipt")} subtitle={embedReceipt.id}>
          <div>
            {t("embed.field.completedAt")}：{embedReceipt.completedAt}
          </div>
          <div>
            {t("embed.field.passenger")}：{embedReceipt.passenger} ·{" "}
            {embedReceipt.maskedPhone}
          </div>
          <div>
            {t("embed.field.route")}：{t("embed.place.station")} →{" "}
            {t("embed.book.pickup")}
          </div>
          <div>
            {t("embed.field.vehicle")}：{t("embed.vehicle.standard.name")} ·{" "}
            {embedReceipt.plate}
          </div>
          <div>
            {t("embed.field.payment")}：{t("embed.receipt.pay")}
          </div>
          <div style={{ fontWeight: 900 }}>
            {t("embed.field.total")}：{embedReceipt.total}
          </div>
        </Card>
      ) : null}

      {context.screen === "completed" ? (
        <Card title={t("embed.card.completed")} subtitle="completed">
          <div>{t("embed.completed.body")}</div>
        </Card>
      ) : null}

      {context.screen === "cancelled" ? (
        <Card title={t("embed.card.cancelled")} subtitle="cancelled">
          <div>{t("embed.cancelled.body")}</div>
        </Card>
      ) : null}

      {(["nosupply", "ineligible", "denied", "degraded"] as const).includes(
        context.screen as "nosupply" | "ineligible" | "denied" | "degraded",
      ) ? (
        <Card
          title={t("embed.card.negative", { screen: context.screen })}
          subtitle={context.strings.supportPhone}
        >
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            {t(`embed.negative.${context.screen}`)}
          </div>
        </Card>
      ) : null}
    </EmbedShell>
  );
}

export function PassengerEmbed({ context }: { context: EmbedContext }) {
  if (context.state === "handoff") {
    return <CompactFlow context={context} />;
  }

  return <IdentityState context={context} />;
}
