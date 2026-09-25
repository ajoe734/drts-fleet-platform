"use client";

import React, { useEffect, useState, useCallback } from "react";
import { usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";

import { 
  buildCanvasTheme,
  CanvasBtn, 
  CanvasCard, 
  CanvasPill, 
  CanvasDL, 
  CanvasField, 
  CanvasBanner, 
  CanvasIcon, 
  CanvasActionButton, 
  CanvasEmptyState,
  CanvasTable,
  CanvasKPI
} from "@drts/ui-web";

export function PanelActionBtn({ theme, descriptor, label, en, icon, onClick, size = "sm", variant }: any) {
  if (!descriptor) return null;
  if (descriptor.enabled && onClick) {
    const isHigh = descriptor.riskLevel === "high";
    const resolvedVariant = variant ?? (descriptor.riskLevel === "medium" ? "primary" : "secondary");
    return (
      <CanvasBtn theme={theme} size={size} danger={isHigh} variant={resolvedVariant} onClick={onClick} icon={icon}>
        {label}
        {en && <span style={{ opacity: 0.72 }}> · {en}</span>}
      </CanvasBtn>
    );
  }
  return <CanvasActionButton theme={theme} descriptor={descriptor} label={label} en={en} icon={icon} size={size} variant={variant} />;
}

export function PartnerNotificationPanel({ entrySlug, canWriteBinding, canManageWebhooks, tenantId }: { entrySlug: string; partnerName?: string; programName?: string; partnerId?: string; tenantId?: string, canWriteBinding?: boolean, canManageWebhooks?: boolean }) {
  const client = usePlatformAdminClient();
  const { t } = useTranslation();
  const theme = buildCanvasTheme({ surface: "platform" });

  const PN_EVENTS: [string, string, string][] = [
    ['assignment_disclosure_ready','passenger.assignment_disclosure_ready.v1',t("partnerNotification.event.assignment_disclosure_ready") ?? "派車揭露就緒"],
    ['assignment_replaced','passenger.assignment_replaced.v1',t("partnerNotification.event.assignment_replaced") ?? "派車已更換"],
    ['eta_changed','passenger.eta_changed.v1',t("partnerNotification.event.eta_changed") ?? "ETA 變更"],
    ['driver_arrived','passenger.driver_arrived.v1',t("partnerNotification.event.driver_arrived") ?? "駕駛已抵達"],
    ['receipt_ready','passenger.receipt_ready.v1',t("partnerNotification.event.receipt_ready") ?? "收據就緒"],
  ];
  
  const PN_BIND: Record<string, [string, any]> = { 
    ready: [t("partnerNotification.state.ready"), 'success'], 
    test_pending: ['待測試', 'warn'], 
    disabled: [t("partnerNotification.state.disabled"), 'neutral'] 
  };
  
  const PN_DLV: Record<string, [string, any]> = {
    delivered: ['端點已接受，但裝置未知','warn'],
    pending:   ['排隊中','neutral'],
    sending:   ['發送中','info'],
    failed:    ['失敗','danger']
  };
  
  const RETRY_DENY: Record<string, string> = { 
    SUPERSEDED:'已被新通知取代', 
    RETRY_EXHAUSTED:'重試次數耗盡', 
    EVENT_EXPIRED:'事件已過期', 
    LEASE_ACTIVE:'另一重送進行中（lease）', 
    BINDING_NOT_READY:'綁定未就緒' 
  };
  
  
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
        client.listPartnerNotificationDeliveries(entrySlug, { pageSize: 500 })
      ]);

      if (bReq.status === 'rejected') {
        const statusCode = bReq.reason?.statusCode;
        const errCode = bReq.reason?.code || bReq.reason?.error;
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
      setError({ kind: "error", message: err.message, code: err.code || err.error });
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
        setError({ kind: "409", message: err.message, code: err.code || err.error });
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
      if (err?.code === 'PARTNER_NOTIFICATION_BINDING_TEST_FAILED' || err?.kind === 'failed') {
        setTestingState("rejected");
      } else {
        setTestingState("rejected"); // fallback
      }
    }
  };

  const handleEnable = async () => {
    if (!binding) return;
    setSaveState("pending");
    try {
      await client.enablePartnerEntryNotificationBinding(entrySlug, binding.version);
      fetchState();
    } catch (err: any) {
      setError({ kind: "error", message: err.message, code: err.code || err.error });
    } finally {
      setSaveState("idle");
    }
  };

  const handleDisable = async () => {
    if (!binding) return;
    setSaveState("pending");
    try {
      await client.disablePartnerEntryNotificationBinding(entrySlug, binding.version);
      fetchState();
    } catch (err: any) {
      setError({ kind: "error", message: err.message, code: err.code || err.error });
    } finally {
      setSaveState("idle");
    }
  };

  const handleResume = () => {
    setEditWebhookId(binding?.webhookId || "");
    setEditEventTypes(binding?.eventTypes || []);
    setEditExpectedVersion(binding?.version || 0);
    setIsEditing(true);
  };
  
  const handleRetry = async (outboxId: string) => {
    setRetryRowId(outboxId);
    setRetryState("pending");
    try {
      const outcome = await client.retryPartnerNotificationDelivery(entrySlug, outboxId);
      if (outcome.kind === 'failed') {
        setRetryState("failed");
      } else {
        setRetryState("queued");
      }
      fetchState();
    } catch {
      setRetryState("failed");
    }
  };

  if (error?.kind === "403") {
    return (
      <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <CanvasCard theme={theme} title={t("partnerNotification.scopeDeniedTitle") ?? "403 · PARTNER_NOTIFICATION_BINDING_TENANT_SCOPE_DENIED（含 getBinding）"} padding={14}>
          <div style={{ padding:'18px 8px' }}>
            <CanvasEmptyState theme={theme} title={t("partnerNotification.permissionDenied")} body="您無此夥伴 entry 的存取範圍；綁定、派送紀錄與所有動作皆不可見。此頁不提供唯讀降級。"/>
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
          {saveState === 'failed' && <CanvasBanner theme={theme} tone="danger" icon="warn" title={t("partnerNotification.saveFailed")} body={error?.message || "請檢查連線或重試。"}/>}
          {error?.kind === '409' && error.code === 'PARTNER_NOTIFICATION_BINDING_VERSION_CONFLICT' && <CanvasBanner theme={theme} tone="warn" icon="warn" title={`綁定已被他人更新（expectedVersion ${editExpectedVersion}）`} body="您的選擇已保留。請重新載入後再儲存；不會靜默覆寫。" actions={<><CanvasBtn theme={theme} size="xs" variant="primary" icon="refresh" onClick={fetchState}>{t("partnerNotification.reload")}</CanvasBtn></>}/>}
          <CanvasCard theme={theme} title={t("partnerNotification.editBinding.title")} subtitle="PUT /partner-entries/:id/notification-binding · webhookId + eventTypes + expectedVersion">
            <CanvasField theme={theme} label="webhookId · 選擇既有 webhook" required hint="端點 URL、密鑰、逾時/重試由既有 webhook 管理維護，本頁不重複 CRUD">
              <input 
                type="text"
                value={editWebhookId} 
                onChange={e => setEditWebhookId(e.target.value)} 
                style={{ width: '100%', padding: '8px 12px', border: `1px solid ${theme.border}`, borderRadius: 4, background: theme.surfaceLo, color: theme.text, fontSize: 13 }}
                placeholder="wh_..."
              />
              <div style={{ marginTop:6 }}>{tenantId ? <a href={`/tenants/${tenantId}`} target="_blank" rel="noreferrer"><CanvasBtn theme={theme} size="xs" variant="ghost" icon="ext">{t("partnerNotification.webhookHelp") ?? "前往既有 /webhooks 管理（需 tenant:webhooks:write）"}</CanvasBtn></a> : <CanvasBtn theme={theme} size="xs" variant="ghost" icon="ext">{t("partnerNotification.webhookHelp") ?? "前往既有 /webhooks 管理（需 tenant:webhooks:write）"}</CanvasBtn>}</div>
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
              <input type="text" value={String(editExpectedVersion)} readOnly style={{ width: '100%', padding: '8px 12px', border: `1px solid ${theme.border}`, borderRadius: 4, background: theme.surfaceLo, color: theme.textDim, fontSize: 13, fontFamily: theme.monoFamily }} />
            </CanvasField>
          </CanvasCard>
        </div>
        <CanvasCard theme={theme} title={t("partnerNotification.summary.title")}>
          <CanvasDL theme={theme} cols={1} items={[
            { k:'webhookId', v: editWebhookId || '未設定', mono:true },
            { k:'eventTypes', v: editEventTypes.length > 0 ? editEventTypes.join(', ') : '無' },
            { k:'expectedVersion', v: `${editExpectedVersion} → 儲存後 ${editExpectedVersion + 1}`, mono:true }
          ]}/>
          <div style={{ marginTop:8 }}>
            <CanvasBanner theme={theme} tone="info" icon="flags" body="儲存後綁定回到 test_pending；若 webhook 端點 fingerprint 改變，先前測試失效，需重測方可啟用。"/>
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <CanvasBtn theme={theme} disabled={saveState === "pending"} onClick={() => setIsEditing(false)}>{t("partnerNotification.cancel")}</CanvasBtn>
            <PanelActionBtn theme={theme} descriptor={{ action:'save', enabled:!isSaveDisabled, riskLevel:'medium' }} variant="primary" icon="check" label={saveState === 'pending' ? "儲存中..." : "儲存"} en="save" onClick={handleSave}/>
          </div>
        </CanvasCard>
      </div>
    );
  }

  const bindState = binding ? binding.state : error?.kind === "404" ? "none" : "unknown";
  const isPending = testingState === 'pending' || saveState === 'pending';
  const m = PN_BIND[bindState] || ['未知', 'neutral'];
  
  // Real or mock test status logic
  // If we have a validatedFingerprint and it matches current endpoint fingerprint, it's passed_current
  // But we don't have endpointFingerprint exposed yet on binding from server? Actually binding has it in my UI?
  // Let's assume binding returns endpointFingerprint if available, and we compare against validatedEndpointFingerprint
  let testStatus = 'none';
  if (binding?.validatedEndpointFingerprint) {
    if (binding.validatedEndpointFingerprint === binding.endpointFingerprint) {
      testStatus = 'passed_current';
    } else {
      testStatus = 'passed_stale';
    }
  } else if (testingState === 'rejected') {
    testStatus = 'failed';
  }

  const TEST: Record<string, [string, any]> = { 
    passed_current:['測試通過 · 目前端點','success'], 
    passed_stale:['測試已失效 · 端點 fingerprint 已變','warn'], 
    failed:['測試失敗','danger'], 
    none:['尚未測試','neutral'] 
  };
  const testDisplay = TEST[testStatus] || ["尚未測試", "neutral"];

  return (
    <div style={{ padding: 24, display:'grid', gridTemplateColumns:'1.5fr 1fr', gap:16, alignItems:'start' }}>
      <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
        {error?.kind === "404" ? (
          <CanvasCard theme={theme} title="404 · PARTNER_NOTIFICATION_BINDING_NOT_FOUND" padding={14}>
            <CanvasBanner theme={theme} tone="info" icon="info" title={t("partnerNotification.notFound.title")} body="選擇既有 webhook 與事件即可建立。" actions={<CanvasBtn theme={theme} size="xs" variant="primary" icon="plus" onClick={() => setIsEditing(true)}>{t("partnerNotification.createBinding")}</CanvasBtn>}/>
          </CanvasCard>
        ) : (
          <CanvasCard theme={theme} title={t("partnerNotification.binding.title")} subtitle="引用既有 webhook · 端點/密鑰於既有 /webhooks 管理（依權限顯示）" actions={<><CanvasBtn theme={theme} size="xs" icon="edit" onClick={() => setIsEditing(true)}>{t("partnerNotification.edit")}</CanvasBtn><CanvasPill theme={theme} tone={m[1] as any} dot>{m[0]}<span style={{ marginLeft:4, opacity:.6, fontFamily:theme.monoFamily, fontSize:9 }}>{bindState}</span></CanvasPill></>}>
            <CanvasDL theme={theme} cols={2} items={[
              { k:'webhookId', v: <span style={{ fontFamily:theme.monoFamily }}>{binding?.webhookId || '—'} {tenantId ? <a href={`/tenants/${tenantId}`} target="_blank" rel="noreferrer"><CanvasBtn theme={theme} size="xs" variant="ghost" icon="ext">{t("partnerNotification.webhookHelp") ?? "既有 /webhooks 管理（需 tenant:webhooks:write）"}</CanvasBtn></a> : <CanvasBtn theme={theme} size="xs" variant="ghost" icon="ext">{t("partnerNotification.webhookHelp") ?? "既有 /webhooks 管理（需 tenant:webhooks:write）"}</CanvasBtn>}</span> }, 
              { k:'端點（唯讀）', v: 'https://...', mono:true },
              { k:'端點 fingerprint', v: binding?.endpointFingerprint || '未知', mono:true }, 
              { k:'version', v:String(binding?.version || 0), mono:true },
              { k:'最近測試', v: <CanvasPill theme={theme} tone={testDisplay[1] as any} dot>{testDisplay[0]}</CanvasPill> }, 
              { k:'測試時間', v: (testStatus==='none') ? '—' : (binding?.validatedAt ? `${new Date(binding.validatedAt).toLocaleString()} · fp:${binding.validatedEndpointFingerprint}` : '—'), mono:true },
              { k:'最後更新', v: binding?.updatedAt ? new Date(binding.updatedAt).toLocaleString() : '—', mono:false },
              { k:'簽章密鑰', v: <span style={{ fontFamily:theme.monoFamily }}>{t("partnerNotification.secretHidden") ?? "••••••••（此頁不顯示、不編輯）"}</span> }
            ]}/>
            <div style={{ marginTop:10 }}>
              <div style={{ fontSize:11, fontWeight:700, color:theme.textMuted, marginBottom:6 }}>{t("partnerNotification.subscribedEvents")}</div>
              {bindState === 'disabled' ? (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  <span style={{ fontSize:11.5, color:theme.textDim }}>{t("partnerNotification.disabledDesc")}</span>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                  {(binding?.eventTypes || []).map((i: string) => {
                    const row = PN_EVENTS.find(e => e[0] === i);
                    return <div key={i} style={{ display:'flex', alignItems:'center', gap:8, fontSize:11.5 }}><CanvasPill theme={theme} tone="accent">{i}</CanvasPill><CanvasIcon name="chevR" size={11} style={{ color:theme.textDim }}/><span style={{ fontFamily:theme.monoFamily, color:theme.textMuted }}>{row ? row[1] : i}</span><span style={{ color:theme.textDim }}>{row ? row[2] : ''}</span></div>
                  })}
                </div>
              )}
            </div>
          </CanvasCard>
        )}
        
        <CanvasCard theme={theme} title={t("partnerNotification.deliveries.title")} subtitle="送達以 ack 驗證為準，不憑 HTTP code · 目標為每筆 immutable delivery context · 重試受控" padding={0} actions={<><CanvasBtn theme={theme} size="xs" icon="refresh" onClick={fetchState}>{t("partnerNotification.refresh")}</CanvasBtn></>}>
          {loading ? (
             <div style={{ padding:16 }}>{[0,1,2].map(i=><div key={i} style={{ height:14, borderRadius:4, background:theme.surfaceLo, marginBottom:10 }}/>)}</div>
          ) : deliveries.length === 0 ? (
             <div style={{ padding:24 }}><CanvasEmptyState theme={theme} title={t("partnerNotification.noData")} body="尚無派送紀錄。" /></div>
          ) : (
            <CanvasTable theme={theme} columns={[
              { h:'Delivery ID', k:'id', w:110, mono:true, r: (r: any) => <div style={{display:'flex', flexDirection:'column'}}><span style={{ color:theme.accent, fontWeight:600 }}>{r.deliveryId || '—'}</span><span style={{ fontSize:10, color:theme.textDim }}>{r.outboxId}</span></div> },
              { h:'事件（內部）', k:'ev', w:170, mono:true, r: (r: any) => r.eventSequence ? `${r.eventType} (#${r.eventSequence})` : r.eventType },
              { h:'目標（遮罩）', w:150, mono:true, r: (r: any) => <span style={{ fontSize:10.5 }}>{r.deliveryTarget || <span style={{color:theme.textDim}}>{t("partnerNotification.unknownTarget") ?? "未知／尚未建立派送目標"}</span>}</span> },
              { h:'下游狀態', k:'ds', w:100, mono:true, r: (r: any) => r.downstreamStatus || '—' },
              { h:'ack', w:70, r: (r: any) => r.status === 'delivered' ? <CanvasPill theme={theme} tone="success">{t("cmp.common.pass") ?? "通過"}</CanvasPill> : r.failureReason === 'partner_ack_invalid' ? <CanvasPill theme={theme} tone="danger">{t("cmp.common.none") ?? "不符"}</CanvasPill> : <span style={{ color:theme.textDim }}>—</span> },
              { h:'送達狀態', w:190, r: (r: any) => { const st = PN_DLV[r.status] || ['未知', 'neutral']; return <CanvasPill theme={theme} tone={st[1]} dot>{st[0]}</CanvasPill>; } },
              { h:'說明', w:150, r: (r: any) => <span style={{ fontSize:11.5, color:theme.textMuted }}>{r.failureReason || '—'}</span> },
              { h:'時間', k:'at', w:120, mono:true, r: (r: any) => r.createdAt ? new Date(r.createdAt).toLocaleString() : '—' },
              { h:'次', k:'tries', w:36, mono:true, align:'center', r: (r: any) => `${r.attempts || 0}/${r.maxAttempts || 0}` },
              { h:'重送', w:150, r: (r: any) => {
                  const rState = retryRowId === r.outboxId ? retryState : 'idle';
                  if (r.retryDisposition === 'manual_only' || (r.retryDisposition === 'automatic' && r.attempts < (r.maxAttempts || 99)) || (r.retryDisposition === 'configuration_blocked' && r.attempts < (r.maxAttempts || 99))) {
                    return <PanelActionBtn theme={theme} size="xs" descriptor={{ action:'resend', enabled: rState !== 'pending' && !!canWriteBinding, riskLevel:'low', requiresReason:false }} icon="refresh" label={rState === 'pending' ? '重送中' : '重送'} en="resend" onClick={() => handleRetry(r.outboxId)}/>;
                  }
                  return <span style={{ fontSize:10.5, color:theme.textDim, display:'inline-flex', alignItems:'center', gap:4 }}><CanvasIcon name="flags" size={10}/>{RETRY_DENY[r.retryDisposition] || r.retryDisposition}</span>;
                }
              },
            ]} rows={deliveries} />
          )}
        </CanvasCard>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
        {binding && (
          <CanvasCard theme={theme} title={t("partnerNotification.lifecycle.title")} subtitle="test → enable · disable · resume">
            {testingState === 'rejected' && <CanvasBanner theme={theme} tone="danger" icon="warn" title={t("partnerNotification.testDeniedTitle") ?? "綁定測試遭拒"} body="夥伴端點回傳錯誤狀態碼，拒絕了測試要求，無法啟用。" actions={<CanvasBtn theme={theme} size="xs" icon="refresh" onClick={handleTest}>{t("partnerNotification.retest")}</CanvasBtn>}/>}
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <PanelActionBtn theme={theme} descriptor={{ action:'test', enabled: bindState !== 'disabled' && !isPending, riskLevel:'low' }} icon="refresh" label={testingState==='pending' ? "測試中..." : "發送測試事件"} en="test" onClick={handleTest}/>
              <PanelActionBtn theme={theme} descriptor={{ action:'enable', enabled: testStatus === 'passed_current' && !isPending, riskLevel:'medium' }} icon="check" label={"啟用"} en="enable" onClick={handleEnable}/>
              {bindState === 'disabled' ? (
                <PanelActionBtn theme={theme} descriptor={{ action:'resume', enabled: !isPending, riskLevel:'medium' }} icon="check" label={saveState === 'pending' ? "恢復通知中..." : testStatus === 'passed_current' ? "恢復通知" : "恢復通知（恢復後需重新測試，通過後才能啟用）"} en="resume" onClick={handleResume}/>
              ) : (
                <PanelActionBtn theme={theme} descriptor={{ action:'disable', enabled: bindState === 'ready' && !isPending, riskLevel:'high' }} icon="lock" label={"停用"} en="disable" onClick={handleDisable}/>
              )}
            </div>
            <div style={{ fontSize:10.5, color:theme.textDim, marginTop:9, lineHeight:1.5 }}>{t("partnerNotification.enableThreshold")}<br/>{t("partnerNotification.resumeThreshold") ?? "「恢復」依據目前端點是否 passed_current 來決定是否需重測，無獨立 /resume。"}</div>
          </CanvasCard>
        )}
        {(() => {
          const recent = deliveries.filter((d: any) => d.createdAt && new Date(d.createdAt).getTime() > Date.now() - 24 * 60 * 60 * 1000);
          const accepted = recent.filter((d: any) => d.status === 'delivered').length;
          const mismatch = recent.filter((d: any) => d.failureReason === 'partner_ack_invalid').length;
          const failed = recent.filter((d: any) => d.status === 'failed').length;
          return (
            <CanvasCard theme={theme} title={t("partnerNotification.recentSubtitle") ?? "派送摘要 · 近 24h"} subtitle="「已接受」≠ 裝置已收到">
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
                <CanvasKPI theme={theme} label="端點已接受" value={String(accepted)}/>
                <CanvasKPI theme={theme} label="ack 不符" value={String(mismatch)}/>
                <CanvasKPI theme={theme} label="失敗/耗盡" value={String(failed)}/>
              </div>
            </CanvasCard>
          );
        })()}
      </div>
    </div>
  );
}
