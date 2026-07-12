import Link from "next/link";
import type { ReactNode } from "react";
import {
  EBanner,
  EBtnContent,
  ECard,
  EIcon,
  EPill,
  ERow,
  entBtnStyle,
  type EBtnVariant,
  type EntTone,
} from "@/components/ent-kit";
import { EnterpriseEmbedShell } from "@/components/enterprise-shell";
import { enterpriseTenant, getEnterpriseUser } from "@/lib/enterprise-fixtures";
import { enterpriseTheme as t } from "@/lib/enterprise-theme";
import {
  getEnterpriseEmbedState,
  getEnterpriseGate,
  type EnterpriseEmbedStateKind,
  type EnterpriseGateKind,
} from "@/lib/enterprise-route-config";
import { getServerLocale } from "@/lib/server-locale";
import {
  type Locale,
  type TranslationKey,
  t as translate,
} from "@/lib/translations";

function LinkBtn({
  href,
  variant = "default",
  block,
  size = "md",
  children,
}: {
  href: string;
  variant?: EBtnVariant;
  block?: boolean;
  size?: "md" | "sm";
  children: ReactNode;
}) {
  return (
    <Link href={href} style={entBtnStyle(t, { variant, block, size })}>
      {children}
    </Link>
  );
}

// ── gate template (web) — calm, support-safe, enterprise-branded (VQ-5) ───────
const GATE_ICON: Record<EnterpriseGateKind, { icon: string; tone: EntTone }> = {
  "auth-required": { icon: "lock", tone: "primary" },
  suspended: { icon: "ban", tone: "danger" },
  "approval-pending": { icon: "shield", tone: "warn" },
  "approval-rejected": { icon: "x", tone: "danger" },
  "quota-blocked": { icon: "bolt", tone: "warn" },
  "no-supply": { icon: "car", tone: "danger" },
  degraded: { icon: "alert", tone: "warn" },
};

const GATE_ROUTE: Record<EnterpriseGateKind, string> = {
  "auth-required": "/auth-required",
  suspended: "/suspended",
  "approval-pending": "/approval-pending",
  "approval-rejected": "/approval-rejected",
  "quota-blocked": "/quota-blocked",
  "no-supply": "/no-supply",
  degraded: "/degraded",
};

