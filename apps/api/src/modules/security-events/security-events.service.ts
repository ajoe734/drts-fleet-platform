import { Injectable, Optional } from "@nestjs/common";

import type {
  IdentityContext,
  SecurityEventMatrixEntry,
  SecurityEventQuery,
  SecurityEventRecord,
} from "@drts/contracts";

import {
  SECURITY_EVENT_MATRIX,
  SECURITY_EVENT_POLICY_VERSION,
} from "../../common/audit/security-event-matrix";
import {
  buildSecurityEventRecord,
  type CreateSecurityEventInput,
} from "../../common/audit/security-event-sanitizer";
import {
  SecurityEventsRepository,
  type SecurityEventQueryExecutor,
} from "./security-events.repository";

const MAX_IN_MEMORY_SECURITY_EVENTS = 1000;

@Injectable()
export class SecurityEventsService {
  private recentEvents: SecurityEventRecord[] = [];

  constructor(
    @Optional()
    private readonly securityEventsRepository?: SecurityEventsRepository,
  ) {}

  isEnabled() {
    return this.securityEventsRepository?.isEnabled() ?? false;
  }

  listMatrix(): readonly SecurityEventMatrixEntry[] {
    return SECURITY_EVENT_MATRIX;
  }

  async listEvents(
    identity: IdentityContext | null,
    query: SecurityEventQuery = {},
  ) {
    const scopedQuery =
      identity?.realm === "tenant" && identity.tenantId
        ? { ...query, tenantId: identity.tenantId }
        : query;

    if (this.securityEventsRepository?.isEnabled()) {
      return this.securityEventsRepository.findMany(scopedQuery);
    }

    return this.filterMemory(scopedQuery);
  }

  recordEvent(input: CreateSecurityEventInput) {
    const record = buildSecurityEventRecord({
      ...input,
      policyVersion: SECURITY_EVENT_POLICY_VERSION,
    });
    this.pushRecent(record);
    if (this.securityEventsRepository?.isEnabled()) {
      void this.securityEventsRepository.append(record).catch((error) => {
        this.securityEventsRepository?.reportPersistenceFailure(
          error,
          record.eventType,
        );
      });
    }
    return record;
  }

  async recordEventRequired(
    input: CreateSecurityEventInput,
    executor?: SecurityEventQueryExecutor,
  ) {
    const record = buildSecurityEventRecord({
      ...input,
      policyVersion: SECURITY_EVENT_POLICY_VERSION,
    });

    try {
      if (this.securityEventsRepository?.isEnabled()) {
        await this.securityEventsRepository.append(record, executor);
      }
      this.pushRecent(record);
      return record;
    } catch (error) {
      this.securityEventsRepository?.reportPersistenceFailure(
        error,
        `${record.eventType} required`,
      );
      throw error;
    }
  }

  private pushRecent(record: SecurityEventRecord) {
    this.recentEvents = [record, ...this.recentEvents].slice(
      0,
      MAX_IN_MEMORY_SECURITY_EVENTS,
    );
  }

  private filterMemory(query: SecurityEventQuery) {
    const requestedLimit =
      typeof query.limit === "number" && Number.isFinite(query.limit)
        ? query.limit
        : 100;

    return this.recentEvents
      .filter((record) => {
        if (query.tenantId && record.tenantId !== query.tenantId) {
          return false;
        }
        if (query.partnerId && record.partnerId !== query.partnerId) {
          return false;
        }
        if (query.actorId && record.actorId !== query.actorId) {
          return false;
        }
        if (query.eventFamily && record.eventFamily !== query.eventFamily) {
          return false;
        }
        if (query.eventType && record.eventType !== query.eventType) {
          return false;
        }
        if (query.outcome && record.outcome !== query.outcome) {
          return false;
        }
        return true;
      })
      .slice(0, Math.min(Math.max(requestedLimit, 1), 500));
  }
}
