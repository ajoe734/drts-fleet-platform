import Link from "next/link";
import { AppShellCard } from "@drts/ui-web";
import { getSlaProfile, updateSlaProfile } from "./actions";
import type { TenantSlaProfile } from "@drts/contracts";
import { describeRoleSnapshot, getTenantRoleSnapshot } from "@/lib/rbac";
import { formatPortalUiError } from "@/lib/error-copy";

export default async function SlaPage() {
  const { profile, error: fetchError } = await getSlaProfile();
  const roleSnapshot = await getTenantRoleSnapshot();

  return (
    <main className="app-grid">
      <AppShellCard
        title="服務時限設定"
        description={
          roleSnapshot.capabilities.canWriteSla
            ? "可查看並更新等待、到達與完成時間的服務時限門檻，涵蓋 DRTS 自營與外部履約訂單。"
            : `目前以 ${describeRoleSnapshot(roleSnapshot)} 身分檢視。這個角色可讀取服務時限門檻，但無法修改。`
        }
      >
        {fetchError && (
          <div className="error-banner">
            <strong>載入服務時限設定失敗：</strong>{" "}
            {formatPortalUiError(fetchError, "無法載入服務時限設定")}
          </div>
        )}

        <div className="source-guidance">
          <strong>如何解讀這些門檻：</strong> DRTS 自營訂單會直接衡量平台內的
          派遣與行程延遲。外部履約訂單也會顯示在這裡，但租戶看到的延遲可能
          來自外部履約交接，而不只是 DRTS 派遣佇列。
        </div>

        {profile && <SlaProfileTable profile={profile} />}

        <UpdateSlaForm
          profile={profile}
          canWrite={roleSnapshot.capabilities.canWriteSla}
        />

        <Link className="route-link" href="/" style={{ marginTop: "1rem" }}>
          <strong>返回首頁</strong>
          回到租戶入口總覽。
        </Link>
      </AppShellCard>
    </main>
  );
}

function SlaProfileTable({ profile }: { profile: TenantSlaProfile }) {
  return (
    <div className="data-table" style={{ marginBottom: "1rem" }}>
      <table>
        <thead>
          <tr>
            <th>指標</th>
            <th>門檻（分鐘）</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>等待時間門檻</td>
            <td>{profile.waitThresholdMin} 分鐘</td>
          </tr>
          <tr>
            <td>到達時間門檻</td>
            <td>{profile.arrivalThresholdMin} 分鐘</td>
          </tr>
          <tr>
            <td>完成時間門檻</td>
            <td>{profile.completionThresholdMin} 分鐘</td>
          </tr>
          <tr>
            <td>最後更新</td>
            <td>
              {profile.updatedAt
                ? new Date(profile.updatedAt).toLocaleString("zh-TW")
                : "-"}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function UpdateSlaForm({
  profile,
  canWrite,
}: {
  profile: TenantSlaProfile | null;
  canWrite: boolean;
}) {
  return (
    <form action={updateSlaProfile}>
      <div className="data-table">
        <table>
          <thead>
            <tr>
              <th>指標</th>
              <th>新值（分鐘）</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <label htmlFor="waitThresholdMin">等待時間</label>
              </td>
              <td>
                <input
                  type="number"
                  id="waitThresholdMin"
                  name="waitThresholdMin"
                  min={1}
                  defaultValue={profile?.waitThresholdMin ?? 15}
                  style={{ width: "100px" }}
                />
              </td>
            </tr>
            <tr>
              <td>
                <label htmlFor="arrivalThresholdMin">到達時間</label>
              </td>
              <td>
                <input
                  type="number"
                  id="arrivalThresholdMin"
                  name="arrivalThresholdMin"
                  min={1}
                  defaultValue={profile?.arrivalThresholdMin ?? 30}
                  style={{ width: "100px" }}
                />
              </td>
            </tr>
            <tr>
              <td>
                <label htmlFor="completionThresholdMin">完成時間</label>
              </td>
              <td>
                <input
                  type="number"
                  id="completionThresholdMin"
                  name="completionThresholdMin"
                  min={1}
                  defaultValue={profile?.completionThresholdMin ?? 60}
                  style={{ width: "100px" }}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: "1rem" }}>
        <button type="submit" className="btn-primary" disabled={!canWrite}>
          {canWrite ? "更新服務時限設定" : "唯讀"}
        </button>
      </div>
    </form>
  );
}
