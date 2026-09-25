"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { 
  buildCanvasTheme,
  CanvasBtn, 
  CanvasCard, 
  CanvasPill, 
  CanvasDL, 
  CanvasField, 
  CanvasInput, 
  CanvasSelect, 
  CanvasShell, 
  CanvasPageHeader, 
  CanvasBanner, 
  CanvasIcon, 
  CanvasActionButton, 
  CanvasEmptyState, 
  CanvasKPI 
} from "@drts/ui-web";

const PN_EVENTS: [string, string, string][] = [
  ['assignment_disclosure_ready','passenger.assignment_disclosure_ready.v1','派車揭露就緒'],
  ['assignment_replaced','passenger.assignment_replaced.v1','派車已更換'],
  ['eta_changed','passenger.eta_changed.v1','ETA 變更'],
  ['driver_arrived','passenger.driver_arrived.v1','駕駛已抵達'],
  ['receipt_ready','passenger.receipt_ready.v1','收據就緒'],
];

const PN_BIND: Record<string, [string, any]> = { 
  ready: ['就緒', 'success'], 
  test_pending: ['待測試', 'warn'], 
  disabled: ['已停用', 'neutral'] 
};

const TEST: Record<string, [string, any]> = { 
  passed_current: ['測試通過 · 目前端點', 'success'], 
  passed_stale: ['測試已失效 · 端點 fingerprint 已變', 'warn'], 
  failed: ['測試失敗', 'danger'], 
  none: ['尚未測試', 'neutral'] 
};

const PN_DLV: Record<string, [string, any]> = {
  accepted:      ['端點已接受，但裝置未知','warn'],
  ack_invalid:   ['回應成功但 ack 驗證失敗','danger'],
  failed:        ['失敗','danger'],
  queued:        ['排隊中','neutral'],
  requeued:      ['已受理重新入列','info'],
  superseded:    ['已被新通知取代','neutral'],
  expired:       ['已過期','neutral'],
  exhausted:     ['重試次數耗盡','danger'],
};

const RETRY_DENY: Record<string, string> = { 
  SUPERSEDED:'已被新通知取代', 
  RETRY_EXHAUSTED:'重試次數耗盡', 
  EVENT_EXPIRED:'事件已過期', 
  LEASE_ACTIVE:'另一重送進行中（lease）', 
  BINDING_NOT_READY:'綁定未就緒' 
};

