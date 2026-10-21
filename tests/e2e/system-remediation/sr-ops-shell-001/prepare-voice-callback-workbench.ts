import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DatabaseService } from "../../../../apps/api/src/common/db/database.service";
import { VoiceBookingRepository } from "../../../../apps/api/src/modules/voice-booking/voice-booking.repository";
import { VoiceBookingCommandService } from "../../../../apps/api/src/modules/voice-booking/voice-booking-command.service";
import { VoiceCommandRunnerService } from "../../../../apps/api/src/modules/voice-booking/voice-command-runner.service";
import { VoiceSessionRepository } from "../../../../apps/api/src/modules/voice-booking/voice-session.repository";
import { VoiceSessionService } from "../../../../apps/api/src/modules/voice-booking/voice-session.service";
import { OwnedMobilityRepository } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { seedVoiceDispatchWorkFixture } from "../../../support/voice-dispatch-workitem-postgres-fixture";

// ts-node uses the API's declared dependency and its existing seed TS config.
// Playwright itself does not transform Nest parameter decorators.
if (process.env.GITHUB_ACTIONS !== "true")
  throw new Error("Actual callback browser preparation is GitHub-hosted only.");

async function prepare() {
  const root = process.env.GITHUB_WORKSPACE;
  if (!root) throw new Error("The hosted repository workspace is required.");
  const directory = resolve(
    root,
    ".artifacts/ops-shell-acceptance/voice-callback-workbench",
  );
  await mkdir(directory, { recursive: true });
  const origin = process.env.OPS_CONSOLE_URL || "http://localhost:3003";
  const source = process.env.CANDIDATE_SHA || process.env.GITHUB_SHA;
  const database = new DatabaseService();
  const stages: { name: string; at: string }[] = [];
  const stage = (name: string) =>
    stages.push({ name, at: new Date().toISOString() });
  async function post(path: string, body: unknown, key?: string) {
    const response = await fetch(`${origin}/control-plane-proxy${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: JSON.stringify(body),
    });
    const envelope = await response.json();
    if (!response.ok)
      throw new Error(
        `Actual callback BFF preparation failed: ${response.status} ${JSON.stringify(envelope)}`,
      );
    return envelope.data;
  }
  try {
    const call = await post("/callcenter/sessions", {
      callType: "booking",
      callerPhone: "0900000016",
      agentId: "SIM-callback-browser-operator",
      agentIdentityAnnounced: true,
    });
    const callId = call.call_id as string;
    if (!callId) throw new Error("Original API-created call is missing.");
    stage("Original call created through actual Ops BFF and API");
    // Media, confirmation and qualification prerequisite ports are fixtures.
    // The workbench scenario proves the real order/task/receipt workflow;
    // full spoken booking and qualification acceptance remain separate.
    const fixture = await seedVoiceDispatchWorkFixture(database, {
      existingCallId: callId,
    });
    const voiceSessionId = fixture.request.voiceSessionId;
    const repository = new VoiceBookingRepository(database);
    const commands = new VoiceBookingCommandService(
      repository,
      fixture.makeEvidence(repository) as never,
      fixture.products as never,
      fixture.areas as never,
      fixture.access,
    );
    const accepted = await commands.accept("fixture-provider", fixture.request);
    const committed = await new VoiceCommandRunnerService(
      commands,
      new OwnedMobilityRepository(database),
    ).execute(accepted.commandId);
    if (committed.status !== "succeeded" || !committed.orderId)
      throw new Error("The original voice order did not commit.");
    const orderId = committed.orderId;
    stage("Confirmed fixture media commits one real original order");
    const reason = `SIM callback ${randomUUID()}`;
    // Explicit SIM consent is an external prerequisite; ANI initialization,
    // encrypted contact revision and callback creation remain actual API/SQL.
    const contact = await post(
      `/callcenter/voice/sessions/${voiceSessionId}/contacts`,
      {
        role: "callbackRecipient",
        name: "SIM callback A",
        phone: "0900000016",
        consentRef: "SIM-callback-browser-explicit-consent",
        reason: "SIM caller requested callback",
      },
    );
    const callback = await post(
      `/voice/sessions/${voiceSessionId}/callbacks`,
      {
        contactRevisionNumber:
          contact.contacts.callback_recipient_revision_number,
        consentRef: contact.contacts.callback_recipient_consent_ref,
        reason,
      },
      randomUUID(),
    );
    if (
      callback.task.call_id !== callId ||
      callback.task.linked_order_id !== orderId ||
      !callback.receipt.command_id
    )
      throw new Error("Callback lost its original call/order/receipt binding.");
    stage("Real callback and create receipt retain original call and order");
    const sessions = new VoiceSessionRepository(database);
    const session = (await sessions.findSessionById(voiceSessionId))!;
    await new VoiceSessionService(sessions).closeSession(
      voiceSessionId,
      session.sessionVersion,
    );
    await post(`/callcenter/sessions/${callId}/close`, {});
    if (
      (await sessions.findSessionById(voiceSessionId))!.dialogState !== "closed"
    )
      throw new Error("Original voice session did not close.");
    stage("Both original call and voice session close through real services");
    const originalOrder = (
      await database.query(
        "SELECT order_id,record FROM ops.phase1_owned_orders WHERE order_id=$1",
        [orderId],
      )
    ).rows;
    if (originalOrder.length !== 1)
      throw new Error("Original order is missing.");
    await writeFile(
      resolve(directory, "seed.json"),
      JSON.stringify(
        {
          source,
          runId: process.env.GITHUB_RUN_ID,
          callId,
          voiceSessionId,
          orderId,
          taskId: callback.task.task_id,
          scopeId: fixture.scopeId,
          reason,
          createReceipt: callback.receipt,
          originalOrder,
          stages,
          externalContactConsentMediaPrerequisites: "SIM",
          qualificationPrerequisites:
            "Synthetic fixture; full spoken booking is not qualified here.",
          internalCallOrderCallbackAndReceipts: "actual API and PostgreSQL",
        },
        null,
        2,
      ),
    );
    process.stdout.write(
      JSON.stringify({
        prepared: true,
        source,
        callId,
        voiceSessionId,
        orderId,
        taskId: callback.task.task_id,
        externalPrerequisites: "SIM",
      }) + "\n",
    );
  } finally {
    await database.onModuleDestroy();
  }
}

void prepare().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
