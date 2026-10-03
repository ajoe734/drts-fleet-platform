import type {
  VoiceCapabilityScope,
  VoiceCapabilityTokenEnvelope,
} from "@drts/contracts";
import type { WorkloadIdentityTokenSource } from "./workload-identity-token-source";

/**
 * The first-party worker/API HTTP client SD §4.2/§10.1 already define
 * (Codex reopen round 5/6, R4) -- previously this worker "has no HTTP
 * client to call apps/api with" at all. Only the three routes this
 * worker's own dialogue turn loop actually needs are implemented:
 * capability issuance, the CAS input-resolution persist seam
 * (`VoiceSessionService.resolveInput`), and the `request_handoff` tool
 * gateway seam (`VoiceToolGatewayService.execute` via
 * `apps/api`'s `VoiceHandoffOnlyToolPorts`). This is not a generic HTTP
 * client -- it has no method for any other SD §10.1 route, since nothing
 * in this worker's current composition calls one.
 */
export class VoiceApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "VoiceApiError";
  }
}

export interface VoiceApiClientConfig {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export interface IssueCapabilityCommand {
  voiceSessionId: string;
  resourceScopeId: string;
  routeProfileVersion: number;
  leaseEpoch: number;
  scopes: readonly VoiceCapabilityScope[];
  ttlSeconds?: number;
}

export interface ResolveInputCommand {
  expectedSessionVersion: number;
  inputEpoch: number;
  resolution: "relevant" | "irrelevant";
}

export interface ResolveInputResult {
  /** `voiceSessionId` (Codex reopen round 5/6, R4-persist residual): the
   * real backend route (`VoiceBookingController#resolveInput`) already
   * returns the full `VoiceSessionRecord`, which carries this field --
   * `createTrustedDialoguePersistPort` needs it to correlate a response
   * against the exact binding it issued the request for, not only the
   * `inputEpoch`, which alone cannot distinguish a misattributed response
   * for a *different* session that happens to carry the same epoch. */
  session: {
    voiceSessionId: string;
    sessionVersion: number;
    inputEpoch: number;
    pendingInput: boolean;
  };
}

export interface RequestHandoffCommand {
  inputEpoch: number;
  deadlineMs?: number;
  output: unknown;
}

export interface RequestHandoffResult {
  results: ReadonlyArray<{
    status: "queued" | "connected" | "unavailable";
    handoffId: string | null;
  }>;
}

interface ApiErrorEnvelope {
  error?: { code?: string; message?: string };
}

export class VoiceApiClient {
  constructor(
    private readonly config: VoiceApiClientConfig,
    private readonly workloadTokenSource: WorkloadIdentityTokenSource,
  ) {}

  /** Stage 1 (workload) + stage 2 (capability) of SD §4.2's exchange,
   * combined: mints this worker's own Google workload identity token,
   * then exchanges it for a short-lived, session-bound capability. */
  async issueCapability(
    command: IssueCapabilityCommand,
    signal?: AbortSignal,
  ): Promise<VoiceCapabilityTokenEnvelope> {
    const workloadToken = await this.workloadTokenSource.getToken(signal);
    return this.request<VoiceCapabilityTokenEnvelope>(
      "POST",
      "/callcenter/voice/capabilities",
      workloadToken,
      command,
      signal,
    );
  }

  async resolveInput(
    sessionId: string,
    capabilityToken: string,
    command: ResolveInputCommand,
    signal?: AbortSignal,
  ): Promise<ResolveInputResult> {
    return this.request<ResolveInputResult>(
      "POST",
      `/callcenter/voice/sessions/${encodeURIComponent(sessionId)}/input-resolutions`,
      capabilityToken,
      command,
      signal,
    );
  }

  async requestHandoff(
    sessionId: string,
    capabilityToken: string,
    command: RequestHandoffCommand,
    signal?: AbortSignal,
  ): Promise<RequestHandoffResult> {
    return this.request<RequestHandoffResult>(
      "POST",
      `/callcenter/voice/sessions/${encodeURIComponent(sessionId)}/handoffs`,
      capabilityToken,
      command,
      signal,
    );
  }

  /** `signal` is forwarded to the real `fetch` so an in-flight request is
   * actually cancelled on abort, not merely ignored after the fact --
   * callers (e.g. `createTrustedDialoguePersistPort`) still must re-check
   * `signal.aborted` at every await boundary themselves, since an
   * already-settled promise cannot be un-resolved by a signal firing
   * afterward. */
  private async request<T>(
    method: string,
    path: string,
    bearerToken: string,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const fetchImpl = this.config.fetchImpl ?? fetch;
    let response: Response;
    try {
      response = await fetchImpl(new URL(path, this.config.baseUrl), {
        method,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify(body),
        signal: signal ?? null,
      });
    } catch (err) {
      throw new VoiceApiError(
        "VOICE_API_UNREACHABLE",
        `Unable to reach apps/api at '${path}': ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      const envelope = (parsed ?? {}) as ApiErrorEnvelope;
      throw new VoiceApiError(
        envelope.error?.code ?? "VOICE_API_ERROR",
        envelope.error?.message ?? `apps/api '${path}' returned HTTP ${response.status}.`,
      );
    }

    return (parsed as { data: T }).data;
  }
}
