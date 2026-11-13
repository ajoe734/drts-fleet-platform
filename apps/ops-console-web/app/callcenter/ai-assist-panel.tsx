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
  type FrequentPlaceView,
  type HandoffQueueItemView,
} from "./ai-assist";
import { aiAssistCopy } from "./translations";

type Theme = ReturnType<typeof buildCanvasTheme>;
type Locale = "zh" | "en";

export type AssistAddressStatus =
  | "idle"
  | "resolving"
  | "history"
  | "applied"
  | "not_found"
  | "error";

export function assistCopy(locale: Locale) {
  return aiAssistCopy[locale];
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
  const copy = aiAssistCopy[locale];
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
                            addressStatus[field] === "applied" ||
                            addressStatus[field] === "history"
                              ? theme.textMuted
                              : theme.warn,
                        }}
                      >
                        {addressStatus[field] === "resolving"
                          ? copy.addressResolving
                          : addressStatus[field] === "history"
                            ? copy.addressHistory
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
  const copy = aiAssistCopy[locale];
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

export interface FrequentPickupChipsProps {
  theme: Theme;
  locale: Locale;
  places: readonly FrequentPlaceView[];
  onPick: (place: FrequentPlaceView) => void;
}

/** CALLCENTER-AI-ASSIST-20261111: one click fills the pickup with a place
 * this caller's phone number used before, keeping its original pin. */
export function FrequentPickupChips({
  theme,
  locale,
  places,
  onPick,
}: FrequentPickupChipsProps) {
  if (!places.length) return null;
  const copy = aiAssistCopy[locale];
  return (
    <div
      data-callcenter-frequent-pickups
      style={{ display: "grid", gap: 4, marginBottom: 8 }}
    >
      <span style={{ fontSize: 12.5, color: theme.textMuted }}>
        {copy.frequentTitle}
      </span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {places.map((place) => (
          <CanvasBtn
            key={`${place.address.lat},${place.address.lng}`}
            theme={theme}
            size="xs"
            variant="secondary"
            onClick={() => onPick(place)}
          >
            {place.label}（{copy.frequentTrips(place.tripCount)}）
          </CanvasBtn>
        ))}
      </div>
      <span style={{ fontSize: 11.5, color: theme.textDim }}>
        {copy.frequentNote}
      </span>
    </div>
  );
}
