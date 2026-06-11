import type { CSSProperties, ReactNode } from "react";
import {
  getProgramChromeVars,
  type PartnerProgramTheme,
} from "@/lib/program-theme";
import { getProgramScreenHref } from "@/lib/program-screens";
import { t } from "@/lib/translations";

/**
 * S2 online-banking-app EMBED identity states (B1–B5), the embedded counterpart
 * to the standalone partner-booking funnel.
 *
 * Mirrors the human design canvas `docs/05-ui/drts-design-canvas/pb-embed.jsx`
 * (functions `PB_EmbedHandoff` / `PB_EmbedReauth` / `PB_EmbedUnsupported` /
 * `PB_EmbedConsent` / `PB_EmbedFallback`). The embed runs inside the issuer's
 * mobile-banking webview, so:
 *
 *  - identity arrives from the host bank session as a signed issuer *reference
 *    token* — the embed NEVER captures raw card data (no card number / no PAN /
 *    no password input);
 *  - host chrome is compact (a slim bank-app top bar above the webview);
 *  - the entry is host-resolved: an unauthorized origin renders the blocked
 *    `unsupported` state, and the `fallback` state routes the user back to the
 *    standalone airport-transfer funnel (`/${tenantSlug}/program`).
 *
 * Brand identity (palette + issuer wording) comes from {@link PartnerProgramTheme}
 * via `@/lib/program-theme`, never a hand-picked hex — only semantic status
 * colors (ok/warn/err/neutral) and shared neutrals are inlined, matching the
 * sibling `program-screens.tsx`. zh-TW copy is sourced through `t()`.
 */

const EMBED_MONO = '"JetBrains Mono", ui-monospace, monospace';

export const EMBED_IDENTITY_STATES = [
  { id: "handoff", segment: "handoff", labelKey: "embed.state.handoff.label" },
  { id: "reauth", segment: "reauth", labelKey: "embed.state.reauth.label" },
  {
    id: "unsupported",
    segment: "unsupported",
    labelKey: "embed.state.unsupported.label",
  },
  { id: "consent", segment: "consent", labelKey: "embed.state.consent.label" },
  {
    id: "fallback",
    segment: "fallback",
    labelKey: "embed.state.fallback.label",
  },
] as const;

export type EmbedIdentityStateId = (typeof EMBED_IDENTITY_STATES)[number]["id"];

const stateBySegment = Object.fromEntries(
  EMBED_IDENTITY_STATES.map((state) => [state.segment, state.id]),
) as Record<string, EmbedIdentityStateId>;

export function isEmbedIdentityState(
  value: string,
): value is EmbedIdentityStateId {
  return value in stateBySegment;
}

/** Resolve a URL segment to an embed state id, or `undefined` if unknown. */
export function resolveEmbedStateSegment(
  segment: string,
): EmbedIdentityStateId | undefined {
  return stateBySegment[segment];
}

/**
 * Host-resolved entry guard. The embed is only authorized inside the issuer's
 * own banking host; any other origin is forced to the blocked `unsupported`
 * state regardless of the requested segment.
 */
export function resolveEmbedState(
  theme: PartnerProgramTheme,
  requested: EmbedIdentityStateId,
  originHost?: string | null,
): EmbedIdentityStateId {
  const origin = (originHost ?? "").trim().toLowerCase();
  if (origin && origin !== theme.host.toLowerCase()) {
    return "unsupported";
  }
  return requested;
}

type ChromeState = "live" | "warn" | "err" | "neutral";
type ChipTone = "ok" | "warn" | "err" | "neutral";

const STATE_DOT: Record<ChromeState, string> = {
  live: "#16A34A",
  warn: "#D97706",
  err: "#DC2626",
  neutral: "#94A3B8",
};

function brandParams(theme: PartnerProgramTheme) {
  return { brand: theme.issuerName };
}

