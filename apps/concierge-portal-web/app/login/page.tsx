"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDeskMode } from "@/lib/desk-catalog";
import { useConciergePortal } from "@/lib/portal-state";

export default function LoginPage() {
  const router = useRouter();
  const { session, signIn } = useConciergePortal();
  const [operatorName, setOperatorName] = useState(
    session?.operatorName ?? "大廳櫃台人員",
  );
  const [operatorId, setOperatorId] = useState(
    session?.operatorId ?? "CP-OPS-001",
  );
  const [mode, setMode] = useState<
    "concierge_operator" | "call_point_operator"
  >(session?.mode ?? "concierge_operator");

  return (
    <div className="page-shell">
      <section className="hero-card">
        <span className="section-kicker">本機登入</span>
        <h1>建立客服代訂操作人員工作階段。</h1>
        <p>
          此入口會建立本機櫃台工作階段，並將 API
          權限限制在客服代訂所需的範圍內。
        </p>
      </section>

      <section className="panel-card">
        <span className="section-kicker">登入表單</span>
        <h2>選擇櫃台角色後，再選擇固定站點。</h2>
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            signIn({
              operatorName,
              operatorId,
              mode,
            });
            router.push("/start");
          }}
        >
          <div className="field-stack">
            <label htmlFor="operator-name">操作人員顯示名稱</label>
            <input
              id="operator-name"
              onChange={(event) => setOperatorName(event.target.value)}
              required
              value={operatorName}
            />
            <p className="form-help">
              僅儲存在本機瀏覽器狀態，用於此客服代訂入口。
            </p>
          </div>

          <div className="field-stack">
            <label htmlFor="operator-id">操作人員編號</label>
            <input
              id="operator-id"
              onChange={(event) => setOperatorId(event.target.value)}
              required
              value={operatorId}
            />
            <p className="form-help">
              呼叫客服與訂單 API 時，會以此編號作為受限操作人員識別。
            </p>
          </div>

          <div className="field-stack">
            <label htmlFor="operator-mode">櫃台角色</label>
            <select
              id="operator-mode"
              onChange={(event) =>
                setMode(
                  event.target.value as
                    | "concierge_operator"
                    | "call_point_operator",
                )
              }
              value={mode}
            >
              <option value="concierge_operator">
                {formatDeskMode("concierge_operator")}
              </option>
              <option value="call_point_operator">
                {formatDeskMode("call_point_operator")}
              </option>
            </select>
            <p className="form-help">
              若角色與櫃台不符，系統會導向拒絕頁，避免擴大權限。
            </p>
          </div>

          <div className="inline-actions">
            <button className="primary-button" type="submit">
              繼續選擇固定站點
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
