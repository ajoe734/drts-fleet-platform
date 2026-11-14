import type { AssistTranscriptSegmentInput } from "../server/voice-api-client";

/**
 * CALLCENTER-AI-ASSIST-20261111: while a human agent talks with the caller
 * (a handed-off call, or a call to the human hotline), the AI keeps
 * listening. Each final speech-recognition result is forwarded to apps/api,
 * which re-extracts the booking fields the agent sees prefilled.
 *
 * Telephony delivers the caller and the agent as separate audio tracks, so
 * each result already knows who spoke. Partial (non-final) results are not
 * forwarded. Sends are batched, strictly ordered and retried; forwarding
 * problems never affect the call itself.
 */

export interface AssistRecognitionResult {
  segmentId: string;
  speaker: AssistTranscriptSegmentInput["speaker"];
  text: string;
  isFinal: boolean;
  startedAt?: string | null;
}

export type AssistTranscriptSender = (
  segments: AssistTranscriptSegmentInput[],
  signal: AbortSignal,
) => Promise<unknown>;

export interface AgentAssistTranscriptForwarderOptions {
  send: AssistTranscriptSender;
  /** Wait this long to batch results spoken close together. */
  batchDelayMs?: number;
  /** apps/api accepts at most 50 segments per request. */
  maxBatchSize?: number;
  requestTimeoutMs?: number;
  /** Retry delays for one batch; after the last one the batch is dropped. */
  retryDelaysMs?: readonly number[];
  onDropped?: (
    segments: AssistTranscriptSegmentInput[],
    error: unknown,
  ) => void;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

const MAX_TEXT_LENGTH = 1000;

export class AgentAssistTranscriptForwarder {
  private readonly pending: AssistTranscriptSegmentInput[] = [];
  private timer: unknown = null;
  private chain: Promise<void> = Promise.resolve();
  private closed = false;
  private readonly options: Required<
    Omit<AgentAssistTranscriptForwarderOptions, "onDropped">
  > &
    Pick<AgentAssistTranscriptForwarderOptions, "onDropped">;

  constructor(options: AgentAssistTranscriptForwarderOptions) {
    this.options = {
      batchDelayMs: 400,
      maxBatchSize: 20,
      requestTimeoutMs: 5_000,
      retryDelaysMs: [500, 2_000, 5_000],
      setTimer: (callback, ms) => setTimeout(callback, ms),
      clearTimer: (handle) =>
        clearTimeout(handle as ReturnType<typeof setTimeout>),
      ...options,
    };
  }

  push(result: AssistRecognitionResult): void {
    if (this.closed || !result.isFinal) {
      return;
    }
    const text = result.text.trim().slice(0, MAX_TEXT_LENGTH);
    if (!text) {
      return;
    }
    this.pending.push({
      segmentId: result.segmentId,
      speaker: result.speaker,
      text,
      startedAt: result.startedAt ?? null,
    });
    if (this.pending.length >= this.options.maxBatchSize) {
      this.flushNow();
      return;
    }
    if (this.timer === null) {
      this.timer = this.options.setTimer(
        () => this.flushNow(),
        this.options.batchDelayMs,
      );
    }
  }

  /** Send everything queued so far; resolves when it has been handled. */
  flush(): Promise<void> {
    this.flushNow();
    return this.chain;
  }

  /** The call ended: send what is left and accept nothing more. */
  async close(): Promise<void> {
    await this.flush();
    this.closed = true;
  }

  private flushNow() {
    if (this.timer !== null) {
      this.options.clearTimer(this.timer);
      this.timer = null;
    }
    while (this.pending.length) {
      const batch = this.pending.splice(0, this.options.maxBatchSize);
      this.chain = this.chain.then(() => this.sendWithRetry(batch));
    }
  }

  private async sendWithRetry(batch: AssistTranscriptSegmentInput[]) {
    const delays = this.options.retryDelaysMs;
    for (let attempt = 0; ; attempt += 1) {
      try {
        await this.options.send(
          batch,
          AbortSignal.timeout(this.options.requestTimeoutMs),
        );
        return;
      } catch (error) {
        if (attempt >= delays.length || isDefinitiveRejection(error)) {
          this.options.onDropped?.(batch, error);
          return;
        }
        await new Promise<void>((resolve) =>
          this.options.setTimer(resolve, delays[attempt]!),
        );
      }
    }
  }
}

/** apps/api understood and refused the batch: retrying cannot help. */
function isDefinitiveRejection(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return (
    typeof code === "string" &&
    (code === "CALLCENTER_ASSIST_TRANSCRIPT_INVALID" ||
      code === "UNAUTHORIZED" ||
      code === "FORBIDDEN")
  );
}

/** Bind a forwarder to one call through the worker's apps/api client. */
export function createAgentAssistTranscriptForwarder(
  client: {
    postAssistTranscript: (
      callId: string,
      segments: readonly AssistTranscriptSegmentInput[],
      signal?: AbortSignal,
    ) => Promise<unknown>;
  },
  callId: string,
  options: Omit<AgentAssistTranscriptForwarderOptions, "send"> = {},
): AgentAssistTranscriptForwarder {
  return new AgentAssistTranscriptForwarder({
    ...options,
    send: (segments, signal) =>
      client.postAssistTranscript(callId, segments, signal),
  });
}
