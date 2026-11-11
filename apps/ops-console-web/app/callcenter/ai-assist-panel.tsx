"use client";

import type { CSSProperties } from "react";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasPill,
  type CanvasTone,
} from "@drts/ui-web";
import type { buildCanvasTheme } from "@drts/ui-web";

import {
  ASSIST_FIELDS,
  assistFieldStatus,
  formatCapabilities,
  handoffWaitMinutes,
  type AssistDraftView,
  type AssistField,
  type AssistFieldStatusView,
  type AssistFormState,
  type HandoffQueueItemView,
} from "./ai-assist";

type Theme = ReturnType<typeof buildCanvasTheme>;
type Locale = "zh" | "en";

export type AssistAddressStatus =
  | "idle"
  | "resolving"
  | "applied"
  | "not_found"
  | "error";

const COPY = {
  zh: {
    title: "AI 協助填單",
    subtitleHandoff: "AI 語音客服已先填好，請核對後送出；錯的欄位直接修改。",
    subtitleAssist:
      "AI 正在聽這通電話並即時填單，請核對後送出；錯的欄位直接修改。",
    sourceHandoff: "AI 語音轉接",
    sourceAssist: "AI 旁聽中",
    extractorLlm: "AI 模型",
    extractorRules: "規則擷取",
    extractorVoice: "語音對話",
    empty: "這通電話目前沒有 AI 填單資料。",
    loadError: "AI 填單資料暫時讀不到，請直接手動填寫。",
    rawText: "乘客原話",
    candidates: "也聽到",
    confirm: "確認無誤",
    offer: "AI 聽到新的值",
    useOffer: "改用",
    blockingTitle: "還有 AI 不確定的欄位",
    blockingBody: "請先確認或修改：",
    transcript: "通話逐字稿（最近幾句）",
    speakerCaller: "乘客",
    speakerAgent: "客服",
    speakerUnknown: "—",
    addressResolving: "正在地圖上查詢 AI 填的地址…",
    addressApplied: "已依 AI 填的地址帶入地圖，請核對位置",
    addressNotFound: "地圖找不到這個地址，請在下方地圖搜尋或釘選",
    addressError: "地圖查詢失敗，請在下方地圖搜尋或釘選",
    status: {
      empty: "未填",
      ai_filled: "AI 填入",
      ai_uncertain: "請確認",
      confirmed: "已確認",
      agent_edited: "已人工修改",
    } satisfies Record<AssistFieldStatusView, string>,
    fields: {
      pickup: "上車地點",
      dropoff: "下車地點",
      passengerName: "乘客稱呼",
      passengerPhone: "聯絡電話",
      pickupTime: "乘車時間",
      passengerCount: "乘客人數",
      luggage: "行李",
      requiredCapabilities: "特殊需求",
      notes: "其他備註",
    } satisfies Record<AssistField, string>,
    queueTitle: "等待接手的 AI 轉接",
    queueSubtitle: "AI 處理不了、轉給真人的來電，最急的在最上面。",
    queueEmpty: "目前沒有等待中的轉接。",
    queueWaiting: (minutes: number) => `已等 ${minutes} 分鐘`,
    queueOpen: "開啟",
    priority: { normal: "一般", urgent: "優先", emergency: "緊急" },
    reasons: {
      customer_requested: "乘客要求真人",
      location_unresolved: "地址無法確認",
      service_unsupported: "AI 不支援的需求",
      urgent_safety: "安全緊急",
      provider_unavailable: "語音服務異常",
    } as Record<string, string>,
  },
  en: {
    title: "AI booking assist",
    subtitleHandoff:
      "The AI voice agent filled this in. Check it, fix what is wrong, then submit.",
    subtitleAssist:
      "The AI is listening to this call and filling the booking. Check it, fix what is wrong, then submit.",
    sourceHandoff: "AI voice handoff",
    sourceAssist: "AI listening",
    extractorLlm: "AI model",
    extractorRules: "Rule extraction",
    extractorVoice: "Voice dialogue",
    empty: "No AI booking data for this call yet.",
    loadError: "AI booking data is unavailable; fill the form manually.",
    rawText: "Caller said",
    candidates: "Also heard",
    confirm: "Looks right",
    offer: "AI heard a new value",
    useOffer: "Use it",
    blockingTitle: "Some AI values are uncertain",
    blockingBody: "Confirm or correct before submitting: ",
    transcript: "Call transcript (latest lines)",
    speakerCaller: "Caller",
    speakerAgent: "Agent",
    speakerUnknown: "—",
    addressResolving: "Looking up the AI's address on the map…",
    addressApplied: "Placed from the AI's address; check the pin",
    addressNotFound: "Address not found on the map; search or pin it below",
    addressError: "Map lookup failed; search or pin it below",
    status: {
      empty: "Empty",
      ai_filled: "AI filled",
      ai_uncertain: "Please check",
      confirmed: "Confirmed",
      agent_edited: "Edited",
    } satisfies Record<AssistFieldStatusView, string>,
    fields: {
      pickup: "Pickup",
      dropoff: "Drop-off",
      passengerName: "Passenger",
      passengerPhone: "Phone",
      pickupTime: "Pickup time",
      passengerCount: "Passengers",
      luggage: "Luggage",
      requiredCapabilities: "Needs",
      notes: "Other notes",
    } satisfies Record<AssistField, string>,
    queueTitle: "AI handoffs waiting",
    queueSubtitle: "Calls the AI passed to a human, most urgent first.",
    queueEmpty: "No handoffs waiting.",
    queueWaiting: (minutes: number) => `Waiting ${minutes} min`,
    queueOpen: "Open",
    priority: { normal: "Normal", urgent: "Urgent", emergency: "Emergency" },
    reasons: {
      customer_requested: "Caller asked for a human",
      location_unresolved: "Address unresolved",
      service_unsupported: "Request not supported by AI",
      urgent_safety: "Safety emergency",
      provider_unavailable: "Voice service problem",
    } as Record<string, string>,
  },
};

