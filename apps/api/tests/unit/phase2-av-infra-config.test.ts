import { describe, expect, it } from "vitest";

import { resolvePhase2AvInfraConfig } from "../../src/config/phase2-av-infra-config";

describe("resolvePhase2AvInfraConfig", () => {
  it("returns the canonical phase2 bucket and topic layout", () => {
    const config = resolvePhase2AvInfraConfig({});

    expect(config.configVersion).toBe("2026-06-26");
    expect(config.storageBuckets.map((bucket) => bucket.name)).toEqual([
      "raw-provider-events",
      "telemetry-archive",
      "video-normal",
      "video-incident-locked",
      "investigation-bundles",
      "regulatory-reports",
    ]);
    expect(config.pubsubTopics.map((topic) => topic.name)).toEqual([
      "provider-events-ingest",
      "telemetry-normalized",
      "video-ingest",
      "evidence-manifest-created",
      "regulatory-report-requested",
      "dr-restore-verify",
    ]);
  });

  it("enforces stronger retention and hold modes on incident and regulatory families", () => {
    const config = resolvePhase2AvInfraConfig({});
    const buckets = Object.fromEntries(
      config.storageBuckets.map((bucket) => [bucket.name, bucket]),
    );

    expect(buckets["video-normal"]).toMatchObject({
      retentionDays: 30,
      objectHoldMode: "none",
    });
    expect(buckets["video-incident-locked"]).toMatchObject({
      retentionDays: 2555,
      objectHoldMode: "default-event-based-hold",
    });
    expect(buckets["investigation-bundles"]).toMatchObject({
      retentionDays: 2555,
      objectHoldMode: "default-event-based-hold",
    });
    expect(buckets["regulatory-reports"]).toMatchObject({
      retentionDays: 2555,
      objectHoldMode: "default-retention-lock",
    });
  });

  it("supports environment-specific prefix overrides without changing logical names", () => {
    const config = resolvePhase2AvInfraConfig({
      PHASE2_AV_ENVIRONMENT: "prod",
      PHASE2_AV_BUCKET_PREFIX: "drts-av-prod",
      PHASE2_AV_TOPIC_PREFIX: "drts.av.prod",
    });

    expect(config.environment).toBe("prod");
    expect(config.bucketPrefix).toBe("drts-av-prod");
    expect(config.topicPrefix).toBe("drts.av.prod");
    expect(config.kms.keyRing).toBe("drts-av-prod-prod");
    expect(config.storageBuckets[0]?.name).toBe("raw-provider-events");
    expect(config.pubsubTopics[0]?.deadLetterTopic).toBe(
      "drts.av.prod.provider-events-dead-letter",
    );
  });

  it("defines telemetry data-quality rules for identity, freshness, location, and schema drift", () => {
    const config = resolvePhase2AvInfraConfig({});

    expect(config.telemetryFieldRules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "externalVehicleRef", required: true }),
        expect.objectContaining({ field: "capturedAt", required: true }),
        expect.objectContaining({ field: "locationLat", required: true }),
        expect.objectContaining({ field: "locationLng", required: true }),
        expect.objectContaining({
          field: "sourceSchemaVersion",
          required: true,
        }),
      ]),
    );
  });
});
