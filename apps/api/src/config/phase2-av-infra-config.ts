export type Phase2AvBucketName =
  | "raw-provider-events"
  | "telemetry-archive"
  | "video-normal"
  | "video-incident-locked"
  | "investigation-bundles"
  | "regulatory-reports";

export type Phase2AvTopicName =
  | "provider-events-ingest"
  | "telemetry-normalized"
  | "video-ingest"
  | "evidence-manifest-created"
  | "regulatory-report-requested"
  | "dr-restore-verify";

export type Phase2AvObjectHoldMode =
  | "none"
  | "default-event-based-hold"
  | "default-retention-lock";

export interface Phase2AvBucketConfig {
  name: Phase2AvBucketName;
  purpose: string;
  versioning: true;
  retentionDays: number;
  objectHoldMode: Phase2AvObjectHoldMode;
  cmekKey: string;
}

export interface Phase2AvTopicConfig {
  name: Phase2AvTopicName;
  purpose: string;
  ordering: boolean;
  retentionDays: number;
  deadLetterTopic?: string;
}

export interface Phase2AvSecretConfig {
  name: string;
  purpose: string;
  accessors: string[];
}

export interface Phase2AvKmsKeyConfig {
  name: string;
  purpose: string;
  rotationPeriodDays: number;
}

export interface Phase2AvTelemetryFieldRule {
  field: string;
  required: boolean;
  qualityRule: string;
  breachAction: string;
}

export interface Phase2AvInfraConfig {
  configVersion: string;
  environment: string;
  bucketPrefix: string;
  topicPrefix: string;
  storageBuckets: Phase2AvBucketConfig[];
  pubsubTopics: Phase2AvTopicConfig[];
  kms: {
    keyRing: string;
    location: string;
    keys: Phase2AvKmsKeyConfig[];
  };
  secrets: Phase2AvSecretConfig[];
  telemetryFieldRules: Phase2AvTelemetryFieldRule[];
}

const DEFAULT_ENVIRONMENT = "staging";
const DEFAULT_BUCKET_PREFIX = "drts-phase2-av";
const DEFAULT_TOPIC_PREFIX = "drts.phase2.av";

