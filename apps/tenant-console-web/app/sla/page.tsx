import type { TenantSlaProfileView } from "@drts/contracts";
import { CanvasBanner, buildCanvasTheme } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { SlaManager } from "./sla-manager";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: false,
  density: "compact",
});

const pageBodyStyle = {
  padding: 24,
};

async function loadSlaPageData(): Promise<{
  view: TenantSlaProfileView | null;
  transportErrorMessage: string | null;
}> {
  const client = getTenantClient();

  try {
    const view = await client.getSlaProfileView();
    return { view, transportErrorMessage: null };
  } catch (error) {
    return {
      view: null,
      transportErrorMessage:
        error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export default async function SlaPage() {
  const locale = await getServerLocale();
  const data = await loadSlaPageData();

  return (
    <div>
      {data.transportErrorMessage ? (
        <div style={pageBodyStyle}>
          <CanvasBanner
            theme={th}
            tone="warn"
            title={t("sla.error.requestFailedTitle", locale)}
            body={data.transportErrorMessage}
          />
        </div>
      ) : null}

      <SlaManager
        view={data.view}
        transportErrorMessage={data.transportErrorMessage}
      />
    </div>
  );
}
