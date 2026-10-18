import { randomUUID } from "node:crypto";
import { Injectable, Optional } from "@nestjs/common";
import { type BookingRequirements } from "@drts/contracts";
import { ApiRequestError } from "../../common/api-envelope";
import {
  VoiceSessionRepository,
  type ContactRoleRevisionRow,
  type VoiceQueryExecutor,
} from "./voice-session.repository";
import {
  decryptDialogueSnapshotContent,
  encryptDialogueSnapshotContent,
  resolveDialogueSnapshotEncryptionKey,
  type DialogueSnapshotEncryptionKey,
} from "./voice-dialogue-snapshot-crypto";

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
  /**
   * AUDIT-VOICE-APPLICATION-REGRESSION-20261018 Package C/D: the consent
   * reference backing the CURRENT effective `callbackRecipient` contact --
   * resolved from `activeRevisions.callbackRecipient` when
   * `callbackRecipientRole === "custom"`, otherwise from
   * `activeRevisions[callbackRecipientRole]` (the booker/passenger revision
   * the recipient currently defaults to). Centralized here so a caller
   * (e.g. `VoiceCallbackService`) never has to re-derive the custom/default
   * pointer rule itself.
   */
  callbackRecipientConsentRef: string | null;
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
   * AUDIT-VOICE-APPLICATION-REGRESSION-20261018 Package C: this service
   * only persists to `voice.contact_role_revision`
   * (V0122__voice_contact_role_revision.sql) when it was constructed with a
   * real, DB-enabled `VoiceSessionRepository` -- a repository mock lacking
   * `isEnabled` (e.g. the plain `{ invalidateActiveConfirmationForSession
   * }` fixture `tests/unit/uv-exec-018.test.ts` uses) safely falls through
   * to the original process-local RAM-only behavior, not an exception.
   */
  private isDbBacked(): boolean {
    return (
      typeof this.sessionRepository?.isEnabled === "function" &&
      this.sessionRepository.isEnabled()
    );
  }

  private requireEncryptionKey(): DialogueSnapshotEncryptionKey {
    const key = resolveDialogueSnapshotEncryptionKey();
    if (!key) {
      throw new ApiRequestError(
        503,
        "VOICE_CONTACT_REVISION_ENCRYPTION_UNCONFIGURED",
        "Contact-role revision encryption key is not configured; refusing to persist unencrypted contact data.",
      );
    }
    return key;
  }

  /**
   * Binds a revision's ciphertext to its own identity (same rationale as
   * `voice-dialogue-snapshot-crypto.ts`'s own AAD doc): a row substitution
   * (e.g. splicing session B's ciphertext into session A's row) fails the
   * authenticated-tag check the same way a tamper would.
   */
  private contactRevisionAssociatedData(
    voiceSessionId: string,
    role: ContactRole,
    revisionNumber: number,
  ): string {
    return JSON.stringify([
      "voice.contact_role_revision.v1",
      voiceSessionId,
      role,
      revisionNumber,
    ]);
  }

  private async persistRevision(
    voiceSessionId: string,
    revision: ContactRevision,
    key: DialogueSnapshotEncryptionKey,
    tx: VoiceQueryExecutor,
  ): Promise<void> {
    const encrypted = encryptDialogueSnapshotContent(
      { phone: revision.phone },
      key,
      this.contactRevisionAssociatedData(
        voiceSessionId,
        revision.role,
        revision.revision,
      ),
    );
    await this.sessionRepository!.insertContactRoleRevision(
      {
        voiceSessionId,
        role: revision.role,
        revisionNumber: revision.revision,
        name: revision.name,
        phoneKeyVersion: encrypted.keyVersion,
        phoneNonce: encrypted.nonce,
        phoneCiphertext: encrypted.ciphertext,
        phoneAuthTag: encrypted.authTag,
        consentRef: revision.consentRef,
        reason: revision.reason,
        replacedRevision: revision.replacedRevision,
      },
      tx,
    );
  }

  private decryptRevisionPhone(row: ContactRoleRevisionRow): string {
    const decrypted = decryptDialogueSnapshotContent(
      {
        keyVersion: row.phoneKeyVersion,
        nonce: row.phoneNonce,
        ciphertext: row.phoneCiphertext,
        authTag: row.phoneAuthTag,
      },
      (version) => {
        const key = resolveDialogueSnapshotEncryptionKey();
        return key && key.version === version ? key.key : null;
      },
      this.contactRevisionAssociatedData(
        row.voiceSessionId,
        row.role,
        row.revisionNumber,
      ),
    ) as { phone: string };
    return decrypted.phone;
  }

  /**
   * Cold reconstruction (C-P1): rebuilds the full in-memory
   * `VoiceContactState` from every `voice.contact_role_revision` row ever
   * written for this session -- the only durable source of truth, since a
   * process restart loses the `states` Map entirely. `driverContactRole`
   * and `callbackRecipientRole` are NOT separately stored columns (adding
   * them would duplicate what `reason` already encodes); instead every
   * `driverContact`/`callbackRecipient` revision's `reason` is either
   * `"default_role:booker"`/`"default_role:passenger"` (an informational
   * pointer snapshot written at init time, see `initializeContacts`) or an
   * explicit override reason supplied to `updateContactRole` -- the LATEST
   * revision for that role tells us which case currently applies, exactly
   * mirroring the RAM model's `driverContactRole` vs `customDriverContact`
   * split.
   */
  private async coldReconstructState(
    voiceSessionId: string,
  ): Promise<VoiceContactState | undefined> {
    const rows =
      await this.sessionRepository!.listContactRoleRevisions(voiceSessionId);
    if (rows.length === 0) return undefined;

    const revisions: ContactRevision[] = rows.map((row) => ({
      revision: row.revisionNumber,
      role: row.role,
      name: row.name,
      phone: this.decryptRevisionPhone(row),
      consentRef: row.consentRef,
      reason: row.reason,
      updatedAt: row.createdAt,
      replacedRevision: row.replacedRevision,
    }));

    const latestOf = (role: ContactRole) =>
      [...revisions].reverse().find((r) => r.role === role);

    const callerRev = latestOf("caller");
    const bookerRev = latestOf("booker");
    const passengerRev = latestOf("passenger");
    if (!callerRev || !bookerRev || !passengerRev) {
      throw new Error(
        `voice_contact_role_revision_incomplete: session '${voiceSessionId}' is missing one of its mandatory caller/booker/passenger seed revisions.`,
      );
    }

    const defaultPointer = /^default_role:(booker|passenger)$/;

    let driverContactRole: "booker" | "passenger" = "booker";
    let customDriverContact: ContactInfo | null = null;
    for (const rev of revisions) {
      if (rev.role !== "driverContact") continue;
      const pointer = defaultPointer.exec(rev.reason);
      if (pointer) {
        driverContactRole = pointer[1] as "booker" | "passenger";
        customDriverContact = null;
      } else {
        customDriverContact = { name: rev.name, phone: rev.phone };
      }
    }

    let callbackRecipientRole: "booker" | "passenger" | "custom" = "booker";
    let customCallbackRecipient: ContactInfo | null = null;
    for (const rev of revisions) {
      if (rev.role !== "callbackRecipient") continue;
      const pointer = defaultPointer.exec(rev.reason);
      if (pointer) {
        callbackRecipientRole = pointer[1] as "booker" | "passenger";
        customCallbackRecipient = null;
      } else {
        callbackRecipientRole = "custom";
        customCallbackRecipient = { name: rev.name, phone: rev.phone };
      }
    }

    const latestRevisionNumber = revisions.reduce(
      (max, r) => Math.max(max, r.revision),
      0,
    );

    const state: VoiceContactState = {
      voiceSessionId,
      assertedCallerPhone: callerRev.phone,
      bookerContact: { name: bookerRev.name, phone: bookerRev.phone },
      passengerContact: { name: passengerRev.name, phone: passengerRev.phone },
      driverContactRole,
      callbackRecipientRole,
      customDriverContact,
      customCallbackRecipient,
      revisions,
      latestRevisionNumber,
      updatedAt: revisions[revisions.length - 1]!.updatedAt,
    };
    this.states.set(voiceSessionId, state);
    return state;
  }

  /**
   * Durable-aware read for callers (e.g. `VoiceCallbackService`) that run
   * in a different process/request than whatever originally called
   * `initializeContacts` -- attempts cold reconstruction before giving up,
   * and returns `null` instead of throwing when no contact state has ever
   * been recorded for this session (an honest "not yet known" boundary,
   * never a fabricated default).
   */
  async getEffectiveContactsDurable(
    voiceSessionId: string,
  ): Promise<EffectiveContactsResult | null> {
    let state = this.states.get(voiceSessionId);
    if (!state && this.isDbBacked()) {
      state = await this.coldReconstructState(voiceSessionId);
    }
    if (!state) return null;
    return this.getEffectiveContacts(voiceSessionId);
  }

  /**
   * Initializes or registers contact roles for a voice session.
   */
  async initializeContacts(
    input: InitializeContactsInput,
  ): Promise<VoiceContactState> {
    let existing = this.states.get(input.voiceSessionId);
    if (!existing && this.isDbBacked()) {
      existing = await this.coldReconstructState(input.voiceSessionId);
    }
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

    // AUDIT-VOICE-APPLICATION-REGRESSION-20261018 Package C: when durably
    // backed, also seed informational "default_role:X" pointer revisions
    // for driverContact/callbackRecipient (or an immediate custom-override
    // revision when the caller already asked for one) -- see
    // `coldReconstructState`'s own doc for why this is the only way a
    // future cold read can recover these two enum fields, which the RAM-
    // only legacy path below never persists anywhere and so does not need.
    if (this.isDbBacked()) {
      revisions.push({
        revision: ++revCounter,
        role: "driverContact",
        name: driverContactRole === "booker" ? bookerName : passengerName,
        phone: driverContactRole === "booker" ? callerPhone : passengerPhone,
        consentRef: null,
        reason: `default_role:${driverContactRole}`,
        updatedAt: now,
        replacedRevision: null,
      });

      if (callbackRecipientRole === "custom" && customCallbackRecipient) {
        revisions.push({
          revision: ++revCounter,
          role: "callbackRecipient",
          name: customCallbackRecipient.name,
          phone: customCallbackRecipient.phone,
          consentRef: input.consentRef ?? null,
          reason: "initial_custom_callback_recipient",
          updatedAt: now,
          replacedRevision: null,
        });
      } else if (callbackRecipientRole !== "custom") {
        revisions.push({
          revision: ++revCounter,
          role: "callbackRecipient",
          name: callbackRecipientRole === "booker" ? bookerName : passengerName,
          phone: callbackRecipientRole === "booker" ? callerPhone : passengerPhone,
          consentRef: null,
          reason: `default_role:${callbackRecipientRole}`,
          updatedAt: now,
          replacedRevision: null,
        });
      }
    }

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

    if (this.isDbBacked()) {
      const key = this.requireEncryptionKey();
      await this.sessionRepository!.withTransaction(async (tx) => {
        for (const revision of revisions) {
          await this.persistRevision(input.voiceSessionId, revision, key, tx);
        }
      });
    }

    this.states.set(input.voiceSessionId, state);
    return this.cloneState(state);
  }

  /**
   * Asserts the caller's phone number. Cannot overwrite an already asserted
   * caller phone. Has no production caller today (`CallcenterService`
   * defines its own unrelated private `assertCallerPhone`) -- kept
   * deliberately synchronous and RAM-only (no cold reconstruction, no
   * durable seed) rather than forced async to match `initializeContacts`,
   * since a sync caller somewhere relying on its current signature is a
   * worse regression than this method staying process-local.
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
      const now = new Date().toISOString();
      const freshState: VoiceContactState = {
        voiceSessionId,
        assertedCallerPhone: normalized,
        bookerContact: { name: "代叫聯絡人", phone: normalized },
        passengerContact: { name: "代叫聯絡人", phone: normalized },
        driverContactRole: "booker",
        callbackRecipientRole: "booker",
        customDriverContact: null,
        customCallbackRecipient: null,
        revisions: [
          {
            revision: 1,
            role: "caller",
            name: "代叫聯絡人",
            phone: normalized,
            consentRef: null,
            reason: "initial_asserted_caller_phone",
            updatedAt: now,
            replacedRevision: null,
          },
        ],
        latestRevisionNumber: 1,
        updatedAt: now,
      };
      this.states.set(voiceSessionId, freshState);
      return this.cloneState(freshState);
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
    let state = this.states.get(input.voiceSessionId);
    if (!state && this.isDbBacked()) {
      state = await this.coldReconstructState(input.voiceSessionId);
    }
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

    // SD §6.4: "允許新 revision 取代有效值並使相關確認失效。"
    let confirmationInvalidated = false;

    if (this.isDbBacked()) {
      // AUDIT-VOICE-APPLICATION-REGRESSION-20261018 Package C: the durable
      // revision insert and the selective confirmation invalidation run in
      // ONE transaction -- a crash between the two could otherwise leave a
      // new contact revision durably committed while a confirmation built
      // on the now-stale contact remains active. `invalidateUnconsumedConfirmationForContactChange`
      // (not the blanket `invalidateActiveConfirmationForSession`) is the
      // one that preserves an already-`commit_status = 'pending'`
      // confirmation's sealed proof -- see that repository method's own
      // doc. The RAM switch-case/push below only runs AFTER this commits,
      // so a failed durable write never leaves in-memory state ahead of
      // what is actually persisted.
      const key = this.requireEncryptionKey();
      await this.sessionRepository!.withTransaction(async (tx) => {
        await this.persistRevision(input.voiceSessionId, newRevision, key, tx);
        if (input.invalidateConfirmation !== false) {
          const invalidated =
            await this.sessionRepository!.invalidateUnconsumedConfirmationForContactChange(
              input.voiceSessionId,
              tx,
            );
          confirmationInvalidated = invalidated !== null;
        }
      });
    }

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

    if (!this.isDbBacked() && input.invalidateConfirmation !== false && this.sessionRepository) {
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

    const callbackRecipientConsentRef =
      state.callbackRecipientRole === "custom"
        ? (activeRevisions.callbackRecipient?.consentRef ?? null)
        : (activeRevisions[state.callbackRecipientRole]?.consentRef ?? null);

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
      callbackRecipientConsentRef,
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