export async function EnterpriseGatePage({
  kind,
}: {
  kind: EnterpriseGateKind;
}) {
  const locale = await getServerLocale();
  const gate = getEnterpriseGate(kind, locale);
  const { icon, tone } = GATE_ICON[kind];
  const toneFg =
    tone === "danger" ? t.danger : tone === "warn" ? t.warn : t.primary;
  const toneBg =
    tone === "danger" ? t.dangerBg : tone === "warn" ? t.warnBg : t.primaryBg;
  const supportPhone = enterpriseTenant.supportPhone;

  return (
    <div style={{ maxWidth: 540, margin: "20px auto" }}>
      <ECard t={t} accent={toneFg}>
        <div style={{ textAlign: "center", padding: "12px 6px 4px" }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              margin: "0 auto 15px",
              background: toneBg,
              color: toneFg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <EIcon name={icon} size={29} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 8px" }}>
            {gate.title}
          </h1>
          <EPill t={t} tone={tone} dot>
            {gate.subtitle}
          </EPill>
        </div>
        <div
          style={{
            marginTop: 16,
            background: t.surfaceLo,
            border: "1px solid " + t.line,
            borderRadius: 12,
            padding: "4px 16px",
          }}
        >
          {gate.details.map((r, i) => (
            <ERow
              t={t}
              key={i}
              k={r.k}
              v={r.v}
              mono={i === 0}
              last={i === gate.details.length - 1}
            />
          ))}
        </div>
        <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
          {gate.actions.map((action, i) => (
            <LinkBtn
              key={action.href + i}
              href={action.href}
              variant={
                i === 0
                  ? tone === "danger"
                    ? "default"
                    : "primary"
                  : "default"
              }
              block
            >
              <EBtnContent>{action.label}</EBtnContent>
            </LinkBtn>
          ))}
        </div>
        <div
          style={{
            marginTop: 14,
            paddingTop: 12,
            borderTop: "1px solid " + t.lineSoft,
            textAlign: "center",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
          }}
        >
          <EIcon name="phone" size={13} style={{ color: t.muted }} />
          <span style={{ fontSize: 12, color: t.muted }}>
            {translate("state.supportLine", { phone: supportPhone }, locale)}
          </span>
        </div>
      </ECard>
      <div style={{ textAlign: "center", marginTop: 12 }}>
        <span style={{ fontSize: 11, color: t.faint, fontFamily: t.mono }}>
          {GATE_ROUTE[kind]}
        </span>
      </div>
    </div>
  );
}

// ── embed identity states (compact app webview) ──────────────────────────────
function EmbedHero({
  icon,
  tone,
  title,
  posture,
}: {
  icon: string;
  tone: EntTone;
  title: string;
  posture: string;
}) {
  const fg =
    tone === "danger"
      ? t.danger
      : tone === "warn"
        ? t.warn
        : tone === "success"
          ? t.success
          : t.primary;
  const bg =
    tone === "danger"
      ? t.dangerBg
      : tone === "warn"
        ? t.warnBg
        : tone === "success"
          ? t.successBg
          : t.primaryBg;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 9,
        padding: "12px 0 4px",
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          background: bg,
          color: fg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <EIcon name={icon} size={27} />
      </div>
      <div style={{ fontSize: 16.5, fontWeight: 800 }}>{title}</div>
      <EPill t={t} tone={tone} dot>
        {posture}
      </EPill>
    </div>
  );
}

function EmbedTokenRow({
  ok,
  k,
  en,
  v,
}: {
  ok: boolean;
  k: string;
  en?: string;
  v: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 0",
        borderBottom: "1px solid " + t.lineSoft,
      }}
    >
      <span
        style={{
          width: 19,
          height: 19,
          borderRadius: 10,
          background: ok ? t.successBg : t.dangerBg,
          color: ok ? t.success : t.danger,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <EIcon name={ok ? "check" : "x"} size={11} stroke={3} />
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12.5, color: t.ink, fontWeight: 500 }}>{k}</div>
        {en && (
          <div style={{ fontFamily: t.mono, fontSize: 9.5, color: t.faint }}>
            {en}
          </div>
        )}
      </div>
      <span
        style={{
          fontSize: 12,
          fontFamily: t.mono,
          color: ok ? t.ink : t.danger,
        }}
      >
        {v}
      </span>
    </div>
  );
}

const cardPadGap = { padding: 16, display: "grid", gap: 13 } as const;

function makeTr(locale: Locale) {
  return (key: TranslationKey, params?: Record<string, string | number>) =>
    translate(key, params, locale);
}

