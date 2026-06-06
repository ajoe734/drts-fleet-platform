import {
  CanvasActionButton,
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasPageHeader,
} from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import { FX_FLEET_STATEMENT } from "@/lib/fleet-portal-fixtures";
import { BiLabel } from "@/lib/fleet-portal-ui";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

export default async function FleetRevenuePage() {
  const locale = await getServerLocale();
  const theme = buildFleetTheme();
  const s = FX_FLEET_STATEMENT;

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("revenue.title", locale)}
        subtitle={t("revenue.subtitle", locale)}
        actions={
          <>
            <CanvasBtn theme={theme} icon="filter">
              {t("revenue.period", locale)}
            </CanvasBtn>
            <CanvasBtn theme={theme}>
              {t("revenue.exportLines", locale)}
            </CanvasBtn>
          </>
        }
      />
      <div
        style={{
          padding: 24,
          display: "grid",
          gridTemplateColumns: "1.3fr 1fr",
          gap: 16,
        }}
      >
        <CanvasCard
          theme={theme}
          title={`當期分潤 · ${s.period}`}
          subtitle="組成明細 · 後端計算為準"
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            {s.lines.map((l) => (
              <div
                key={l.en}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "11px 0",
                  borderBottom: `1px solid ${theme.border}`,
                  fontSize: 13,
                }}
              >
                <BiLabel theme={theme} zh={l.zh} en={l.en} />
                <span
                  style={{
                    fontFamily: theme.monoFamily,
                    fontWeight: 600,
                    color: l.sign === "−" ? theme.danger : theme.text,
                  }}
                >
                  {l.sign === "−" ? "− " : "+ "}
                  {l.v}
                </span>
              </div>
            ))}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "14px 0 2px",
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 14 }}>
                {t("revenue.payable", locale)}
              </span>
              <span
                style={{
                  fontFamily: theme.monoFamily,
                  fontWeight: 700,
                  fontSize: 20,
                  color: theme.accent,
                }}
              >
                {s.payable}
              </span>
            </div>
          </div>
        </CanvasCard>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <CanvasCard theme={theme} title={t("revenue.rules", locale)}>
            <CanvasDL
              theme={theme}
              cols={1}
              items={[
                { k: "逐趟分潤比例", v: "70 / 30 (車行 / 平台)", mono: true },
                { k: "機場接送加成", v: "+ 5% commission", mono: true },
                { k: "管理費", v: "NT$ 36,000 / 月固定", mono: true },
                {
                  k: "招募獎金",
                  v: "NT$ 3,000 / 新司機 (滿 30 趟)",
                  mono: true,
                },
                { k: "罰則觸發", v: "SLA breach · 重大申訴", mono: true },
                { k: "規則版本", v: "rsr_v8 · 平台治理發佈", mono: true },
              ]}
            />
          </CanvasCard>
          <CanvasCard theme={theme} title={t("revenue.actions", locale)}>
            <CanvasBanner
              theme={theme}
              tone="warn"
              icon="warn"
              title={t("revenue.pendingTitle", locale)}
              body={t("revenue.pendingBody", locale)}
            />
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <CanvasActionButton
                theme={theme}
                descriptor={{
                  action: "dispute",
                  enabled: true,
                  riskLevel: "medium",
                }}
                label={t("revenue.dispute", locale)}
                en="dispute"
              />
              <CanvasActionButton
                theme={theme}
                descriptor={{
                  action: "confirm",
                  enabled: true,
                  riskLevel: "high",
                  requiresReason: true,
                }}
                variant="primary"
                icon="check"
                label={t("revenue.confirm", locale)}
                en="confirm"
              />
            </div>
          </CanvasCard>
        </div>
      </div>
    </>
  );
}
