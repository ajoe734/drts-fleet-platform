import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Ephemeral CI session handoff, outside the uploaded evidence directories.
// Values come from createWireApp's real JwtAuthService and durable sessions.
const sessionFile = path.join(tmpdir(), "drts-wire-host-browser-sessions.json");
export interface WireHostBrowserSessions {
  hostA: string;
  hostB: string;
}
export function saveWireHostBrowserSessions(sessions: WireHostBrowserSessions) {
  writeFileSync(sessionFile, JSON.stringify(sessions));
}
export function readWireHostBrowserSessions(): WireHostBrowserSessions {
  return JSON.parse(
    readFileSync(sessionFile, "utf8"),
  ) as WireHostBrowserSessions;
}
export function removeWireHostBrowserSessions() {
  rmSync(sessionFile, { force: true });
}
