import { readFileSync } from "node:fs";
import path from "node:path";
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
      retentionLock: false,
    });
    expect(buckets["video-incident-locked"]).toMatchObject({
      retentionDays: 2555,
      objectHoldMode: "default-event-based-hold",
      retentionLock: false,
    });
    expect(buckets["investigation-bundles"]).toMatchObject({
      retentionDays: 2555,
      objectHoldMode: "default-event-based-hold",
      retentionLock: false,
    });
    expect(buckets["regulatory-reports"]).toMatchObject({
      retentionDays: 2555,
      objectHoldMode: "none",
      retentionLock: true,
    });
  });

  it("supports environment-specific prefixes without changing canonical topic names", () => {
    const config = resolvePhase2AvInfraConfig({
      PHASE2_AV_ENVIRONMENT: "prod",
      PHASE2_AV_BUCKET_PREFIX: "drts-av-prod",
      PHASE2_AV_TOPIC_PREFIX: "drts.av.prod",
    });

    expect(config.environment).toBe("prod");
    expect(config.bucketPrefix).toBe("drts-av-prod");
    expect(config.topicPrefix).toBe("drts.av.prod");
    expect(config.kms.keyRing).toBe("drts-phase2-av-prod");
    expect(config.storageBuckets[0]?.name).toBe("raw-provider-events");
    expect(config.pubsubTopics[0]?.deadLetterTopic).toBe(
      "provider-events-dead-letter",
    );
  });

  it("matches the repo-local infra JSON contract for bucket retention and dead-letter topics", () => {
    const config = resolvePhase2AvInfraConfig({});
    const infraJsonPath = path.resolve(
      __dirname,
      "../../../../infra/gcp/phase2/av-sandbox-infra-config.json",
    );
    const infraConfig = JSON.parse(
      readFileSync(infraJsonPath, "utf8"),
    ) as {
      gcp: {
        storageBuckets: Array<{
          name: string;
          retentionDays: number;
          objectHoldMode: string;
          retentionLock: boolean;
        }>;
        pubsubTopics: Array<{
          name: string;
          retentionDays: number;
          ordering: boolean;
          deadLetterTopic?: string;
        }>;
        kms: {
          keyRingName: string;
          location: string;
          rotationPeriodDays: Record<string, number>;
        };
      };
    };

    expect(config.storageBuckets).toEqual(
      infraConfig.gcp.storageBuckets.map((bucket) => ({
        ...bucket,
        versioning: true,
        cmekKey: expect.any(String),
        purpose: expect.any(String),
      })),
    );
    expect(config.pubsubTopics).toEqual(
      infraConfig.gcp.pubsubTopics.map((topic) => ({
        ...topic,
        purpose: expect.any(String),
      })),
    );
    expect(config.kms.keyRing).toBe(
      infraConfig.gcp.kms.keyRingName.replace("<env>", config.environment),
    );
    expect(config.kms.location).toBe(infraConfig.gcp.kms.location);
    expect(
      Object.fromEntries(config.kms.keys.map((key) => [key.name, key.rotationPeriodDays])),
    ).toEqual(infraConfig.gcp.kms.rotationPeriodDays);
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
