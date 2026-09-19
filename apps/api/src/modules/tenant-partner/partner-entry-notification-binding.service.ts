// PartnerEntryNotificationBinding governance — SR-PARTNER-NOTIFY-ROUTE-20260917
// §3.1/§3.2. Precise entry -> webhook binding (never a tenant-wide fanout
// list), version-guarded mutation, and the test_pending -> ready gate that
// requires a successful `passenger.notification.test.v1` dispatch against
// the *current* endpoint configuration before a binding may serve real
// events. Does not implement transport, DI wiring or the consumer outbox
// state machine — dispatch of the binding test event is delegated to the
// already-implemented `PartnerNotificationDispatchFacade`
// (SR-PARTNER-NOTIFY-ACK-20260917), never reimplemented here.

import { randomUUID } from "node:crypto";

import { HttpStatus, Injectable, Optional } from "@nestjs/common";

import type {
  PartnerEntryNotificationBinding,
  PartnerEntryNotificationBindingState,
  PartnerNotificationAcceptedAck,
  PartnerNotificationTypedFailure,
  PartnerPassengerEventType,
  PartnerPassengerNotificationTestWirePayload,
  TenantWebhookEndpoint,
} from "@drts/contracts";
import {
  PARTNER_NOTIFICATION_TEST_EXTERNAL_EVENT,
  PARTNER_PASSENGER_EVENT_TO_EXTERNAL_NAME,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { PartnerNotificationDispatchFacade } from "./partner-notification-dispatch.facade";
import {
  PartnerEntryNotificationBindingRepository,
  type BindingWriteOutcome,
} from "./partner-entry-notification-binding.repository";
import { TenantPartnerService } from "./tenant-partner.service";

const VALID_EVENT_TYPES: readonly PartnerPassengerEventType[] = [
  "assignment_disclosure_ready",
  "assignment_replaced",
  "eta_changed",
  "driver_arrived",
  "receipt_ready",
];

export type PutPartnerEntryNotificationBindingCommand = {
  webhookId: string;
  eventTypes: PartnerPassengerEventType[];
  expectedVersion: number;
};

export type TestPartnerEntryNotificationBindingResult =
  | { kind: "accepted"; ack: PartnerNotificationAcceptedAck }
  | { kind: "failed"; failure: PartnerNotificationTypedFailure };

import { computeEndpointFingerprint } from "./partner-notification-fingerprint";
export { computeEndpointFingerprint } from "./partner-notification-fingerprint";

@Injectable()
export class PartnerEntryNotificationBindingService {
  constructor(
    private readonly repository: PartnerEntryNotificationBindingRepository,
    private readonly tenantPartnerService: TenantPartnerService,
    @Optional()
    private readonly dispatchFacade?: PartnerNotificationDispatchFacade,
  ) {}

  async getBinding(
    entrySlug: string,
    identity: BootstrapRequestIdentity | null,
  ): Promise<PartnerEntryNotificationBinding> {
    const entry = this.requireEntryInScope(entrySlug, identity);
    const binding = await this.repository.findByEntrySlug(entry.entrySlug);
    if (!binding) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "PARTNER_NOTIFICATION_BINDING_NOT_FOUND",
        "No notification binding has been configured for this entry yet.",
        { entrySlug: entry.entrySlug },
      );
    }
    return binding;
  }

  async putBinding(
    entrySlug: string,
    command: PutPartnerEntryNotificationBindingCommand,
    identity: BootstrapRequestIdentity | null,
  ): Promise<PartnerEntryNotificationBinding> {
    const entry = this.requireEntryInScope(entrySlug, identity);
    const eventTypes = this.requireValidEventTypes(command.eventTypes);
    const webhookId = command.webhookId?.trim();
    if (!webhookId) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PARTNER_NOTIFICATION_BINDING_WEBHOOK_ID_REQUIRED",
        "webhookId is required.",
      );
    }
    const endpoint = this.requireTenantWebhookEndpoint(entry.tenantId, webhookId);
    this.requireEventsSubscribable(endpoint, eventTypes);

    const outcome = await this.repository.put({
      entrySlug: entry.entrySlug,
      tenantId: entry.tenantId,
      partnerId: entry.partnerId,
      webhookId: endpoint.webhookId,
      eventTypes,
      expectedVersion: command.expectedVersion,
      now: new Date().toISOString(),
    });
    return this.requireWritten(outcome, entry.entrySlug);
  }

  async testBinding(
    entrySlug: string,
    identity: BootstrapRequestIdentity | null,
  ): Promise<TestPartnerEntryNotificationBindingResult> {
    const entry = this.requireEntryInScope(entrySlug, identity);
    const binding = await this.repository.findByEntrySlug(entry.entrySlug);
    if (!binding) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "PARTNER_NOTIFICATION_BINDING_NOT_FOUND",
        "No notification binding has been configured for this entry yet.",
        { entrySlug: entry.entrySlug },
      );
    }
    const endpoint = this.requireTenantWebhookEndpoint(
      entry.tenantId,
      binding.webhookId,
    );
    if (!this.dispatchFacade) {
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "PARTNER_NOTIFICATION_DISPATCH_UNAVAILABLE",
        "The partner notification dispatch façade is not available in this deployment.",
      );
    }

    const now = new Date().toISOString();
    const notificationId = `binding_test_${randomUUID()}`;
    const wirePayload: PartnerPassengerNotificationTestWirePayload = {
      event: PARTNER_NOTIFICATION_TEST_EXTERNAL_EVENT,
      deliveryId: randomUUID(),
      occurredAt: now,
      tenantId: entry.tenantId,
      data: {
        schemaVersion: "1.0",
        notificationId,
        partnerEntrySlug: entry.entrySlug,
        message: "DRTS partner notification binding test — no real ride.",
      },
    };

    const outcome = await this.dispatchFacade.dispatchNotificationAttemptByWebhookId(
      {
        tenantId: entry.tenantId,
        webhookId: binding.webhookId,
        wirePayload,
      },
    );

    if (outcome.kind === "accepted") {
      const fingerprint = computeEndpointFingerprint(endpoint);
      const writeOutcome = await this.repository.setValidated({
        entrySlug: entry.entrySlug,
        expectedVersion: binding.version,
        validatedEndpointFingerprint: fingerprint,
        now,
      });
      if (writeOutcome.outcome === "version_conflict") {
        throw new ApiRequestError(
          HttpStatus.CONFLICT,
          "PARTNER_NOTIFICATION_BINDING_VERSION_CONFLICT",
          "The binding was modified concurrently; re-test against the current version.",
          { entrySlug: entry.entrySlug, expectedVersion: binding.version },
        );
      }
      return { kind: "accepted", ack: outcome.ack };
    }

    return { kind: "failed", failure: outcome.failure };
  }

  async enableBinding(
    entrySlug: string,
    expectedVersion: number,
    identity: BootstrapRequestIdentity | null,
  ): Promise<PartnerEntryNotificationBinding> {
    const entry = this.requireEntryInScope(entrySlug, identity);
    const binding = await this.repository.findByEntrySlug(entry.entrySlug);
    if (!binding) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "PARTNER_NOTIFICATION_BINDING_NOT_FOUND",
        "No notification binding has been configured for this entry yet.",
        { entrySlug: entry.entrySlug },
      );
    }
    if (binding.version !== expectedVersion) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PARTNER_NOTIFICATION_BINDING_VERSION_CONFLICT",
        "The binding was modified concurrently.",
        { entrySlug: entry.entrySlug, expectedVersion, actualVersion: binding.version },
      );
    }
    const endpoint = this.requireTenantWebhookEndpoint(
      entry.tenantId,
      binding.webhookId,
    );
    const currentFingerprint = computeEndpointFingerprint(endpoint);
    if (
      !binding.validatedAt ||
      binding.validatedEndpointFingerprint !== currentFingerprint
    ) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PARTNER_NOTIFICATION_BINDING_NOT_VALIDATED",
        "The binding has no successful test against the current endpoint configuration; run the binding test again before enabling.",
        { entrySlug: entry.entrySlug },
      );
    }

    const outcome = await this.repository.setState({
      entrySlug: entry.entrySlug,
      expectedVersion,
      nextState: "ready",
      now: new Date().toISOString(),
    });
    return this.requireWritten(outcome, entry.entrySlug);
  }

  async disableBinding(
    entrySlug: string,
    expectedVersion: number,
    identity: BootstrapRequestIdentity | null,
  ): Promise<PartnerEntryNotificationBinding> {
    const entry = this.requireEntryInScope(entrySlug, identity);
    const outcome = await this.repository.setState({
      entrySlug: entry.entrySlug,
      expectedVersion,
      nextState: "disabled",
      now: new Date().toISOString(),
    });
    return this.requireWritten(outcome, entry.entrySlug);
  }

  private requireWritten(
    outcome: BindingWriteOutcome,
    entrySlug: string,
  ): PartnerEntryNotificationBinding {
    if (outcome.outcome === "version_conflict") {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PARTNER_NOTIFICATION_BINDING_VERSION_CONFLICT",
        "The binding's expectedVersion does not match the current stored version.",
        {
          entrySlug,
          currentVersion: outcome.current?.version ?? null,
        },
      );
    }
    return outcome.binding;
  }

  private requireValidEventTypes(
    eventTypes: PartnerPassengerEventType[] | undefined,
  ): PartnerPassengerEventType[] {
    if (!Array.isArray(eventTypes) || eventTypes.length === 0) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PARTNER_NOTIFICATION_BINDING_EVENT_TYPES_REQUIRED",
        "eventTypes must be a non-empty array.",
      );
    }
    const deduped = [...new Set(eventTypes)];
    const invalid = deduped.filter(
      (eventType) => !VALID_EVENT_TYPES.includes(eventType),
    );
    if (invalid.length > 0) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PARTNER_NOTIFICATION_BINDING_EVENT_TYPES_INVALID",
        "eventTypes contains values outside the five passenger notification events.",
        { invalid },
      );
    }
    return deduped;
  }

  /**
   * Resolves the entry via the existing platform partner-entry registry
   * (never re-derived from request-body claims) and checks the caller's
   * resource scope: a platform-wide identity (`tenantId === null`) passes,
   * while a tenant-scoped identity must match the entry's own tenant.
   */
  private requireEntryInScope(
    entrySlugInput: string,
    identity: BootstrapRequestIdentity | null,
  ) {
    const entrySlug = entrySlugInput?.trim();
    if (!entrySlug) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "PARTNER_NOTIFICATION_BINDING_ENTRY_SLUG_REQUIRED",
        "entrySlug is required.",
      );
    }
    const entry = this.tenantPartnerService.getPartnerEntry(entrySlug);
    if (identity?.tenantId && identity.tenantId !== entry.tenantId) {
      throw new ApiRequestError(
        HttpStatus.FORBIDDEN,
        "PARTNER_NOTIFICATION_BINDING_TENANT_SCOPE_DENIED",
        "The caller's tenant scope does not include this partner entry.",
        { entrySlug, tenantId: identity.tenantId },
      );
    }
    if (!entry.activeFlag) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PARTNER_NOTIFICATION_BINDING_ENTRY_INACTIVE",
        "The partner entry is not active.",
        { entrySlug },
      );
    }
    return entry;
  }

  private requireTenantWebhookEndpoint(
    tenantId: string,
    webhookId: string,
  ): TenantWebhookEndpoint {
    const endpoint = this.tenantPartnerService
      .listWebhookEndpoints(tenantId)
      .find((candidate) => candidate.webhookId === webhookId);
    if (!endpoint) {
      throw new ApiRequestError(
        HttpStatus.NOT_FOUND,
        "WEBHOOK_NOT_FOUND",
        "The tenant webhook endpoint could not be found.",
        { tenantId, webhookId },
      );
    }
    return endpoint;
  }

  /**
   * §3.1: the events a binding wants to send must already be in the
   * referenced endpoint's own subscription allowlist — a binding cannot
   * grant an endpoint access to `passenger.*` events it never subscribed to.
   */
  private requireEventsSubscribable(
    endpoint: TenantWebhookEndpoint,
    eventTypes: PartnerPassengerEventType[],
  ) {
    const endpointEvents = new Set(endpoint.events);
    const missing = eventTypes.filter(
      (eventType) =>
        !endpointEvents.has(PARTNER_PASSENGER_EVENT_TO_EXTERNAL_NAME[eventType]),
    );
    if (missing.length > 0) {
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "PARTNER_NOTIFICATION_BINDING_ENDPOINT_EVENTS_MISSING",
        "The referenced webhook endpoint is not subscribed to one or more requested events.",
        { webhookId: endpoint.webhookId, missing },
      );
    }
  }
}

export type { PartnerEntryNotificationBindingState };
