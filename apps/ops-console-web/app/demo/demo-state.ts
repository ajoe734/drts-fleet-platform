export const DEMO_STORAGE_KEY = "drts-ops-external-service-demo-v1";
export type DemoDomain =
  | "voice"
  | "push"
  | "email"
  | "erp"
  | "issuer"
  | "forwarder";
export type DeliveryStatus = "draft" | "queued" | "failed" | "delivered";
export type DemoState = {
  version: 1;
  simulation: true;
  voice: "idle" | "ringing" | "connected" | "ended";
  push: { status: DeliveryStatus; attempts: number };
  email: { status: DeliveryStatus; attempts: number };
  erp: {
    status: "idle" | "prepared" | "pending" | "failed" | "acknowledged";
    attempts: number;
  };
  issuer: "idle" | "pending" | "eligible" | "expired" | "ineligible";
  forwarder: "idle" | "offered" | "accepted" | "rejected" | "completed";
  inbox: { id: string; channel: "push" | "email"; at: string }[];
  events: {
    id: string;
    domain: DemoDomain;
    action: DemoAction;
    at: string;
    status: string;
  }[];
};
export type DemoAction =
  | "voice.start"
  | "voice.answer"
  | "voice.end"
  | "push.send"
  | "push.fail"
  | "push.deliver"
  | "push.retry"
  | "email.send"
  | "email.fail"
  | "email.deliver"
  | "email.retry"
  | "erp.prepare"
  | "erp.send"
  | "erp.fail"
  | "erp.retry"
  | "erp.acknowledge"
  | "issuer.request"
  | "issuer.eligible"
  | "issuer.expired"
  | "issuer.ineligible"
  | "forwarder.offer"
  | "forwarder.accept"
  | "forwarder.reject"
  | "forwarder.complete";

export function createDemoState(): DemoState {
  return {
    version: 1,
    simulation: true,
    voice: "idle",
    push: { status: "draft", attempts: 0 },
    email: { status: "draft", attempts: 0 },
    erp: { status: "idle", attempts: 0 },
    issuer: "idle",
    forwarder: "idle",
    inbox: [],
    events: [],
  };
}

/** Only the local scenario changes. This module has no provider or network port. */
export function transitionDemo(
  state: DemoState,
  action: DemoAction,
  at: string,
): DemoState {
  const domain = action.split(".")[0] as DemoDomain;
  let next: DemoState = state;
  if (action === "voice.start" && ["idle", "ended"].includes(state.voice))
    next = { ...state, voice: "ringing" };
  else if (action === "voice.answer" && state.voice === "ringing")
    next = { ...state, voice: "connected" };
  else if (
    action === "voice.end" &&
    ["ringing", "connected"].includes(state.voice)
  )
    next = { ...state, voice: "ended" };
  else if (domain === "push" || domain === "email") {
    const delivery = state[domain];
    const operation = action.split(".")[1];
    if (
      (operation === "send" &&
        ["draft", "delivered"].includes(delivery.status)) ||
      (operation === "retry" && delivery.status === "failed")
    )
      next = {
        ...state,
        [domain]: { status: "queued", attempts: delivery.attempts + 1 },
      };
    else if (operation === "fail" && delivery.status === "queued")
      next = { ...state, [domain]: { ...delivery, status: "failed" } };
    else if (operation === "deliver" && delivery.status === "queued")
      next = {
        ...state,
        [domain]: { ...delivery, status: "delivered" },
        inbox: [
          ...state.inbox,
          {
            id: `demo-${domain}-${state.events.length + 1}`,
            channel: domain,
            at,
          },
        ],
      };
  } else if (domain === "erp") {
    const erp = state.erp;
    if (
      action === "erp.prepare" &&
      ["idle", "acknowledged"].includes(erp.status)
    )
      next = { ...state, erp: { status: "prepared", attempts: 0 } };
    else if (
      (action === "erp.send" && erp.status === "prepared") ||
      (action === "erp.retry" && erp.status === "failed")
    )
      next = {
        ...state,
        erp: { status: "pending", attempts: erp.attempts + 1 },
      };
    else if (action === "erp.fail" && erp.status === "pending")
      next = { ...state, erp: { ...erp, status: "failed" } };
    else if (action === "erp.acknowledge" && erp.status === "pending")
      next = { ...state, erp: { ...erp, status: "acknowledged" } };
  } else if (action === "issuer.request" && state.issuer !== "pending")
    next = { ...state, issuer: "pending" };
  else if (domain === "issuer" && state.issuer === "pending") {
    const decision = action.split(".")[1];
    if (
      decision === "eligible" ||
      decision === "expired" ||
      decision === "ineligible"
    )
      next = { ...state, issuer: decision };
  } else if (
    action === "forwarder.offer" &&
    ["idle", "rejected", "completed"].includes(state.forwarder)
  )
    next = { ...state, forwarder: "offered" };
  else if (action === "forwarder.accept" && state.forwarder === "offered")
    next = { ...state, forwarder: "accepted" };
  else if (action === "forwarder.reject" && state.forwarder === "offered")
    next = { ...state, forwarder: "rejected" };
  else if (action === "forwarder.complete" && state.forwarder === "accepted")
    next = { ...state, forwarder: "completed" };
  if (next === state) return state;
  const result = next[domain];
  const status = typeof result === "string" ? result : result.status;
  return {
    ...next,
    events: [
      ...state.events,
      {
        id: `demo-event-${state.events.length + 1}`,
        domain,
        action,
        at,
        status,
      },
    ],
  };
}

