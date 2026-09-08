import type {
  VoiceAddressCandidate,
  VoiceAddressRepairState,
  VoiceDialogueSlot,
  VoiceHandoffSummary,
} from "./dialogue-types";
import {
  groupHouseNumber,
  groupPhoneNumber,
  groupPickupTime,
  repairHouseNumber,
  repairPhoneNumber,
  repairPickupTime,
} from "./number-grouping";

/**
 * Manages dialogue slots and 2-turn address repair state (Acceptance §2):
 * "電話、門牌、時間數字分組讀回與更正；兩輪地址修復失敗有保留原話與候選的交接資料。"
 */
export class SlotRepairManager {
  private slots: Record<string, VoiceDialogueSlot> = {};
  private addressRepair: VoiceAddressRepairState;

  constructor(
    initialSlots: Record<string, VoiceDialogueSlot> = {},
    initialRepair?: VoiceAddressRepairState,
  ) {
    this.slots = { ...initialSlots };
    this.addressRepair = initialRepair ?? {
      slotName: "pickupAddress",
      failedAttempts: 0,
      rawUtterances: [],
      candidates: [],
      lastQuery: "",
      resolved: false,
      abandonedToHandoff: false,
    };
  }

  getSlots(): Record<string, VoiceDialogueSlot> {
    return { ...this.slots };
  }

  getAddressRepairState(): VoiceAddressRepairState {
    return { ...this.addressRepair };
  }

  /**
   * Updates or corrects phone number slot with digit grouping and spoken readback.
   */
  updatePhoneNumber(
    rawUtterance: string,
    turnId: string,
  ): VoiceDialogueSlot<string> {
    const existing = this.slots["passengerPhone"];
    if (existing && existing.normalizedValue) {
      // Check for partial or full correction
      const currentGrouped = groupPhoneNumber(existing.normalizedValue as string);
      const repairResult = repairPhoneNumber(currentGrouped, rawUtterance);
      if (repairResult.isCorrected) {
        const slot: VoiceDialogueSlot<string> = {
          name: "passengerPhone",
          rawText: rawUtterance,
          normalizedValue: repairResult.repaired.normalized,
          sourceTurnIds: [...existing.sourceTurnIds, turnId],
          providerConfidence: 0.95,
          validationState: repairResult.repaired.isValid ? "valid" : "needs_repair",
          confirmedByCustomerAt: null,
          groupedReadbackText: repairResult.repaired.spokenReadback,
        };
        this.slots["passengerPhone"] = slot;
        return slot;
      }
    }

    const grouped = groupPhoneNumber(rawUtterance);
    const slot: VoiceDialogueSlot<string> = {
      name: "passengerPhone",
      rawText: rawUtterance,
      normalizedValue: grouped.normalized,
      sourceTurnIds: [turnId],
      providerConfidence: grouped.isValid ? 0.95 : 0.6,
      validationState: grouped.isValid ? "valid" : "needs_repair",
      confirmedByCustomerAt: null,
      groupedReadbackText: grouped.spokenReadback,
    };
    this.slots["passengerPhone"] = slot;
    return slot;
  }

  /**
   * Updates or corrects house/door number slot with digit-by-digit spoken readback.
   */
  updateHouseNumber(
    rawUtterance: string,
    turnId: string,
  ): VoiceDialogueSlot<string> {
    const existing = this.slots["houseNumber"];
    if (existing && existing.normalizedValue) {
      const currentGrouped = groupHouseNumber(existing.normalizedValue as string);
      const repairResult = repairHouseNumber(currentGrouped, rawUtterance);
      if (repairResult.isCorrected) {
        const slot: VoiceDialogueSlot<string> = {
          name: "houseNumber",
          rawText: rawUtterance,
          normalizedValue: repairResult.repaired.normalized,
          sourceTurnIds: [...existing.sourceTurnIds, turnId],
          providerConfidence: 0.95,
          validationState: repairResult.repaired.isValid ? "valid" : "needs_repair",
          confirmedByCustomerAt: null,
          groupedReadbackText: repairResult.repaired.spokenReadback,
        };
        this.slots["houseNumber"] = slot;
        return slot;
      }
    }

    const grouped = groupHouseNumber(rawUtterance);
    const slot: VoiceDialogueSlot<string> = {
      name: "houseNumber",
      rawText: rawUtterance,
      normalizedValue: grouped.normalized,
      sourceTurnIds: [turnId],
      providerConfidence: grouped.isValid ? 0.95 : 0.6,
      validationState: grouped.isValid ? "valid" : "needs_repair",
      confirmedByCustomerAt: null,
      groupedReadbackText: grouped.spokenReadback,
    };
    this.slots["houseNumber"] = slot;
    return slot;
  }