function normalize(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function resolvePhase2AvInfraConfig(
  env: NodeJS.ProcessEnv = process.env,
): Phase2AvInfraConfig {
  const environment =
    normalize(env.PHASE2_AV_ENVIRONMENT) ??
    normalize(env.APP_ENV) ??
    DEFAULT_ENVIRONMENT;
  const bucketPrefix =
    normalize(env.PHASE2_AV_BUCKET_PREFIX) ?? DEFAULT_BUCKET_PREFIX;
  const topicPrefix =
    normalize(env.PHASE2_AV_TOPIC_PREFIX) ?? DEFAULT_TOPIC_PREFIX;

  return {
    configVersion: "2026-06-26",
    environment,
    bucketPrefix,
    topicPrefix,
    storageBuckets: [
      {
        name: "raw-provider-events",
        purpose: "Immutable intake for Tesla/provider payloads before normalization.",
        versioning: true,
        retentionDays: 30,
        objectHoldMode: "none",
        cmekKey: "provider-events",
      },
      {
        name: "telemetry-archive",
        purpose: "Normalized telemetry and state snapshots kept for replay and audit.",
        versioning: true,
        retentionDays: 365,
        objectHoldMode: "none",
        cmekKey: "telemetry-archive",
      },
      {
        name: "video-normal",
        purpose: "Routine vehicle video clips outside incident/legal escalation windows.",
        versioning: true,
        retentionDays: 30,
        objectHoldMode: "none",
        cmekKey: "video-normal",
      },
      {
        name: "video-incident-locked",
        purpose: "Incident-linked clips held for investigation and regulator access.",
        versioning: true,
        retentionDays: 2555,
        objectHoldMode: "default-event-based-hold",
        cmekKey: "video-incident-locked",
      },
      {
        name: "investigation-bundles",
        purpose: "Case-level manifests, checksums, and packaged evidence bundles.",
        versioning: true,
        retentionDays: 2555,
        objectHoldMode: "default-event-based-hold",
        cmekKey: "investigation-bundles",
      },
      {
        name: "regulatory-reports",
        purpose: "Submitted regulator-facing exports, manifests, and signed attestations.",
        versioning: true,
        retentionDays: 2555,
        objectHoldMode: "default-retention-lock",
        cmekKey: "regulatory-reports",
      },
    ],
    pubsubTopics: [
      {
        name: "provider-events-ingest",
        purpose: "Fan-out raw provider events into validation and normalization workers.",
        ordering: true,
        retentionDays: 7,
        deadLetterTopic: `${topicPrefix}.provider-events-dead-letter`,
      },
      {
        name: "telemetry-normalized",
        purpose: "Publish validated telemetry samples to downstream consumers and archives.",
        ordering: true,
        retentionDays: 7,
        deadLetterTopic: `${topicPrefix}.telemetry-normalized-dead-letter`,
      },
      {
        name: "video-ingest",
        purpose: "Coordinate clip upload, checksum seal, and evidence manifest linking.",
        ordering: true,
        retentionDays: 7,
        deadLetterTopic: `${topicPrefix}.video-ingest-dead-letter`,
      },
      {
        name: "evidence-manifest-created",
        purpose: "Trigger manifest verification and investigation bundle assembly.",
        ordering: true,
        retentionDays: 14,
        deadLetterTopic: `${topicPrefix}.evidence-manifest-dead-letter`,
      },
      {
        name: "regulatory-report-requested",
        purpose: "Drive regulator export generation and dual-control approvals.",
        ordering: true,
        retentionDays: 14,
        deadLetterTopic: `${topicPrefix}.regulatory-report-dead-letter`,
      },
      {
        name: "dr-restore-verify",
        purpose: "Run restore drills, checksum replay, and manifest verification during DR exercises.",
        ordering: false,
        retentionDays: 14,
      },
    ],
    kms: {
      keyRing: `${bucketPrefix}-${environment}`,
      location: "asia-east1",
      keys: [
        {
          name: "provider-events",
          purpose: "Encrypt raw provider event objects and the ingest dead-letter topic.",
          rotationPeriodDays: 90,
        },
        {
          name: "telemetry-archive",
          purpose: "Encrypt normalized telemetry archive objects.",
          rotationPeriodDays: 90,
        },
        {
          name: "video-normal",
          purpose: "Encrypt non-incident vehicle video storage.",
          rotationPeriodDays: 90,
        },
        {
          name: "video-incident-locked",
          purpose: "Encrypt incident video under tighter access control and hold workflows.",
          rotationPeriodDays: 60,
        },
        {
          name: "investigation-bundles",
          purpose: "Encrypt evidence manifests, checksums, and case bundles.",
          rotationPeriodDays: 60,
        },
        {
          name: "regulatory-reports",
          purpose: "Encrypt regulator-facing exports and signed report artifacts.",
          rotationPeriodDays: 60,
        },
      ],
    },
    secrets: [
      {
        name: "tesla-fleet-api-client-id",
        purpose: "Tesla Fleet API client identifier for provider pulls and command bridge auth.",
        accessors: ["api-runtime", "tesla-sync-worker"],
      },
      {
        name: "tesla-fleet-api-client-secret",
        purpose: "Tesla Fleet API client secret resolved only at runtime.",
        accessors: ["api-runtime", "tesla-sync-worker"],
      },
      {
        name: "tesla-fleet-api-private-key",
        purpose: "Command-bridge signing key material for provider-authenticated calls.",
        accessors: ["api-runtime", "tesla-command-worker"],
      },
      {
        name: "av-webhook-shared-secret",
        purpose: "Ingress secret for provider event/webhook verification.",
        accessors: ["api-runtime", "provider-ingest-worker"],
      },
      {
        name: "av-evidence-signing-secret",
        purpose: "Manifest signature and controlled-download attestation secret.",
        accessors: ["api-runtime", "evidence-bundle-worker"],
      },
    ],
    telemetryFieldRules: [
      {
        field: "externalVehicleRef",
        required: true,
        qualityRule: "Must be stable and map to one active sandbox vehicle.",
        breachAction: "Reject sample and page sandbox-governance owner after 5 consecutive misses.",
      },
      {
        field: "capturedAt",
        required: true,
        qualityRule: "Timestamp skew must stay within 120 seconds of ingest time.",
        breachAction: "Quarantine sample into raw-provider-events and mark telemetry feed degraded.",
      },
      {
        field: "locationLat",
        required: true,
        qualityRule: "Latitude must be within -90..90 and not null for motion events.",
        breachAction: "Fail normalization and increment data-quality incident counter.",
      },
      {
        field: "locationLng",
        required: true,
        qualityRule: "Longitude must be within -180..180 and not null for motion events.",
        breachAction: "Fail normalization and increment data-quality incident counter.",
      },
      {
        field: "speedMps",
        required: false,
        qualityRule: "If present, value must be >= 0 and < 90 m/s.",
        breachAction: "Clamp is forbidden; quarantine sample for review.",
      },
      {
        field: "batteryLevelPct",
        required: false,
        qualityRule: "If present, value must be within 0..100.",
        breachAction: "Drop field, keep sample, and raise provider-quality warning.",
      },
      {
        field: "autonomyState",
        required: true,
        qualityRule: "Must resolve to a known sandbox autonomy state enum for the active schema version.",
        breachAction: "Reject normalization and hold new AV dispatch for the affected vehicle.",
      },
      {
        field: "online",
        required: true,
        qualityRule: "Presence must be explicit; null is allowed only in raw intake, never in normalized telemetry.",
        breachAction: "Send to dead-letter topic and mark telemetry feed degraded.",
      },
      {
        field: "sourceSchemaVersion",
        required: true,
        qualityRule: "Version must match an enabled provider capability requirement.",
        breachAction: "Reject sample and open schema drift incident.",
      },
      {
        field: "sourceSignatureRef",
        required: false,
        qualityRule: "Required for command receipts, investigations, and regulator-bound events.",
        breachAction: "Block bundle sealing when signature reference is missing on evidentiary flows.",
      },
    ],
  };
}
