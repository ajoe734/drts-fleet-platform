import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { Duplex } from "node:stream";
import { EventEmitter } from "node:events";
import {
  completeWebSocketHandshake,
  WebSocketServerChannel,
} from "./websocket-channel";

export interface MediaWorkerServerConfig {
  port?: number | undefined;
  host?: string | undefined;
  maxConcurrentSessions?: number | undefined;
  wsTimeoutMs?: number | undefined;
  drainTimeoutMs?: number | undefined;
  serviceVersion?: string | undefined;
}

export interface MediaSessionRecord {
  sessionId: string;
  connectedAt: string;
  channel?: WebSocketServerChannel | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export class MediaWorkerServer extends EventEmitter {
  private readonly config: {
    port: number;
    host: string;
    maxConcurrentSessions: number;
    wsTimeoutMs: number;
    drainTimeoutMs: number;
    serviceVersion: string;
  };
  private readonly server: Server;
  private readonly activeSessions = new Map<string, MediaSessionRecord>();
  private isDraining = false;
  private totalAdmitted = 0;
  private isRunning = false;

  constructor(config?: MediaWorkerServerConfig) {
    super();
    this.config = {
      port:
        config?.port ??
        Number(process.env.VOICE_MEDIA_PORT ?? process.env.PORT ?? 3002),
      host: config?.host ?? "0.0.0.0",
      maxConcurrentSessions:
        config?.maxConcurrentSessions ??
        Number(process.env.VOICE_MEDIA_MAX_CONCURRENT_SESSIONS ?? 100),
      wsTimeoutMs:
        config?.wsTimeoutMs ??
        Number(
          process.env.VOICE_MEDIA_WS_TIMEOUT_SECONDS
            ? Number(process.env.VOICE_MEDIA_WS_TIMEOUT_SECONDS) * 1000
            : 300_000,
        ),
      drainTimeoutMs:
        config?.drainTimeoutMs ??
        Number(
          process.env.VOICE_MEDIA_DRAIN_TIMEOUT_SECONDS
            ? Number(process.env.VOICE_MEDIA_DRAIN_TIMEOUT_SECONDS) * 1000
            : 15_000,
        ),
      serviceVersion: config?.serviceVersion ?? "0.1.0",
    };

    this.server = createServer((req, res) => this.handleHttpRequest(req, res));
    this.server.on("upgrade", (req: IncomingMessage, socket: Duplex) =>
      this.handleUpgrade(req, socket),
    );
  }

  get port(): number {
    return this.config.port;
  }

  get draining(): boolean {
    return this.isDraining;
  }

  get running(): boolean {
    return this.isRunning;
  }

  get sessionCount(): number {
    return this.activeSessions.size;
  }

  get admittedCount(): number {
    return this.totalAdmitted;
  }

  get httpServer(): Server {
    return this.server;
  }

  async start(): Promise<number> {
    if (this.isRunning) return this.config.port;

    return new Promise<number>((resolve, reject) => {
      this.server.on("error", reject);
      this.server.listen(this.config.port, this.config.host, () => {
        this.isRunning = true;
        this.server.removeListener("error", reject);
        const addr = this.server.address();
        const resolvedPort =
          typeof addr === "object" && addr ? addr.port : this.config.port;
        this.config.port = resolvedPort;
        this.emit("ready", { port: resolvedPort });
        resolve(resolvedPort);
      });
    });
  }

  /**
   * Gracefully drains the server:
   * 1. Marks server as draining (/ready immediately returns 503 to signal LB).
   * 2. Rejects new session admissions.
   * 3. Notifies existing sessions and allows in-flight audio/processing to complete.
   * 4. Closes server after all sessions finish or drain timeout expires.
   */
  async drain(
    customTimeoutMs?: number,
  ): Promise<{ drainedSessions: number; timedOut: boolean }> {
    if (this.isDraining && !this.isRunning) {
      return { drainedSessions: 0, timedOut: false };
    }

    this.isDraining = true;
    this.emit("draining");

    const timeout = customTimeoutMs ?? this.config.drainTimeoutMs;
    const initialSessionCount = this.activeSessions.size;

    // Send drain/closing notice to active WebSocket channels
    for (const session of this.activeSessions.values()) {
      if (session.channel && !session.channel.destroyed) {
        session.channel.sendText(
          JSON.stringify({
            type: "server.draining",
            reason: "worker_shutdown",
          }),
        );
      }
    }

    let timedOut = false;
    if (this.activeSessions.size > 0) {
      timedOut = await new Promise<boolean>((resolve) => {
        const checkInterval = setInterval(() => {
          if (this.activeSessions.size === 0) {
            clearInterval(checkInterval);
            clearTimeout(drainTimer);
            resolve(false);
          }
        }, 50);

        const drainTimer = setTimeout(() => {
          clearInterval(checkInterval);
          // Force close any remaining sessions
          for (const session of this.activeSessions.values()) {
            if (session.channel) {
              session.channel.close(1001, "Server drain timeout reached");
            }
          }
          this.activeSessions.clear();
          resolve(true);
        }, timeout);
      });
    }

    await this.stop();
    return { drainedSessions: initialSessionCount, timedOut };
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    for (const session of this.activeSessions.values()) {
      if (session.channel && !session.channel.destroyed) {
        session.channel.close(1000, "Server stopping");
      }
    }
    this.activeSessions.clear();

    return new Promise<void>((resolve, reject) => {
      this.server.close((err) => {
        this.isRunning = false;
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Programmatic admission for a media session (used by HTTP or internal coordinator).
   */
  admitSession(
    sessionId: string,
    metadata?: Record<string, unknown> | undefined,
  ): MediaSessionRecord {
    if (this.isDraining) {
      throw new Error(
        "MEDIA_WORKER_DRAINING: Server is draining; cannot admit new sessions",
      );
    }
    if (this.activeSessions.size >= this.config.maxConcurrentSessions) {
      throw new Error(
        "MEDIA_WORKER_CAPACITY_EXCEEDED: Maximum concurrent sessions reached",
      );
    }

    const session: MediaSessionRecord = {
      sessionId,
      connectedAt: new Date().toISOString(),
      ...(metadata !== undefined ? { metadata } : {}),
    };
    this.activeSessions.set(sessionId, session);
    this.totalAdmitted++;
    this.emit("session.admitted", session);
    return session;
  }

  closeSession(
    sessionId: string,
    code = 1000,
    reason = "Normal closure",
  ): boolean {
    const session = this.activeSessions.get(sessionId);
    if (!session) return false;

    if (session.channel && !session.channel.destroyed) {
      session.channel.close(code, reason);
    }
    this.activeSessions.delete(sessionId);
    this.emit("session.closed", { sessionId, code, reason });
    return true;
  }

  private handleHttpRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );
    const pathname = url.pathname;

    res.setHeader("Content-Type", "application/json");

    if (
      req.method === "GET" &&
      (pathname === "/health" || pathname === "/healthz")
    ) {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          status: "ok",
          service: "voice-media-worker",
          version: this.config.serviceVersion,
          uptimeSeconds: Math.floor(process.uptime()),
        }),
      );
      return;
    }

    if (
      req.method === "GET" &&
      (pathname === "/ready" || pathname === "/readyz")
    ) {
      if (this.isDraining) {
        res.statusCode = 503;
        res.end(
          JSON.stringify({
            ready: false,
            reason: "draining",
            activeSessions: this.activeSessions.size,
          }),
        );
        return;
      }
      if (this.activeSessions.size >= this.config.maxConcurrentSessions) {
        res.statusCode = 503;
        res.end(
          JSON.stringify({
            ready: false,
            reason: "capacity_exceeded",
            activeSessions: this.activeSessions.size,
            maxConcurrentSessions: this.config.maxConcurrentSessions,
          }),
        );
        return;
      }

      res.statusCode = 200;
      res.end(
        JSON.stringify({
          ready: true,
          activeSessions: this.activeSessions.size,
          maxConcurrentSessions: this.config.maxConcurrentSessions,
        }),
      );
      return;
    }

    if (
      req.method === "GET" &&
      (pathname === "/status" || pathname === "/metrics")
    ) {
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          service: "voice-media-worker",
          version: this.config.serviceVersion,
          running: this.isRunning,
          draining: this.isDraining,
          activeSessions: this.activeSessions.size,
          totalAdmitted: this.totalAdmitted,
          maxConcurrentSessions: this.config.maxConcurrentSessions,
          wsTimeoutMs: this.config.wsTimeoutMs,
          drainTimeoutMs: this.config.drainTimeoutMs,
          uptimeSeconds: Math.floor(process.uptime()),
        }),
      );
      return;
    }

    if (req.method === "POST" && pathname === "/drain") {
      res.statusCode = 202;
      res.end(JSON.stringify({ status: "drain_initiated" }));
      void this.drain();
      return;
    }

    if (req.method === "POST" && pathname === "/sessions") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          const sessionId =
            parsed.sessionId ??
            `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const session = this.admitSession(sessionId, parsed.metadata);
          res.statusCode = 201;
          res.end(JSON.stringify({ status: "admitted", session }));
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          res.statusCode =
            errorMsg.includes("DRAINING") || errorMsg.includes("CAPACITY")
              ? 503
              : 400;
          res.end(JSON.stringify({ error: errorMsg }));
        }
      });
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: "Not Found", path: pathname }));
  }

  private handleUpgrade(req: IncomingMessage, socket: Duplex): void {
    if (this.isDraining) {
      socket.write(
        "HTTP/1.1 503 Service Unavailable\r\nContent-Type: text/plain\r\n\r\nServer is draining\r\n",
      );
      socket.destroy();
      return;
    }

    if (this.activeSessions.size >= this.config.maxConcurrentSessions) {
      socket.write(
        "HTTP/1.1 503 Service Unavailable\r\nContent-Type: text/plain\r\n\r\nCapacity exceeded\r\n",
      );
      socket.destroy();
      return;
    }

    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );
    const sessionId =
      url.searchParams.get("sessionId") ??
      `ws-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const secKey = req.headers["sec-websocket-key"] as string | undefined;
    const channel = completeWebSocketHandshake(secKey, socket, {
      timeoutMs: this.config.wsTimeoutMs,
    });

    if (!channel) return;

    let session: MediaSessionRecord;
    try {
      session = this.admitSession(sessionId);
    } catch {
      channel.close(1013, "Capacity exceeded or draining");
      return;
    }

    session.channel = channel;

    channel.on("message", (data: string | Buffer, isBinary: boolean) => {
      this.emit("session.message", { sessionId, data, isBinary });
    });

    channel.on("close", (code: number, reason: string) => {
      this.activeSessions.delete(sessionId);
      this.emit("session.closed", { sessionId, code, reason });
    });

    channel.on("error", (err: Error) => {
      this.emit("session.error", { sessionId, error: err });
    });

    this.emit("session.connected", session);
  }
}
