import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { VoiceApiClient } from "../../../apps/voice-media-worker/src/server/voice-api-client";
import { VoiceBookingController } from "../../../apps/api/src/modules/voice-booking/voice-booking.controller";
import { deepToSnakeCase } from "../../../apps/api/src/common/snake-case.interceptor";
import { VoiceSessionRepository } from "../../../apps/api/src/modules/voice-booking/voice-session.repository";
import { VoiceDomainToolPorts as CurrentPorts } from "../../../apps/api/src/modules/voice-booking/voice-domain-tool-ports";
import { VoiceBookingRepository } from "../../../apps/api/src/modules/voice-booking/voice-booking.repository";
import { VoiceBookingDraftService } from "../../../apps/api/src/modules/voice-booking/voice-booking-draft.service";
import { VoiceConfirmationService } from "../../../apps/api/src/modules/voice-booking/voice-confirmation.service";
import { VoiceContactService } from "../../../apps/api/src/modules/voice-booking/voice-contact.service";
import { VoiceHandoffOnlyToolPorts } from "../../../apps/api/src/modules/voice-booking/voice-handoff-tool-ports";
import { VoiceLocationService } from "../../../apps/api/src/modules/geo/voice-location.service";
import { ServiceAreaService } from "../../../apps/api/src/modules/service-area/service-area.service";
import { ServiceProductService } from "../../../apps/api/src/modules/service-product/service-product.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { sourceModuleLoader } from "./source-module-loader";
const Ports = process.env.VOICE_ORIGINAL_REF
  ? sourceModuleLoader({}, [
      "apps/api/src/modules/voice-booking/voice-domain-tool-ports.ts",
    ])<{ VoiceDomainToolPorts: typeof CurrentPorts }>(
      resolve("apps/api/src/modules/voice-booking/voice-domain-tool-ports.ts"),
    ).VoiceDomainToolPorts
  : CurrentPorts;
