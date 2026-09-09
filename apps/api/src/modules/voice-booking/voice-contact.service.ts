import { randomUUID } from "node:crypto";
import { Injectable, Optional } from "@nestjs/common";
import { type BookingRequirements } from "@drts/contracts";
import { ApiRequestError } from "../../common/api-envelope";
import { VoiceSessionRepository } from "./voice-session.repository";

export type ContactRole =
  | "caller"
  | "booker"
  | "passenger"
  | "driverContact"
  | "callbackRecipient";

export interface ContactInfo {
  name: string;
  phone: string;
}

export interface ContactRevision {
  revision: number;
  role: ContactRole;
  name: string;
  phone: string;
  consentRef: string | null;
  reason: string;
  updatedAt: string;
  replacedRevision: number | null;
}

export interface VoiceContactState {
  voiceSessionId: string;
  assertedCallerPhone: string;
  bookerContact: ContactInfo;
  passengerContact: ContactInfo;
  driverContactRole: "booker" | "passenger";
  callbackRecipientRole: "booker" | "passenger" | "custom";
  customDriverContact: ContactInfo | null;
  customCallbackRecipient: ContactInfo | null;
  revisions: ContactRevision[];
  latestRevisionNumber: number;
  updatedAt: string;
}

export interface InitializeContactsInput {
  voiceSessionId: string;
  callerPhone: string;
  bookerName?: string;
  isSelfBooking?: boolean;
  passengerName?: string;
  passengerPhone?: string;
  driverContactRole?: "booker" | "passenger";
  callbackRecipientRole?: "booker" | "passenger" | "custom";
  customCallbackRecipient?: ContactInfo;
  consentRef?: string | null;
}

export interface UpdateContactRoleInput {
  voiceSessionId: string;
  role: ContactRole;
  phone: string;
  name?: string;
  consentRef?: string | null;
  reason: string;
  invalidateConfirmation?: boolean;
}

export interface EffectiveContactsResult {
  voiceSessionId: string;
  assertedCallerPhone: string;
  bookerContact: ContactInfo;
  passengerContact: ContactInfo;
  driverContact: ContactInfo;
  callbackRecipient: ContactInfo;
  driverContactRole: "booker" | "passenger";
  callbackRecipientRole: "booker" | "passenger" | "custom";
  activeRevisions: Record<ContactRole, ContactRevision | null>;
  totalRevisions: number;
}

/**
 * SD §6.4: Contact roles and immutable revision management.
 *
 * Requirements:
 * 1. Role separation:
 *    - `caller`: Inbound phone (`assertedCallerPhone`). In retention period, IMMUTABLE!
 *    - `booker`: Person booking the ride (A).
 *    - `passenger`: Person riding the vehicle (B).
 *    - `driverContact`: Contact for the driver to reach. Defaults to passenger (B) when A books for B.
 *    - `callbackRecipient`: Contact for callback. Defaults to booker (A) when A books for B.
 * 2. Asserted caller phone immutability:
 *    - Once asserted, attempting to overwrite with a different phone number is rejected.
 * 3. Revision history:
 *    - Updates to other roles preserve immutable revision records with revision number,
 *      reason, consent evidence, and timestamp.
 * 4. Confirmation invalidation:
 *    - Replacing an active contact value invalidates unconsumed confirmation to prevent
 *      stale confirmations from completing an order with outdated contact info.
 */
@Injectable()
export class VoiceContactService {
  private readonly states = new Map<string, VoiceContactState>();

  constructor(
    @Optional() private readonly sessionRepository?: VoiceSessionRepository,
  ) {}