export function PartnerNotificationPanel({ entrySlug, partnerName, programName, partnerId, tenantId }: { entrySlug: string; partnerName?: string; programName?: string; partnerId?: string; tenantId?: string }) {
  const client = usePlatformAdminClient();
  const theme = buildCanvasTheme({ surface: "platform" });
  const { t } = useTranslation();

  const [binding, setBinding] = useState<any>(null);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ kind: "error" | "404" | "403" | "409", message: string, code?: string } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "pending" | "failed">("idle");
  const [testingState, setTestingState] = useState<"idle" | "pending" | "rejected">("idle");
  const [retryState, setRetryState] = useState<"idle" | "pending" | "failed" | "queued">("idle");
  const [retryRowId, setRetryRowId] = useState<string | null>(null);
  
  const [editWebhookId, setEditWebhookId] = useState("");
  const [editEventTypes, setEditEventTypes] = useState<string[]>([]);
  const [editExpectedVersion, setEditExpectedVersion] = useState(0);

  const fetchState = useCallback(async () => {
    setLoading(true);
    try {
      const [bReq, dReq] = await Promise.allSettled([
        client.getPartnerEntryNotificationBinding(entrySlug),
        client.listPartnerNotificationDeliveries(entrySlug, { pageSize: 50 })
      ]);

      if (bReq.status === 'rejected') {
        const statusCode = bReq.reason?.statusCode;
        const errCode = bReq.reason?.error;
        if (statusCode === 404) {
          setBinding(null);
          setError({ kind: "404", message: "Not found", code: errCode });
        } else if (statusCode === 403) {
          setError({ kind: "403", message: "Forbidden", code: errCode });
        } else if (statusCode === 409) {
          setError({ kind: "409", message: bReq.reason?.message || "Conflict", code: errCode });
        } else {
          setError({ kind: "error", message: bReq.reason?.message || "Failed to load binding", code: errCode });
        }
      } else {
        setBinding(bReq.value);
        setEditWebhookId(bReq.value?.webhookId || "");
        setEditEventTypes(bReq.value?.eventTypes || []);
        setEditExpectedVersion(bReq.value?.version || 0);
        setError(null);
      }

      if (dReq.status === 'fulfilled') {
        setDeliveries(dReq.value.items || []);
      }
    } catch (err: any) {
      setError({ kind: "error", message: err.message, code: err.error });
    } finally {
      setLoading(false);
    }
  }, [client, entrySlug]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  const handleSave = async () => {
    setSaveState("pending");
    try {
      await client.updatePartnerEntryNotificationBinding(entrySlug, {
        webhookId: editWebhookId,
        eventTypes: editEventTypes as any,
        expectedVersion: editExpectedVersion
      });
      setIsEditing(false);
      setSaveState("idle");
      fetchState();
    } catch (err: any) {
      setSaveState("failed");
      if (err.statusCode === 409) {
        setError({ kind: "409", message: err.message, code: err.error });
      }
    }
  };
  
  const handleTest = async () => {
    setTestingState("pending");
    try {
      await client.testPartnerEntryNotificationBinding(entrySlug);
      setTestingState("idle");
      fetchState();
    } catch (err: any) {
      setTestingState("rejected");
    }
  };
  
  const handleRetry = async (outboxId: string) => {
    setRetryRowId(outboxId);
    setRetryState("pending");
    try {
      const res = await client.retryPartnerNotificationDelivery(entrySlug, outboxId);
      setRetryState("queued");
      fetchState();
    } catch (err: any) {
      setRetryState("failed");
    }
  };

  if (error?.kind === "403") {
    return (
      <div style={{ padding: 24 }}>
        <CanvasCard theme={theme} title="403 · PARTNER_NOTIFICATION_BINDING_TENANT_SCOPE_DENIED" padding={14}>
          <div style={{ padding:'18px 8px' }}>
            <CanvasEmptyState theme={theme} title="權限不足" body="您無此夥伴 entry 的存取範圍；綁定、派送紀錄與所有動作皆不可見。此頁不提供唯讀降級。"/>
          </div>
        </CanvasCard>
      </div>
    );
  }
  
  if (isEditing) {
    const isSaveDisabled = saveState === "pending" || !editWebhookId;
    return (
      <div style={{ padding: 24, display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:16, alignItems:'start' }}>
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          {saveState === 'failed' && <CanvasBanner theme={theme} tone="danger" icon="warn" title="儲存失敗" body={error?.message || "請檢查連線或重試。"}/>}
          {error?.kind === '409' && error.code === 'version_conflict' && <CanvasBanner theme={theme} tone="warn" icon="warn" title={`綁定已被他人更新（expectedVersion ${editExpectedVersion}）`} body="您的選擇已保留。請重新載入後再儲存；不會靜默覆寫。" actions={<><CanvasBtn theme={theme} size="xs" variant="primary" icon="refresh" onClick={fetchState}>重新載入</CanvasBtn></>}/>}
          <CanvasCard theme={theme} title="編輯通知綁定" subtitle="PUT /partner-entries/:id/notification-binding · webhookId + eventTypes + expectedVersion">
            <CanvasField theme={theme} label="webhookId · 選擇既有 webhook" required hint="端點 URL、密鑰、逾時/重試由既有 webhook 管理維護，本頁不重複 CRUD">
              <input 
                type="text"
                value={editWebhookId} 
                onChange={e => setEditWebhookId(e.target.value)} 
                style={{ width: '100%', padding: '8px 12px', border: `1px solid ${theme.border}`, borderRadius: 4, background: theme.surfaceLo, color: theme.text, fontSize: 13 }}
                placeholder="wh_..."
              />
            </CanvasField>
            <CanvasField theme={theme} label="eventTypes · 內部事件" required>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {PN_EVENTS.map(([i,o,zh]) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <input type="checkbox" checked={editEventTypes.includes(i as string)} onChange={(e) => {
                      if (e.target.checked) setEditEventTypes([...editEventTypes, i as string]);
                      else setEditEventTypes(editEventTypes.filter(x => x !== (i as string)));
                    }}/>
                    <span style={{ fontSize:10.5, fontFamily:theme.monoFamily, color:theme.textDim }}>→ {o}</span>
                    <span style={{ fontSize:10.5, color:theme.textDim }}>{zh}</span>
                  </div>
                ))}
              </div>
            </CanvasField>
            <CanvasField theme={theme} label="expectedVersion" hint="樂觀鎖 · 不符將回 409">
              <CanvasInput theme={theme} value={String(editExpectedVersion)} mono readOnly/>
            </CanvasField>
          </CanvasCard>
        </div>
        <CanvasCard theme={theme} title="變更摘要">
          <CanvasDL theme={theme} cols={1} items={[
            { k:'webhookId', v: editWebhookId || '未設定', mono:true },
            { k:'eventTypes', v: editEventTypes.length > 0 ? editEventTypes.join(', ') : '無' },
            { k:'expectedVersion', v: `${editExpectedVersion} → 儲存後 ${editExpectedVersion + 1}`, mono:true }
          ]}/>
          <div style={{ marginTop:8 }}>
            <CanvasBanner theme={theme} tone="neutral" icon="lock" body="儲存後綁定回到 test_pending；若 webhook 端點 fingerprint 改變，先前測試失效，需重測方可啟用。"/>
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <CanvasBtn theme={theme} disabled={saveState === "pending"} onClick={() => setIsEditing(false)}>取消</CanvasBtn>
            <CanvasActionButton theme={theme} descriptor={{ action:'save', enabled:!isSaveDisabled, riskLevel:'medium' }} variant="primary" icon="check" label={saveState === 'pending' ? "儲存中..." : "儲存"} en="save" onAction={handleSave}/>
          </div>
        </CanvasCard>
      </div>
    );
  }

  const bindState = binding ? binding.state : error?.kind === "404" ? "none" : "unknown";
  // Determine test state. If status has a test report, check it.
  const isPending = testingState === 'pending' || saveState === 'pending';
  const m = PN_BIND[bindState] || ['未知', 'neutral'];

  return (
    <div style={{ padding: 24, display:'grid', gridTemplateColumns:'1.5fr 1fr', gap:16, alignItems:'start' }}>
      <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
        {error?.kind === "404" ? (
          <CanvasCard theme={theme} title="404 · PARTNER_NOTIFICATION_BINDING_NOT_FOUND" padding={14}>
            <CanvasBanner theme={theme} tone="neutral" icon="info" title="此夥伴尚未建立通知綁定" body="選擇既有 webhook 與事件即可建立。" actions={<CanvasBtn theme={theme} size="xs" variant="primary" icon="plus" onClick={() => setIsEditing(true)}>建立綁定</CanvasBtn>}/>
          </CanvasCard>
        ) : (
          <CanvasCard theme={theme} title="通知綁定 · Notification Binding" subtitle="引用既有 webhook · 端點/密鑰於既有 /webhooks 管理" actions={<><CanvasBtn theme={theme} size="xs" icon="edit" onClick={() => setIsEditing(true)}>編輯</CanvasBtn><CanvasPill theme={theme} tone={m[1]} dot>{m[0]}<span style={{ marginLeft:4, opacity:.6, fontFamily:theme.monoFamily, fontSize:9 }}>{bindState}</span></CanvasPill></>}>
            <CanvasDL theme={theme} cols={2} items={[
              { k:'webhookId', v: binding?.webhookId || '—', mono:true }, 
              { k:'端點（唯讀）', v: '...', mono:true },
              { k:'端點 fingerprint', v: binding?.endpointFingerprint || '未知', mono:true }, 
              { k:'version', v:String(binding?.version || 0), mono:true },
              { k:'最近測試', v: <span style={{color:theme.textDim}}>—</span> }, 
              { k:'最後更新', v: binding?.updatedAt || '—', mono:false }
            ]}/>
            <div style={{ marginTop:10 }}>
              <div style={{ fontSize:11, fontWeight:700, color:theme.textMuted, marginBottom:6 }}>訂閱事件（內部 → 對外映射）</div>
              {bindState === 'disabled' ? <span style={{ fontSize:11.5, color:theme.textDim }}>已停用 · 不派送任何事件；訂閱設定保留，可恢復</span> :
                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                  {(binding?.eventTypes || []).map((i: string) => {
                    const row = PN_EVENTS.find(e => e[0] === i);
                    return <div key={i} style={{ display:'flex', alignItems:'center', gap:8, fontSize:11.5 }}><CanvasPill theme={theme} tone="accent">{i}</CanvasPill><CanvasIcon name="arrow-right" size={11} style={{ color:theme.textDim }}/><span style={{ fontFamily:theme.monoFamily, color:theme.textMuted }}>{row ? row[1] : i}</span><span style={{ color:theme.textDim }}>{row ? row[2] : ''}</span></div>
                  })}
                </div>}
            </div>
          </CanvasCard>
        )}
        
        <CanvasCard theme={theme} title="派送紀錄 · Deliveries" subtitle="送達以 ack 驗證為準，不憑 HTTP code" padding={0} actions={<><CanvasBtn theme={theme} size="xs" icon="refresh" onClick={fetchState}>重新整理</CanvasBtn></>}>
          {loading ? (
             <div style={{ padding:16 }}>{[0,1,2].map(i=><div key={i} style={{ height:14, borderRadius:4, background:theme.surfaceLo, marginBottom:10 }}/>)}</div>
          ) : deliveries.length === 0 ? (
             <div style={{ padding:24 }}><CanvasEmptyState theme={theme} title="無資料" body="尚無派送紀錄。" /></div>
          ) : (
            <table style={{ width: '100%', fontSize: 11.5, borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${theme.border}`, color: theme.textMuted }}>
                  <th style={{ padding: '8px 14px', fontWeight: 600 }}>Delivery / Outbox ID</th>
                  <th style={{ padding: '8px 14px', fontWeight: 600 }}>Event</th>
                  <th style={{ padding: '8px 14px', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '8px 14px', fontWeight: 600 }}>Reason</th>
                  <th style={{ padding: '8px 14px', fontWeight: 600 }}>At</th>
                  <th style={{ padding: '8px 14px', fontWeight: 600 }}>Retry</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map(r => {
                  const dlvStatus = PN_DLV[r.status] || ['未知', 'neutral'];
                  const rState = retryRowId === r.outboxId ? retryState : 'idle';
                  return (
                    <tr key={r.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                      <td style={{ padding: '8px 14px', fontFamily: theme.monoFamily }}>
                        <div style={{display:'flex', flexDirection:'column'}}>
                          <span style={{ color:theme.accent, fontWeight:600 }}>{r.id || '—'}</span>
                          <span style={{ fontSize:10, color:theme.textDim }}>{r.outboxId}</span>
                        </div>
                      </td>
                      <td style={{ padding: '8px 14px', fontFamily: theme.monoFamily }}>{r.eventSequence ? `${r.eventType} (#${r.eventSequence})` : r.eventType}</td>
                      <td style={{ padding: '8px 14px' }}><CanvasPill theme={theme} tone={dlvStatus[1]} dot>{dlvStatus[0]}</CanvasPill></td>
                      <td style={{ padding: '8px 14px', color: theme.textMuted }}>{r.failureReason || '—'}</td>
                      <td style={{ padding: '8px 14px', fontFamily: theme.monoFamily }}>{r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'}</td>
                      <td style={{ padding: '8px 14px' }}>
                        {r.retryDisposition === 'manual_only' || r.retryDisposition === 'automatic' || r.retryDisposition === 'configuration_blocked' ? (
                          <CanvasActionButton theme={theme} size="xs" descriptor={{ action:'resend', enabled: rState !== 'pending', riskLevel:'low', requiresReason:false }} icon="refresh" label={rState === 'pending' ? '重送中' : '重送'} en="resend" onAction={() => handleRetry(r.outboxId)}/>
                        ) : <span style={{ fontSize:10.5, color:theme.textDim, display:'inline-flex', alignItems:'center', gap:4 }}><CanvasIcon name="lock" size={10}/>{RETRY_DENY[r.retryDisposition] || r.retryDisposition}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CanvasCard>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
        {binding && (
          <CanvasCard theme={theme} title="生命週期控制" subtitle="test → enable · disable · resume">
            {testingState === 'rejected' && <CanvasBanner theme={theme} tone="danger" icon="warn" title="測試失敗" body="端點測試要求失敗，無法啟用。" actions={<CanvasBtn theme={theme} size="xs" icon="refresh" onClick={handleTest}>重測</CanvasBtn>}/>}
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <CanvasActionButton theme={theme} descriptor={{ action:'test', enabled: bindState !== 'disabled' && !isPending, riskLevel:'low' }} icon="refresh" label={testingState==='pending' ? "測試中..." : "發送測試事件"} en="test" onAction={handleTest}/>
              <CanvasActionButton theme={theme} descriptor={{ action:'enable', enabled: false, riskLevel:'medium' }} icon="check" label={"啟用"} en="enable"/>
            </div>
            <div style={{ fontSize:10.5, color:theme.textDim, marginTop:9, lineHeight:1.5 }}>啟用門檻：目前端點 fingerprint 必須有成功測試。端點變更後測試自動失效，需重測。</div>
          </CanvasCard>
        )}
      </div>
    </div>
  );
}
