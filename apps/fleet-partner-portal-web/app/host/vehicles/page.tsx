import { CanvasBanner, CanvasCard, CanvasEmptyState, CanvasPageHeader } from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import { loadHostVehicles } from "@/app/host/lib/host-data.server";
import { HostAccessStateCard } from "@/components/host/host-access-state";
import { HostVehicleTable } from "@/components/host/host-vehicle-table";
import { HostPageFooter } from "@/components/host/host-page-footer";
import { getServerLocale } from "@/lib/server-locale";
import { trHost } from "@/app/host/translations";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function HostVehiclesPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const locale = await getServerLocale();
  const theme = buildFleetTheme();
  const page = Number(params.page) > 0 ? Number(params.page) : 1;

  const result = await loadHostVehicles({ page, pageSize: PAGE_SIZE });

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={trHost("vehiclesPageTitle", locale)}
        subtitle="僅顯示您名下車輛；VIN 遮蔽後 6 碼 · 唯讀，無新增 / 編輯入口"
      />
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
        {!result.ok ? (
          result.accessState === "fetch_failed" ? (
            <>
              <CanvasBanner
                theme={theme}
                tone="warn"
                icon="warn"
                title={trHost("vehiclesServiceUnavailableTitle", locale)}
                body="Host 後端模組（SR-HOST-BE-001）尚未合併至 dev，暫時無法讀取自有車輛資料。此為已知限制，不以假資料代替。"
              />
              <HostAccessStateCard theme={theme} state={result.accessState} detail={result.error} />
            </>
          ) : (
            <HostAccessStateCard theme={theme} state={result.accessState} detail={result.error} />
          )
        ) : result.items.length === 0 ? (
          <CanvasCard theme={theme}>
            <CanvasEmptyState
              theme={theme}
              tone="neutral"
              title={trHost("vehiclesEmptyTitle", locale)}
              body="您名下目前沒有任何車輛。車輛掛靠後將顯示在這裡，這是合法的空狀態。"
            />
          </CanvasCard>
        ) : (
          <CanvasCard theme={theme} padding={0}>
            <HostVehicleTable theme={theme} locale={locale} rows={result.items} />
            <HostPageFooter
              theme={theme}
              locale={locale}
              pageInfo={result.pageInfo}
              basePath="/host/vehicles"
            />
          </CanvasCard>
        )}
      </div>
    </>
  );
}
