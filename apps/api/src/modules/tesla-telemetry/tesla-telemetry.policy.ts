const DEFAULT_QUALITY_GATE_SCORE = 0.8;
const DEFAULT_INCIDENT_SCORE = 0.5;
const DEFAULT_DELAY_THRESHOLD_SECONDS = 30;
const DEFAULT_GAP_THRESHOLD_SECONDS = 60;
const DEFAULT_DISPATCH_HOLD_THRESHOLD_SECONDS = 180;

function numberFromEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function secondsFromEnv(name: string, fallbackSeconds: number) {
  return numberFromEnv(name, fallbackSeconds) * 1000;
}

export function resolveTeslaTelemetryDelayThresholdMs() {
  return secondsFromEnv(
    "TESLA_TELEMETRY_DELAY_THRESHOLD_SECONDS",
    DEFAULT_DELAY_THRESHOLD_SECONDS,
  );
}

export function resolveTeslaTelemetryGapThresholdMs() {
  return secondsFromEnv(
    "TESLA_TELEMETRY_GAP_THRESHOLD_SECONDS",
    DEFAULT_GAP_THRESHOLD_SECONDS,
  );
}

export function resolveTeslaTelemetryDispatchHoldThresholdMs() {
  return secondsFromEnv(
    "TESLA_TELEMETRY_DISPATCH_HOLD_THRESHOLD_SECONDS",
    DEFAULT_DISPATCH_HOLD_THRESHOLD_SECONDS,
  );
}

export function resolveTeslaTelemetryQualityGateScore() {
  return numberFromEnv(
    "TESLA_TELEMETRY_QUALITY_GATE_SCORE",
    DEFAULT_QUALITY_GATE_SCORE,
  );
}

export function resolveTeslaTelemetryIncidentScore() {
  return numberFromEnv(
    "TESLA_TELEMETRY_INCIDENT_SCORE",
    DEFAULT_INCIDENT_SCORE,
  );
}
