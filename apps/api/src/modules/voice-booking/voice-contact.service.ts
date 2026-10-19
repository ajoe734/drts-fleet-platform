import { randomUUID } from "node:crypto";
import { Injectable, Optional } from "@nestjs/common";
import {
  voiceDialogueContactCandidateSchema,
  type VoiceDialogueSnapshotContent,
  type BookingRequirements,
} from "@drts/contracts";
import { ApiRequestError } from "../../common/api-envelope";
import {
  VoiceSessionRepository,
  type ContactRoleRevisionRow,
  type ContactRoleSource,
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
  /**
   * AUDIT-VOICE-APPLICATION-REGRESSION-20261018 review round 2 (F7): set
   * programmatically by this service, never derived from caller-supplied
   * text. See `voice.contact_role_revision.role_source`'s migration doc.
   */
  roleSource: ContactRoleSource;
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
  consentRef?: string | null | undefined;
}

export interface UpdateContactRoleInput {
  voiceSessionId: string;
  role: ContactRole;
  phone: string;
  name?: string | undefined;
  consentRef?: string | null | undefined;
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
  /**
   * AUDIT-VOICE-APPLICATION-REGRESSION-20261018 review round 2 (F5): the
   * `revision_number` backing the CURRENT effective `callbackRecipient`
   * contact, resolved with the same custom/default-pointer rule as
   * `callbackRecipientConsentRef`. `VoiceCallbackService` uses this to pin a
   * newly created callback task to a specific immutable revision instead of
   * "whatever is effective now" (a later recipient change must not silently
   * retarget an already-created task's sealed contact/consent).
   */
  callbackRecipientRevisionNumber: number | null;
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
        roleSource: revision.roleSource,
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
    executor?: VoiceQueryExecutor,
  ): Promise<VoiceContactState | undefined> {
    const rows = await this.sessionRepository!.listContactRoleRevisions(
      voiceSessionId,
      executor,
    );
    if (rows.length === 0) return undefined;

    const revisions: ContactRevision[] = rows.map((row) => ({
      revision: row.revisionNumber,
      role: row.role,
      name: row.name,
      phone: this.decryptRevisionPhone(row),
      consentRef: row.consentRef,
      reason: row.reason,
      roleSource: row.roleSource,
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

    // F7: `roleSource` (set only by this service, never from caller text)
    // decides pointer-vs-explicit; the `default_role:<role>` reason text is
    // only ever PARSED once we already trust roleSource says it is one.
    const defaultPointer = /^default_role:(booker|passenger)$/;

    let driverContactRole: "booker" | "passenger" = "booker";
    let customDriverContact: ContactInfo | null = null;
    for (const rev of revisions) {
      if (rev.role !== "driverContact") continue;
      const pointer =
        rev.roleSource !== "explicit" ? defaultPointer.exec(rev.reason) : null;
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
      const pointer =
        rev.roleSource !== "explicit" ? defaultPointer.exec(rev.reason) : null;
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
    return state;
  }

  /**
   * Durable-aware read for callers (e.g. `VoiceCallbackService`) that run
   * in a different process/request than whatever originally called
   * `initializeContacts` -- attempts cold reconstruction before giving up,
   * and returns `null` instead of throwing when no contact state has ever
   * been recorded for this session (an honest "not yet known" boundary,
   * never a fabricated default).
   *
   * AUDIT-VOICE-APPLICATION-REGRESSION-20261018 review round 2 (F6): when
   * DB-backed, this ALWAYS re-reconstructs from the authoritative ledger
   * rather than trusting this instance's own possibly-stale `states` cache
   * -- a warm reader that already populated its cache earlier otherwise
   * never saw another instance's (or even its own later call's) committed
   * revision again. Only the RAM-only path (never durable, no cross-process
   * concern) still trusts the warm `Map` directly.
   */
  async getEffectiveContactsDurable(
    voiceSessionId: string,
    executor?: VoiceQueryExecutor,
  ): Promise<EffectiveContactsResult | null> {
    if (this.isDbBacked()) {
      const fresh = await this.coldReconstructState(voiceSessionId, executor);
      if (!fresh) return null;
      if (!executor) this.states.set(voiceSessionId, fresh);
      return this.projectContacts(fresh);
    }
    const state = this.states.get(voiceSessionId);
    if (!state) return null;
    return this.getEffectiveContacts(voiceSessionId);
  }

  /** Consume only the current durable turn's typed contact data. A proposal
   * cannot overwrite ANI or create consent. Both A/B corrections and proof
   * invalidation commit under the original session lock. */
  async synchronizeDialogueContacts(input: {
    voiceSessionId: string;
    snapshotId: string;
    inputEpoch: number;
    leaseEpoch: number;
    resourceScopeId: string;
    routeProfileVersion: number;
    content: VoiceDialogueSnapshotContent;
    signal: AbortSignal;
  }) {
    const changes: Array<{
      role: "booker" | "passenger";
      contact: ContactInfo;
    }> = [];
    for (const [field, role] of [
      ["bookerContact", "booker"],
      ["passengerContact", "passenger"],
    ] as const) {
      const slot = input.content.slots[field];
      if (!slot) continue;
      let candidate: unknown;
      try {
        candidate = JSON.parse(slot.normalizedValue ?? slot.candidate);
      } catch {
        continue;
      }
      const parsed = voiceDialogueContactCandidateSchema.safeParse(candidate);
      if (parsed.success) changes.push({ role, contact: parsed.data });
    }
    if (!changes.length) return;
    if (!this.isDbBacked())
      throw new ApiRequestError(
        503,
        "VOICE_CONTACT_PERSISTENCE_REQUIRED",
        "Durable contact storage is required.",
      );
    const key = this.requireEncryptionKey();
    await this.sessionRepository!.withTransaction(async (tx) => {
      input.signal.throwIfAborted();
      const session = await this.sessionRepository!.findSessionById(
        input.voiceSessionId,
        tx,
        true,
      );
      const snapshot = await this.sessionRepository!.findLatestDialogueSnapshot(
        input.voiceSessionId,
        tx,
      );
      if (
        !session ||
        snapshot?.snapshotId !== input.snapshotId ||
        session.inputEpoch !== input.inputEpoch ||
        session.leaseEpoch !== input.leaseEpoch ||
        session.resourceScopeId !== input.resourceScopeId ||
        session.routeProfileVersion !== input.routeProfileVersion ||
        session.controlOwner !== "ai" ||
        session.dialogState === "closed"
      )
        throw new Error("voice_contact_dialogue_stale");
      const state = await this.coldReconstructState(input.voiceSessionId, tx);
      if (!state)
        throw new ApiRequestError(
          409,
          "VOICE_CONTACT_NOT_FOUND",
          "Admit the original caller before contact correction.",
        );
      let next = state.latestRevisionNumber,
        changed = false;
      for (const { role, contact } of changes) {
        const prior = [...state.revisions]
          .reverse()
          .find((revision) => revision.role === role);
        if (prior?.name === contact.name && prior.phone === contact.phone)
          continue;
        input.signal.throwIfAborted();
        await this.persistRevision(
          input.voiceSessionId,
          {
            revision: ++next,
            role,
            ...contact,
            consentRef: null,
            reason: `dialogue_snapshot:${input.snapshotId}`,
            roleSource: "explicit",
            updatedAt: new Date().toISOString(),
            replacedRevision: prior?.revision ?? null,
          },
          key,
          tx,
        );
        changed = true;
      }
      if (changed)
        await this.refreshDefaultDriverRole(input.voiceSessionId, tx, key);
      if (changed)
        await this.sessionRepository!.invalidateUnconsumedConfirmationForContactChange(
          input.voiceSessionId,
          tx,
        );
    });
  }

  /**
   * Resolves a single, specific immutable revision by number -- used by
   * `VoiceCallbackService` to read back the EXACT `callbackRecipient`
   * revision a task was bound to (F5), never "whatever is current now".
   * Returns `null` when DB-backed is unavailable or the revision does not
   * exist (an honest boundary, not a fabricated value).
   */
  async getContactRevisionByNumber(
    voiceSessionId: string,
    revisionNumber: number,
    executor?: VoiceQueryExecutor,
  ): Promise<ContactRevision | null> {
    if (!this.isDbBacked()) return null;
    const rows = await this.sessionRepository!.listContactRoleRevisions(
      voiceSessionId,
      executor,
    );
    const row = rows.find((r) => r.revisionNumber === revisionNumber);
    if (!row) return null;
    return {
      name: row.name,
      phone: this.decryptRevisionPhone(row),
      consentRef: row.consentRef,
      revision: row.revisionNumber,
      role: row.role,
      roleSource: row.roleSource,
      reason: row.reason,
      updatedAt: row.createdAt,
      replacedRevision: row.replacedRevision,
    };
  }

  /**
   * Initializes or registers contact roles for a voice session.
   */
  async initializeContacts(
    input: InitializeContactsInput,
  ): Promise<VoiceContactState> {
    if (!this.isDbBacked()) return this.createInitialContacts(input);
    const state = await this.sessionRepository!.withTransaction(async (tx) => {
      const session = await this.sessionRepository!.findSessionById(
        input.voiceSessionId,
        tx,
        true,
      );
      if (!session)
        throw new ApiRequestError(
          404,
          "VOICE_SESSION_NOT_FOUND",
          "Voice session was not found.",
        );
      const existing = await this.coldReconstructState(
        input.voiceSessionId,
        tx,
      );
      if (existing) {
        this.requireSameCaller(existing, input.callerPhone);
        return existing;
      }
      return this.createInitialContacts(input, tx);
    });
    this.states.set(input.voiceSessionId, state);
    return this.cloneState(state);
  }

  private requireSameCaller(state: VoiceContactState, phone: string): void {
    if (state.assertedCallerPhone !== phone.trim()) {
      throw new ApiRequestError(
        409,
        "ASSERTED_CALLER_PHONE_IMMUTABLE",
        "原始 assertedCallerPhone 在適用保存期間不可覆寫。",
      );
    }
  }

  private async createInitialContacts(
    input: InitializeContactsInput,
    tx?: VoiceQueryExecutor,
  ): Promise<VoiceContactState> {
    const existing = tx ? undefined : this.states.get(input.voiceSessionId);
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

    const isSelfBooking =
      input.isSelfBooking ?? (!input.passengerName && !input.passengerPhone);
    const bookerName = input.bookerName?.trim() || "代叫聯絡人";
    const passengerName = isSelfBooking
      ? bookerName
      : input.passengerName?.trim() || "乘車人";
    const passengerPhone = isSelfBooking
      ? callerPhone
      : input.passengerPhone?.trim() || callerPhone;

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
      roleSource: "explicit",
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
      roleSource: "explicit",
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
      reason: isSelfBooking
        ? "self_booking_passenger"
        : "third_party_passenger",
      roleSource: "explicit",
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
        roleSource:
          input.driverContactRole === undefined
            ? "default_pointer"
            : "selected_pointer",
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
          roleSource: "explicit",
          updatedAt: now,
          replacedRevision: null,
        });
      } else if (callbackRecipientRole !== "custom") {
        revisions.push({
          revision: ++revCounter,
          role: "callbackRecipient",
          name: callbackRecipientRole === "booker" ? bookerName : passengerName,
          phone:
            callbackRecipientRole === "booker" ? callerPhone : passengerPhone,
          consentRef: null,
          reason: `default_role:${callbackRecipientRole}`,
          roleSource:
            input.callbackRecipientRole === undefined
              ? "default_pointer"
              : "selected_pointer",
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

    if (tx) {
      const key = this.requireEncryptionKey();
      for (const revision of revisions)
        await this.persistRevision(input.voiceSessionId, revision, key, tx);
    } else {
      this.states.set(input.voiceSessionId, state);
    }
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
  assertCallerPhone(
    voiceSessionId: string,
    callerPhone: string,
  ): VoiceContactState {
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
            roleSource: "explicit",
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
   *
   * AUDIT-VOICE-APPLICATION-REGRESSION-20261018 review round 2 (F6):
   * DB-backed sessions delegate to `updateContactRoleDurable`, which
   * computes the next revision number and previous-revision lookup from a
   * FRESH, lock-serialized read instead of this instance's possibly-stale
   * `states` cache -- see that method's own doc.
   */
  async updateContactRole(input: UpdateContactRoleInput): Promise<{
    state: VoiceContactState;
    newRevision: ContactRevision;
    confirmationInvalidated: boolean;
  }> {
    const normalizedPhone = input.phone.trim();
    if (!normalizedPhone) {
      throw new ApiRequestError(
        400,
        "INVALID_PHONE_NUMBER",
        "Contact phone cannot be empty.",
      );
    }

    if (this.isDbBacked()) {
      return this.updateContactRoleDurable(input, normalizedPhone);
    }

    const state = this.states.get(input.voiceSessionId);
    if (!state) {
      throw new ApiRequestError(
        404,
        "VOICE_CONTACT_NOT_FOUND",
        `No contact state registered for session '${input.voiceSessionId}'.`,
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
      const currentRev = [...state.revisions]
        .reverse()
        .find((r) => r.role === "caller")!;
      return {
        state: this.cloneState(state),
        newRevision: currentRev,
        confirmationInvalidated: false,
      };
    }

    // Find the latest previous revision for this role
    const previousRev = [...state.revisions]
      .reverse()
      .find((r) => r.role === input.role);
    const replacedRevisionNumber = previousRev ? previousRev.revision : null;

    const now = new Date().toISOString();
    const nextRevisionNumber = ++state.latestRevisionNumber;
    const resolvedName =
      input.name?.trim() ||
      previousRev?.name ||
      (input.role === "passenger" ? "乘車人" : "聯絡人");

    const newRevision: ContactRevision = {
      revision: nextRevisionNumber,
      role: input.role,
      name: resolvedName,
      phone: normalizedPhone,
      consentRef: input.consentRef ?? null,
      reason: input.reason,
      roleSource: "explicit",
      updatedAt: now,
      replacedRevision: replacedRevisionNumber,
    };

    // SD §6.4: "允許新 revision 取代有效值並使相關確認失效。"
    let confirmationInvalidated = false;

    // Apply the update to the active state
    switch (input.role) {
      case "booker":
        state.bookerContact = { name: resolvedName, phone: normalizedPhone };
        break;
      case "passenger":
        state.passengerContact = { name: resolvedName, phone: normalizedPhone };
        break;
      case "driverContact":
        state.customDriverContact = {
          name: resolvedName,
          phone: normalizedPhone,
        };
        break;
      case "callbackRecipient":
        state.customCallbackRecipient = {
          name: resolvedName,
          phone: normalizedPhone,
        };
        state.callbackRecipientRole = "custom";
        break;
    }

    state.revisions.push(newRevision);
    state.updatedAt = now;

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

  /** The original session row lock serializes revision allocation and proof
   * invalidation. A contact edit never rewrites an existing task's snapshot. */
  private async refreshDefaultDriverRole(
    voiceSessionId: string,
    tx: VoiceQueryExecutor,
    key: DialogueSnapshotEncryptionKey,
  ) {
    const state = await this.coldReconstructState(voiceSessionId, tx);
    if (!state) return;
    const pointer = [...state.revisions]
      .reverse()
      .find((revision) => revision.role === "driverContact");
    if (pointer?.roleSource !== "default_pointer" || state.customDriverContact)
      return;
    const thirdParty =
      state.bookerContact.phone !== state.passengerContact.phone ||
      state.bookerContact.name !== state.passengerContact.name;
    const role = thirdParty ? "passenger" : "booker";
    if (role === state.driverContactRole) return;
    const contact =
      role === "passenger" ? state.passengerContact : state.bookerContact;
    await this.persistRevision(
      voiceSessionId,
      {
        revision: state.latestRevisionNumber + 1,
        role: "driverContact",
        ...contact,
        consentRef: null,
        reason: `default_role:${role}`,
        roleSource: "default_pointer",
        updatedAt: new Date().toISOString(),
        replacedRevision: pointer.revision,
      },
      key,
      tx,
    );
  }

  private async updateContactRoleDurable(
    input: UpdateContactRoleInput,
    normalizedPhone: string,
  ): Promise<{
    state: VoiceContactState;
    newRevision: ContactRevision;
    confirmationInvalidated: boolean;
  }> {
    const key = this.requireEncryptionKey();
    let confirmationInvalidated = false;
    let newRevision: ContactRevision | undefined;
    let callerNoopReturn:
      | {
          state: VoiceContactState;
          newRevision: ContactRevision;
          confirmationInvalidated: boolean;
        }
      | undefined;

    await this.sessionRepository!.withTransaction(async (tx) => {
      const lockedSession = await this.sessionRepository!.findSessionById(
        input.voiceSessionId,
        tx,
        true,
      );
      if (!lockedSession) {
        throw new ApiRequestError(
          404,
          "VOICE_CONTACT_NOT_FOUND",
          `No contact state registered for session '${input.voiceSessionId}'.`,
        );
      }

      const rows = await this.sessionRepository!.listContactRoleRevisions(
        input.voiceSessionId,
        tx,
      );
      if (rows.length === 0) {
        throw new ApiRequestError(
          404,
          "VOICE_CONTACT_NOT_FOUND",
          `No contact state registered for session '${input.voiceSessionId}'.`,
        );
      }

      if (input.role === "caller") {
        const callerRows = rows.filter((r) => r.role === "caller");
        const latestCaller = callerRows[callerRows.length - 1]!;
        const currentCallerPhone = this.decryptRevisionPhone(latestCaller);
        if (currentCallerPhone !== normalizedPhone) {
          throw new ApiRequestError(
            409,
            "ASSERTED_CALLER_PHONE_IMMUTABLE",
            "原始 assertedCallerPhone 在適用保存期間不可覆寫。",
          );
        }
        const reconstructed = await this.coldReconstructState(
          input.voiceSessionId,
          tx,
        );
        callerNoopReturn = {
          state: this.cloneState(reconstructed!),
          newRevision: {
            revision: latestCaller.revisionNumber,
            role: "caller",
            name: latestCaller.name,
            phone: currentCallerPhone,
            consentRef: latestCaller.consentRef,
            reason: latestCaller.reason,
            roleSource: latestCaller.roleSource,
            updatedAt: latestCaller.createdAt,
            replacedRevision: latestCaller.replacedRevision,
          },
          confirmationInvalidated: false,
        };
        return;
      }

      const roleRows = rows.filter((r) => r.role === input.role);
      const previousRow = roleRows[roleRows.length - 1];
      const replacedRevisionNumber = previousRow
        ? previousRow.revisionNumber
        : null;
      const nextRevisionNumber =
        rows.reduce((max, r) => Math.max(max, r.revisionNumber), 0) + 1;
      const resolvedName =
        input.name?.trim() ||
        previousRow?.name ||
        (input.role === "passenger" ? "乘車人" : "聯絡人");
      const now = new Date().toISOString();

      newRevision = {
        revision: nextRevisionNumber,
        role: input.role,
        name: resolvedName,
        phone: normalizedPhone,
        consentRef: input.consentRef ?? null,
        reason: input.reason,
        roleSource: "explicit",
        updatedAt: now,
        replacedRevision: replacedRevisionNumber,
      };

      await this.persistRevision(input.voiceSessionId, newRevision, key, tx);
      if (input.role === "booker" || input.role === "passenger")
        await this.refreshDefaultDriverRole(input.voiceSessionId, tx, key);

      if (input.invalidateConfirmation !== false) {
        const invalidated =
          await this.sessionRepository!.invalidateUnconsumedConfirmationForContactChange(
            input.voiceSessionId,
            tx,
          );
        confirmationInvalidated = invalidated !== null;
      }

      // A role edit never changes a callback's sealed recipient. Operators
      // cancel the old task through its existing CAS command, then create an
      // explicitly related replacement with fresh consent.
    });

    if (callerNoopReturn) return callerNoopReturn;

    const fresh = await this.coldReconstructState(input.voiceSessionId);
    if (fresh) this.states.set(input.voiceSessionId, fresh);
    return {
      state: this.cloneState(fresh!),
      newRevision: newRevision!,
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

    return this.projectContacts(state);
  }

  private projectContacts(state: VoiceContactState): EffectiveContactsResult {
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
      caller:
        [...state.revisions].reverse().find((r) => r.role === "caller") ?? null,
      booker:
        [...state.revisions].reverse().find((r) => r.role === "booker") ?? null,
      passenger:
        [...state.revisions].reverse().find((r) => r.role === "passenger") ??
        null,
      driverContact:
        [...state.revisions]
          .reverse()
          .find((r) => r.role === "driverContact") ?? null,
      callbackRecipient:
        [...state.revisions]
          .reverse()
          .find((r) => r.role === "callbackRecipient") ?? null,
    };

    const callbackRecipientConsentRef =
      state.callbackRecipientRole === "custom"
        ? (activeRevisions.callbackRecipient?.consentRef ?? null)
        : (activeRevisions[state.callbackRecipientRole]?.consentRef ?? null);
    const callbackRecipientRevisionNumber =
      state.callbackRecipientRole === "custom"
        ? (activeRevisions.callbackRecipient?.revision ?? null)
        : (activeRevisions[state.callbackRecipientRole]?.revision ?? null);

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
      callbackRecipientRevisionNumber,
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
      return state.revisions
        .filter((r) => r.role === role)
        .map((r) => ({ ...r }));
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
      validationReference:
        params.validationReference ?? `val-ref-${randomUUID()}`,
    };
  }

  private cloneState(state: VoiceContactState): VoiceContactState {
    return {
      ...state,
      bookerContact: { ...state.bookerContact },
      passengerContact: { ...state.passengerContact },
      customDriverContact: state.customDriverContact
        ? { ...state.customDriverContact }
        : null,
      customCallbackRecipient: state.customCallbackRecipient
        ? { ...state.customCallbackRecipient }
        : null,
      revisions: state.revisions.map((r) => ({ ...r })),
    };
  }
}
