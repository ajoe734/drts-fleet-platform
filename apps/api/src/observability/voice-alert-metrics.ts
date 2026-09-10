export interface VoiceAlertLabels {
  language: string;
  route_profile_version: number | string;
  provider: string;
  brand_id: string;
}

function formatLabels(labels: VoiceAlertLabels): string {
  const parts = [
    `brand_id="${labels.brand_id}"`,
    `language="${labels.language}"`,
    `provider="${labels.provider}"`,
    `route_profile_version="${labels.route_profile_version}"`,
  ];
  return parts.join(",");
}

export class VoiceAlertMetrics {
  private static instance: VoiceAlertMetrics | null = null;

  private readonly errorOrDuplicateCounter = new Map<string, number>();
  private readonly crossScopeDenialsCounter = new Map<string, number>();
  private readonly pendingCommandTimeoutsCounter = new Map<string, number>();
  private readonly recordingCheckpointFailuresCounter = new Map<string, number>();
  private readonly providerOverflowCounter = new Map<string, number>();
  private readonly handoffQueueUnansweredGauge = new Map<string, number>();
  private readonly dispatchUnavailableCounter = new Map<string, number>();
  private readonly callUnitCostGauge = new Map<string, number>();
  private readonly workerLeaseConflictsCounter = new Map<string, number>();

  private constructor() {}

  public static getInstance(): VoiceAlertMetrics {
    if (!VoiceAlertMetrics.instance) {
      VoiceAlertMetrics.instance = new VoiceAlertMetrics();
    }
    return VoiceAlertMetrics.instance;
  }

  public recordErrorOrDuplicateBooking(labels: VoiceAlertLabels, count = 1): void {
    const key = formatLabels(labels);
    this.errorOrDuplicateCounter.set(key, (this.errorOrDuplicateCounter.get(key) ?? 0) + count);
  }

  public recordCrossScopeDenial(labels: VoiceAlertLabels, count = 1): void {
    const key = formatLabels(labels);
    this.crossScopeDenialsCounter.set(key, (this.crossScopeDenialsCounter.get(key) ?? 0) + count);
  }

  public recordPendingCommandTimeout(labels: VoiceAlertLabels, count = 1): void {
    const key = formatLabels(labels);
    this.pendingCommandTimeoutsCounter.set(key, (this.pendingCommandTimeoutsCounter.get(key) ?? 0) + count);
  }

  public recordRecordingCheckpointFailure(labels: VoiceAlertLabels, count = 1): void {
    const key = formatLabels(labels);
    this.recordingCheckpointFailuresCounter.set(key, (this.recordingCheckpointFailuresCounter.get(key) ?? 0) + count);
  }

  public recordProviderOverflow(labels: VoiceAlertLabels, count = 1): void {
    const key = formatLabels(labels);
    this.providerOverflowCounter.set(key, (this.providerOverflowCounter.get(key) ?? 0) + count);
  }

  public setHandoffQueueUnansweredCount(labels: VoiceAlertLabels, value: number): void {
    const key = formatLabels(labels);
    this.handoffQueueUnansweredGauge.set(key, value);
  }

  public recordDispatchUnavailable(labels: VoiceAlertLabels, count = 1): void {
    const key = formatLabels(labels);
    this.dispatchUnavailableCounter.set(key, (this.dispatchUnavailableCounter.get(key) ?? 0) + count);
  }

  public setCallUnitCost(labels: VoiceAlertLabels, costTwd: number): void {
    const key = formatLabels(labels);
    this.callUnitCostGauge.set(key, costTwd);
  }

  public recordWorkerLeaseConflict(labels: VoiceAlertLabels, count = 1): void {
    const key = formatLabels(labels);
    this.workerLeaseConflictsCounter.set(key, (this.workerLeaseConflictsCounter.get(key) ?? 0) + count);
  }

  public recordCrossScopeAccessDenied(labels: VoiceAlertLabels, count = 1): void {
    this.recordCrossScopeDenial(labels, count);
  }

  public recordProviderCapacityExceeded(labels: VoiceAlertLabels, count = 1): void {
    this.recordProviderOverflow(labels, count);
  }

  public recordHandoffUnansweredBreach(labels: VoiceAlertLabels, value = 1): void {
    this.setHandoffQueueUnansweredCount(labels, value);
  }

  public recordDispatchUnavailableSpike(labels: VoiceAlertLabels, count = 1): void {
    this.recordDispatchUnavailable(labels, count);
  }