export function assistCopy(locale: Locale) {
  return COPY[locale];
}

const STATUS_TONE: Record<AssistFieldStatusView, CanvasTone> = {
  empty: "neutral",
  ai_filled: "info",
  ai_uncertain: "warn",
  confirmed: "success",
  agent_edited: "accent",
};

/** Fields typed in this panel; the others live in the order form below. */
const PANEL_INPUT_FIELDS: readonly AssistField[] = [
  "pickupTime",
  "passengerCount",
  "luggage",
  "requiredCapabilities",
  "notes",
];

export interface AiAssistPanelProps {
  theme: Theme;
  locale: Locale;
  draft: AssistDraftView | null;
  loadState: "idle" | "loading" | "ready" | "error";
  form: AssistFormState;
  addressStatus: Record<"pickup" | "dropoff", AssistAddressStatus>;
  blocking: AssistField[];
  onEdit: (field: AssistField, value: string) => void;
  onConfirm: (field: AssistField) => void;
  onAcceptOffer: (field: AssistField) => void;
}

export function AiAssistPanel({
  theme,
  locale,
  draft,
  loadState,
  form,
  addressStatus,
  blocking,
  onEdit,
  onConfirm,
  onAcceptOffer,
}: AiAssistPanelProps) {
  const copy = COPY[locale];
  const rowStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "minmax(84px, 110px) 1fr",
    gap: "4px 10px",
    padding: "8px 0",
    borderTop: `1px solid ${theme.border}`,
    alignItems: "start",
  };
  const mutedStyle: CSSProperties = { color: theme.textMuted, fontSize: 12 };
  const inputStyle: CSSProperties = {
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    background: theme.surfaceLo,
    color: theme.text,
    border: `1px solid ${theme.border}`,
    borderRadius: 6,
    padding: "5px 8px",
    fontSize: 13,
  };

  if (!draft) {
    return (
      <div data-callcenter-ai-assist="empty" style={{ marginBottom: 12 }}>
        <CanvasBanner
          theme={theme}
          tone={loadState === "error" ? "warn" : "info"}
          icon={loadState === "error" ? "warn" : "phone"}
          title={copy.title}
          body={loadState === "error" ? copy.loadError : copy.empty}
        />
      </div>
    );
  }

  const extractorLabel =
    draft.extractor === "llm"
      ? copy.extractorLlm
      : draft.extractor === "voice_dialogue"
        ? copy.extractorVoice
        : copy.extractorRules;

  return (
    <div
      data-callcenter-ai-assist={draft.source}
      data-draft-version={draft.draftVersion}
      style={{ marginBottom: 12 }}
    >
      <CanvasCard
        theme={theme}
        title={copy.title}
        subtitle={
          draft.source === "voice_handoff"
            ? copy.subtitleHandoff
            : copy.subtitleAssist
        }
        actions={
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <CanvasPill theme={theme} tone="accent" dot>
              {draft.source === "voice_handoff"
                ? copy.sourceHandoff
                : copy.sourceAssist}
            </CanvasPill>
            <CanvasPill theme={theme} tone="neutral">
              {extractorLabel}
            </CanvasPill>
          </div>
        }
      >
        {blocking.length > 0 && (
          <div style={{ marginBottom: 8 }} data-callcenter-ai-assist-blocking>
            <CanvasBanner
              theme={theme}
              tone="warn"
              icon="warn"
              title={copy.blockingTitle}
              body={`${copy.blockingBody}${blocking.map((field) => copy.fields[field]).join(locale === "zh" ? "、" : ", ")}`}
            />
          </div>
        )}
        <div>
          {ASSIST_FIELDS.map((field) => {
            const ai = draft.fields[field];
            const status = assistFieldStatus(form, draft, field);
            const value = form.values[field] ?? "";
            const offer = form.offers[field];
            const editable = PANEL_INPUT_FIELDS.includes(field);
            const shown =
              field === "requiredCapabilities" && !editable
                ? formatCapabilities(value, locale)
                : value;
            return (
              <div
                key={field}
                style={rowStyle}
                data-assist-field={field}
                data-assist-status={status}
              >
                <div style={{ fontSize: 12.5, color: theme.textMuted }}>
                  {copy.fields[field]}
                </div>
                <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    {editable ? (
                      <input
                        aria-label={copy.fields[field]}
                        value={value}
                        onChange={(event) => onEdit(field, event.target.value)}
                        style={{ ...inputStyle, flex: "1 1 160px" }}
                      />
                    ) : (
                      <span
                        style={{
                          fontSize: 13,
                          color: value ? theme.text : theme.textDim,
                          flex: "1 1 160px",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {shown || "—"}
                      </span>
                    )}
                    <CanvasPill theme={theme} tone={STATUS_TONE[status]}>
                      {copy.status[status]}
                    </CanvasPill>
                    {status === "ai_uncertain" && (
                      <CanvasBtn
                        theme={theme}
                        size="xs"
                        variant="secondary"
                        onClick={() => onConfirm(field)}
                      >
                        {copy.confirm}
                      </CanvasBtn>
                    )}
                  </div>
                  {(field === "pickup" || field === "dropoff") &&
                    addressStatus[field] !== "idle" && (
                      <span
                        style={{
                          ...mutedStyle,
                          color:
                            addressStatus[field] === "applied"
                              ? theme.textMuted
                              : theme.warn,
                        }}
                      >
                        {addressStatus[field] === "resolving"
                          ? copy.addressResolving
                          : addressStatus[field] === "applied"
                            ? copy.addressApplied
                            : addressStatus[field] === "not_found"
                              ? copy.addressNotFound
                              : copy.addressError}
                      </span>
                    )}
                  {ai?.rawText && ai.rawText !== ai.value && (
                    <span style={mutedStyle}>
                      {copy.rawText}：「{ai.rawText}」
                    </span>
                  )}
                  {ai && ai.candidates.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        gap: 4,
                        flexWrap: "wrap",
                        alignItems: "center",
                      }}
                    >
                      <span style={mutedStyle}>{copy.candidates}：</span>
                      {ai.candidates.map((candidate) => (
                        <CanvasBtn
                          key={candidate}
                          theme={theme}
                          size="xs"
                          variant="ghost"
                          onClick={() => onEdit(field, candidate)}
                        >
                          {field === "requiredCapabilities"
                            ? formatCapabilities(candidate, locale)
                            : candidate}
                        </CanvasBtn>
                      ))}
                    </div>
                  )}
                  {offer !== undefined && (
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <span style={{ ...mutedStyle, color: theme.info }}>
                        {copy.offer}：{offer}
                      </span>
                      <CanvasBtn
                        theme={theme}
                        size="xs"
                        variant="secondary"
                        onClick={() => onAcceptOffer(field)}
                      >
                        {copy.useOffer}
                      </CanvasBtn>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {draft.transcript.length > 0 && (
          <details style={{ marginTop: 8 }}>
            <summary style={{ ...mutedStyle, cursor: "pointer" }}>
              {copy.transcript}
            </summary>
            <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
              {draft.transcript.slice(-8).map((line) => (
                <div
                  key={line.segmentId}
                  style={{ fontSize: 12.5, overflowWrap: "anywhere" }}
                >
                  <span style={{ color: theme.textMuted }}>
                    {line.speaker === "caller"
                      ? copy.speakerCaller
                      : line.speaker === "agent"
                        ? copy.speakerAgent
                        : copy.speakerUnknown}
                    ：
                  </span>
                  {line.text}
                </div>
              ))}
            </div>
          </details>
        )}
      </CanvasCard>
    </div>
  );
}

export interface HandoffQueueListProps {
  theme: Theme;
  locale: Locale;
  items: HandoffQueueItemView[];
  selectedCallId: string | null;
  onOpen: (callId: string) => void;
}

const PRIORITY_TONE: Record<HandoffQueueItemView["priority"], CanvasTone> = {
  normal: "neutral",
  urgent: "warn",
  emergency: "danger",
};

export function HandoffQueueList({
  theme,
  locale,
  items,
  selectedCallId,
  onOpen,
}: HandoffQueueListProps) {
  const copy = COPY[locale];
  return (
    <CanvasCard
      theme={theme}
      title={copy.queueTitle}
      subtitle={copy.queueSubtitle}
    >
      {items.length === 0 ? (
        <span style={{ color: theme.textMuted, fontSize: 12.5 }}>
          {copy.queueEmpty}
        </span>
      ) : (
        <div style={{ display: "grid", gap: 6 }} data-callcenter-handoff-queue>
          {items.map((item) => (
            <div
              key={item.handoffId}
              data-handoff-id={item.handoffId}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
                padding: "6px 8px",
                borderRadius: 6,
                border: `1px solid ${item.callId === selectedCallId ? theme.borderStrong : theme.border}`,
              }}
            >
              <CanvasPill theme={theme} tone={PRIORITY_TONE[item.priority]}>
                {copy.priority[item.priority]}
              </CanvasPill>
              <span style={{ fontSize: 13, flex: "1 1 140px", minWidth: 0 }}>
                {copy.reasons[item.reason] ?? item.reason}
              </span>
              <span style={{ color: theme.textMuted, fontSize: 12 }}>
                {copy.queueWaiting(handoffWaitMinutes(item.enqueuedAt))}
              </span>
              <CanvasBtn
                theme={theme}
                size="xs"
                variant="secondary"
                onClick={() => onOpen(item.callId)}
              >
                {copy.queueOpen}
              </CanvasBtn>
            </div>
          ))}
        </div>
      )}
    </CanvasCard>
  );
}
