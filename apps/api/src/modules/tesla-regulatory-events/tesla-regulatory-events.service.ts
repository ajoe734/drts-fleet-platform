import {
  createHash,
  createPublicKey,
  createVerify,
  randomUUID,
} from "node:crypto";

import { HttpStatus, Injectable, Logger, Optional } from "@nestjs/common";
import type { PoolClient } from "pg";

import type {
  Phase2SourceMetadata,
  TeslaDisengagementCause,
  TeslaRegulatoryEventType,
} from "@drts/contracts";
import {
  TESLA_DISENGAGEMENT_CAUSES,
  TESLA_REGULATORY_EVENT_TYPES,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import {
  TeslaRegulatoryEventsRepository,
  type CreateTeslaRegulatoryCanonicalEventInput,
  type CreateTeslaRegulatoryRawEventInput,
  type TeslaRegulatoryRawEventRecord,
} from "./tesla-regulatory-events.repository";

const DEFAULT_PROVIDER_CODE = "tesla";
const DEFAULT_REPLAY_WINDOW_SECONDS = 300;
const DEFAULT_PAYLOAD_LIMIT_BYTES = 65_536;
const DEFAULT_PROVIDER_IDENTITIES = ["tesla-regulatory-sandbox"];
const SUPPORTED_SCHEMA_VERSIONS = new Set(["tesla.regulatory-event.v1"]);
const SUPPORTED_JWS_ALGORITHMS = new Set(["RS256", "ES256"]);

type TeslaRegulatoryIngressRequest = {
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
  rawBody?: Buffer;
  rawHeaders?: string[];
  requestId?: string;
};

type TeslaRegulatoryIngressEnvelope = {
  schemaVersion: string;
  providerEventId: string;
  occurredAt: string | null;
  record: Record<string, unknown>;
};

type TeslaRegulatoryCanonicalEnvelope = {
  schemaVersion: string;
  providerEventId: string;
  vehicleId: string;
  externalVehicleRef: string | null;
  eventType: TeslaRegulatoryEventType;
  occurredAt: string;
  location: { lat: number; lng: number } | null;
  speedMps: number | null;
  headingDeg: number | null;
  disengagementCause: TeslaDisengagementCause | null;
  providerReasonCode: string | null;
  safetyOperatorId: string | null;
  rocOperatorId: string | null;
  oddZoneId: string | null;
};

type VerifiedJws = {
  protectedHeader: Record<string, unknown>;
  keyId: string;
  algorithm: string;
  issuedAt: string;
  detachedCompact: string;
};

type CanonicalEventReceiptRef = {
  eventId: string;
};

type PersistedIngressResult = {
  rawEvent: TeslaRegulatoryRawEventRecord;
  canonicalEvent: CanonicalEventReceiptRef | null;
  status: TeslaRegulatoryIngressReceipt["status"];
  duplicate: boolean;
  rejectionError?: ApiRequestError;
};

export type TeslaRegulatoryIngressReceipt = {
  receiptId: string;
  providerCode: string;
  providerEventId: string;
  schemaVersion: string;
  payloadSha256: string;
  rawEventId: string | null;
  canonicalEventId: string | null;
  status: "accepted" | "duplicate" | "quarantined";
  duplicate: boolean;
  receivedAt: string;
};

@Injectable()
export class TeslaRegulatoryEventsService {
  private readonly logger = new Logger(TeslaRegulatoryEventsService.name);

  constructor(
    private readonly repository = new TeslaRegulatoryEventsRepository(),
    @Optional()
    private readonly auditNotificationService = new AuditNotificationService(),
  ) {}

  async ingest(
    request: TeslaRegulatoryIngressRequest,
  ): Promise<TeslaRegulatoryIngressReceipt> {
    try {
      const receivedAt = new Date().toISOString();
      const rawBody = this.resolveRawBody(request.body, request.rawBody);

      this.assertPayloadLimit(rawBody);

      const providerCode = this.resolveProviderCode(request.headers);
      const clientCert = this.resolveHeader(
        request.headers,
        "x-forwarded-client-cert",
        "x-ssl-client-subject-dn",
      );
      const providerIdentity = this.verifyProviderIdentity(clientCert);
      const verifiedJws = this.verifyDetachedJws(rawBody, request.headers);
      const payloadSha256 = createHash("sha256").update(rawBody).digest("hex");
      const payload = this.parsePayload(request.body);

      const rawEventInput = this.buildRawEventRecord({
        providerCode,
        providerIdentity,
        payload,
        payloadSha256,
        rawBody,
        rawHeaders: request.rawHeaders ?? [],
        verifiedJws,
        clientCert,
        receivedAt,
      });
      const persisted = await this.persistIngress(
        rawEventInput,
        payload,
        payloadSha256,
        providerIdentity,
        request.requestId,
      );

      if (persisted.rejectionError) {
        throw persisted.rejectionError;
      }

      if (persisted.status === "quarantined") {
        this.recordAudit(
          "ingress.quarantined_unknown_schema",
          payload.providerEventId,
          request.requestId,
          {
            providerCode,
            providerIdentity,
            schemaVersion: payload.schemaVersion,
            rawEventId: persisted.rawEvent.rawEventId,
          },
        );
        return this.buildReceipt(
          persisted.rawEvent,
          null,
          "quarantined",
          persisted.duplicate,
        );
      }

      if (persisted.duplicate) {
        this.recordAudit(
          "ingress.duplicate",
          payload.providerEventId,
          request.requestId,
          {
            providerCode,
            providerIdentity,
            rawEventId: persisted.rawEvent.rawEventId,
            canonicalEventId: persisted.rawEvent.canonicalEventId,
          },
        );
        return this.buildReceipt(
          persisted.rawEvent,
          persisted.canonicalEvent,
          "duplicate",
          true,
        );
      }

      this.recordAudit(
        "ingress.accepted",
        payload.providerEventId,
        request.requestId,
        {
          providerCode,
          providerIdentity,
          schemaVersion: payload.schemaVersion,
          rawEventId: persisted.rawEvent.rawEventId,
          canonicalEventId: persisted.canonicalEvent!.eventId,
        },
      );

      return this.buildReceipt(
        persisted.rawEvent,
        persisted.canonicalEvent,
        "accepted",
        false,
      );
    } catch (error) {
      this.recordRejectedIngressAudit(error, request);
      throw error;
    }
  }

  listRawEvents() {
    return this.repository.listRawEvents();
  }

  listCanonicalEvents() {
    return this.repository.listCanonicalEvents();
  }

  private resolveRawBody(body: unknown, rawBody?: Buffer) {
    if (rawBody && rawBody.length > 0) {
      return rawBody;
    }

    return Buffer.from(JSON.stringify(body ?? {}));
  }

  private assertPayloadLimit(rawBody: Buffer) {
    const maxBytes = Number.parseInt(
      process.env.TESLA_REGULATORY_MAX_PAYLOAD_BYTES ??
        `${DEFAULT_PAYLOAD_LIMIT_BYTES}`,
      10,
    );

    if (rawBody.byteLength <= maxBytes) {
      return;
    }

    throw new ApiRequestError(
      HttpStatus.PAYLOAD_TOO_LARGE,
      "PAYLOAD_TOO_LARGE",
      "Tesla regulatory event payload exceeded the configured size limit.",
      {
        maxBytes,
        actualBytes: rawBody.byteLength,
      },
    );
  }

  private resolveProviderCode(
    headers: Record<string, string | string[] | undefined>,
  ) {
    const providerCode =
      this.resolveHeader(headers, "x-provider-code") ?? DEFAULT_PROVIDER_CODE;
    const normalized = providerCode.trim().toLowerCase();

    if (normalized === DEFAULT_PROVIDER_CODE) {
      return normalized;
    }

    throw new ApiRequestError(
      HttpStatus.FORBIDDEN,
      "PROVIDER_NOT_ALLOWLISTED",
      "Tesla regulatory ingress rejected an unallowlisted provider code.",
      {
        providerCode,
      },
    );
  }

  private verifyProviderIdentity(clientCertHeader: string | null) {
    if (!clientCertHeader) {
      this.recordAudit(
        "ingress.rejected_missing_mtls_identity",
        null,
        undefined,
        {
          reason: "missing_client_certificate_header",
        },
      );
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "MTLS_IDENTITY_REQUIRED",
        "Tesla regulatory ingress requires a verified mTLS client identity.",
      );
    }

    const allowlist = (
      process.env.TESLA_REGULATORY_PROVIDER_IDENTITIES ??
      DEFAULT_PROVIDER_IDENTITIES.join(",")
    )
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const candidates = new Set<string>([clientCertHeader]);
    const cnMatch = clientCertHeader.match(/CN=([^,;"\s]+)/i);
    if (cnMatch?.[1]) {
      candidates.add(cnMatch[1]);
    }
    const uriMatch = clientCertHeader.match(/URI=([^,;"\s]+)/i);
    if (uriMatch?.[1]) {
      candidates.add(uriMatch[1]);
    }

    const matched = allowlist.find((allowed) => candidates.has(allowed));
    if (matched) {
      return matched;
    }

    this.recordAudit("ingress.rejected_mtls_identity", null, undefined, {
      allowlist,
      presentedIdentity: clientCertHeader,
    });
    throw new ApiRequestError(
      HttpStatus.FORBIDDEN,
      "MTLS_IDENTITY_NOT_ALLOWLISTED",
      "Tesla regulatory ingress rejected an unallowlisted mTLS client identity.",
      {
        presentedIdentity: clientCertHeader,
      },
    );
  }

  private verifyDetachedJws(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): VerifiedJws {
    const signature = this.resolveHeader(
      headers,
      "x-jws-signature",
      "x-provider-jws-signature",
    );
    if (!signature) {
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "JWS_SIGNATURE_REQUIRED",
        "Tesla regulatory ingress requires a detached JWS signature.",
      );
    }

    const parts = signature.split(".");
    if (parts.length !== 3 || parts[1] !== "") {
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "INVALID_DETACHED_JWS",
        "Tesla regulatory ingress requires compact detached JWS serialization.",
      );
    }

    const [protectedSegment, , signatureSegment] = parts;
    if (!protectedSegment || !signatureSegment) {
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "INVALID_DETACHED_JWS",
        "Tesla regulatory ingress requires compact detached JWS serialization.",
      );
    }

    const protectedHeader = this.parseProtectedHeader(protectedSegment);
    const algorithm = this.requiredString(protectedHeader.alg, "alg");
    const keyId = this.requiredString(protectedHeader.kid, "kid");
    if (!SUPPORTED_JWS_ALGORITHMS.has(algorithm)) {
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "UNSUPPORTED_JWS_ALGORITHM",
        "Tesla regulatory ingress rejected an unsupported JWS algorithm.",
        {
          alg: algorithm,
        },
      );
    }

    const issuedAtSeconds = this.resolveIssuedAtSeconds(protectedHeader);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const replayWindowSeconds = Number.parseInt(
      process.env.TESLA_REGULATORY_REPLAY_WINDOW_SECONDS ??
        `${DEFAULT_REPLAY_WINDOW_SECONDS}`,
      10,
    );

    if (Math.abs(nowSeconds - issuedAtSeconds) > replayWindowSeconds) {
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "JWS_REPLAY_WINDOW_EXCEEDED",
        "Tesla regulatory ingress rejected a signature outside the replay window.",
        {
          issuedAt: new Date(issuedAtSeconds * 1000).toISOString(),
          replayWindowSeconds,
        },
      );
    }

    const publicKeyPem = this.resolvePublicKeyPem(keyId);
    const verifier = createVerify("SHA256");
    verifier.update(`${protectedSegment}.${this.toBase64Url(rawBody)}`);
    verifier.end();

    let verified = false;
    try {
      verified = verifier.verify(
        {
          key: createPublicKey(publicKeyPem),
          ...(algorithm === "ES256"
            ? { dsaEncoding: "ieee-p1363" as const }
            : {}),
        },
        this.fromBase64Url(signatureSegment),
      );
    } catch {
      verified = false;
    }
    if (!verified) {
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "INVALID_JWS_SIGNATURE",
        "Tesla regulatory ingress rejected an invalid detached JWS signature.",
        {
          kid: keyId,
          alg: algorithm,
        },
      );
    }

    return {
      protectedHeader,
      keyId,
      algorithm,
      issuedAt: new Date(issuedAtSeconds * 1000).toISOString(),
      detachedCompact: signature,
    };
  }

  private parseProtectedHeader(protectedSegment: string) {
    try {
      const decoded = this.fromBase64Url(protectedSegment).toString("utf8");
      const parsed = JSON.parse(decoded) as Record<string, unknown>;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Fall through to the uniform invalid-header error below.
    }

    throw new ApiRequestError(
      HttpStatus.UNAUTHORIZED,
      "INVALID_JWS_HEADER",
      "Tesla regulatory ingress could not parse the detached JWS header.",
    );
  }

  private resolveIssuedAtSeconds(protectedHeader: Record<string, unknown>) {
    const candidate = protectedHeader.iat;
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return Math.trunc(candidate);
    }

    throw new ApiRequestError(
      HttpStatus.UNAUTHORIZED,
      "JWS_IAT_REQUIRED",
      "Tesla regulatory ingress requires `iat` in the detached JWS protected header.",
    );
  }

  private resolvePublicKeyPem(keyId: string) {
    const configuredMap = process.env.TESLA_REGULATORY_JWS_PUBLIC_KEYS_JSON;
    if (configuredMap) {
      const parsed = JSON.parse(configuredMap) as Record<string, string>;
      if (typeof parsed[keyId] === "string" && parsed[keyId].trim()) {
        return parsed[keyId];
      }
    }

    const fallbackKey = process.env.TESLA_REGULATORY_JWS_PUBLIC_KEY;
    const fallbackKid =
      process.env.TESLA_REGULATORY_JWS_DEFAULT_KID ?? "default";
    if (fallbackKey && keyId === fallbackKid) {
      return fallbackKey;
    }

    throw new ApiRequestError(
      HttpStatus.UNAUTHORIZED,
      "UNKNOWN_JWS_KEY",
      "Tesla regulatory ingress rejected an unknown JWS key identifier.",
      {
        kid: keyId,
      },
    );
  }

  private parsePayload(body: unknown): TeslaRegulatoryIngressEnvelope {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "INVALID_PAYLOAD",
        "Tesla regulatory ingress expects a JSON object payload.",
      );
    }

    const record = body as Record<string, unknown>;
    const schemaVersion = this.requiredString(
      record.schemaVersion,
      "schemaVersion",
    );
    const providerEventId = this.requiredString(
      record.providerEventId,
      "providerEventId",
    );

    return {
      schemaVersion,
      providerEventId,
      occurredAt: this.optionalIsoTimestamp(record.occurredAt),
      record,
    };
  }

  private parseCanonicalPayload(
    payload: TeslaRegulatoryIngressEnvelope,
  ): TeslaRegulatoryCanonicalEnvelope {
    const { record } = payload;

    return {
      schemaVersion: payload.schemaVersion,
      providerEventId: payload.providerEventId,
      vehicleId: this.requiredString(record.vehicleId, "vehicleId"),
      externalVehicleRef: this.optionalString(record.externalVehicleRef),
      eventType: this.requiredEventType(record.eventType),
      occurredAt: this.requiredIsoTimestamp(record.occurredAt, "occurredAt"),
      location: this.optionalLocation(record.location),
      speedMps: this.optionalNumber(record.speedMps),
      headingDeg: this.optionalNumber(record.headingDeg),
      disengagementCause: this.optionalDisengagementCause(
        record.disengagementCause,
      ),
      providerReasonCode: this.optionalString(record.providerReasonCode),
      safetyOperatorId: this.optionalString(record.safetyOperatorId),
      rocOperatorId: this.optionalString(record.rocOperatorId),
      oddZoneId: this.optionalString(record.oddZoneId),
    };
  }

  private buildRawEventRecord(input: {
    providerCode: string;
    providerIdentity: string;
    payload: TeslaRegulatoryIngressEnvelope;
    payloadSha256: string;
    rawBody: Buffer;
    rawHeaders: string[];
    verifiedJws: VerifiedJws;
    clientCert: string | null;
    receivedAt: string;
  }): CreateTeslaRegulatoryRawEventInput {
    return {
      providerCode: input.providerCode,
      providerIdentity: input.providerIdentity,
      providerEventId: input.payload.providerEventId,
      schemaVersion: input.payload.schemaVersion,
      payloadSha256: input.payloadSha256,
      payloadBody: input.rawBody.toString("utf8"),
      payloadBytes: input.rawBody.byteLength,
      rawHeaders: [...input.rawHeaders],
      jwsProtectedHeader: structuredClone(input.verifiedJws.protectedHeader),
      jwsSignature: input.verifiedJws.detachedCompact,
      jwsKid: input.verifiedJws.keyId,
      jwsAlg: input.verifiedJws.algorithm,
      jwsIssuedAt: input.verifiedJws.issuedAt,
      mtlsClientCert: input.clientCert ?? input.providerIdentity,
      mtlsFingerprint: this.extractCertFingerprint(input.clientCert),
      receivedAt: input.receivedAt,
      occurredAt: input.payload.occurredAt ?? input.receivedAt,
      normalizationStatus: SUPPORTED_SCHEMA_VERSIONS.has(
        input.payload.schemaVersion,
      )
        ? "pending"
        : "quarantined",
      canonicalEventId: null,
    };
  }

  private buildCanonicalEventRecord(
    rawEvent: Pick<TeslaRegulatoryRawEventRecord, "rawEventId" | "receivedAt">,
    payload: TeslaRegulatoryCanonicalEnvelope,
    providerCode: string,
    payloadSha256: string,
  ): CreateTeslaRegulatoryCanonicalEventInput {
    const signatureRef = `tesla-regulatory-raw:${rawEvent.rawEventId}`;
    const source: Phase2SourceMetadata = {
      sourceSystem: "tesla_fleet_api",
      sourceRef: payload.providerEventId,
      ingestedAt: rawEvent.receivedAt,
      recordedAt: payload.occurredAt,
      signatureRef,
      schemaVersion: payload.schemaVersion,
    };

    return {
      providerCode,
      providerEventId: payload.providerEventId,
      payloadSha256,
      rawEventId: rawEvent.rawEventId,
      vehicleId: payload.vehicleId,
      externalVehicleRef: payload.externalVehicleRef,
      eventType: payload.eventType,
      occurredAt: payload.occurredAt,
      location: payload.location,
      speedMps: payload.speedMps,
      headingDeg: payload.headingDeg,
      disengagementCause: payload.disengagementCause,
      providerReasonCode: payload.providerReasonCode,
      safetyOperatorId: payload.safetyOperatorId,
      rocOperatorId: payload.rocOperatorId,
      oddZoneId: payload.oddZoneId,
      source,
    };
  }

  private async persistIngress(
    rawEventInput: CreateTeslaRegulatoryRawEventInput,
    payload: TeslaRegulatoryIngressEnvelope,
    payloadSha256: string,
    providerIdentity: string,
    requestId?: string,
  ): Promise<PersistedIngressResult> {
    if (this.repository.isEnabled()) {
      return this.repository.withTransaction((executor) =>
        this.persistIngressWithExecutor(
          rawEventInput,
          payload,
          payloadSha256,
          providerIdentity,
          requestId,
          executor,
        ),
      );
    }

    return this.persistIngressWithExecutor(
      rawEventInput,
      payload,
      payloadSha256,
      providerIdentity,
      requestId,
    );
  }

  private async persistIngressWithExecutor(
    rawEventInput: CreateTeslaRegulatoryRawEventInput,
    payload: TeslaRegulatoryIngressEnvelope,
    payloadSha256: string,
    providerIdentity: string,
    requestId?: string,
    executor?: PoolClient,
  ): Promise<PersistedIngressResult> {
    const existing = await this.repository.findRawEventByProviderRef(
      rawEventInput.providerCode,
      rawEventInput.providerEventId,
      executor,
      executor ? { forUpdate: true } : undefined,
    );

    if (existing) {
      return this.handleExistingEvent(
        existing,
        payload,
        payloadSha256,
        providerIdentity,
        requestId,
        executor,
      );
    }

    const rawEventResult = await this.repository.createRawEventIfAbsent(
      rawEventInput,
      executor,
    );
    if (!rawEventResult.inserted) {
      return this.handleExistingEvent(
        rawEventResult.rawEvent,
        payload,
        payloadSha256,
        providerIdentity,
        requestId,
        executor,
      );
    }

    if (!SUPPORTED_SCHEMA_VERSIONS.has(payload.schemaVersion)) {
      return {
        rawEvent: rawEventResult.rawEvent,
        canonicalEvent: null,
        status: "quarantined",
        duplicate: false,
      };
    }

    const canonicalEventInput = this.buildCanonicalEventInput(
      payload,
      rawEventResult.rawEvent,
      rawEventInput.providerCode,
      payloadSha256,
    );
    if (canonicalEventInput instanceof ApiRequestError) {
      return {
        rawEvent: rawEventResult.rawEvent,
        canonicalEvent: null,
        status: "duplicate",
        duplicate: false,
        rejectionError: canonicalEventInput,
      };
    }

    const canonicalEvent = await this.repository.createCanonicalEvent(
      {
        ...canonicalEventInput,
        rawEventId: rawEventResult.rawEvent.rawEventId,
        source: {
          ...canonicalEventInput.source,
          ingestedAt: rawEventResult.rawEvent.receivedAt,
          signatureRef: `tesla-regulatory-raw:${rawEventResult.rawEvent.rawEventId}`,
        },
      },
      executor,
    );
    const attachedRawEvent =
      (await this.repository.attachCanonicalEvent(
        rawEventResult.rawEvent.rawEventId,
        canonicalEvent.eventId,
        executor,
      )) ?? rawEventResult.rawEvent;

    return {
      rawEvent: attachedRawEvent,
      canonicalEvent: {
        eventId: canonicalEvent.eventId,
      },
      status: "accepted",
      duplicate: false,
    };
  }

  private async handleExistingEvent(
    existing: TeslaRegulatoryRawEventRecord,
    payload: TeslaRegulatoryIngressEnvelope,
    payloadSha256: string,
    providerIdentity: string,
    requestId: string | undefined,
    executor?: PoolClient,
  ): Promise<PersistedIngressResult> {
    if (existing.payloadSha256 !== payloadSha256) {
      this.recordAudit(
        "ingress.security_incident_hash_mismatch",
        existing.providerEventId,
        requestId,
        {
          providerCode: existing.providerCode,
          providerIdentity,
          existingPayloadSha256: existing.payloadSha256,
          incomingPayloadSha256: payloadSha256,
          rawEventId: existing.rawEventId,
        },
      );
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PROVIDER_EVENT_HASH_MISMATCH",
        "Tesla regulatory ingress detected a payload hash mismatch for an existing provider event id.",
        {
          providerEventId: existing.providerEventId,
        },
      );
    }

    const canonicalEventInput = this.resolveDuplicateCanonicalEventInput(
      existing,
      payload,
      existing.providerCode,
      payloadSha256,
    );
    if (canonicalEventInput instanceof ApiRequestError) {
      return {
        rawEvent: existing,
        canonicalEvent: existing.canonicalEventId
          ? { eventId: existing.canonicalEventId }
          : null,
        status: "duplicate",
        duplicate: true,
        rejectionError: canonicalEventInput,
      };
    }

    if (
      canonicalEventInput &&
      existing.normalizationStatus !== "quarantined" &&
      !existing.canonicalEventId
    ) {
      const canonicalEvent =
        (await this.repository.findCanonicalEventByProviderRef(
          existing.providerCode,
          existing.providerEventId,
          executor,
        )) ??
        (await this.repository.createCanonicalEvent(
          {
            ...canonicalEventInput,
            rawEventId: existing.rawEventId,
            source: {
              ...canonicalEventInput.source,
              ingestedAt: existing.receivedAt,
              signatureRef: `tesla-regulatory-raw:${existing.rawEventId}`,
            },
          },
          executor,
        ));
      const attachedRawEvent = (await this.repository.attachCanonicalEvent(
        existing.rawEventId,
        canonicalEvent.eventId,
        executor,
      )) ?? {
        ...existing,
        canonicalEventId: canonicalEvent.eventId,
        normalizationStatus: "accepted",
      };

      this.recordAudit(
        "ingress.recovered_missing_canonical_attachment",
        existing.providerEventId,
        requestId,
        {
          providerCode: existing.providerCode,
          providerIdentity,
          rawEventId: existing.rawEventId,
          canonicalEventId: canonicalEvent.eventId,
        },
      );

      return {
        rawEvent: attachedRawEvent,
        canonicalEvent: {
          eventId: canonicalEvent.eventId,
        },
        status: "duplicate",
        duplicate: true,
      };
    }

    return {
      rawEvent: existing,
      canonicalEvent: existing.canonicalEventId
        ? ({
            eventId: existing.canonicalEventId,
          } as CanonicalEventReceiptRef)
        : null,
      status:
        existing.normalizationStatus === "quarantined"
          ? "quarantined"
          : "duplicate",
      duplicate: true,
    };
  }

  private buildCanonicalEventInput(
    payload: TeslaRegulatoryIngressEnvelope,
    rawEvent: Pick<TeslaRegulatoryRawEventRecord, "rawEventId" | "receivedAt">,
    providerCode: string,
    payloadSha256: string,
  ): CreateTeslaRegulatoryCanonicalEventInput | ApiRequestError {
    try {
      return this.buildCanonicalEventRecord(
        rawEvent,
        this.parseCanonicalPayload(payload),
        providerCode,
        payloadSha256,
      );
    } catch (error) {
      if (error instanceof ApiRequestError) {
        return error;
      }

      throw error;
    }
  }

  private resolveDuplicateCanonicalEventInput(
    existing: TeslaRegulatoryRawEventRecord,
    payload: TeslaRegulatoryIngressEnvelope,
    providerCode: string,
    payloadSha256: string,
  ): CreateTeslaRegulatoryCanonicalEventInput | ApiRequestError | null {
    if (
      !SUPPORTED_SCHEMA_VERSIONS.has(payload.schemaVersion) ||
      existing.normalizationStatus === "quarantined" ||
      existing.canonicalEventId
    ) {
      return null;
    }

    return this.buildCanonicalEventInput(
      payload,
      existing,
      providerCode,
      payloadSha256,
    );
  }

  private buildReceipt(
    rawEvent: TeslaRegulatoryRawEventRecord,
    canonicalEvent: CanonicalEventReceiptRef | null,
    status: TeslaRegulatoryIngressReceipt["status"],
    duplicate: boolean,
  ): TeslaRegulatoryIngressReceipt {
    return {
      receiptId: randomUUID(),
      providerCode: rawEvent.providerCode,
      providerEventId: rawEvent.providerEventId,
      schemaVersion: rawEvent.schemaVersion,
      payloadSha256: rawEvent.payloadSha256,
      rawEventId: rawEvent.rawEventId,
      canonicalEventId: canonicalEvent?.eventId ?? rawEvent.canonicalEventId,
      status,
      duplicate,
      receivedAt: rawEvent.receivedAt,
    };
  }

  private recordAudit(
    actionName: string,
    resourceId: string | null,
    requestId: string | undefined,
    details: Record<string, unknown>,
  ) {
    this.auditNotificationService.recordAuditLog({
      actorId: null,
      actorType: "system",
      tenantId: null,
      moduleName: "tesla-regulatory-events",
      actionName,
      resourceType: "tesla_regulatory_event_ingress",
      resourceId,
      newValuesSummary: details,
      ...(requestId ? { requestId } : {}),
    });
  }

  private recordRejectedIngressAudit(
    error: unknown,
    request: TeslaRegulatoryIngressRequest,
  ) {
    if (!(error instanceof ApiRequestError)) {
      return;
    }

    const response = error.getResponse();
    const envelope =
      response && typeof response === "object" && "error" in response
        ? (response as {
            error?: {
              code?: string;
              details?: Record<string, unknown>;
            };
          })
        : null;
    const code = envelope?.error?.code;
    if (!code) {
      return;
    }

    if (
      code === "PROVIDER_EVENT_HASH_MISMATCH" ||
      code === "MTLS_IDENTITY_NOT_ALLOWLISTED" ||
      code === "MTLS_IDENTITY_REQUIRED"
    ) {
      return;
    }

    this.recordAudit(
      `ingress.rejected_${code.toLowerCase()}`,
      null,
      request.requestId,
      {
        ...envelope?.error?.details,
        headerKeys: Object.keys(request.headers),
      },
    );
    this.logger.warn(`Rejected Tesla regulatory ingress with code ${code}.`);
  }

  private resolveHeader(
    headers: Record<string, string | string[] | undefined>,
    ...candidates: string[]
  ) {
    for (const candidate of candidates) {
      const value = headers[candidate];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
      if (Array.isArray(value) && value[0]?.trim()) {
        return value[0].trim();
      }
    }

    return null;
  }

  private requiredString(value: unknown, fieldName: string) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    throw new ApiRequestError(
      HttpStatus.BAD_REQUEST,
      "INVALID_PAYLOAD",
      `Tesla regulatory ingress requires \`${fieldName}\`.`,
      {
        field: fieldName,
      },
    );
  }

  private optionalString(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  private requiredIsoTimestamp(value: unknown, fieldName: string) {
    const timestamp = this.requiredString(value, fieldName);
    const parsed = new Date(timestamp);
    if (Number.isNaN(parsed.getTime())) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "INVALID_PAYLOAD",
        `Tesla regulatory ingress requires \`${fieldName}\` to be an ISO timestamp.`,
        {
          field: fieldName,
        },
      );
    }

    return parsed.toISOString();
  }

  private optionalNumber(value: unknown) {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    throw new ApiRequestError(
      HttpStatus.BAD_REQUEST,
      "INVALID_PAYLOAD",
      "Tesla regulatory ingress encountered a non-numeric field.",
    );
  }

  private optionalIsoTimestamp(value: unknown) {
    if (typeof value !== "string" || !value.trim()) {
      return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  private optionalLocation(value: unknown) {
    if (value === null || value === undefined) {
      return null;
    }

    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "INVALID_PAYLOAD",
        "Tesla regulatory ingress requires `location` to be an object.",
      );
    }

    const record = value as Record<string, unknown>;
    return {
      lat: this.requiredFiniteNumber(record.lat, "location.lat"),
      lng: this.requiredFiniteNumber(record.lng, "location.lng"),
    };
  }

  private requiredFiniteNumber(value: unknown, fieldName: string) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    throw new ApiRequestError(
      HttpStatus.BAD_REQUEST,
      "INVALID_PAYLOAD",
      `Tesla regulatory ingress requires \`${fieldName}\` to be numeric.`,
      {
        field: fieldName,
      },
    );
  }

  private requiredEventType(value: unknown): TeslaRegulatoryEventType {
    const eventType = this.requiredString(value, "eventType");
    if (
      (TESLA_REGULATORY_EVENT_TYPES as readonly string[]).includes(eventType)
    ) {
      return eventType as TeslaRegulatoryEventType;
    }

    throw new ApiRequestError(
      HttpStatus.BAD_REQUEST,
      "INVALID_PAYLOAD",
      "Tesla regulatory ingress encountered an unknown event type.",
      {
        eventType,
      },
    );
  }

  private optionalDisengagementCause(
    value: unknown,
  ): TeslaDisengagementCause | null {
    const cause = this.optionalString(value);
    if (!cause) {
      return null;
    }

    if ((TESLA_DISENGAGEMENT_CAUSES as readonly string[]).includes(cause)) {
      return cause as TeslaDisengagementCause;
    }

    throw new ApiRequestError(
      HttpStatus.BAD_REQUEST,
      "INVALID_PAYLOAD",
      "Tesla regulatory ingress encountered an unknown disengagement cause.",
      {
        disengagementCause: cause,
      },
    );
  }

  private extractCertFingerprint(clientCertHeader: string | null) {
    if (!clientCertHeader) {
      return null;
    }

    const fingerprintMatch = clientCertHeader.match(
      /(sha256|fingerprint)=([A-Za-z0-9:+/=-]+)/i,
    );
    return fingerprintMatch?.[2] ?? null;
  }

  private toBase64Url(buffer: Buffer) {
    return buffer
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  private fromBase64Url(value: string) {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padding =
      normalized.length % 4 === 0
        ? ""
        : "=".repeat(4 - (normalized.length % 4));
    return Buffer.from(`${normalized}${padding}`, "base64");
  }
}
