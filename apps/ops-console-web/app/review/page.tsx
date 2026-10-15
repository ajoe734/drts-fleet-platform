"use client";
import { useEffect, useRef, useState } from "react";
import type {
  OwnedOrderRecord,
  DispatchJobRecord,
  DispatchCandidate,
} from "@drts/contracts";
import { getOpsClient } from "../../lib/api-client";

const SUPPLY = ["a", "b"].map((suffix) => ({
  driverId: `pax-review-driver-${suffix}`,
  vehicleId: `pax-review-vehicle-${suffix}`,
}));

/** Small rehearsal operator entry using the original Ops BFF and authorities.
 * It creates no alternate order, session or dispatch state in the browser.
 */
export default function SharedOrderReviewOps() {
  const [enabled, setEnabled] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [order, setOrder] = useState<OwnedOrderRecord>();
  const [job, setJob] = useState<DispatchJobRecord>();
  const [candidates, setCandidates] = useState<DispatchCandidate[]>([]);
  const [selected, setSelected] = useState(SUPPLY[0]!.driverId);
  const [registrationCode, setRegistrationCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  const pending = useRef<
    { path: string; body: unknown; key: string } | undefined
  >(undefined);
  const client = getOpsClient();
  useEffect(() => {
    setOrderId(
      new URLSearchParams(window.location.search).get("orderId") ?? "",
    );
    void client
      .get<{ enabled: boolean }>("/api/passenger-app/review-demo/config")
      .then((r) => setEnabled(r.enabled))
      .catch(() => setEnabled(false));
  }, [client]);
  async function run(operation: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      await operation();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "操作失敗，請核對權限／當前狀態後重試。",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function command<T>(path: string, body: unknown): Promise<T> {
    // Unknown acknowledgements retain exactly the original command and key.
    const fingerprint = JSON.stringify({ path, body });
    if (
      pending.current &&
      JSON.stringify({
        path: pending.current.path,
        body: pending.current.body,
      }) !== fingerprint
    )
      throw new Error("上一個命令結果尚待讀回，請先重試原命令。");
    pending.current ??= { path, body, key: crypto.randomUUID() };
    const result = await client.post<T>(path, {
      body,
      headers: {
        "Idempotency-Key": pending.current.key,
        "X-Idempotency-Key": pending.current.key,
      },
    });
    pending.current = undefined;
    return result;
  }
  async function load() {
    if (!/^[0-9a-f-]{36}$/i.test(orderId))
      throw new Error("請貼上乘客剛建立的 UUID。");
    const current = await client.get<OwnedOrderRecord>(
      `/api/orders/${encodeURIComponent(orderId)}`,
    );
    setOrder(current);
    const jobs = await client.get<{ items: DispatchJobRecord[] }>(
      "/api/dispatch/tasks",
    );
    const latest = jobs.items
      .filter((j) => j.orderId === orderId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    setJob(latest);
    setCandidates(
      latest
        ? (
            await client.get<{ items: DispatchCandidate[] }>(
              `/api/dispatch/tasks/${latest.dispatchJobId}/candidates`,
            )
          ).items
        : [],
    );
  }
  return (
    <main style={{ padding: 24, maxWidth: 900 }}>
      <h1>同單審查演練・Ops</h1>
      <p>
        沿既有 Ops 身分與 BFF
        權限操作真正後端；車司資格／供給與定位為虛構演練資料，通知不送真人。
      </p>
      {!enabled ? (
        <p role="status">此 API 未啟用共享演練。</p>
      ) : (
        <>
          <section>
            <h2>演練供給與司機裝置</h2>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await command("/api/passenger-app/review-demo/prepare", {});
                  setMessage("已準備兩組合成車司；未建立訂單、派遣或付款。");
                })
              }
            >
              準備虛構演練車司
            </button>
            <select
              aria-label="演練司機"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={busy}
            >
              {SUPPLY.map((s) => (
                <option key={s.driverId}>{s.driverId}</option>
              ))}
            </select>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = await command<{ registrationCode: string }>(
                    "/api/auth/driver/device/invite",
                    { driverId: selected },
                  );
                  setRegistrationCode(result.registrationCode);
                })
              }
            >
              發出既有司機裝置註冊碼
            </button>
            {registrationCode && (
              <label>
                單次註冊碼（交給本場司機視窗，不納入證據）
                <input
                  type="password"
                  readOnly
                  value={registrationCode}
                  aria-label="演練裝置註冊碼"
                />
                <button
                  onClick={() =>
                    void navigator.clipboard.writeText(registrationCode)
                  }
                >
                  複製註冊碼
                </button>
                <button onClick={() => setRegistrationCode("")}>
                  隱藏註冊碼
                </button>
              </label>
            )}
            <p>
              無車情境只切換這兩位演練司機的既有供給狀態；有進行中任務時請先完成或取消。
            </p>
            {(["offline", "available"] as const).map((workState) => (
              <button
                key={workState}
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    for (const s of SUPPLY)
                      await command(
                        `/api/regulatory-registry/drivers/${s.driverId}/work-state`,
                        { workState },
                      );
                    setMessage(
                      workState === "offline"
                        ? "演練供給已離線；新派遣走真正無車流程。"
                        : "演練供給已恢復；請依原流程重新派遣。",
                    );
                  })
                }
              >
                {workState === "offline" ? "暫停演練供給" : "恢復演練供給"}
              </button>
            ))}
          </section>
          <section>
            <h2>乘客新建的同一張訂單</h2>
            <label>
              訂單 UUID
              <input
                aria-label="訂單 UUID"
                value={orderId}
                disabled={busy}
                onChange={(e) => {
                  setOrderId(e.target.value);
                  setOrder(undefined);
                  setJob(undefined);
                  setCandidates([]);
                }}
              />
            </label>
            <button disabled={busy} onClick={() => void run(load)}>
              讀回同單
            </button>
            {order && (
              <>
                <p>
                  UUID：
                  <output data-testid="ops-review-order-id">
                    {order.orderId}
                  </output>
                  ；狀態：
                  <output data-testid="ops-review-order-status">
                    {order.status}
                  </output>
                </p>
                <p>
                  {order.pickup.address} → {order.dropoff.address}
                </p>
                <a href={`/dispatch/${job?.dispatchJobId ?? orderId}`}>
                  既有派遣詳情／候選指派
                </a>{" "}
                · <a href="/dispatch">既有調度看板</a>
                <button
                  disabled={busy || !!job}
                  onClick={() =>
                    void run(async () => {
                      await command(`/api/orders/${orderId}/dispatch`, {
                        mode: "auto",
                      });
                      await load();
                    })
                  }
                >
                  建立同單派遣
                </button>
                {job && (
                  <>
                    <p>
                      派遣：
                      <output data-testid="ops-review-job-id">
                        {job.dispatchJobId}
                      </output>
                      ；{job.status}
                    </p>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await command(`/api/orders/${orderId}/redispatch`, {
                            reasonCode: "review_supply_restored",
                            reasonNote: "演練供給恢復，沿真派遣",
                          });
                          await load();
                        })
                      }
                    >
                      依原流程重新派遣
                    </button>
                    <ul>
                      {candidates.map((candidate) => (
                        <li key={candidate.driverId}>
                          {candidate.driverId} / {candidate.vehicleId}
                          <button
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                await command("/api/dispatch/assign", {
                                  dispatchJobId: job.dispatchJobId,
                                  driverId: candidate.driverId,
                                  vehicleId: candidate.vehicleId,
                                });
                                await load();
                              })
                            }
                          >
                            指派 {candidate.driverId}
                          </button>
                          <button
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                await command("/api/dispatch/reassign", {
                                  dispatchJobId: job.dispatchJobId,
                                  driverId: candidate.driverId,
                                  vehicleId: candidate.vehicleId,
                                  reasonCode: "review_reassignment",
                                  reasonNote: "演練改派，請乘客重新核對車牌",
                                });
                                await load();
                              })
                            }
                          >
                            改派 {candidate.driverId}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </section>
        </>
      )}
      <p role="status">{busy ? "處理中…" : message}</p>
    </main>
  );
}
