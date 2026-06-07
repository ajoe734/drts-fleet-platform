import Link from "next/link";
import { getAuditLogs } from "./actions";
import { describeRoleSnapshot, getTenantRoleSnapshot } from "@/lib/rbac";
import { AppShellCard } from "@drts/ui-web";
import { formatPortalUiError } from "@/lib/error-copy";

const AUDIT_CODE_LABELS: Record<string, string> = {
  system: "系統",
  tenant: "租戶",
  tenant_admin: "租戶管理員",
  tenant_user: "租戶使用者",
  operator: "營運人員",
  viewer: "檢視者",
  finance: "財務",
  analyst: "分析",
  integration: "整合",
  manager: "管理員",
  user: "使用者",
  users: "使用者",
  booking: "訂單",
  bookings: "訂單",
  passenger: "乘客",
  passengers: "乘客",
  report: "報表",
  reports: "報表",
  webhook: "回呼",
  webhooks: "回呼",
  endpoint: "端點",
  endpoints: "端點",
  api: "API",
  key: "金鑰",
  keys: "金鑰",
  sla: "服務時限",
  billing: "計費",
  invoice: "發票",
  notification: "通知",
  notifications: "通知",
  audit: "稽核",
  settings: "設定",
  create: "建立",
  update: "更新",
  delete: "刪除",
  disable: "停用",
  enable: "啟用",
  rotate: "輪替",
  refresh: "重新整理",
  list: "查詢",
  get: "取得",
  read: "讀取",
  write: "寫入",
  view: "檢視",
  resource: "資源",
};

function formatAuditCode(value: string) {
  const direct = AUDIT_CODE_LABELS[value];
  if (direct) {
    return direct;
  }

  return value
    .split(/[._]/)
    .filter(Boolean)
    .map((part) => AUDIT_CODE_LABELS[part] ?? "其他")
    .join(" ");
}

export default async function AuditPage() {
  const { logs, error } = await getAuditLogs();
  const roleSnapshot = await getTenantRoleSnapshot();
  const combinedError = [
    error ? formatPortalUiError(error, "無法載入稽核紀錄") : null,
    roleSnapshot.identityError
      ? formatPortalUiError(roleSnapshot.identityError, "身分載入失敗")
      : null,
  ]
    .filter(Boolean)
    .join(" | ");

  return (
    <main className="app-grid">
      <AppShellCard
        title="稽核軌跡"
        description={`目前以 ${describeRoleSnapshot(roleSnapshot)} 身分檢視。稽核紀錄會維持在租戶範圍內，使用者管理與整合作業仍會保留目前權限脈絡。`}
      >
        <div className="callout-panel">
          <strong>正式治理脈絡</strong>
          <p>
            租戶管理員、營運人員、財務／分析、整合管理員與檢視者都需要可追溯
            的歷程。當前後端權限仍會回傳下方這組以角色目錄為基礎的租戶角色碼。
          </p>
          <div className="chip-row">
            {roleSnapshot.roleCatalogBackedLabels.length > 0 ? (
              roleSnapshot.roleCatalogBackedLabels.map((roleLabel, index) => (
                <span className="status-chip" key={`${roleLabel}-${index}`}>
                  {roleLabel}
                </span>
              ))
            ) : (
              <span className="status-chip">權限資訊暫不可用</span>
            )}
          </div>
        </div>

        {combinedError && (
          <div className="error-banner">
            <strong>錯誤：</strong> {combinedError}
          </div>
        )}

        {logs.length > 0 ? (
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>時間</th>
                  <th>操作者</th>
                  <th>模組</th>
                  <th>動作</th>
                  <th>資源</th>
                  <th>請求 ID</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.auditId}>
                    <td>{new Date(log.createdAt).toLocaleString()}</td>
                    <td>
                      {log.actorId ? (
                        <span title={log.actorId}>
                          {formatAuditCode(log.actorType)}
                        </span>
                      ) : (
                        <span className="muted">
                          {formatAuditCode(log.actorType)}
                        </span>
                      )}
                    </td>
                    <td>{formatAuditCode(log.moduleName)}</td>
                    <td>
                      <code>{formatAuditCode(log.actionName)}</code>
                    </td>
                    <td>
                      {formatAuditCode(log.resourceType)}
                      {log.resourceId ? `: ${log.resourceId}` : ""}
                    </td>
                    <td>
                      <code className="muted">{log.requestId}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">目前沒有稽核紀錄。</p>
        )}

        <Link className="route-link" href="/" style={{ marginTop: "1rem" }}>
          <strong>返回首頁</strong>
          回到租戶入口總覽。
        </Link>
        <Link className="route-link" href="/settings">
          <strong>設定頁總覽</strong>
          前往租戶設定摘要，查看服務水準、通知與能力邊界。
        </Link>
      </AppShellCard>
    </main>
  );
}