  public recordCostAnomalySpikeRatio(labels: VoiceAlertLabels, value: number): void {
    this.setCallUnitCost(labels, value);
  }

  public toPrometheusFormat(): string {
    const lines: string[] = [];

    lines.push("# HELP drts_voice_error_or_duplicate_bookings_total Counter of error or duplicate voice bookings (UV-AC-032 / SD §13.2)");
    lines.push("# TYPE drts_voice_error_or_duplicate_bookings_total counter");
    for (const [keyLabels, val] of this.errorOrDuplicateCounter.entries()) {
      lines.push(`drts_voice_error_or_duplicate_bookings_total{${keyLabels}} ${val}`);
    }

    lines.push("# HELP drts_voice_cross_scope_denials_total Counter of cross-scope or unauthorized brand access attempts");
    lines.push("# TYPE drts_voice_cross_scope_denials_total counter");
    for (const [keyLabels, val] of this.crossScopeDenialsCounter.entries()) {
      lines.push(`drts_voice_cross_scope_denials_total{${keyLabels}} ${val}`);
    }

    lines.push("# HELP drts_voice_pending_command_timeouts_total Counter of pending voice booking command receipt timeouts");
    lines.push("# TYPE drts_voice_pending_command_timeouts_total counter");
    for (const [keyLabels, val] of this.pendingCommandTimeoutsCounter.entries()) {
      lines.push(`drts_voice_pending_command_timeouts_total{${keyLabels}} ${val}`);
    }

    lines.push("# HELP drts_voice_recording_checkpoint_failures_total Counter of voice recording checkpoint or finalize verification failures");
    lines.push("# TYPE drts_voice_recording_checkpoint_failures_total counter");
    for (const [keyLabels, val] of this.recordingCheckpointFailuresCounter.entries()) {
      lines.push(`drts_voice_recording_checkpoint_failures_total{${keyLabels}} ${val}`);
    }

    lines.push("# HELP drts_voice_provider_overflow_total Counter of voice provider capacity overflow events");
    lines.push("# TYPE drts_voice_provider_overflow_total counter");
    for (const [keyLabels, val] of this.providerOverflowCounter.entries()) {
      lines.push(`drts_voice_provider_overflow_total{${keyLabels}} ${val}`);
    }

    lines.push("# HELP drts_voice_handoff_queue_unanswered_count Current number of unanswered human handoff queue items beyond SLA");
    lines.push("# TYPE drts_voice_handoff_queue_unanswered_count gauge");
    for (const [keyLabels, val] of this.handoffQueueUnansweredGauge.entries()) {
      lines.push(`drts_voice_handoff_queue_unanswered_count{${keyLabels}} ${val}`);
    }

    lines.push("# HELP drts_voice_dispatch_unavailable_total Counter of unavailable driver dispatch events under AI flow");
    lines.push("# TYPE drts_voice_dispatch_unavailable_total counter");
    for (const [keyLabels, val] of this.dispatchUnavailableCounter.entries()) {
      lines.push(`drts_voice_dispatch_unavailable_total{${keyLabels}} ${val}`);
    }

    lines.push("# HELP drts_voice_call_unit_cost_twd Voice per-call cost in TWD for cost anomaly monitoring (SD §14.3)");
    lines.push("# TYPE drts_voice_call_unit_cost_twd gauge");
    for (const [keyLabels, val] of this.callUnitCostGauge.entries()) {
      lines.push(`drts_voice_call_unit_cost_twd{${keyLabels}} ${val}`);
    }

    lines.push("# HELP drts_voice_worker_lease_conflicts_total Counter of voice worker lease epoch conflicts");
    lines.push("# TYPE drts_voice_worker_lease_conflicts_total counter");
    for (const [keyLabels, val] of this.workerLeaseConflictsCounter.entries()) {
      lines.push(`drts_voice_worker_lease_conflicts_total{${keyLabels}} ${val}`);
    }

    return lines.join("\n");
  }

  public resetForTest(): void {
    this.errorOrDuplicateCounter.clear();
    this.crossScopeDenialsCounter.clear();
    this.pendingCommandTimeoutsCounter.clear();
    this.recordingCheckpointFailuresCounter.clear();
    this.providerOverflowCounter.clear();
    this.handoffQueueUnansweredGauge.clear();
    this.dispatchUnavailableCounter.clear();
    this.callUnitCostGauge.clear();
    this.workerLeaseConflictsCounter.clear();
  }
}

export const voiceAlertMetrics = VoiceAlertMetrics.getInstance();
