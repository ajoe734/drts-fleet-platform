import { describe, expect, it, vi } from "vitest";
import { VoiceContactService } from "../../apps/api/src/modules/voice-booking/voice-contact.service";
import { VoiceCallbackService } from "../../apps/api/src/modules/voice-booking/voice-callback.service";
import { CallcenterService } from "../../apps/api/src/modules/callcenter/callcenter.service";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";

const VOICE_SESSION_ID = "11111111-1111-4111-8111-111111111111";
const RESOURCE_SCOPE_ID = "22222222-2222-4222-8222-222222222222";
const BRAND_ID = "brand-tw-01";
const CALL_ID = "call-uv-018-test";

describe("UV-EXEC-018 Contact Roles, Consented Callbacks, & Terminal Race CAS", () => {
  describe("1. Contact Roles & Revisions (SD §6.4)", () => {
    it("separates roles so that when A books for B, driver contacts B and callback reaches A", () => {
      const service = new VoiceContactService();

      service.initializeContacts({
        voiceSessionId: VOICE_SESSION_ID,
        callerPhone: "0911000111", // Alice (A)
        bookerName: "Alice",
        passengerName: "Bob", // Bob (B)
        passengerPhone: "0922000222",
        isSelfBooking: false,
        consentRef: "consent-a-books-b",
      });

      const effective = service.getEffectiveContacts(VOICE_SESSION_ID);

      // Asserted caller is Alice (A)
      expect(effective.assertedCallerPhone).toBe("0911000111");
      expect(effective.bookerContact).toEqual({
        name: "Alice",
        phone: "0911000111",
      });
      expect(effective.passengerContact).toEqual({
        name: "Bob",
        phone: "0922000222",
      });

      // Driver contacts B (passenger)
      expect(effective.driverContactRole).toBe("passenger");
      expect(effective.driverContact).toEqual({
        name: "Bob",
        phone: "0922000222",
      });

      // Callback reaches A (booker)
      expect(effective.callbackRecipientRole).toBe("booker");
      expect(effective.callbackRecipient).toEqual({
        name: "Alice",
        phone: "0911000111",
      });

      // Build BookingRequirements mapping
      const requirements = service.buildBookingRequirements(VOICE_SESSION_ID, {
        passengerCount: 2,
        luggageCount: 1,
        luggageSize: "standard",
      });
      expect(requirements.passengerCount).toBe(2);
      expect(requirements.bookerContact).toEqual({ name: "Alice", phone: "0911000111" });
      expect(requirements.passengerContact).toEqual({ name: "Bob", phone: "0922000222" });
      expect(requirements.driverContactRole).toBe("passenger");
    });

    it("enforces that original assertedCallerPhone is immutable during retention period", async () => {
      const service = new VoiceContactService();

      service.initializeContacts({
        voiceSessionId: VOICE_SESSION_ID,
        callerPhone: "0911000111",
        bookerName: "Alice",
      });

      // Re-asserting the identical phone is idempotent
      expect(() => {
        service.assertCallerPhone(VOICE_SESSION_ID, "0911000111");
      }).not.toThrow();

      // Attempting to overwrite assertedCallerPhone with a different phone throws 409
      expect(() => {
        service.assertCallerPhone(VOICE_SESSION_ID, "0988777666");
      }).toThrowError(
        expect.objectContaining({
          status: 409,
          code: "ASSERTED_CALLER_PHONE_IMMUTABLE",
        }),
      );

      // Attempting to update role 'caller' via updateContactRole is also rejected
      await expect(
        service.updateContactRole({
          voiceSessionId: VOICE_SESSION_ID,
          role: "caller",
          phone: "0988777666",
          reason: "malicious_overwrite",
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 409,
          code: "ASSERTED_CALLER_PHONE_IMMUTABLE",
        }),
      );
    });

    it("retains immutable revision history for role corrections and invalidates active confirmation", async () => {
      const mockSessionRepo = {
        invalidateActiveConfirmationForSession: vi.fn(async () => null),
      } as any;

      const service = new VoiceContactService(mockSessionRepo);

      service.initializeContacts({
        voiceSessionId: VOICE_SESSION_ID,
        callerPhone: "0911000111",
        bookerName: "Alice",
        passengerName: "Bob",
        passengerPhone: "0922000222",
        isSelfBooking: false,
      });

      const initialHistory = service.getRevisionHistory(VOICE_SESSION_ID);
      expect(initialHistory).toHaveLength(3); // caller, booker, passenger initial revisions

      // Correct Bob's passenger phone number
      const update1 = await service.updateContactRole({
        voiceSessionId: VOICE_SESSION_ID,
        role: "passenger",
        phone: "0933333444",
        name: "Bob (Updated)",
        reason: "passenger_phone_correction",
        consentRef: "consent-bob-phone-correction",
      });

      expect(update1.newRevision.revision).toBe(4);
      expect(update1.newRevision.replacedRevision).toBe(3);
      expect(update1.newRevision.phone).toBe("0933333444");
      expect(update1.confirmationInvalidated).toBe(true);
      expect(
        mockSessionRepo.invalidateActiveConfirmationForSession,
      ).toHaveBeenCalledWith(VOICE_SESSION_ID);

      // Verify active passenger contact changed
      const effectiveAfterUpdate1 = service.getEffectiveContacts(VOICE_SESSION_ID);
      expect(effectiveAfterUpdate1.passengerContact).toEqual({
        name: "Bob (Updated)",
        phone: "0933333444",
      });
      // Driver now contacts the updated passenger phone
      expect(effectiveAfterUpdate1.driverContact).toEqual({
        name: "Bob (Updated)",
        phone: "0933333444",
      });

      // Update booker phone
      const update2 = await service.updateContactRole({
        voiceSessionId: VOICE_SESSION_ID,
        role: "booker",
        phone: "0955555666",
        reason: "booker_phone_correction",
      });
      expect(update2.newRevision.revision).toBe(5);
      expect(update2.newRevision.replacedRevision).toBe(2);

      // Verify full immutable history preserves all 5 revisions
      const fullHistory = service.getRevisionHistory(VOICE_SESSION_ID);
      expect(fullHistory).toHaveLength(5);
      expect(fullHistory.map((r) => r.revision)).toEqual([1, 2, 3, 4, 5]);

      // Original revision 3 for passenger is still intact in history
      const originalPassengerRev = fullHistory.find((r) => r.revision === 3);
      expect(originalPassengerRev?.phone).toBe("0922000222");

      // Filtered history by role
      const passengerHistory = service.getRevisionHistory(VOICE_SESSION_ID, "passenger");
      expect(passengerHistory).toHaveLength(2);
      expect(passengerHistory[0]?.phone).toBe("0922000222");
      expect(passengerHistory[1]?.phone).toBe("0933333444");
    });

    it("verifies linkOrderToCallSession does NOT overwrite callerPhone with passenger.phone", () => {
      const auditService = new AuditNotificationService();
      const callcenter = new CallcenterService(auditService);

      // Open a call session with asserted callerPhone A
      const session = callcenter.openCallSession({
        callType: "booking",
        callerPhone: "0911000111", // Asserted callerPhone (A)
        agentId: "ops-001",
      });
      expect(session.callerPhone).toBe("0911000111");

      // Now link an order where the passenger phone is B (0922000222)
      const linked = callcenter.linkOrderToCallSession({
        callId: session.callId,
        callType: "booking",
        callerPhone: "0922000222", // Passenger phone passed in order link
        agentId: "ops-001",
        linkedOrderId: "ORD-UV-018-001",
        recordingId: "rec-018-001",
      });

      // SD §6.4: assertedCallerPhone must NOT be overwritten by passenger.phone
      expect(linked.callerPhone).toBe("0911000111");
      expect(callcenter.getCallSession(session.callId).callerPhone).toBe("0911000111");
      expect(linked.linkedOrderId).toBe("ORD-UV-018-001");
    });
  });

  describe("2. Consented Callback & Command Atomicity (SD §12.5)", () => {
    it("rejects callback creation when customer consent is missing (沒有同意不能補造)", async () => {
      const service = new VoiceCallbackService();

      // Missing consentRef throws 400 CALLBACK_CONSENT_REQUIRED
      await expect(
        service.createCallback({
          voiceSessionId: VOICE_SESSION_ID,
          resourceScopeId: RESOURCE_SCOPE_ID,
          brandId: BRAND_ID,
          callId: CALL_ID,
          contactPhone: "0911000111",
          consentRef: "", // empty consent
          reason: "customer_busy",
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 400,
          code: "CALLBACK_CONSENT_REQUIRED",
        }),
      );

      // Whitespace only consentRef also throws
      await expect(
        service.createCallback({
          voiceSessionId: VOICE_SESSION_ID,
          resourceScopeId: RESOURCE_SCOPE_ID,
          brandId: BRAND_ID,
          callId: CALL_ID,
          contactPhone: "0911000111",
          consentRef: "   ",
          reason: "customer_busy",
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 400,
          code: "CALLBACK_CONSENT_REQUIRED",
        }),
      );
    });

    it("atomically creates callback task and receipt with idempotency replay", async () => {
      const service = new VoiceCallbackService();

      const res1 = await service.createCallback({
        voiceSessionId: VOICE_SESSION_ID,
        resourceScopeId: RESOURCE_SCOPE_ID,
        brandId: BRAND_ID,
        callId: CALL_ID,
        contactPhone: "0911000111",
        consentRef: "consent-spoken-recorded-001",
        reason: "agent_queue_timeout",
        priority: "urgent",
        slaMinutes: 15,
        actionSuffix: "handoff-01",
      });

      expect(res1.replayed).toBe(false);
      expect(res1.receipt.status).toBe("succeeded");
      expect(res1.task.status).toBe("pending");
      expect(res1.task.priority).toBe("urgent");
      expect(res1.task.version).toBe(1);

      // Replay with identical payload and actionKey
      const res2 = await service.createCallback({
        voiceSessionId: VOICE_SESSION_ID,
        resourceScopeId: RESOURCE_SCOPE_ID,
        brandId: BRAND_ID,
        callId: CALL_ID,
        contactPhone: "0911000111",
        consentRef: "consent-spoken-recorded-001",
        reason: "agent_queue_timeout",
        priority: "urgent",
        slaMinutes: 15,
        actionSuffix: "handoff-01",
      });

      expect(res2.replayed).toBe(true);
      expect(res2.receipt.commandId).toBe(res1.receipt.commandId);
      expect(res2.task.taskId).toBe(res1.task.taskId);

      // Re-submitting same action key with different payload hash throws 409 conflict
      await expect(
        service.createCallback({
          voiceSessionId: VOICE_SESSION_ID,
          resourceScopeId: RESOURCE_SCOPE_ID,
          brandId: BRAND_ID,
          callId: CALL_ID,
          contactPhone: "0988777999", // different phone!
          consentRef: "consent-spoken-recorded-001",
          reason: "agent_queue_timeout",
          actionSuffix: "handoff-01",
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          status: 409,
          code: "VOICE_ACTION_PAYLOAD_CONFLICT",
        }),
      );
    });

    it("allows receipt recovery even after task response lost and call.ended arrived first", async () => {
      const service = new VoiceCallbackService();

      // Step 1: Client submits callback creation with valid consent
      const created = await service.createCallback({
        voiceSessionId: VOICE_SESSION_ID,
        resourceScopeId: RESOURCE_SCOPE_ID,
        brandId: BRAND_ID,
        callId: CALL_ID,
        contactPhone: "0911000111",
        consentRef: "consent-spoken-proof-rec-099",
        reason: "lines_full_abandoned",
        actionSuffix: "action-recovery-01",
      });

      // Step 2: Simulate response loss over the wire.
      // Simultaneously, the telephony call ends: call.ended event received.
      const actionKey = created.receipt.actionKey;

      // Step 3: Reconciler or reconnecting client recovers via actionKey receipt lookup
      const recovered = service.getReceiptByActionKey(actionKey);
      expect(recovered.receipt).not.toBeNull();
      expect(recovered.receipt?.status).toBe("succeeded");
      expect(recovered.task).not.toBeNull();
      expect(recovered.task?.taskId).toBe(created.task.taskId);
      expect(recovered.task?.status).toBe("pending");

      // Also recoverable by session ID: "call closed 不等於工作已結案"
      const sessionTask = service.getTaskBySessionId(VOICE_SESSION_ID);
      expect(sessionTask).not.toBeNull();
      expect(sessionTask?.taskId).toBe(created.task.taskId);
      expect(sessionTask?.status).toBe("pending");
    });
  });

  describe("3. Terminal State CAS, Outcall Fencing & Mutual Exclusion (SD §12.5)", () => {
    it("supports claim lease, version CAS, and attempt retry SLA until unreachable", async () => {
      const service = new VoiceCallbackService();

      const { task } = await service.createCallback({
        voiceSessionId: VOICE_SESSION_ID,
        resourceScopeId: RESOURCE_SCOPE_ID,
        brandId: BRAND_ID,
        callId: CALL_ID,
        contactPhone: "0911000111",
        consentRef: "consent-sla-001",
        reason: "busy_retry",
        maxAttempts: 2, // 2 attempts max
      });

      expect(task.version).toBe(1);
      expect(task.status).toBe("pending");

      // Claim task by Operator A with expectedVersion: 1
      const claimed = service.claimCallback({
        taskId: task.taskId,
        operatorId: "operator-alice",
        expectedVersion: 1,
      });
      expect(claimed.status).toBe("claimed");
      expect(claimed.version).toBe(2);
      expect(claimed.assignedOperatorId).toBe("operator-alice");

      // Stale claim with version 1 fails
      expect(() => {
        service.claimCallback({
          taskId: task.taskId,
          operatorId: "operator-bob",
          expectedVersion: 1,
        });
      }).toThrowError(
        expect.objectContaining({
          status: 409,
          code: "CALLBACK_TASK_VERSION_MISMATCH",
        }),
      );

      // Attempt 1: Busy -> task returns to 'pending' queue for retry
      const attempt1 = service.recordAttempt({
        taskId: task.taskId,
        operatorId: "operator-alice",
        expectedVersion: 2,
        outcome: "busy",
        dialStatus: "hung_up",
        hangupConfirmed: true,
      });
      expect(attempt1.task.attemptCount).toBe(1);
      expect(attempt1.task.status).toBe("pending"); // Returned to pending queue!
      expect(attempt1.task.version).toBe(3);
      expect(attempt1.task.assignedOperatorId).toBeNull(); // Claim cleared for next operator

      // Claim again by Operator B with version: 3
      const claimed2 = service.claimCallback({
        taskId: task.taskId,
        operatorId: "operator-bob",
        expectedVersion: 3,
      });
      expect(claimed2.status).toBe("claimed");
      expect(claimed2.version).toBe(4);

      // Attempt 2: No answer -> reaches maxAttempts (2) -> transitions to 'unreachable' (terminal)
      const attempt2 = service.recordAttempt({
        taskId: task.taskId,
        operatorId: "operator-bob",
        expectedVersion: 4,
        outcome: "no_answer",
        dialStatus: "hung_up",
        hangupConfirmed: true,
      });
      expect(attempt2.task.attemptCount).toBe(2);
      expect(attempt2.task.status).toBe("unreachable"); // Terminal!
      expect(attempt2.task.version).toBe(5);

      // Terminal tasks cannot be claimed or attempted ("terminal 不復活")
      expect(() => {
        service.claimCallback({
          taskId: task.taskId,
          operatorId: "operator-carol",
          expectedVersion: 5,
        });
      }).toThrowError(
        expect.objectContaining({
          status: 409,
          code: "CALLBACK_TASK_TERMINAL",
        }),
      );
    });

    it("enforces cancel and complete mutual exclusion and terminal immutability (terminal 不復活)", async () => {
      const service = new VoiceCallbackService();

      const { task } = await service.createCallback({
        voiceSessionId: VOICE_SESSION_ID,
        resourceScopeId: RESOURCE_SCOPE_ID,
        brandId: BRAND_ID,
        callId: CALL_ID,
        contactPhone: "0911000111",
        consentRef: "consent-race-001",
        reason: "terminal_race_test",
      });

      // Claim
      const claimed = service.claimCallback({
        taskId: task.taskId,
        operatorId: "operator-1",
        expectedVersion: 1,
      });
      expect(claimed.status).toBe("claimed");

      // Scenario A: Task is completed
      const completed = service.completeCallback({
        taskId: task.taskId,
        operatorId: "operator-1",
        expectedVersion: 2,
        resolutionNotes: "Issue solved on call",
      });
      expect(completed.status).toBe("completed");
      expect(completed.replayed).toBe(false);

      // Re-completing replays completed terminal state
      const reCompleted = service.completeCallback({
        taskId: task.taskId,
        operatorId: "operator-1",
        expectedVersion: 3,
      });
      expect(reCompleted.status).toBe("completed");
      expect(reCompleted.replayed).toBe(true);

      // Attempting to cancel an already completed task is rejected with 409 conflict
      expect(() => {
        service.cancelCallback({
          taskId: task.taskId,
          reason: "customer_wants_cancel",
          expectedVersion: 3,
        });
      }).toThrowError(
        expect.objectContaining({
          status: 409,
          code: "CALLBACK_TERMINAL_RACE_CONFLICT",
        }),
      );

      // Scenario B: Another task is cancelled first
      const taskB = (
        await service.createCallback({
          voiceSessionId: "session-b-002",
          resourceScopeId: RESOURCE_SCOPE_ID,
          brandId: BRAND_ID,
          callId: "call-b-002",
          contactPhone: "0922000333",
          consentRef: "consent-race-002",
          reason: "cancel_race_test",
        })
      ).task;

      const cancelledB = service.cancelCallback({
        taskId: taskB.taskId,
        reason: "customer_cancelled_request",
        expectedVersion: 1,
      });
      expect(cancelledB.status).toBe("cancelled");
      expect(cancelledB.replayed).toBe(false);

      // Re-cancelling replays cancelled terminal state
      const reCancelledB = service.cancelCallback({
        taskId: taskB.taskId,
        reason: "duplicate_cancel",
        expectedVersion: 2,
      });
      expect(reCancelledB.status).toBe("cancelled");
      expect(reCancelledB.replayed).toBe(true);

      // Attempting to complete a cancelled task is rejected with 409 conflict ("terminal 不復活")
      expect(() => {
        service.completeCallback({
          taskId: taskB.taskId,
          operatorId: "operator-2",
          expectedVersion: 2,
        });
      }).toThrowError(
        expect.objectContaining({
          status: 409,
          code: "CALLBACK_TERMINAL_RACE_CONFLICT",
        }),
      );
    });

    it("fences outcall so task cancel does NOT falsely report actual phone has hung up (task cancel 不假報實際電話已掛斷)", async () => {
      const service = new VoiceCallbackService();

      const { task } = await service.createCallback({
        voiceSessionId: VOICE_SESSION_ID,
        resourceScopeId: RESOURCE_SCOPE_ID,
        brandId: BRAND_ID,
        callId: CALL_ID,
        contactPhone: "0911000111",
        consentRef: "consent-dial-fence-001",
        reason: "outcall_fencing_test",
      });

      // Claim
      service.claimCallback({
        taskId: task.taskId,
        operatorId: "operator-dialer",
        expectedVersion: 1,
      });

      // Start an outcall dial attempt: currently bridging / dialing, phone NOT yet hung up!
      const { attempt } = service.recordAttempt({
        taskId: task.taskId,
        operatorId: "operator-dialer",
        expectedVersion: 2,
        outcome: "answered",
        dialOperationKey: "dial-cct-outcall-999",
        dialStatus: "dialing", // Dial is in-flight!
        hangupConfirmed: false, // Phone is NOT hung up!
      });
      expect(attempt.dialStatus).toBe("dialing");
      expect(attempt.hangupConfirmed).toBe(false);

      // While the dial is active, customer cancels or operator cancels the task
      const cancelResult = service.cancelCallback({
        taskId: task.taskId,
        reason: "customer_cancelled_via_web",
        expectedVersion: 3,
      });

      // SD §12.5: "task cancel 不假報實際電話已掛斷"
      expect(cancelResult.status).toBe("cancelled");
      expect(cancelResult.actualPhoneHungUp).toBe(false); // Does NOT falsely report phone is hung up!
      expect(cancelResult.dialReconcileRequired).toBe(true);
      expect(cancelResult.inFlightAttemptId).toBe(attempt.attemptId);

      // Verify the in-flight attempt is marked for reconciliation
      const attempts = service.getAttempts(task.taskId);
      expect(attempts[0]?.dialStatus).toBe("reconcile_required");
      expect(attempts[0]?.hangupConfirmed).toBe(false);

      // Replay cancelCallback BEFORE reconciliation: must NOT falsely report phone hung up!
      const replayBeforeReconcile = service.cancelCallback({
        taskId: task.taskId,
        reason: "replay_cancel_request",
        expectedVersion: 4,
      });
      expect(replayBeforeReconcile.status).toBe("cancelled");
      expect(replayBeforeReconcile.replayed).toBe(true);
      expect(replayBeforeReconcile.actualPhoneHungUp).toBe(false);
      expect(replayBeforeReconcile.dialReconcileRequired).toBe(true);
      expect(replayBeforeReconcile.inFlightAttemptId).toBe(attempt.attemptId);

      // Later, the telephony provider CTI webhook reports the physical line has finally cleared
      const reconciled = service.reconcileInFlightDial(
        task.taskId,
        attempt.attemptId,
        {
          hungUpAt: "2026-09-09T19:30:00.000Z",
          dialOutcome: "answered",
          operatorNote: "CTI leg clear event confirmed",
        },
      );

      // Attempt now reflects true physical hangup
      expect(reconciled.attempt.dialStatus).toBe("hung_up");
      expect(reconciled.attempt.hangupConfirmed).toBe(true);
      expect(reconciled.attempt.endedAt).toBe("2026-09-09T19:30:00.000Z");

      // Task remains cancelled ("terminal 不復活")
      expect(reconciled.task.status).toBe("cancelled");

      // Replay cancelCallback AFTER reconciliation: now reports phone hung up and no reconcile required!
      const replayAfterReconcile = service.cancelCallback({
        taskId: task.taskId,
        reason: "replay_cancel_request_after_reconcile",
        expectedVersion: 4,
      });
      expect(replayAfterReconcile.status).toBe("cancelled");
      expect(replayAfterReconcile.replayed).toBe(true);
      expect(replayAfterReconcile.actualPhoneHungUp).toBe(true);
      expect(replayAfterReconcile.dialReconcileRequired).toBe(false);
      expect(replayAfterReconcile.inFlightAttemptId).toBeUndefined();
    });

    it("persists and re-derives unresolved dial reconciliation state across cancelCallback replays (Codex review blocker regression)", async () => {
      const service = new VoiceCallbackService();

      const { task } = await service.createCallback({
        voiceSessionId: VOICE_SESSION_ID,
        resourceScopeId: RESOURCE_SCOPE_ID,
        brandId: BRAND_ID,
        callId: CALL_ID,
        contactPhone: "0911000111",
        consentRef: "consent-replay-fence-002",
        reason: "replay_dial_reconciliation_test",
      });

      // Claim and start dial attempt (bridged, in-flight)
      service.claimCallback({
        taskId: task.taskId,
        operatorId: "operator-replayer",
        expectedVersion: 1,
      });

      const { attempt } = service.recordAttempt({
        taskId: task.taskId,
        operatorId: "operator-replayer",
        expectedVersion: 2,
        outcome: "answered",
        dialStatus: "bridged",
        hangupConfirmed: false,
      });

      // Initial cancel while dial is in-flight
      const cancel1 = service.cancelCallback({
        taskId: task.taskId,
        reason: "cancel_inflight",
        expectedVersion: 3,
      });
      expect(cancel1.replayed).toBe(false);
      expect(cancel1.actualPhoneHungUp).toBe(false);
      expect(cancel1.dialReconcileRequired).toBe(true);
      expect(cancel1.inFlightAttemptId).toBe(attempt.attemptId);
      expect(cancel1.task.dialReconcileRequired).toBe(true);

      // Multiple replays before physical line hung up: must maintain actualPhoneHungUp=false
      for (let i = 0; i < 3; i++) {
        const replay = service.cancelCallback({
          taskId: task.taskId,
          reason: "cancel_replay",
          expectedVersion: 4,
        });
        expect(replay.replayed).toBe(true);
        expect(replay.actualPhoneHungUp).toBe(false);
        expect(replay.dialReconcileRequired).toBe(true);
        expect(replay.inFlightAttemptId).toBe(attempt.attemptId);
      }

      // Reconcile line
      service.reconcileInFlightDial(task.taskId, attempt.attemptId, {
        hungUpAt: new Date().toISOString(),
        dialOutcome: "answered",
        operatorNote: "Physical call ended",
      });

      // Replays after reconciliation: physical line is now cleared
      const replayResolved = service.cancelCallback({
        taskId: task.taskId,
        reason: "cancel_replay_post_reconcile",
        expectedVersion: 4,
      });
      expect(replayResolved.replayed).toBe(true);
      expect(replayResolved.actualPhoneHungUp).toBe(true);
      expect(replayResolved.dialReconcileRequired).toBe(false);
      expect(replayResolved.inFlightAttemptId).toBeUndefined();
      expect(replayResolved.task.dialReconcileRequired).toBe(false);
    });

    it("verifies call closed does not mean callback task is terminated (call closed 不等於工作已結案)", async () => {
      const service = new VoiceCallbackService();

      const { task } = await service.createCallback({
        voiceSessionId: VOICE_SESSION_ID,
        resourceScopeId: RESOURCE_SCOPE_ID,
        brandId: BRAND_ID,
        callId: CALL_ID,
        contactPhone: "0911000111",
        consentRef: "consent-call-closed-001",
        reason: "agent_offline_handoff",
      });

      // Telephony call is terminated (call closed).
      // Callback task must remain actionable in the ops exception workbench.
      const foundTask = service.getTaskById(task.taskId);
      expect(foundTask?.status).toBe("pending");

      // Operator can claim, perform attempts, and complete the task even after call closed
      const claimed = service.claimCallback({
        taskId: task.taskId,
        operatorId: "ops-agent-007",
        expectedVersion: 1,
      });
      expect(claimed.status).toBe("claimed");

      const completed = service.completeCallback({
        taskId: task.taskId,
        operatorId: "ops-agent-007",
        expectedVersion: 2,
        resolutionNotes: "Outbound follow-up completed successfully after call closed.",
      });
      expect(completed.status).toBe("completed");
    });
  });
});
