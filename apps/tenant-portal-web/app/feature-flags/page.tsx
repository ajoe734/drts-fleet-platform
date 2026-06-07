import Link from "next/link";
import { AppShellCard } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { formatPortalUiError, toPortalErrorMessage } from "@/lib/error-copy";
import {
  formatPortalCodeLabel,
  formatPortalFlagDescription,
} from "@/lib/localized-labels";

export default async function FeatureFlagsPage() {
  const client = await getTenantClient();

  let flags: unknown[] = [];
  let error: string | null = null;

  try {
    const summary = await client.getFeatureFlags();
    flags = summary.flags;
  } catch (e) {
    error = formatPortalUiError(toPortalErrorMessage(e), "無法載入功能旗標");
  }

  return (
    <main className="app-grid">
      <AppShellCard
        title="功能旗標"
        description={`資料來自租戶旗標摘要，目前共有 ${flags.length} 個旗標。`}
      >
        {error && (
          <div className="error-banner">
            <strong>錯誤：</strong> {error}
          </div>
        )}

        {flags.length > 0 ? (
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>旗標鍵值</th>
                  <th>狀態</th>
                  <th>說明</th>
                  <th>更新時間</th>
                </tr>
              </thead>
              <tbody>
                {flags.map((flag: any, i: number) => (
                  <tr key={i}>
                    <td>
                      <strong>
                        {formatPortalCodeLabel(flag.key, flag.key)}
                      </strong>
                    </td>
                    <td>{flag.enabled ? "✅ 啟用中" : "❌ 停用中"}</td>
                    <td>
                      {formatPortalFlagDescription(flag.key, flag.description)}
                    </td>
                    <td>
                      {flag.updatedAt
                        ? new Date(flag.updatedAt).toLocaleString("zh-TW")
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">目前沒有功能旗標資料。</p>
        )}

        <Link className="route-link" href="/">
          <strong>返回首頁</strong>
          回到租戶入口總覽。
        </Link>
      </AppShellCard>
    </main>
  );
}