// ── Compact bank-app chrome: slim host bar above the embedded webview. ────────
function EmbedChrome({
  theme,
  host,
  state,
  children,
}: {
  theme: PartnerProgramTheme;
  host?: string;
  state: ChromeState;
  children: ReactNode;
}) {
  const hostLabel = host ?? theme.host;
  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#EEF1F7",
        borderRadius: "18px",
        overflow: "hidden",
        border: "1px solid #E1E6EF",
      }}
      data-program-kind={theme.kind}
      data-embed-host={hostLabel}
    >
      {/* bank app top bar (host chrome — compact) */}
      <div
        style={{
          background: theme.primaryDark,
          color: "#ffffff",
          padding: "10px 14px 11px",
          display: "flex",
          alignItems: "center",
          gap: "9px",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "14px",
            background: "rgba(255,255,255,0.14)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
          >
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </span>
        <div style={{ flex: 1, lineHeight: 1.2 }}>
          <div style={{ fontSize: "13.5px", fontWeight: 700 }}>
            {t("embed.chrome.service")}
          </div>
          <div style={{ fontSize: "10px", opacity: 0.72 }}>
            {t("embed.chrome.host", brandParams(theme))}
          </div>
        </div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            fontSize: "9.5px",
            fontFamily: EMBED_MONO,
            opacity: 0.72,
            background: "rgba(255,255,255,0.10)",
            padding: "4px 8px",
            borderRadius: "999px",
          }}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
          >
            <rect x="4" y="11" width="16" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 018 0v3" />
          </svg>
          {hostLabel}
        </div>
      </div>
      {/* webview surface badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "6px 14px",
          background: "#ffffff",
          borderBottom: "1px solid #E8ECF3",
          fontSize: "10.5px",
          color: "#56657F",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "3px",
            background: STATE_DOT[state],
          }}
        />
        <span style={{ fontFamily: EMBED_MONO }}>webview</span>
        <span style={{ color: "#9CA3AF" }}>
          {t("embed.chrome.webviewNote", brandParams(theme))}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>{children}</div>
    </div>
  );
}

function EmbedChip({
  tone,
  children,
}: {
  tone: ChipTone;
  children: ReactNode;
}) {
  const palette: Record<ChipTone, CSSProperties> = {
    ok: {
      color: "#15803D",
      background: "#F0FDF4",
      border: "1px solid #BBF7D0",
    },
    warn: {
      color: "#B45309",
      background: "#FFFBEB",
      border: "1px solid #FDE68A",
    },
    err: {
      color: "#B42318",
      background: "#FEF2F2",
      border: "1px solid #FECACA",
    },
    neutral: {
      color: "#56657F",
      background: "#F1F3F8",
      border: "1px solid #DDE3EC",
    },
  };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 9px",
        borderRadius: "999px",
        fontSize: "11px",
        fontWeight: 700,
        fontFamily: EMBED_MONO,
        ...palette[tone],
      }}
    >
      {children}
    </span>
  );
}

function EmbedCard({
  theme,
  title,
  accentBar,
  children,
}: {
  theme: PartnerProgramTheme;
  title?: string;
  accentBar?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      style={{
        borderRadius: "14px",
        border: "1px solid #E8ECF3",
        background: "#ffffff",
        overflow: "hidden",
        borderLeft: accentBar ? `3px solid ${theme.primary}` : undefined,
      }}
    >
      {title ? (
        <header
          style={{
            padding: "11px 14px 9px",
            borderBottom: "1px solid #F1F3F8",
            fontSize: "12.5px",
            fontWeight: 700,
            color: "#0E1424",
          }}
        >
          {title}
        </header>
      ) : null}
      <div style={{ padding: "13px 14px" }}>{children}</div>
    </section>
  );
}

function EmbedRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "12px",
        padding: "8px 0",
        borderBottom: "1px dashed #F1F3F8",
        fontSize: "13px",
      }}
    >
      <span style={{ color: "#56657F" }}>{label}</span>
      <span
        style={{
          color: "#0E1424",
          fontFamily: mono ? EMBED_MONO : "inherit",
          fontWeight: mono ? 600 : 500,
          textAlign: "right",
        }}
      >
        {value}
      </span>
    </div>
  );
}

// Identity token-resolution row (issuer reference token — never raw card data).
function EmbedTokenRow({
  ok,
  label,
  code,
  value,
}: {
  ok: boolean;
  label: string;
  code?: string;
  value: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "9px 0",
        borderBottom: "1px dashed #F1F3F8",
      }}
    >
      <span
        style={{
          width: "18px",
          height: "18px",
          borderRadius: "9px",
          background: ok ? "#F0FDF4" : "#FEF2F2",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {ok ? (
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#15803D"
            strokeWidth="3"
          >
            <path d="M5 12l5 5L20 7" />
          </svg>
        ) : (
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#DC2626"
            strokeWidth="3"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        )}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "12.5px", color: "#0E1424", fontWeight: 500 }}>
          {label}
        </div>
        {code ? (
          <div
            style={{
              fontFamily: EMBED_MONO,
              fontSize: "9.5px",
              color: "#9CA3AF",
            }}
          >
            {code}
          </div>
        ) : null}
      </div>
      <span
        style={{
          fontSize: "12px",
          fontFamily: EMBED_MONO,
          color: ok ? "#0E1424" : "#DC2626",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function EmbedButton({
  theme,
  label,
  href,
  primary,
  ghost,
}: {
  theme: PartnerProgramTheme;
  label: string;
  href?: string;
  primary?: boolean;
  ghost?: boolean;
}) {
  const style: CSSProperties = {
    width: "100%",
    minHeight: "46px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "12px",
    fontSize: "14px",
    fontWeight: 700,
    textDecoration: "none",
    cursor: "pointer",
    border: primary
      ? `1px solid ${theme.primary}`
      : ghost
        ? "1px solid transparent"
        : "1px solid #D2D8E2",
    background: primary ? theme.primary : ghost ? "transparent" : "#ffffff",
    color: primary ? "#ffffff" : ghost ? theme.primaryDark : "#0E1424",
  };
  if (href) {
    return (
      <a href={href} style={style}>
        {label}
      </a>
    );
  }
  return (
    <button type="button" style={style}>
      {label}
    </button>
  );
}

function EmbedFooter({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gap: "8px",
        padding: "12px 16px 16px",
        borderTop: "1px solid #E8ECF3",
        background: "#ffffff",
      }}
    >
      {children}
    </div>
  );
}

function HeroIcon({ bg, children }: { bg: string; children: ReactNode }) {
  return (
    <div
      style={{
        width: "56px",
        height: "56px",
        borderRadius: "28px",
        background: bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </div>
  );
}

function StateBody({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      {children}
    </div>
  );
}

function renderEmbedState(
  theme: PartnerProgramTheme,
  state: EmbedIdentityStateId,
  basePath: string,
  originHost?: string,
): ReactNode {
  // Fallback / unsupported route the rider back to the standalone funnel
  // entry (the `landing` bootstrap), where they self-verify eligibility.
  const standaloneHref = `${basePath}/program`;
  // Hand-off (B1) and consent (B4) already carry a resolved issuer identity,
  // so their primary CTA continues *inside* the embed: it skips the standalone
  // `landing` bootstrap and enters the funnel at eligibility/booking directly.
  const embedContinueHref = getProgramScreenHref(
    `${basePath}/program`,
    "eligibility",
  );

  if (state === "handoff") {
    return (
      <EmbedChrome theme={theme} state="live">
        <StateBody>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "10px",
              padding: "10px 0 2px",
            }}
          >
            <HeroIcon bg={theme.surface.bg}>
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke={theme.primary}
                strokeWidth="2"
              >
                <path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </HeroIcon>
            <div style={{ fontSize: "16px", fontWeight: 700 }}>
              {t("embed.handoff.title")}
            </div>
            <EmbedChip tone="ok">{t("embed.handoff.chip")}</EmbedChip>
          </div>
          <EmbedCard theme={theme} title={t("embed.handoff.cardTitle")}>
            <EmbedTokenRow
              ok
              label={t("embed.handoff.row.signature")}
              code="issuer_signature"
              value="valid"
            />
            <EmbedTokenRow
              ok
              label={t("embed.handoff.row.cardholder")}
              code="cardholder_resolved"
              value="陳〇明"
            />
            <EmbedTokenRow
              ok
              label={t("embed.handoff.row.refToken")}
              code="ref_token"
              value="tok_••••_9F2"
            />
            <div style={{ marginTop: "4px" }}>
              <EmbedRow
                label={t("embed.handoff.row.benefit")}
                value={t("embed.handoff.benefitValue")}
              />
            </div>
          </EmbedCard>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 12px",
              background: theme.surface.bg,
              border: `1px solid ${theme.surface.border}`,
              borderRadius: "9px",
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke={theme.primaryDark}
              strokeWidth="2"
              style={{ flexShrink: 0 }}
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v4l3 2" />
            </svg>
            <span
              style={{ fontSize: "11.5px", color: "#0E1424", lineHeight: 1.4 }}
            >
              {t("embed.handoff.note")}
            </span>
          </div>
        </StateBody>
        <EmbedFooter>
          <EmbedButton
            theme={theme}
            label={t("embed.handoff.cta")}
            href={embedContinueHref}
            primary
          />
        </EmbedFooter>
      </EmbedChrome>
    );
  }

  if (state === "reauth") {
    return (
      <EmbedChrome theme={theme} state="warn">
        <StateBody>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "10px",
              padding: "10px 0 2px",
            }}
          >
            <HeroIcon bg="#FFFBEB">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#B45309"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
            </HeroIcon>
            <div style={{ fontSize: "16px", fontWeight: 700 }}>
              {t("embed.reauth.title")}
            </div>
            <EmbedChip tone="warn">{t("embed.reauth.chip")}</EmbedChip>
          </div>
          <EmbedCard theme={theme} title={t("embed.reauth.cardTitle")}>
            <EmbedTokenRow
              ok={false}
              label={t("embed.reauth.row.session")}
              code="issuer_session"
              value="expired"
            />
            <EmbedTokenRow
              ok={false}
              label={t("embed.reauth.row.refToken")}
              code="ref_token"
              value="stale"
            />
          </EmbedCard>
          <EmbedCard theme={theme} accentBar>
            <div
              style={{ fontSize: "12.5px", color: "#0E1424", lineHeight: 1.6 }}
            >
              {t("embed.reauth.body", brandParams(theme))}{" "}
              <b>{t("embed.reauth.bodyStrong")}</b>
            </div>
          </EmbedCard>
        </StateBody>
        <EmbedFooter>
          <EmbedButton theme={theme} label={t("embed.reauth.cta")} primary />
          <EmbedButton
            theme={theme}
            label={t("embed.reauth.secondary")}
            ghost
          />
        </EmbedFooter>
      </EmbedChrome>
    );
  }

  if (state === "unsupported") {
    return (
      <EmbedChrome
        theme={theme}
        host={originHost ?? "unknown-host.example"}
        state="err"
      >
        <StateBody>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "10px",
              padding: "10px 0 2px",
            }}
          >
            <HeroIcon bg="#FEE4E2">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#B42318"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M6 6l12 12" />
              </svg>
            </HeroIcon>
            <div style={{ fontSize: "16px", fontWeight: 700 }}>
              {t("embed.unsupported.title")}
            </div>
            <EmbedChip tone="err">{t("embed.unsupported.chip")}</EmbedChip>
          </div>
          <EmbedCard theme={theme} title={t("embed.unsupported.reasonTitle")}>
            <div
              style={{ fontSize: "13px", color: "#0E1424", lineHeight: 1.6 }}
            >
              {t("embed.unsupported.reason")}
            </div>
          </EmbedCard>
          <EmbedCard theme={theme} title={t("embed.unsupported.detectTitle")}>
            <EmbedTokenRow
              ok={false}
              label={t("embed.unsupported.row.origin")}
              code="origin_host"
              value={t("embed.unsupported.row.originValue")}
            />
            <EmbedTokenRow
              ok={false}
              label={t("embed.unsupported.row.signature")}
              code="issuer_signature"
              value={t("embed.unsupported.row.signatureValue")}
            />
          </EmbedCard>
          <div
            style={{
              fontSize: "11.5px",
              color: "#56657F",
              lineHeight: 1.55,
              padding: "0 4px",
            }}
          >
            {t("embed.unsupported.hint", brandParams(theme))}
          </div>
        </StateBody>
        <EmbedFooter>
          <EmbedButton
            theme={theme}
            label={t("embed.unsupported.cta")}
            href={standaloneHref}
            primary
          />
        </EmbedFooter>
      </EmbedChrome>
    );
  }

  if (state === "consent") {
    const scopes: ReadonlyArray<{ title: string; desc: string; code: string }> =
      [
        {
          title: t("embed.consent.scope.identity.title"),
          desc: t("embed.consent.scope.identity.desc"),
          code: "identity.read",
        },
        {
          title: t("embed.consent.scope.trip.title"),
          desc: t("embed.consent.scope.trip.desc"),
          code: "trip.share",
        },
        {
          title: t("embed.consent.scope.billing.title"),
          desc: t("embed.consent.scope.billing.desc"),
          code: "billing.link",
        },
      ];
    return (
      <EmbedChrome theme={theme} state="live">
        <StateBody>
          <div style={{ padding: "6px 0 2px" }}>
            <div style={{ fontSize: "17px", fontWeight: 700 }}>
              {t("embed.consent.title")}
            </div>
            <div
              style={{ fontSize: "12.5px", color: "#56657F", marginTop: "4px" }}
            >
              {t("embed.consent.subtitle")}
            </div>
          </div>
          <EmbedCard theme={theme}>
            {scopes.map((scope, index) => (
              <div
                key={scope.code}
                style={{
                  display: "flex",
                  gap: "12px",
                  padding: "11px 0",
                  borderBottom:
                    index < scopes.length - 1 ? "1px dashed #F1F3F8" : "none",
                }}
              >
                <span
                  style={{
                    width: "20px",
                    height: "20px",
                    borderRadius: "5px",
                    background: theme.primary,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    marginTop: "1px",
                  }}
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="3"
                  >
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                </span>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "7px",
                    }}
                  >
                    <span style={{ fontSize: "13px", fontWeight: 600 }}>
                      {scope.title}
                    </span>
                    <span
                      style={{
                        fontFamily: EMBED_MONO,
                        fontSize: "9.5px",
                        color: "#9CA3AF",
                      }}
                    >
                      {scope.code}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "11.5px",
                      color: "#56657F",
                      marginTop: "2px",
                      lineHeight: 1.45,
                    }}
                  >
                    {scope.desc}
                  </div>
                </div>
              </div>
            ))}
          </EmbedCard>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "8px",
              padding: "10px 12px",
              background: theme.surface.bg,
              border: `1px solid ${theme.surface.border}`,
              borderRadius: "9px",
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke={theme.primaryDark}
              strokeWidth="2"
              style={{ flexShrink: 0, marginTop: "1px" }}
            >
              <rect x="4" y="11" width="16" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 018 0v3" />
            </svg>
            <span
              style={{ fontSize: "11.5px", color: "#0E1424", lineHeight: 1.45 }}
            >
              {t("embed.consent.note", brandParams(theme))}
            </span>
          </div>
        </StateBody>
        <EmbedFooter>
          <EmbedButton
            theme={theme}
            label={t("embed.consent.cta")}
            href={embedContinueHref}
            primary
          />
          <EmbedButton
            theme={theme}
            label={t("embed.consent.secondary")}
            ghost
          />
        </EmbedFooter>
      </EmbedChrome>
    );
  }

  // fallback
  return (
    <EmbedChrome theme={theme} state="neutral">
      <StateBody>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "10px",
            padding: "10px 0 2px",
          }}
        >
          <HeroIcon bg="#F1F3F8">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#56657F"
              strokeWidth="2"
            >
              <path d="M10 14L21 3M21 3h-6M21 3v6" />
              <path d="M21 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h5" />
            </svg>
          </HeroIcon>
          <div style={{ fontSize: "16px", fontWeight: 700 }}>
            {t("embed.fallback.title")}
          </div>
          <EmbedChip tone="neutral">{t("embed.fallback.chip")}</EmbedChip>
        </div>
        <EmbedCard theme={theme} title={t("embed.fallback.nextTitle")}>
          <div style={{ fontSize: "13px", color: "#0E1424", lineHeight: 1.6 }}>
            {t("embed.fallback.bodyPre", brandParams(theme))}
            <b>{t("embed.fallback.bodyStrong")}</b>
            {t("embed.fallback.bodyPost")}
          </div>
        </EmbedCard>
        <EmbedCard theme={theme}>
          <EmbedRow
            label={t("embed.fallback.row.site")}
            value={theme.host}
            mono
          />
          <EmbedRow
            label={t("embed.fallback.row.verify")}
            value={t("embed.fallback.row.verifyValue")}
          />
          <EmbedRow
            label={t("embed.fallback.row.security")}
            value={t("embed.fallback.row.securityValue")}
          />
        </EmbedCard>
      </StateBody>
      <EmbedFooter>
        <EmbedButton
          theme={theme}
          label={t("embed.fallback.cta")}
          href={standaloneHref}
          primary
        />
        <EmbedButton
          theme={theme}
          label={t("embed.fallback.secondary")}
          ghost
        />
      </EmbedFooter>
    </EmbedChrome>
  );
}

/**
 * Host-resolved embed identity surface. Applies the program chrome vars and
 * renders the active embed state inside the compact bank-app webview frame,
 * with a state-switch nav for design review (the live entry is resolved by
 * {@link resolveEmbedState}).
 */
export function EmbedIdentityFlow({
  theme,
  state,
  basePath,
  originHost,
}: {
  theme: PartnerProgramTheme;
  state: EmbedIdentityStateId;
  basePath: string;
  originHost?: string | undefined;
}) {
  return (
    <div
      style={{
        ...getProgramChromeVars(theme),
        display: "grid",
        gap: "16px",
        background: theme.chrome.pageBackground,
        color: theme.chrome.pageForeground,
        borderRadius: "20px",
        padding: "20px",
        border: `1px solid ${theme.chrome.panelBorder}`,
      }}
      data-program-kind={theme.kind}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div
          style={{
            fontSize: "12px",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: theme.primary,
            fontWeight: 800,
          }}
        >
          {t("embed.flow.eyebrow")}
        </div>
        <EmbedChip tone="neutral">{`host: ${theme.host}`}</EmbedChip>
      </div>

      <nav style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        {EMBED_IDENTITY_STATES.map((meta) => {
          const isActive = meta.id === state;
          return (
            <a
              key={meta.id}
              href={`${basePath}/embed/${meta.segment}`}
              style={{
                textDecoration: "none",
                padding: "8px 12px",
                borderRadius: "12px",
                border: isActive
                  ? `1px solid ${theme.primary}`
                  : "1px solid rgba(15, 23, 42, 0.10)",
                background: isActive ? theme.surface.bg : "#ffffff",
                color: isActive ? theme.primary : "#0E1424",
                fontSize: "13px",
                fontWeight: 700,
              }}
            >
              {t(meta.labelKey)}
            </a>
          );
        })}
      </nav>

      <div
        style={{
          fontSize: "13px",
          lineHeight: 1.6,
          color: theme.chrome.pageMuted,
        }}
      >
        {t("embed.flow.summary")}
      </div>

      <div style={{ maxWidth: "420px", width: "100%" }}>
        {renderEmbedState(theme, state, basePath, originHost)}
      </div>
    </div>
  );
}