  /**
   * Initializes or registers contact roles for a voice session.
   */
  initializeContacts(input: InitializeContactsInput): VoiceContactState {
    const existing = this.states.get(input.voiceSessionId);
    if (existing) {
      // Validate caller phone immutability if re-asserted
      if (existing.assertedCallerPhone !== input.callerPhone.trim()) {
        throw new ApiRequestError(
          409,
          "ASSERTED_CALLER_PHONE_IMMUTABLE",
          "原始 assertedCallerPhone 在適用保存期間不可覆寫。",
        );
      }
      return this.cloneState(existing);
    }

    const now = new Date().toISOString();
    const callerPhone = input.callerPhone.trim();
    if (!callerPhone) {
      throw new ApiRequestError(
        400,
        "INVALID_CALLER_PHONE",
        "Asserted caller phone cannot be empty.",
      );
    }

    const isSelfBooking = input.isSelfBooking ?? (!input.passengerName && !input.passengerPhone);
    const bookerName = input.bookerName?.trim() || "代叫聯絡人";
    const passengerName = isSelfBooking
      ? bookerName
      : (input.passengerName?.trim() || "乘車人");
    const passengerPhone = isSelfBooking
      ? callerPhone
      : (input.passengerPhone?.trim() || callerPhone);

    const driverContactRole: "booker" | "passenger" =
      input.driverContactRole ?? (isSelfBooking ? "booker" : "passenger");

    const callbackRecipientRole: "booker" | "passenger" | "custom" =
      input.callbackRecipientRole ?? "booker";

    const customCallbackRecipient = input.customCallbackRecipient
      ? { ...input.customCallbackRecipient }
      : null;

    let revCounter = 0;
    const revisions: ContactRevision[] = [];

    // Revision 1: Caller asserted phone
    revisions.push({
      revision: ++revCounter,
      role: "caller",
      name: bookerName,
      phone: callerPhone,
      consentRef: input.consentRef ?? null,
      reason: "initial_asserted_caller_phone",
      updatedAt: now,
      replacedRevision: null,
    });

    // Revision 2: Booker contact
    revisions.push({
      revision: ++revCounter,
      role: "booker",
      name: bookerName,
      phone: callerPhone,
      consentRef: input.consentRef ?? null,
      reason: "initial_booker_contact",
      updatedAt: now,
      replacedRevision: null,
    });

    // Revision 3: Passenger contact
    revisions.push({
      revision: ++revCounter,
      role: "passenger",
      name: passengerName,
      phone: passengerPhone,
      consentRef: input.consentRef ?? null,
      reason: isSelfBooking ? "self_booking_passenger" : "third_party_passenger",
      updatedAt: now,
      replacedRevision: null,
    });

    const state: VoiceContactState = {
      voiceSessionId: input.voiceSessionId,
      assertedCallerPhone: callerPhone,
      bookerContact: { name: bookerName, phone: callerPhone },
      passengerContact: { name: passengerName, phone: passengerPhone },
      driverContactRole,
      callbackRecipientRole,
      customDriverContact: null,
      customCallbackRecipient,
      revisions,
      latestRevisionNumber: revCounter,
      updatedAt: now,
    };

    this.states.set(input.voiceSessionId, state);
    return this.cloneState(state);
  }

  /**
   * Asserts the caller's phone number. Cannot overwrite an already asserted caller phone.
   */
  assertCallerPhone(voiceSessionId: string, callerPhone: string): VoiceContactState {
    const normalized = callerPhone.trim();
    if (!normalized) {
      throw new ApiRequestError(
        400,
        "INVALID_CALLER_PHONE",
        "Asserted caller phone cannot be empty.",
      );
    }

    const state = this.states.get(voiceSessionId);
    if (!state) {
      return this.initializeContacts({
        voiceSessionId,
        callerPhone: normalized,
      });
    }

    if (state.assertedCallerPhone !== normalized) {
      throw new ApiRequestError(
        409,
        "ASSERTED_CALLER_PHONE_IMMUTABLE",
        "原始 assertedCallerPhone 在適用保存期間不可覆寫。",
      );
    }

    return this.cloneState(state);
  }

