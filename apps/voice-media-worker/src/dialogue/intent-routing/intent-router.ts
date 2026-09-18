import type { VoiceDialogueOutput, VoiceToolProposal } from "@drts/contracts";
import {
  VoiceCapabilityRegistry,
  DEFAULT_PHASE1_CAPABILITY_CONFIG,
} from "./capability-registry";
import { voiceNumericReadback } from "../dialogue-state";

export interface IntentRoutingContext {
  callerPhone?: string | undefined;
  callerPhoneVerified?: boolean | undefined;
  hasActiveOrder?: boolean | undefined;
  activeOrderId?: string | undefined;
  multiVehicleRequested?: boolean | undefined;
  vehicleCount?: number | undefined;
  scheduledTimeIsoUtc?: string | undefined;
  specialRequirements?: string[] | undefined;
  specialRequirementServiceable?: boolean | undefined;
  cancelFee?: number | undefined;
}

export interface RoutedIntentResult {
  intent: VoiceDialogueOutput["intent"];
  terminal: VoiceDialogueOutput["terminal"];
  tools: VoiceToolProposal[];
  promptZh: string;
  diverted: boolean;
  divertReason?:
    | "capability_disabled"
    | "duplicate_active_order"
    | "multi_vehicle_unsupported"
    | "reservation_not_enabled"
    | "special_product_unsupported"
    | "identity_unverified"
    | undefined;
  handoffReason?:
    | "customer_requested"
    | "urgent_safety"
    | "service_unsupported"
    | "location_unresolved"
    | "provider_unavailable"
    | undefined;
}

export class VoiceIntentRouter {
  constructor(
    private readonly registry: VoiceCapabilityRegistry = new VoiceCapabilityRegistry(
      DEFAULT_PHASE1_CAPABILITY_CONFIG,
    ),
  ) {}

