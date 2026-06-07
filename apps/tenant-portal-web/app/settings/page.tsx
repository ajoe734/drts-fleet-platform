import type {
  FeatureFlagSummary,
  TenantIntegrationGovernancePackage,
  TenantNotificationPreferences,
  TenantSlaProfile,
} from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";
import {
  formatPortalSectionError,
  formatPortalUiError,
} from "@/lib/error-copy";
import {
  FORMAL_TENANT_ROLE_FRAMING,
  describeRoleSnapshot,
  getTenantRoleSnapshot,
} from "@/lib/rbac";
import {
  formatPortalChecklistItem,
  formatPortalCodeLabel,
} from "@/lib/localized-labels";

export const dynamic = "force-dynamic";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "未提供";
  }

  return DATE_TIME_FORMATTER.format(new Date(value));
}

export default async function SettingsPage() {
  const client = await getTenantClient();
  const roleSnapshot = await getTenantRoleSnapshot();
  const [preferencesResult, slaResult, governanceResult, flagsResult] =
    await Promise.allSettled([
      client.getNotificationPreferences() as Promise<TenantNotificationPreferences>,
      client.getSlaProfile() as Promise<TenantSlaProfile>,
      client.getTenantIntegrationGovernancePackage() as Promise<TenantIntegrationGovernancePackage>,
      client.getFeatureFlags() as Promise<FeatureFlagSummary>,
    ]);

  const preferences =
    preferencesResult.status === "fulfilled" ? preferencesResult.value : null;
  const sla = slaResult.status === "fulfilled" ? slaResult.value : null;
  const governance =
    governanceResult.status === "fulfilled" ? governanceResult.value : null;
  const flags = flagsResult.status === "fulfilled" ? flagsResult.value : null;

  const errors = [
    roleSnapshot.identityError
      ? formatPortalUiError(roleSnapshot.identityError, "身分載入失敗")
      : null,
    preferencesResult.status === "rejected"
      ? formatPortalSectionError("通知偏好", preferencesResult.reason)
      : null,
    slaResult.status === "rejected"
      ? formatPortalSectionError("服務時限設定", slaResult.reason)
      : null,
    governanceResult.status === "rejected"
      ? formatPortalSectionError("整合治理", governanceResult.reason)
      : null,
    flagsResult.status === "rejected"
      ? formatPortalSectionError("功能旗標", flagsResult.reason)
      : null,
  ].filter(Boolean) as string[];

  return (
    <main className="page-shell">
      <section className="page-hero">
        <span className="eyebrow">設定</span>
        <h1>租戶設定集中顯示目前的權限脈絡、偏好設定與能力摘要。</h1>
        <p>
          這個頁面整合通知設定、服務水準脈絡、整合治理與正式租戶角色模型，不會
          額外虛構只存在於後端的操作。
        </p>
      </section>

      {errors.length > 0 ? (
        <section className="callout-panel is-warning">
          <strong>部分設定資料目前不可用</strong>
          <ul className="panel-list">
            {errors.map((message, index) => (
              <li key={`${message}-${index}`}>{message}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="surface-grid surface-grid-wide">
        <article className="surface-card">
          <span className="surface-kicker">角色模型</span>
          <h3>正式租戶角色</h3>
          <p>
            目前身分解析為 {describeRoleSnapshot(roleSnapshot)}。以下是這個原型
            目前採用的治理分工。
          </p>
          <ul className="panel-list">
            {FORMAL_TENANT_ROLE_FRAMING.map((roleFrame) => (
              <li key={roleFrame.key}>
                <strong>{roleFrame.label}</strong>
                <span className="list-note">{roleFrame.summary}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="surface-card">
          <span className="surface-kicker">權限</span>
          <h3>目前後端角色目錄</h3>
          <p>
            UI 權限控制依據身分脈絡中的伺服器角色。後端尚未拆出獨立的整合管理
            角色前，整合治理仍歸在租戶管理員權限下。
          </p>
          <div className="chip-row">
            {roleSnapshot.roleCatalogBackedLabels.length > 0 ? (
              roleSnapshot.roleCatalogBackedLabels.map((roleLabel, index) => (
                <span className="status-chip" key={`${roleLabel}-${index}`}>
                  {roleLabel}
                </span>
              ))
            ) : (
              <span className="status-chip">目前無法解析角色標籤</span>
            )}
          </div>
        </article>

        <article className="surface-card">
          <span className="surface-kicker">通知</span>
          <h3>租戶通知訂閱</h3>
          <p>
            這裡只顯示租戶範圍內的通知偏好，與平台公告或營運控制台升級通知
            分開管理。
          </p>
          {preferences ? (
            <>
              <ul className="panel-list">
                {preferences.subscriptions.map((subscription) => (
                  <li key={`${subscription.eventType}-${subscription.channel}`}>
                    <strong>
                      {formatPortalCodeLabel(
                        subscription.eventType,
                        subscription.eventType,
                      )}
                    </strong>
                    <span className="list-note">
                      {formatPortalCodeLabel(
                        subscription.channel,
                        subscription.channel,
                      )}{" "}
                      · {subscription.enabled ? "啟用" : "停用"}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="muted-copy">
                更新時間：{formatDateTime(preferences.updatedAt)}
              </p>
            </>
          ) : (
            <p className="muted-copy">目前無法取得通知偏好。</p>
          )}
        </article>

        <article className="surface-card">
          <span className="surface-kicker">服務時限</span>
          <h3>租戶服務門檻</h3>
          <p>
            服務時限設定只提供租戶可見的服務期待，不會暴露只供派遣端使用的內部
            控制規則。
          </p>
          {sla ? (
            <dl className="definition-grid">
              <div>
                <dt>等待門檻</dt>
                <dd>{sla.waitThresholdMin} 分鐘</dd>
              </div>
              <div>
                <dt>到達門檻</dt>
                <dd>{sla.arrivalThresholdMin} 分鐘</dd>
              </div>
              <div>
                <dt>完成門檻</dt>
                <dd>{sla.completionThresholdMin} 分鐘</dd>
              </div>
              <div>
                <dt>更新時間</dt>
                <dd>{formatDateTime(sla.updatedAt)}</dd>
              </div>
            </dl>
          ) : (
            <p className="muted-copy">目前無法取得服務時限設定。</p>
          )}
        </article>

        <article className="surface-card">
          <span className="surface-kicker">整合</span>
          <h3>能力與開通姿態</h3>
          <p>
            整合金鑰與回呼端點的完整治理仍在各自頁面處理，但設定頁仍應摘要
            這些頁面依賴的整體姿態。
          </p>
          <div className="chip-row">
            {flags?.flags
              .filter((flag) => flag.enabled)
              .slice(0, 8)
              .map((flag) => (
                <span className="status-chip" key={flag.key}>
                  {formatPortalCodeLabel(flag.key, flag.key)}
                </span>
              ))}
          </div>
          {governance?.onboardingChecklist?.length ? (
            <ul className="panel-list">
              {governance.onboardingChecklist.slice(0, 4).map((item, index) => (
                <li key={`${item}-${index}`}>
                  {formatPortalChecklistItem(item)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted-copy">目前沒有回傳任何開通檢查項目。</p>
          )}
        </article>
      </section>

      <section className="callout-panel">
        <strong>範圍界線</strong>
        <p>
          這個頁面刻意停留在租戶範圍的偏好與治理摘要。使用者邀請、回呼端點
          憑證生命週期與整合金鑰操作仍保留在各自的權限頁面處理。
        </p>
      </section>
    </main>
  );
}