  /**
   * SD §6.4: Updates a contact role with an immutable revision.
   * Attempting to overwrite assertedCallerPhone is strictly rejected.
   * Updating other roles creates a new immutable revision and invalidates unconsumed confirmations.
   */
  async updateContactRole(
    input: UpdateContactRoleInput,
  ): Promise<{ state: VoiceContactState; newRevision: ContactRevision; confirmationInvalidated: boolean }> {
    const state = this.states.get(input.voiceSessionId);
    if (!state) {
      throw new ApiRequestError(
        404,
        "VOICE_CONTACT_NOT_FOUND",
        `No contact state registered for session '${input.voiceSessionId}'.`,
      );
    }

    const normalizedPhone = input.phone.trim();
    if (!normalizedPhone) {
      throw new ApiRequestError(
        400,
        "INVALID_PHONE_NUMBER",
        "Contact phone cannot be empty.",
      );
    }

    // Caller phone is strictly immutable
    if (input.role === "caller") {
      if (state.assertedCallerPhone !== normalizedPhone) {
        throw new ApiRequestError(
          409,
          "ASSERTED_CALLER_PHONE_IMMUTABLE",
          "原始 assertedCallerPhone 在適用保存期間不可覆寫。",
        );
      }
      // If same phone, return current state without creating redundant revision
      const currentRev = [...state.revisions].reverse().find((r) => r.role === "caller")!;
      return {
        state: this.cloneState(state),
        newRevision: currentRev,
        confirmationInvalidated: false,
      };
    }

    // Find the latest previous revision for this role
    const previousRev = [...state.revisions].reverse().find((r) => r.role === input.role);
    const replacedRevisionNumber = previousRev ? previousRev.revision : null;

    const now = new Date().toISOString();
    const nextRevisionNumber = ++state.latestRevisionNumber;
    const resolvedName = input.name?.trim() || previousRev?.name || (input.role === "passenger" ? "乘車人" : "聯絡人");

    const newRevision: ContactRevision = {
      revision: nextRevisionNumber,
      role: input.role,
      name: resolvedName,
      phone: normalizedPhone,
      consentRef: input.consentRef ?? null,
      reason: input.reason,
      updatedAt: now,
      replacedRevision: replacedRevisionNumber,
    };

    // Apply the update to the active state
    switch (input.role) {
      case "booker":
        state.bookerContact = { name: resolvedName, phone: normalizedPhone };
        break;
      case "passenger":
        state.passengerContact = { name: resolvedName, phone: normalizedPhone };
        break;
      case "driverContact":
        state.customDriverContact = { name: resolvedName, phone: normalizedPhone };
        break;
      case "callbackRecipient":
        state.customCallbackRecipient = { name: resolvedName, phone: normalizedPhone };
        state.callbackRecipientRole = "custom";
        break;
    }

    state.revisions.push(newRevision);
    state.updatedAt = now;

    // SD §6.4: "允許新 revision 取代有效值並使相關確認失效。"
    let confirmationInvalidated = false;
    if (input.invalidateConfirmation !== false && this.sessionRepository) {
      try {
        await this.sessionRepository.invalidateActiveConfirmationForSession(
          input.voiceSessionId,
        );
        confirmationInvalidated = true;
      } catch {
        // If session repo throws or not connected, flag stays false
      }
    }

    return {
      state: this.cloneState(state),
      newRevision,
      confirmationInvalidated,
    };
  }

