"use client";
import { useTranslation } from "../../lib/i18n";
import { reviewCopy } from "./translations";
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
  const { locale } = useTranslation();
  const t = reviewCopy(locale);
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
      .get<{ enabled: boolean }>("/api/ops/review-demo/config")
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
      setMessage(error instanceof Error ? error.message : t.operationFailed);
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
      throw new Error(t.pendingCommand);
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
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw new Error(t.invalidOrderId);
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
      <h1>{t.title}</h1>
      <p>{t.intro}</p>
      {!enabled ? (
        <p role="status">{t.disabled}</p>
      ) : (
        <>
          <section>
            <h2>{t.supplyTitle}</h2>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await command("/api/ops/review-demo/prepare", {});
                  setMessage(t.prepared);
                })
              }
            >
              {t.prepare}
            </button>
            <select
              aria-label={t.driverLabel}
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
              {t.invite}
            </button>
            {registrationCode && (
              <label>
                {t.registrationNotice}
                <input
                  type="password"
                  readOnly
                  value={registrationCode}
                  aria-label={t.registrationLabel}
                />
                <button
                  onClick={() =>
                    void navigator.clipboard.writeText(registrationCode)
                  }
                >
                  {t.copyCode}
                </button>
                <button onClick={() => setRegistrationCode("")}>
                  {t.hideCode}
                </button>
              </label>
            )}
            <p>{t.supplyNotice}</p>
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
                        ? t.supplyPaused
                        : t.supplyRestored,
                    );
                  })
                }
              >
                {workState === "offline" ? t.pauseSupply : t.restoreSupply}
              </button>
            ))}
          </section>
          <section>
            <h2>{t.orderTitle}</h2>
            <label>
              {t.orderId}
              <input
                aria-label={t.orderId}
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
              {t.readOrder}
            </button>
            {order && (
              <>
                <p>
                  UUID：
                  <output data-testid="ops-review-order-id">
                    {order.orderId}
                  </output>
                  {t.orderStatus}
                  <output data-testid="ops-review-order-status">
                    {order.status}
                  </output>
                </p>
                <p>
                  {order.pickup.address} → {order.dropoff.address}
                </p>
                <a href={`/dispatch/${job?.dispatchJobId ?? orderId}`}>
                  {t.dispatchDetails}
                </a>{" "}
                · <a href="/dispatch">{t.dispatchBoard}</a>
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
                  {t.createDispatch}
                </button>
                {job && (
                  <>
                    <p>
                      {t.dispatchId}
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
                            reasonNote: t.redispatchNote,
                          });
                          await load();
                        })
                      }
                    >
                      {t.redispatch}
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
                            {t.assign}
                            {candidate.driverId}
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
                                  reasonNote: t.reassignNote,
                                });
                                await load();
                              })
                            }
                          >
                            {t.reassign}
                            {candidate.driverId}
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
      <p role="status">{busy ? t.working : message}</p>
    </main>
  );
}