const NOW = "2026-10-19T03:00:00.000Z";
beforeEach(() => {
  vi.useFakeTimers().setSystemTime(new Date(NOW));
  process.env.VOICE_DIALOGUE_SNAPSHOT_KEY_VERSION = "SIM-qualified-contact-key";
  process.env.VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_KEY =
    randomBytes(32).toString("base64");
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.VOICE_DIALOGUE_SNAPSHOT_KEY_VERSION;
  delete process.env.VOICE_DIALOGUE_SNAPSHOT_ENCRYPTION_KEY;
});
async function harness(coordinates = { lat: 25.03, lng: 121.56 }) {
  const session = {
    voice_session_id: "session",
    call_id: "call",
    resource_scope_id: "scope",
    provider_account_id: "provider",
    route_profile_version: 1,
    control_owner: "ai",
    dialog_state: "collecting",
    lease_epoch: 1,
    session_version: 5,
    input_epoch: 1,
    pending_input: false,
    last_resolved_input_epoch: 1,
    last_applied_control_sequence: 1,
    commit_status: "none",
    created_at: NOW,
    updated_at: NOW,
  };
  let intent: Record<string, unknown> | null = null;
  const drafts: Record<string, unknown>[] = [],
    confirmations: Record<string, unknown>[] = [],
    contactRows: Record<string, unknown>[] = [];
  const db = {
    isEnabled: () => true,
    connect: async () => ({ query: db.query, release() {} }),
    query: async (sql: string, args: readonly unknown[] = []) => {
      let rows: Record<string, unknown>[] = [];
      if (sql.includes("UPDATE voice.session SET confirmation_state")) {
        session.session_version += 1;
      } else if (sql.includes("FROM voice.resource_scope"))
        rows = [
          {
            scope_id: "scope",
            status: "active",
            version: 1,
            runtime_mapping: {
              runtimeProfileCode: "ordinary_taxi",
              serviceProductCode: "taxi_realtime",
            },
            created_at: NOW,
            updated_at: NOW,
          },
        ];
      else if (sql.includes("FROM voice.session ")) rows = [session];
      else if (sql.includes("INSERT INTO voice.contact_role_revision")) {
        const keys = [
          "voice_session_id",
          "role",
          "revision_number",
          "name",
          "phone_key_version",
          "phone_nonce",
          "phone_ciphertext",
          "phone_auth_tag",
          "consent_ref",
          "reason",
          "role_source",
          "replaced_revision",
          "retention_expires_at",
        ];
        const row = {
          ...Object.fromEntries(keys.map((key, i) => [key, args[i]])),
          revision_id: `revision-${contactRows.length + 1}`,
          created_at: NOW,
        };
        contactRows.push(row);
        rows = [row];
      } else if (sql.includes("SELECT * FROM voice.contact_role_revision"))
        rows = contactRows;
      else if (sql.includes("MAX(revision_number)"))
        rows = [
          {
            revision: Math.max(
              0,
              ...contactRows.map((row) => Number(row.revision_number)),
            ),
          },
        ];
      else if (sql.includes("INSERT INTO voice.intent")) {
        intent ??= {
          intent_id: "intent",
          voice_session_id: "session",
          action: "create_owned_order",
          current_draft_version: 0,
          bound_order_id: null,
          status: "collecting",
          created_at: NOW,
          updated_at: NOW,
        };
      } else if (sql.includes("FROM voice.intent"))
        rows = intent ? [intent] : [];
      else if (sql.includes("UPDATE voice.intent"))
        intent!.current_draft_version = args[1];
      else if (sql.includes("INSERT INTO voice.draft_revision"))
        drafts.push({
          intent_id: args[0],
          draft_version: args[1],
          slots: JSON.parse(String(args[2])),
          validation_refs: JSON.parse(String(args[3])),
          canonical_snapshot: JSON.parse(String(args[4])),
          snapshot_hash: args[5],
          created_at: NOW,
        });
      else if (sql.includes("FROM voice.draft_revision"))
        rows = sql.includes("validation_refs @>")
          ? drafts.filter(
              (d) => JSON.stringify(d.validation_refs) === String(args[1]),
            )
          : drafts.filter(
              (d) => d.intent_id === args[0] && d.draft_version === args[1],
            );
      else if (sql.includes("FROM voice.confirmation")) rows = confirmations;
      else if (sql.includes("INSERT INTO voice.confirmation"))
        confirmations.push({
          confirmation_id: args[0],
          voice_session_id: args[1],
          intent_id: args[2],
          draft_version: args[3],
          action: args[4],
          snapshot_hash: args[5],
          readback_playback_id: args[6],
          input_epoch: args[7],
          media_epoch: args[8],
          control_sequence: args[9],
          lease_epoch: args[10],
          evidence: JSON.parse(String(args[11])),
          state: "readback_playing",
          expires_at: args[12],
          created_at: NOW,
        });
      else if (sql.includes("FROM voice.session_event"))
        rows = [
          {
            event_id: "event",
            voice_session_id: "session",
            source: "worker",
            provider_account_id: "provider",
            source_event_id: "source-1",
            sequence: 1,
            media_epoch: 1,
            input_epoch: 1,
            lease_epoch: 1,
            event_type: "speech_end",
            occurred_at: NOW,
            received_at: NOW,
          },
        ];
      return { rows, rowCount: rows.length };
    },
  };
  const repository = new VoiceBookingRepository(db as never);
  const contacts = new VoiceContactService(
    new VoiceSessionRepository(db as never),
  );
  await contacts.initializeContacts({
    voiceSessionId: "session",
    callerPhone: "0911000111",
    bookerName: "A",
    passengerName: "B",
    passengerPhone: "0922000222",
    isSelfBooking: false,
  });
  const geo = {
    health: () => ({ status: "healthy", mode: "external", failClosed: false }),
    search: async () => ({
      provider: "google",
      generatedAt: NOW,
      candidates: [
        {
          candidateId: "candidate",
          placeId: "place",
          provider: "google",
          displayName: "Taipei",
          address: "Taipei",
          confidence: "exact",
        },
      ],
    }),
    resolve: async () => ({
      provider: "google",
      resolvedAt: NOW,
      address: {
        address: "Taipei",
        normalizedAddress: "Taipei",
        lat: coordinates.lat,
        lng: coordinates.lng,
        placeId: "place",
        coordinateSource: "provider_candidate",
        geocodeConfidence: "exact",
        resolvedAt: NOW,
      },
    }),
  };
  const areas = new ServiceAreaService(),
    products = new ServiceProductService(new AuditNotificationService());
  products.upsertRuntimeProfilePolicy({
    runtimeProfileCode: "ordinary_taxi",
    serviceProductCode: "taxi_realtime",
    active: true,
    effectiveFrom: "2026-01-01T00:00:00Z",
  });
  const draftsService = new VoiceBookingDraftService(
    repository,
    new VoiceLocationService(geo as never),
    areas,
    products,
  );
  const confirmation = new VoiceConfirmationService(
    repository,
    {} as never,
    draftsService,
    {
      authorize: async () => ({
        leaseEpoch: 1,
        resourceScopeId: "scope",
        providerAccountId: "provider",
      }),
    },
  );
  const slot = (candidate: string) => ({
    rawText: "Taipei",
    candidate,
    normalizedValue: candidate,
    sourceTurnIds: ["turn"],
    sourceSegmentIds: ["segment"],
    providerConfidence: 1,
    validationState: "unvalidated",
    confirmedByCustomerAt: null,
  });
  const content = {
    draftVersion: 1,
    confirmationId: null,
    slots: { pickup: slot("place"), dropoff: slot("place"), time: slot(NOW) },
    slotHistory: [],
    addressRepairs: { pickup: 0, dropoff: 0 },
    addressHistory: [
      {
        field: "pickup",
        rawText: "Taipei",
        candidates: [{ placeId: "place", label: "Taipei", region: "Taipei" }],
      },
      {
        field: "dropoff",
        rawText: "Taipei",
        candidates: [{ placeId: "place", label: "Taipei", region: "Taipei" }],
      },
    ],
    handoff: null,
  };
  const sessions = {
    getDialogueSnapshotRestoration: async () => ({
      session: await repository.findSessionById("session"),
      snapshot: {
        snapshotId: "snapshot-1",
        inputEpoch: 1,
        mediaEpoch: 1,
        content,
      },
    }),
  };
  const ports = new Ports(
    new VoiceHandoffOnlyToolPorts(repository, {} as never),
    geo as never,
    undefined,
    {
      repository,
      contacts,
      drafts: draftsService,
      confirmation,
      sessions: sessions as never,
      credential: "external-identity-SIM",
    },
  );
  const context = {
    claims: {
      voiceSessionId: "session",
      resourceScopeId: "scope",
      routeProfileVersion: 1,
      leaseEpoch: 1,
    } as never,
    inputEpoch: 1,
    boundOrderId: null,
    signal: new AbortController().signal,
  };
  return {
    ports,
    context,
    drafts,
    confirmations,
    content,
    areas,
    contacts,
    contactRows,
    db,
    repository,
    sessions,
    geo,
    draftsService,
    confirmation,
  };
}
it("F1: selected provider addresses run real qualification and immutable draft/readback, preserving A/B contacts and retry identity", async () => {
  const h = await harness();
  await expect(
    h.ports.execute({ name: "check_booking_eligibility", args: {} }, h.context),
  ).resolves.toMatchObject({ status: "serviceable" });
  const plan = await h.ports.execute(
    { name: "prepare_booking_readback", args: {} },
    h.context,
  );
  expect(plan).toMatchObject({
    draftVersion: 1,
    confirmation: { templateVersion: "zh-TW-booking-v1", expectedDigit: "1" },
  });
  expect(h.contactRows).toHaveLength(5);
  expect(
    (await h.contacts.getEffectiveContactsDurable("session"))
      ?.assertedCallerPhone,
  ).toBe("0911000111");
  expect(h.drafts).toHaveLength(1);
  expect(h.confirmations).toHaveLength(1);
  expect(h.drafts[0]!.canonical_snapshot).toMatchObject({
    bookingRequirements: {
      bookerContact: { name: "A", phone: "0911000111" },
      passengerContact: { name: "B", phone: "0922000222" },
      driverContactRole: "passenger",
    },
  });
  expect(
    await h.ports.execute(
      { name: "prepare_booking_readback", args: {} },
      h.context,
    ),
  ).toEqual(plan);
  expect(h.drafts).toHaveLength(1);
  expect(h.confirmations).toHaveLength(1);
});
it("F1: no explicit selection and aborted original input remain denied before draft effects", async () => {
  const h = await harness();
  h.content.slots.pickup.normalizedValue = "unselected";
  await expect(
    h.ports.execute({ name: "prepare_booking_readback", args: {} }, h.context),
  ).rejects.toMatchObject({ code: "VOICE_ADDRESS_SELECTION_REQUIRED" });
  expect(h.drafts).toHaveLength(0);
  const c = new AbortController();
  c.abort();
  await expect(
    h.ports.execute(
      { name: "prepare_booking_readback", args: {} },
      { ...h.context, signal: c.signal },
    ),
  ).rejects.toThrow();
  expect(h.drafts).toHaveLength(0);
});