  /**
   * SD §6.4: Resolves the effective contacts for all roles:
   * When A代B叫車:
   * - driverContact: B (passengerContact)
   * - callbackRecipient: A (bookerContact)
   * - assertedCallerPhone: A
   */
  getEffectiveContacts(voiceSessionId: string): EffectiveContactsResult {
    const state = this.states.get(voiceSessionId);
    if (!state) {
      throw new ApiRequestError(
        404,
        "VOICE_CONTACT_NOT_FOUND",
        `No contact state found for session '${voiceSessionId}'.`,
      );
    }

    // Driver contact resolution
    let driverContact: ContactInfo;
    if (state.customDriverContact) {
      driverContact = { ...state.customDriverContact };
    } else if (state.driverContactRole === "booker") {
      driverContact = { ...state.bookerContact };
    } else {
      driverContact = { ...state.passengerContact };
    }

    // Callback recipient resolution
    let callbackRecipient: ContactInfo;
    if (state.customCallbackRecipient) {
      callbackRecipient = { ...state.customCallbackRecipient };
    } else if (state.callbackRecipientRole === "passenger") {
      callbackRecipient = { ...state.passengerContact };
    } else {
      callbackRecipient = { ...state.bookerContact };
    }

    // Derive active revision per role
    const activeRevisions: Record<ContactRole, ContactRevision | null> = {
      caller: [...state.revisions].reverse().find((r) => r.role === "caller") ?? null,
      booker: [...state.revisions].reverse().find((r) => r.role === "booker") ?? null,
      passenger: [...state.revisions].reverse().find((r) => r.role === "passenger") ?? null,
      driverContact: [...state.revisions].reverse().find((r) => r.role === "driverContact") ?? null,
      callbackRecipient: [...state.revisions].reverse().find((r) => r.role === "callbackRecipient") ?? null,
    };

    return {
      voiceSessionId: state.voiceSessionId,
      assertedCallerPhone: state.assertedCallerPhone,
      bookerContact: { ...state.bookerContact },
      passengerContact: { ...state.passengerContact },
      driverContact,
      callbackRecipient,
      driverContactRole: state.driverContactRole,
      callbackRecipientRole: state.callbackRecipientRole,
      activeRevisions,
      totalRevisions: state.revisions.length,
    };
  }

  /**
   * Retrieves the full immutable revision history for auditing.
   */
  getRevisionHistory(
    voiceSessionId: string,
    role?: ContactRole,
  ): ContactRevision[] {
    const state = this.states.get(voiceSessionId);
    if (!state) {
      throw new ApiRequestError(
        404,
        "VOICE_CONTACT_NOT_FOUND",
        `No contact state found for session '${voiceSessionId}'.`,
      );
    }

    if (role) {
      return state.revisions.filter((r) => r.role === role).map((r) => ({ ...r }));
    }
    return state.revisions.map((r) => ({ ...r }));
  }

  /**
   * Constructs typed BookingRequirements mapping according to SD §6.4.
   */
  buildBookingRequirements(
    voiceSessionId: string,
    params: {
      passengerCount?: number;
      luggageCount?: number;
      luggageSize?: "standard" | "oversized";
      requiredCapabilities?: Array<"wheelchair" | "child_seat">;
      policyVersion?: string;
      validationReference?: string;
    } = {},
  ): BookingRequirements {
    const contacts = this.getEffectiveContacts(voiceSessionId);

    return {
      passengerCount: params.passengerCount ?? 1,
      luggageCount: params.luggageCount ?? 0,
      luggageSize: params.luggageSize ?? "standard",
      requiredCapabilities: params.requiredCapabilities ?? [],
      bookerContact: contacts.bookerContact,
      passengerContact: contacts.passengerContact,
      driverContactRole: contacts.driverContactRole,
      policyVersion: params.policyVersion ?? "v2026.09.06",
      validationReference: params.validationReference ?? `val-ref-${randomUUID()}`,
    };
  }

  private cloneState(state: VoiceContactState): VoiceContactState {
    return {
      ...state,
      bookerContact: { ...state.bookerContact },
      passengerContact: { ...state.passengerContact },
      customDriverContact: state.customDriverContact ? { ...state.customDriverContact } : null,
      customCallbackRecipient: state.customCallbackRecipient ? { ...state.customCallbackRecipient } : null,
      revisions: state.revisions.map((r) => ({ ...r })),
    };
  }
}
