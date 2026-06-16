import { CanvasCard, CanvasPageHeader } from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import { loadReferralStatements } from "@/lib/channel-portal-data.server";
import { DataSourceNotice } from "@/lib/fleet-portal-ui";
import { ReferralStatementsTable } from "@/components/referral-tables";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export const dynamic = "force-dynamic";

export default async function ReferralStatementsPage() {
  const locale = await getServerLocale();
  const theme = buildFleetTheme();
  const statements = await loadReferralStatements();

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={t("referral.statements.title", locale)}
        subtitle={t("referral.statements.subtitle", locale)}
      />
      <div
        style={{
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <DataSourceNotice
          theme={theme}
          source={statements.source}
          body={t("data.fixtureNotice", locale)}
        />
        <CanvasCard theme={theme} padding={0}>
          <ReferralStatementsTable rows={statements.rows} />
        </CanvasCard>
      </div>
    </>
  );
}