export async function EnterpriseEmbedStatePage({
  kind,
}: {
  kind: EnterpriseEmbedStateKind;
}) {
  const locale = await getServerLocale();
  const state = getEnterpriseEmbedState(kind, locale);
  const k = makeTr(locale);
  const user = getEnterpriseUser(locale);
  const tenant = enterpriseTenant;

  if (kind === "handoff-ok") {
    return (
      <EnterpriseEmbedShell
        state="live"
        footer={
          <LinkBtn href="/embed/home" variant="primary" block>
            <EBtnContent iconR="arrow">{state.actions[0]?.label}</EBtnContent>
          </LinkBtn>
        }
      >
        <div style={cardPadGap}>
          <EmbedHero
            icon="shield"
            tone="success"
            title={k("embed.handoffOk.hero")}
            posture={k("embed.handoffOk.posture")}
          />
          <ECard
            t={t}
            pad={15}
            title={k("embed.handoffOk.cardTitle")}
            sub={k("card.sub.handoffToken")}
          >
            <EmbedTokenRow
              ok
              k={k("embed.handoffOk.tokenSignature")}
              en="tenant_signature"
              v="valid"
            />
            <EmbedTokenRow
              ok
              k={k("embed.handoffOk.tokenEmployee")}
              en="employee_resolved"
              v={user.name}
            />
            <EmbedTokenRow
              ok
              k={k("embed.handoffOk.tokenScope")}
              en="tenant_scope"
              v={tenant.name}
            />
            <div style={{ marginTop: 4 }}>
              <ERow
                t={t}
                k={k("embed.handoffOk.dept")}
                v={k("embed.handoffOk.deptValue")}
                last
              />
            </div>
          </ECard>
          <EBanner
            t={t}
            tone="primary"
            icon="bolt"
            body={k("embed.handoffOk.banner")}
          />
        </div>
      </EnterpriseEmbedShell>
    );
  }

  if (kind === "reauth-required") {
    return (
      <EnterpriseEmbedShell
        state="warn"
        footer={
          <>
            <LinkBtn href="/embed" variant="primary" block>
              <EBtnContent>{state.actions[0]?.label}</EBtnContent>
            </LinkBtn>
            <LinkBtn href="/" variant="ghost" block size="sm">
              <EBtnContent size="sm">{state.actions[1]?.label}</EBtnContent>
            </LinkBtn>
          </>
        }
      >
        <div style={cardPadGap}>
          <EmbedHero
            icon="clock"
            tone="warn"
            title={k("embed.reauthRequired.hero")}
            posture="reauth_required"
          />
          <ECard t={t} pad={15} title={k("embed.reauthRequired.cardTitle")}>
            <EmbedTokenRow
              ok={false}
              k={k("embed.reauthRequired.tokenSession")}
              en="tenant_session"
              v="expired"
            />
            <EmbedTokenRow
              ok={false}
              k={k("embed.reauthRequired.tokenToken")}
              en="handoff_token"
              v="stale"
            />
          </ECard>
          <EBanner
            t={t}
            tone="warn"
            icon="shield"
            body={k("embed.reauthRequired.banner")}
          />
        </div>
      </EnterpriseEmbedShell>
    );
  }

  if (kind === "unsupported-host") {
    return (
      <EnterpriseEmbedShell
        state="err"
        host="unknown-host"
        footer={
          <LinkBtn href="/" variant="primary" block>
            <EBtnContent iconR="ext">{state.actions[0]?.label}</EBtnContent>
          </LinkBtn>
        }
      >
        <div style={cardPadGap}>
          <EmbedHero
            icon="ban"
            tone="danger"
            title={k("embed.unsupportedHost.hero")}
            posture="unsupported_host"
          />
          <ECard t={t} pad={15} title={k("embed.unsupportedHost.reasonTitle")}>
            <div style={{ fontSize: 13, color: t.ink2, lineHeight: 1.6 }}>
              {k("embed.unsupportedHost.reasonBody")}
            </div>
          </ECard>
          <ECard t={t} pad={15} title={k("embed.unsupportedHost.detectTitle")}>
            <EmbedTokenRow
              ok={false}
              k={k("embed.unsupportedHost.tokenOrigin")}
              en="origin_host"
              v={k("embed.unsupportedHost.unauthorized")}
            />
            <EmbedTokenRow
              ok={false}
              k={k("embed.unsupportedHost.tokenRealm")}
              en="tenant_realm"
              v="mismatch"
            />
          </ECard>
          <div
            style={{
              fontSize: 11.5,
              color: t.muted,
              lineHeight: 1.55,
              padding: "0 2px",
            }}
          >
            {k("embed.unsupportedHost.note")}
          </div>
        </div>
      </EnterpriseEmbedShell>
    );
  }

  if (kind === "consent-required") {
    const scopes: [TranslationKey, TranslationKey, string][] = [
      [
        "embed.consentRequired.scope1Title",
        "embed.consentRequired.scope1Body",
        "identity.read",
      ],
      [
        "embed.consentRequired.scope2Title",
        "embed.consentRequired.scope2Body",
        "trip.share",
      ],
      [
        "embed.consentRequired.scope3Title",
        "embed.consentRequired.scope3Body",
        "billing.costcenter",
      ],
    ];
    return (
      <EnterpriseEmbedShell
        state="live"
        footer={
          <>
            <LinkBtn href="/embed/home" variant="primary" block>
              <EBtnContent>{state.actions[0]?.label}</EBtnContent>
            </LinkBtn>
            <LinkBtn href="/" variant="ghost" block size="sm">
              <EBtnContent size="sm">{state.actions[1]?.label}</EBtnContent>
            </LinkBtn>
          </>
        }
      >
        <div style={cardPadGap}>
          <div style={{ padding: "6px 0 2px" }}>
            <div style={{ fontSize: 17, fontWeight: 800 }}>
              {k("embed.consentRequired.heading")}
            </div>
            <div style={{ fontSize: 12.5, color: t.muted, marginTop: 4 }}>
              {k("embed.consentRequired.sub")}
            </div>
          </div>
          <ECard t={t} pad={15}>
            {scopes.map((c, i) => (
              <div
                key={c[2]}
                style={{
                  display: "flex",
                  gap: 11,
                  padding: "11px 0",
                  borderBottom:
                    i < scopes.length - 1 ? "1px solid " + t.lineSoft : "none",
                }}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 5,
                    background: t.primary,
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    marginTop: 1,
                  }}
                >
                  <EIcon name="check" size={12} stroke={3} />
                </span>
                <div style={{ flex: 1 }}>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 7 }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 700 }}>
                      {k(c[0])}
                    </span>
                    <span
                      style={{
                        fontFamily: t.mono,
                        fontSize: 9.5,
                        color: t.faint,
                      }}
                    >
                      {c[2]}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: t.muted,
                      marginTop: 2,
                      lineHeight: 1.45,
                    }}
                  >
                    {k(c[1])}
                  </div>
                </div>
              </div>
            ))}
          </ECard>
          <EBanner
            t={t}
            tone="primary"
            icon="lock"
            body={k("embed.consentRequired.banner")}
          />
        </div>
      </EnterpriseEmbedShell>
    );
  }

  // fallback-to-web
  return (
    <EnterpriseEmbedShell
      state="neutral"
      footer={
        <>
          <LinkBtn href="/" variant="primary" block>
            <EBtnContent iconR="ext">{state.actions[0]?.label}</EBtnContent>
          </LinkBtn>
          <LinkBtn href="/embed" variant="ghost" block size="sm">
            <EBtnContent size="sm">{state.actions[1]?.label}</EBtnContent>
          </LinkBtn>
        </>
      }
    >
      <div style={cardPadGap}>
        <EmbedHero
          icon="ext"
          tone="neutral"
          title={k("embed.fallbackToWeb.hero")}
          posture="fallback_to_web"
        />
        <ECard t={t} pad={15} title={k("embed.fallbackToWeb.nextTitle")}>
          <div style={{ fontSize: 13, color: t.ink2, lineHeight: 1.6 }}>
            {k("embed.fallbackToWeb.nextBody")}
          </div>
        </ECard>
        <ECard t={t} pad={15}>
          <ERow
            t={t}
            k={k("embed.fallbackToWeb.siteRow")}
            v={tenant.host ?? "go.hongshuo.com.tw"}
            mono
          />
          <ERow
            t={t}
            k={k("embed.fallbackToWeb.loginRow")}
            v={k("embed.fallbackToWeb.loginValue")}
          />
          <ERow
            t={t}
            k={k("embed.fallbackToWeb.secRow")}
            v={k("embed.fallbackToWeb.secValue")}
            last
          />
        </ECard>
      </div>
    </EnterpriseEmbedShell>
  );
}