  /**
   * Updates or corrects pickup time slot with spoken readback.
   */
  updatePickupTime(
    rawUtterance: string,
    turnId: string,
  ): VoiceDialogueSlot<string> {
    const existing = this.slots["pickupTime"];
    if (existing && existing.normalizedValue) {
      const currentGrouped = groupPickupTime(existing.normalizedValue as string);
      const repairResult = repairPickupTime(currentGrouped, rawUtterance);
      if (repairResult.isCorrected) {
        const slot: VoiceDialogueSlot<string> = {
          name: "pickupTime",
          rawText: rawUtterance,
          normalizedValue: repairResult.repaired.normalized,
          sourceTurnIds: [...existing.sourceTurnIds, turnId],
          providerConfidence: 0.95,
          validationState: repairResult.repaired.isValid ? "valid" : "needs_repair",
          confirmedByCustomerAt: null,
          groupedReadbackText: repairResult.repaired.spokenReadback,
        };
        this.slots["pickupTime"] = slot;
        return slot;
      }
    }

    const grouped = groupPickupTime(rawUtterance);
    const slot: VoiceDialogueSlot<string> = {
      name: "pickupTime",
      rawText: rawUtterance,
      normalizedValue: grouped.normalized,
      sourceTurnIds: [turnId],
      providerConfidence: grouped.isValid ? 0.95 : 0.6,
      validationState: grouped.isValid ? "valid" : "needs_repair",
      confirmedByCustomerAt: null,
      groupedReadbackText: grouped.spokenReadback,
    };
    this.slots["pickupTime"] = slot;
    return slot;
  }

  /**
   * Records an address resolution attempt.
   * Enforces the 2-round repair policy:
   * If address cannot be uniquely resolved after 2 attempts (e.g. 0 matches or multiple ambiguous matches),
   * abandons to handoff with reason 'location_unresolved', preserving all raw utterances and candidates.
   */
  processAddressResolutionResult(
    rawUtterance: string,
    candidates: VoiceAddressCandidate[],
    slotName: "pickupAddress" | "dropoffAddress" = "pickupAddress",
    turnId: string = "turn-0",
  ): {
    resolved: boolean;
    abandonedToHandoff: boolean;
    handoffSummary?: VoiceHandoffSummary;
    clarificationPrompt?: string;
  } {
    this.addressRepair.slotName = slotName;
    this.addressRepair.lastQuery = rawUtterance;
    this.addressRepair.rawUtterances.push(rawUtterance);

    // Merge candidates
    const seenIds = new Set(this.addressRepair.candidates.map((c) => c.candidateId));
    for (const c of candidates) {
      if (!seenIds.has(c.candidateId)) {
        this.addressRepair.candidates.push(c);
        seenIds.add(c.candidateId);
      }
    }

    // Single unique candidate resolved!
    if (candidates.length === 1 && candidates[0]) {
      const winner = candidates[0];
      this.addressRepair.resolved = true;
      this.addressRepair.abandonedToHandoff = false;
      this.slots[slotName] = {
        name: slotName,
        rawText: rawUtterance,
        normalizedValue: winner.address,
        sourceTurnIds: [turnId],
        providerConfidence: winner.confidence ?? 0.95,
        validationState: "valid",
        confirmedByCustomerAt: null,
        groupedReadbackText: winner.displayName,
      };
      return {
        resolved: true,
        abandonedToHandoff: false,
      };
    }

    // Failed resolution (either 0 candidates or ambiguous > 1 candidates)
    this.addressRepair.failedAttempts += 1;

    // Check if max 2 attempts reached
    if (this.addressRepair.failedAttempts >= 2) {
      this.addressRepair.resolved = false;
      this.addressRepair.abandonedToHandoff = true;

      this.slots[slotName] = {
        name: slotName,
        rawText: this.addressRepair.rawUtterances.join("；"),
        normalizedValue: null,
        sourceTurnIds: [turnId],
        providerConfidence: 0.1,
        validationState: "needs_repair",
        confirmedByCustomerAt: null,
      };

      const handoffSummary: VoiceHandoffSummary = {
        reasonCode: "location_unresolved",
        confirmedSlots: this.getConfirmedSlotValues(),
        unconfirmedSlots: {
          [slotName]: {
            rawUtterances: [...this.addressRepair.rawUtterances],
            candidates: [...this.addressRepair.candidates],
            failedAttempts: this.addressRepair.failedAttempts,
          },
        },
        lastCustomerUtterance: rawUtterance,
        language: "zh-TW",
        addressRepairEvidence: {
          rawUtterances: [...this.addressRepair.rawUtterances],
          candidates: [...this.addressRepair.candidates],
          failedAttempts: this.addressRepair.failedAttempts,
        },
        recordingRefs: [],
        handoffRequestedAt: new Date().toISOString(),
      };

      return {
        resolved: false,
        abandonedToHandoff: true,
        handoffSummary,
      };
    }

    // Attempt 1 failed: generate clarification prompt
    let prompt = "抱歉，無法確認您說的地址，請問是哪個行政區或附近有什麼地標嗎？";
    if (candidates.length > 1) {
      const names = candidates
        .slice(0, 3)
        .map((c) => c.displayName)
        .join("，或是");
      prompt = `您指的是${names}？請再告訴我更具體的地點。`;
    }

    return {
      resolved: false,
      abandonedToHandoff: false,
      clarificationPrompt: prompt,
    };
  }

  private getConfirmedSlotValues(): Record<string, unknown> {
    const res: Record<string, unknown> = {};
    for (const [key, slot] of Object.entries(this.slots)) {
      if (slot.validationState === "valid") {
        res[key] = slot.normalizedValue;
      }
    }
    return res;
  }
}