it.each([
  { lat: 25.0478, lng: 121.517, status: "not_serviceable" },
  { lat: 25.0338, lng: 121.5645, status: "manual_review" },
])(
  "A2 real service-area $status survives tool qualification without creating a draft or confirmation",
  async ({ lat, lng, status }) => {
    const h = await harness({ lat, lng });
    const result = await h.ports.execute(
      { name: "check_booking_eligibility", args: {} },
      h.context,
    );
    expect(result).toMatchObject({
      status,
      reason:
        "Service-area review must be resolved before autonomous booking or dispatch.",
    });
    await expect(
      h.ports.execute(
        { name: "prepare_booking_readback", args: {} },
        h.context,
      ),
    ).rejects.toMatchObject({ code: "VOICE_SERVICE_AREA_REVIEW_REQUIRED" });
    expect(h.drafts).toHaveLength(0);
    expect(h.confirmations).toHaveLength(0);
  },
);

it("A2 preserves the real qualifier's conditional passenger-capacity refusal from the current durable candidate", async () => {
  const h = await harness();
  const content = h.content as { slots: Record<string, unknown> };
  content.slots.passengerCount = {
    ...h.content.slots.time,
    candidate: "5",
    normalizedValue: null,
  };
  await expect(
    h.ports.execute({ name: "prepare_booking_readback", args: {} }, h.context),
  ).rejects.toMatchObject({ code: "BOOKING_REQUIREMENTS_UNSUPPORTED" });
  expect(h.drafts).toHaveLength(0);
  expect(h.confirmations).toHaveLength(0);
});

