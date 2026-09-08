import type {
  VoiceDialogueIntent,
  VoiceHandoffReasonCode,
  VoiceToolProposal,
} from "./dialogue-types";

/**
 * Acceptance §3:
 * "要求真人/投訴/遺失物/緊急意圖停止推銷叫車"
 *
 * When any of these intents are identified, the dialogue engine MUST halt
 * booking flows immediately: it will NOT pitch rides, request booking slots,
 * or attempt upselling. It routes directly to human handoff or emergency protocol.
 */

export interface IntentClassificationResult {
  intent: VoiceDialogueIntent;
  confidence: number;
  shouldHaltBooking: boolean;
  handoffReason?: VoiceHandoffReasonCode;
  immediateResponseText?: string;
  proposedToolCalls: VoiceToolProposal[];
}

/**
 * Classifies passenger utterances into dialogue intents and flags safety/handoff mandates.
 */
export function classifyDialogueIntent(
  utterance: string,
  turnId: string = "turn-0",
): IntentClassificationResult {
  const text = utterance.trim().toLowerCase();

  // 1. Emergency / Urgent Safety (Highest priority)
  if (
    /救命|車禍|緊急|事故|發生意外|危險|報警|受傷|火災|生命危險/i.test(text)
  ) {
    return {
      intent: "emergency",
      confidence: 0.99,
      shouldHaltBooking: true,
      handoffReason: "urgent_safety",
      immediateResponseText:
        "收到您的緊急通報，系統已立即終止叫車並通報緊急協助專線，請保持通話。",
      proposedToolCalls: [
        {
          callId: `call-handoff-${turnId}`,
          toolName: "request_handoff",
          parameters: {
            reasonCode: "urgent_safety",
            summary: {
              triggerUtterance: utterance,
              category: "emergency",
            },
          },
        },
      ],
    };
  }

  // 2. Complaint / Dispute
  if (
    /投訴|申訴|態度很差|態度惡劣|被超收|亂收費|司機罵我|騙錢|服務很爛|不滿意|要找消保官/i.test(
      text,
    )
  ) {
    return {
      intent: "complaint",
      confidence: 0.95,
      shouldHaltBooking: true,
      handoffReason: "complaint",
      immediateResponseText:
        "非常抱歉造成您的不便與困擾，我已停止叫車流程，立即為您轉接客訴處理專員，請稍候。",
      proposedToolCalls: [
        {
          callId: `call-handoff-${turnId}`,
          toolName: "request_handoff",
          parameters: {
            reasonCode: "complaint",
            summary: {
              triggerUtterance: utterance,
              category: "customer_complaint",
            },
          },
        },
      ],
    };
  }

  // 3. Lost and Found
  if (
    /遺失物|東西掉|忘在車上|手機掉|錢包忘|東西忘了拿|行李掉|協尋/i.test(text)
  ) {
    return {
      intent: "lost_and_found",
      confidence: 0.95,
      shouldHaltBooking: true,
      handoffReason: "lost_and_found",
      immediateResponseText:
        "收到您的遺失物協尋需求，我已停止叫車對話，立即為您轉接客服專員協助調閱紀錄，請稍候。",
      proposedToolCalls: [
        {
          callId: `call-handoff-${turnId}`,
          toolName: "request_handoff",
          parameters: {
            reasonCode: "lost_and_found",
            summary: {
              triggerUtterance: utterance,
              category: "lost_and_found",
            },
          },
        },
      ],
    };
  }

  // 4. Explicit Request for Human Agent / Supervisor
  if (
    /真人|人工|轉專人|叫主管|客服專員|找人講話|不要機器人|換真人|轉客服/i.test(
      text,
    )
  ) {
    return {
      intent: "request_human",
      confidence: 0.98,
      shouldHaltBooking: true,
      handoffReason: "customer_requested",
      immediateResponseText:
        "好的，我立即停止語音系統引導，為您轉接真人客服專員，請稍候。",
      proposedToolCalls: [
        {
          callId: `call-handoff-${turnId}`,
          toolName: "request_handoff",
          parameters: {
            reasonCode: "customer_requested",
            summary: {
              triggerUtterance: utterance,
              category: "human_requested",
            },
          },
        },
      ],
    };
  }

  // 5. Booking Status Query
  if (
    /查單|車子到哪|司機到了嗎|車到了沒|查一下我的訂單|查詢訂單|多久會到/i.test(
      text,
    )
  ) {
    return {
      intent: "query_booking",
      confidence: 0.9,
      shouldHaltBooking: false,
      immediateResponseText: "好的，正在為您查詢目前的派車與車輛狀態，請稍候。",
      proposedToolCalls: [
        {
          callId: `call-query-${turnId}`,
          toolName: "get_bound_booking_status",
          parameters: {},
        },
      ],
    };
  }

  // 6. Booking Cancellation
  if (/取消|不要叫了|不要派車|不用了|取消叫車|取消這趟/i.test(text)) {
    return {
      intent: "cancel_booking",
      confidence: 0.9,
      shouldHaltBooking: true,
      immediateResponseText:
        "收到您的取消需求，目前語音線上取消需轉接專員確認，立即為您接通客服，請稍候。",
      proposedToolCalls: [
        {
          callId: `call-handoff-${turnId}`,
          toolName: "request_handoff",
          parameters: {
            reasonCode: "customer_requested",
            summary: {
              triggerUtterance: utterance,
              action: "cancel_requested",
            },
          },
        },
      ],
    };
  }

  // 7. Booking Creation (Default positive intent)
  if (
    /叫車|去|從|到|台北|車站|大勇街|中正路|門牌|地址|出發|機場|坐計程車/i.test(
      text,
    )
  ) {
    return {
      intent: "create_booking",
      confidence: 0.85,
      shouldHaltBooking: false,
      proposedToolCalls: [],
    };
  }

  return {
    intent: "unknown",
    confidence: 0.4,
    shouldHaltBooking: false,
    proposedToolCalls: [],
  };
}

/**
 * Checks whether an intent requires stopping any further booking promotion or questioning.
 */
export function isNonBookingHandoffIntent(
  intent: VoiceDialogueIntent,
): boolean {
  return (
    intent === "request_human" ||
    intent === "complaint" ||
    intent === "lost_and_found" ||
    intent === "emergency"
  );
}
