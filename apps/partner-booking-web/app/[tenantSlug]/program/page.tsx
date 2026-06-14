import Link from "next/link";
import { getProgramChromeVars } from "@/lib/program-theme";
import { getTenantProgramTheme } from "@/lib/program-route-context";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
};

export default async function ProgramFlowPage({ params }: PageProps) {
  const { tenantSlug } = await params;
  const locale = await getServerLocale();
  const theme = await getTenantProgramTheme(tenantSlug);
  const issuerName =
    locale === "zh"
      ? theme.issuerName
      : theme.kind === "card"
        ? theme.issuerLabel + " Bank"
        : theme.kind === "insurance"
          ? "Fubon Insurance"
          : "Lion Travel";
  const programLabel =
    locale === "zh"
      ? theme.programLabel
      : theme.kind === "card"
        ? "Credit-card airport transfer"
        : theme.kind === "insurance"
          ? "Insurance replacement mobility"
          : "Travel agency group transfer";
  const cards = [
    {
      href: `/${tenantSlug}`,
      eyebrow: t("program.selector.website.eyebrow", undefined, locale),
      title: t("program.selector.website.title", undefined, locale),
      body: t("program.selector.website.body", undefined, locale),
    },
    {
      href: `/${tenantSlug}/program/site`,
      eyebrow: t("program.selector.funnel.eyebrow", undefined, locale),
      title: t("program.selector.funnel.title", undefined, locale),
      body: t("program.selector.funnel.body", undefined, locale),
    },
    ...(theme.kind === "card"
      ? [
          {
            href: `/${tenantSlug}/program/embed`,
            eyebrow: t("program.selector.embed.eyebrow", undefined, locale),
            title: t("program.selector.embed.title", undefined, locale),
            body: t("program.selector.embed.body", undefined, locale),
          },
        ]
      : []),
  ];
  return (
    <section
      style={{
        ...getProgramChromeVars(theme),
        display: "grid",
        gap: "20px",
        background: theme.chrome.pageBackground,
        color: theme.chrome.pageForeground,
        borderRadius: "24px",
        padding: "24px",
        border: `1px solid ${theme.chrome.panelBorder}`,
      }}
      data-program-kind={theme.kind}
      data-program-surface="selector"
    >
      <header style={{ display: "grid", gap: "8px" }}>
        <div
          style={{
            fontSize: "12px",
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: theme.primary,
            fontWeight: 800,
          }}
        >
          {issuerName} · {programLabel}
        </div>
        <h1 style={{ margin: 0, fontSize: "28px", lineHeight: 1.15 }}>
          {t("program.selector.title", undefined, locale)}
        </h1>
        <p
          style={{
            margin: 0,
            color: theme.chrome.pageMuted,
            fontSize: "14px",
            lineHeight: 1.7,
            maxWidth: "720px",
          }}
        >
          {t("program.selector.body", undefined, locale)}
        </p>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "12px",
        }}
      >
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            style={{
              display: "grid",
              gap: "8px",
              minHeight: "148px",
              padding: "18px",
              borderRadius: "18px",
              border: `1px solid ${theme.chrome.panelBorder}`,
              background: theme.chrome.panel,
              color: theme.chrome.pageForeground,
              textDecoration: "none",
              boxShadow: "0 18px 40px rgba(15, 23, 42, 0.08)",
            }}
          >
            <span
              style={{
                color: theme.primary,
                fontSize: "11px",
                fontWeight: 800,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              {card.eyebrow}
            </span>
            <strong style={{ fontSize: "18px" }}>{card.title}</strong>
            <span
              style={{
                color: theme.chrome.pageMuted,
                fontSize: "13px",
                lineHeight: 1.6,
              }}
            >
              {card.body}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