export function restoreDemoState(raw: string | null): DemoState {
  if (!raw) return createDemoState();
  try {
    const value = JSON.parse(raw) as DemoState;
    if (
      value.version !== 1 ||
      value.simulation !== true ||
      !value.erp ||
      !["idle", "prepared", "pending", "failed", "acknowledged"].includes(
        value.erp.status,
      ) ||
      !Number.isSafeInteger(value.erp.attempts) ||
      value.erp.attempts < 0 ||
      !["idle", "ringing", "connected", "ended"].includes(value.voice) ||
      !["idle", "pending", "eligible", "expired", "ineligible"].includes(
        value.issuer,
      ) ||
      !["idle", "offered", "accepted", "rejected", "completed"].includes(
        value.forwarder,
      ) ||
      ![value.push, value.email].every(
        (item) =>
          item &&
          ["draft", "queued", "failed", "delivered"].includes(item.status) &&
          Number.isSafeInteger(item.attempts) &&
          item.attempts >= 0,
      ) ||
      !Array.isArray(value.events) ||
      !value.events.every(
        (event) =>
          typeof event.id === "string" &&
          typeof event.action === "string" &&
          typeof event.at === "string" &&
          typeof event.status === "string" &&
          ["voice", "push", "email", "erp", "issuer", "forwarder"].includes(
            event.domain,
          ),
      ) ||
      !Array.isArray(value.inbox) ||
      !value.inbox.every(
        (item) =>
          typeof item.id === "string" &&
          typeof item.at === "string" &&
          ["push", "email"].includes(item.channel),
      )
    )
      return createDemoState();
    return value;
  } catch {
    return createDemoState();
  }
}

export function exportDemoRecord(state: DemoState): string {
  return JSON.stringify(
    {
      notice:
        "SIMULATION ONLY — fictional scenario; no external delivery or production action.",
      ...state,
    },
    null,
    2,
  );
}

export function demoLiveHref(route: string, search: string): string {
  const [path, query] = route.split("?");
  const params = new URLSearchParams(query);
  const current = new URLSearchParams(search);
  for (const key of ["role", "locale"]) {
    const value = current.get(key);
    if (value) params.set(key, value);
  }
  return `${path}${params.size ? `?${params}` : ""}`;
}
