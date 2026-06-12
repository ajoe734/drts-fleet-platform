import Link from "next/link";
import { getProgramChromeVars } from "@/lib/program-theme";
import { getTenantProgramTheme } from "@/lib/program-route-context";
import { getServerLocale } from "@/lib/server-locale";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ tenantSlug: string }>;
};

export default async function ProgramFlowPage({ params }: PageProps) {
  const { tenantSlug } = await params;
  const locale = await getServerLocale();
  const theme = await getTenantProgramTheme(tenantSlug);
  const isZh = locale === "zh";
  const cards = [
    {
      href: `/${tenantSlug}`,
      eyebrow: isZh ? "Standalone website" : "Standalone website",
      title: isZh ? "網站預約" : "Website booking",
      body: isZh
        ? "給信用卡客戶直接開啟的白牌預約網站，依銀行品牌套不同版型樣式。"
        : "White-label booking website for cardholders, themed per issuer brand.",
    },
    {
      href: `/${tenantSlug}/program/site`,
      eyebrow: isZh ? "Program funnel QA" : "Program funnel QA",
      title: isZh ? "網站預約狀態稿" : "Website funnel states",
      body: isZh
        ? "固定七步 funnel：入口、資格、確認、成功、追蹤、錯誤、人工審查。"
        : "Fixed seven-screen funnel: entry, eligibility, review, success, tracking, error, manual review.",
    },
    ...(theme.kind === "card"
      ? [
          {
            href: `/${tenantSlug}/program/embed`,
            eyebrow: isZh ? "Mobile banking webview" : "Mobile banking webview",
            title: isZh ? "網銀 App 內嵌" : "Banking-app embed",
            body: isZh
              ? "只看銀行 App 身分交接 B1-B5：reference token、逾時重驗、host 封鎖、授權、回退官網。"
              : "B1-B5 embedded identity states: reference token, re-auth, host block, consent, site fallback.",
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
          {theme.issuerName} · {theme.programLabel}
        </div>
        <h1 style={{ margin: 0, fontSize: "28px", lineHeight: 1.15 }}>
          {isZh ? "選擇要檢視的前台 surface" : "Choose a frontend surface"}
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
          {isZh
            ? "信用卡機場接送有網站預約與網銀 App 內嵌兩條入口；保險與旅行社 program 則沿用同一套網站 funnel。這頁只負責導覽，不混用畫面。"
            : "Credit-card airport transfer has separate website and banking-app embedded entry points. Insurance and travel programs reuse the website funnel. This selector keeps the surfaces separate."}
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