  route(
    output: VoiceDialogueOutput,
    context: IntentRoutingContext = {},
  ): RoutedIntentResult {
    const { intent } = output;

    // 1. Emergency intent (urgent safety)
    if (intent === "emergency") {
      return {
        intent,
        terminal: "handoff",
        tools: [
          {
            name: "request_handoff",
            args: { reason: "urgent_safety" },
          },
        ],
        promptZh: "如有立即危險，請聯絡當地緊急救援服務。",
        diverted: true,
        divertReason: "capability_disabled",
        handoffReason: "urgent_safety",
      };
    }

    // 2. Explicit human / complaint / lost property requests
    if (
      intent === "human" ||
      intent === "complaint" ||
      intent === "lost_property"
    ) {
      return {
        intent,
        terminal: "handoff",
        tools: [
          {
            name: "request_handoff",
            args: { reason: "customer_requested" },
          },
        ],
        promptZh: "已為您停止自動受理，正在轉接客服專員為您處理。",
        diverted: true,
        divertReason: "capability_disabled",
        handoffReason: "customer_requested",
      };
    }

    // 3. Cancel intent (SD §12.2, §12.4, UV-AC-015, UV-AC-016)
    if (intent === "cancel") {
      if (this.registry.isDisabled("order_cancel")) {
        // Capability disabled: reject mutation, route to handoff, never claim cancelled
        return {
          intent,
          terminal: "handoff",
          tools: [
            {
              name: "request_handoff",
              args: { reason: "service_unsupported" },
            },
          ],
          promptZh:
            "無人語音系統目前尚未開通自動取消訂單功能，不會為您直接取消或建立新單，現在將為您轉接客服專員處理。",
          diverted: true,
          divertReason: "capability_disabled",
          handoffReason: "service_unsupported",
        };
      }

      // If conditionally enabled, check caller identity
      if (context.callerPhone && !context.callerPhoneVerified) {
        return {
          intent,
          terminal: "handoff",
          tools: [
            {
              name: "request_handoff",
              args: { reason: "service_unsupported" },
            },
          ],
          promptZh:
            "取消訂單需核對乘客身份與行程授權，未核對前無法進行取消操作，將為您轉接專員為您確認。",
          diverted: true,
          divertReason: "identity_unverified",
          handoffReason: "service_unsupported",
        };
      }

      // If enabled and verified, tools pass through or request handoff based on flow
      return {
        intent,
        terminal: output.terminal,
        tools: output.tools,
        promptZh:
          context.cancelFee && context.cancelFee > 0
            ? `若確認取消本行程，將依派遣規定產生取消費用新台幣 ${context.cancelFee} 元。請說「確認取消」以完成操作。`
            : "本行程目前尚在配對司機中，取消不收取費用。請說「確認取消」以完成取消。",
        diverted: false,
      };
    }

    // 4. Amend intent (SD §12.4)
    if (intent === "amend") {
      // Amend is disabled in Phase 1: reject mutation, route to handoff, never modify or create regular order
      return {
        intent,
        terminal: "handoff",
        tools: [
          {
            name: "request_handoff",
            args: { reason: "service_unsupported" },
          },
        ],
        promptZh:
          "無人語音系統目前尚未開通語音改單功能，不會為您直接修改或另建即時單，現在將為您轉接客服專員為您更改行程。",
        diverted: true,
        divertReason: "capability_disabled",
        handoffReason: "service_unsupported",
      };
    }

    // 5. Reservation intent (SD §12.4, UV-FR-016, UV-AC-017)
    if (intent === "reservation") {
      let readbackTime = "";
      if (context.scheduledTimeIsoUtc) {
        try {
          readbackTime = voiceNumericReadback(
            "time",
            context.scheduledTimeIsoUtc,
          );
        } catch {
          readbackTime = context.scheduledTimeIsoUtc;
        }
      }

      const promptZh = readbackTime
        ? `您所預約的台北時間為 ${readbackTime}。無人語音系統目前尚未開通預約叫車寫入功能，不會為您建立即時單，現在將為您轉接客服專員處理。`
        : "無人語音系統目前尚未開通預約叫車寫入功能，不會為您建立即時單，現在將為您轉接客服專員為您安排預約。";

      return {
        intent,
        terminal: "handoff",
        tools: [
          {
            name: "request_handoff",
            args: { reason: "service_unsupported" },
          },
        ],
        promptZh,
        diverted: true,
        divertReason: "reservation_not_enabled",
        handoffReason: "service_unsupported",
      };
    }

    // 6. Status / Inquiry intent (SD §12.2, UV-FR-014, UV-AC-014)
    if (intent === "status") {
      if (context.callerPhone && !context.callerPhoneVerified) {
        // Caller phone without verified proof cannot reveal itinerary or confirm order existence
        return {
          intent,
          terminal: "handoff",
          tools: [
            {
              name: "request_handoff",
              args: { reason: "customer_requested" },
            },
          ],
          promptZh:
            "查詢訂單需先完成身份核對，未核對身份前不透露行程內容。將為您轉接客服專員為您處理。",
          diverted: true,
          divertReason: "identity_unverified",
          handoffReason: "customer_requested",
        };
      }

      return {
        intent,
        terminal: output.terminal,
        tools: output.tools,
        promptZh: output.text || "正在為您查詢本通電話已綁定之訂單狀態。",
        diverted: false,
      };
    }

    // 7. Book intent: check multi-vehicle, duplicate call, reservation time, special products
    if (intent === "book") {
      // 7a. Multi-vehicle demand in single call (SD §12.3, UV-FR-017, UV-AC-019)
      if (
        context.multiVehicleRequested ||
        (context.vehicleCount !== undefined && context.vehicleCount > 1)
      ) {
        return {
          intent,
          terminal: "handoff",
          tools: [
            {
              name: "request_handoff",
              args: { reason: "service_unsupported" },
            },
          ],
          promptZh:
            "無人語音系統一次僅能受理單輛車派遣，多車叫車需求不會直接重複下單，將為您轉接客服專員統籌派車。",
          diverted: true,
          divertReason: "multi_vehicle_unsupported",
          handoffReason: "service_unsupported",
        };
      }

      // 7b. Duplicate call with active order (SD §12.3, UV-FR-017, UV-AC-019)
      if (context.hasActiveOrder) {
        return {
          intent,
          terminal: "handoff",
          tools: [
            {
              name: "request_handoff",
              args: { reason: "customer_requested" },
            },
          ],
          promptZh:
            "系統核對發現您目前已有一筆進行中的行程，為避免重複下單，不會直接建立第二筆訂單。將為您查詢現有進度或轉接專員。",
          diverted: true,
          divertReason: "duplicate_active_order",
          handoffReason: "customer_requested",
        };
      }

      // 7c. Scheduled timing in booking slots (UV-AC-017)
      if (context.scheduledTimeIsoUtc) {
        let readbackTime = "";
        try {
          readbackTime = voiceNumericReadback(
            "time",
            context.scheduledTimeIsoUtc,
          );
        } catch {
          readbackTime = context.scheduledTimeIsoUtc;
        }

        return {
          intent,
          terminal: "handoff",
          tools: [
            {
              name: "request_handoff",
              args: { reason: "service_unsupported" },
            },
          ],
          promptZh: `您指定的時間為台北時間 ${readbackTime}。無人語音系統目前僅支援即時派車，預約單不會自動偷換成即時單下單，將為您轉接客服專員。`,
          diverted: true,
          divertReason: "reservation_not_enabled",
          handoffReason: "service_unsupported",
        };
      }

      // 7d. Unsupported special requirements (wheelchair, child seat, etc.) (SD §12.4, UV-AC-018)
      if (
        context.specialRequirements &&
        context.specialRequirements.length > 0 &&
        context.specialRequirementServiceable === false
      ) {
        return {
          intent,
          terminal: "handoff",
          tools: [
            {
              name: "request_handoff",
              args: { reason: "service_unsupported" },
            },
          ],
          promptZh:
            "您所需求的特殊服務規格（如輪椅／安全座椅）目前未有可承諾之合格運能，不會僅填寫備註派普通車，將為您轉接客服專員處理。",
          diverted: true,
          divertReason: "special_product_unsupported",
          handoffReason: "service_unsupported",
        };
      }
    }

    // Default: normal turn flow
    return {
      intent,
      terminal: output.terminal,
      tools: output.tools,
      promptZh: output.text,
      diverted: false,
    };
  }
}