it("F1 actual first-party HTTP client -> controller -> original gateway -> durable roles/qualifier/immutable draft/readback across canonical snake wire", async () => {
  const h = await harness();
  const guard = {
    authenticate: async () => ({
      voiceSessionId: "session",
      resourceScopeId: "scope",
      routeProfileVersion: 1,
      leaseEpoch: 1,
      scopes: ["session_execute"],
    }),
  };
  const controller = new VoiceBookingController(
    {} as never,
    {} as never,
    undefined,
    undefined,
    guard as never,
    h.sessions as never,
    h.repository,
    {} as never,
    {} as never,
    undefined,
    h.geo as never,
    undefined,
    h.contacts,
    new VoiceSessionRepository(h.db as never),
    h.draftsService,
    h.confirmation,
  );
  const client = new VoiceApiClient(
    {
      baseUrl: "https://firstparty.example.test",
      fetchImpl: async (raw, init) => {
        expect(String(raw)).toContain(
          "/callcenter/voice/sessions/session/handoffs",
        );
        const result = await controller.requestHandoff(
          "session",
          { authorization: new Headers(init?.headers).get("authorization")! },
          JSON.parse(String(init?.body)),
        );
        return Response.json(deepToSnakeCase(result));
      },
    },
    { getToken: async () => "SIM-workload-identity" },
  );
  const response = await client.requestHandoff("session", "SIM-capability", {
    inputEpoch: 1,
    output: {
      intent: "book",
      text: "",
      slots: [],
      tools: [
        { name: "check_booking_eligibility", args: {} },
        { name: "prepare_booking_readback", args: {} },
      ],
      usage: { inputTokens: null, outputTokens: null },
      terminal: "tool_required",
    },
  });
  expect(response.results[0]).toMatchObject({ status: "serviceable" });
  expect(response.results[1]).toMatchObject({
    playbackTaskId: expect.any(String),
    draftVersion: 1,
    confirmation: {
      readbackPlaybackId: expect.any(String),
      templateVersion: "zh-TW-booking-v1",
    },
  });
  expect(h.contactRows).toHaveLength(5);
  expect(h.drafts).toHaveLength(1);
  expect(h.confirmations).toHaveLength(1);
});
