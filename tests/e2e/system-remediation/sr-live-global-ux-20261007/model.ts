export const states = ["default", "empty", "validation", "error", "loading", "expired", "permission", "dialog"] as const;
export const locales = ["zh-TW", "en-US"] as const;
export const widths = [390, 768, 1440] as const;
export const manualChecks = ["keyboard", "screen-reader", "contrast", "design-mapping"] as const;
export type State = typeof states[number];
export type Locale = typeof locales[number];
export type Surface = { app: string; service: string; roles: string[]; roleSource: string };
export type Screen = {
  id: string; app: string; route: string; source: string; sourceBlob: string;
  sourceCommit: string; roles: string[]; design: "unverified";
};
export type Inventory = { runtimeSha: string; surfaces: Surface[]; screens: Screen[]; excluded: Record<string, string> };
export type Case = { id: string; screen: Screen; role: string; state: State; locale: Locale; width: number };
export type Step =
  | { kind: "tab"; target: string; max: number }
  | { kind: "press"; key: "Enter" | "Space" | "Escape" | "Tab" | "Shift+Tab" }
  | { kind: "type"; text: string }
  | { kind: "focus"; target: string }
  | { kind: "visible"; target: string; text: string };
export type FormatProbe = { selector: string; kind: "money" | "date"; value: string | number; options: Intl.DateTimeFormatOptions | Intl.NumberFormatOptions };
export type Recipe = {
  route: string; finalPath: string; ready: string; expectedStatus: number;
  stateProof: { selector: string; text: Record<Locale, string>; source: string };
  steps: Record<Locale, Step[]>;
  formats: Record<Locale, FormatProbe[]>;
  // Explicit missing-format rationale remains reviewable; never inferred from an empty array.
  noFormatsReason?: string;
  dialog?: { trigger: string; selector: string; returnTo: string };
  mask: string[];
};
export type Session = {
  app: string; role: string; kind: "named-human" | "authorized-isolation";
  authorizationRef: string; subjectAlias: string; sandboxOnly: true;
  identity: { path: string; subjectPath: string; rolePath: string; expectedSubject: string };
  storageState: { cookies: Array<{ name: string; value: string; domain: string; path: string; expires: number; httpOnly: boolean; secure: boolean; sameSite: "Strict" | "Lax" | "None" }>; origins: Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }> };
  variants?: Partial<Record<State, Session["storageState"]>>;
};
export type Plan = {
  runtimeSha: string; approvalRef: string; expiresAt: string; sandboxOnly: true;
  // Keys are screen.id|role|state. No wildcards; locale and viewport remain fixed by the harness.
  recipes: Record<string, Recipe>;
};
export type Deployment = { project: string; region: string; runtimeSha: string; observedAt: string; services: Array<{ app: string; service: string; origin: string; revisions: Array<{ name: string; percent: number; sha: string; image: string }> }> };
export type CaseEvidence = {
  id: string; harnessSha: string; runtimeSha: string; runId: string; planHash: string;
  source: string; sourceBlob: string; route: string; role: string; locale: Locale; width: number;
  status: "passed" | "failed" | "blocked" | "skipped" | "not_applicable";
  checks: string[]; screenshot?: string; screenshotHash?: string; consoleErrors: number;
  sessionKind?: Session["kind"]; reason?: string;
};
export type ManualEvidence = { id: string; runtimeSha: string; harnessSha: string; runId: string; planHash: string; checks: Array<{ check: typeof manualChecks[number]; status: "passed" | "failed" | "blocked" | "not_applicable"; tester: string; tool: string; procedure: string; artifact: string; sha256: string; sourceRef: string }> };
export const automatedChecks = ["runtime-sha", "state", "semantics", "keyboard-focus", "overflow", "locale", "formats", "console", "screenshot"];
export const recipeKey = (c: Pick<Case, "screen" | "role" | "state">) => `${c.screen.id}|${c.role}|${c.state}`;
export function cases(inventory: Inventory): Case[] {
  return inventory.screens.flatMap(screen => screen.roles.flatMap(role => states.flatMap(state => locales.flatMap(locale => widths.map(width => ({ id: `${screen.id}|${role}|${state}|${locale}|${width}`, screen, role, state, locale, width }))))));
}
