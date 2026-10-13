"use client";

import { useEffect, useState } from "react";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasPageHeader,
  CanvasPill,
  buildCanvasTheme,
} from "@drts/ui-web";
import { useTranslation } from "../../lib/i18n";
import {
  createDemoState,
  demoLiveHref,
  DEMO_STORAGE_KEY,
  exportDemoRecord,
  restoreDemoState,
  transitionDemo,
  type DemoAction,
  type DemoDomain,
  type DemoState,
} from "./demo-state";
import { demoCopy } from "./translations";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});
const domains: DemoDomain[] = [
  "voice",
  "push",
  "email",
  "erp",
  "issuer",
  "forwarder",
];
const actions: Record<DemoDomain, DemoAction[]> = {
  voice: ["voice.start", "voice.answer", "voice.end"],
  push: ["push.send", "push.fail", "push.retry", "push.deliver"],
  email: ["email.send", "email.fail", "email.retry", "email.deliver"],
  erp: ["erp.prepare", "erp.send", "erp.fail", "erp.retry", "erp.acknowledge"],
  issuer: [
    "issuer.request",
    "issuer.eligible",
    "issuer.expired",
    "issuer.ineligible",
  ],
  forwarder: [
    "forwarder.offer",
    "forwarder.accept",
    "forwarder.reject",
    "forwarder.complete",
  ],
};
const liveRoutes: Record<DemoDomain, string> = {
  voice: "/callcenter",
  push: "/dispatch",
  email: "/revenue",
  erp: "/revenue",
  issuer: "/contracts",
  forwarder: "/dispatch?board=forwarded",
};

export default function ExternalServiceDemoPage() {
  const { locale } = useTranslation();
  const copy = demoCopy(locale);
  const [state, setState] = useState<DemoState | null>(null);
  const [storageFailed, setStorageFailed] = useState(false);
  const [exportFailed, setExportFailed] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setSearch(window.location.search);
    try {
      setState(restoreDemoState(localStorage.getItem(DEMO_STORAGE_KEY)));
    } catch {
      setState(createDemoState());
      setStorageFailed(true);
    }
  }, []);

  const commit = (next: DemoState) => {
    setState(next);
    try {
      localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(next));
      setStorageFailed(false);
    } catch {
      setStorageFailed(true);
    }
  };
  const act = (action: DemoAction) => {
    if (state) commit(transitionDemo(state, action, new Date().toISOString()));
  };
  const download = () => {
    if (!state) return;
    setExportFailed(false);
    let url: string | undefined;
    const anchor = document.createElement("a");
    try {
      url = URL.createObjectURL(
        new Blob([exportDemoRecord(state)], {
          type: "application/json;charset=utf-8",
        }),
      );
      anchor.href = url;
      anchor.download = "external-service-SIMULATION.json";
      document.body.appendChild(anchor);
      anchor.click();
    } catch {
      setExportFailed(true);
    } finally {
      anchor.remove();
      if (url) {
        const downloadedUrl = url;
        window.setTimeout(() => URL.revokeObjectURL(downloadedUrl), 1000);
      }
    }
  };

  return (
    <div>
      <CanvasPageHeader
        theme={theme}
        title={copy.title}
        subtitle={copy.subtitle}
        actions={
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <CanvasBtn theme={theme} disabled={!state} onClick={download}>
              {copy.export}
            </CanvasBtn>
            <CanvasBtn
              theme={theme}
              disabled={!state}
              onClick={() => commit(createDemoState())}
            >
              {copy.reset}
            </CanvasBtn>
          </div>
        }
      />
      <div style={{ padding: 24, display: "grid", gap: 20 }}>
        <CanvasBanner
          theme={theme}
          tone="warn"
          title={copy.banner}
          body={copy.notice}
        />
        {storageFailed ? <div role="status">{copy.storageError}</div> : null}
        {exportFailed ? <div role="alert">{copy.exportError}</div> : null}
        {!state ? (
          <p role="status">{copy.loading}</p>
        ) : (
          <>
            <p style={{ margin: 0, color: theme.textMuted }}>{copy.person}</p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
                gap: 16,
              }}
            >
              {domains.map((domain) => {
                const detail = copy[`${domain}Detail`];
                const value = state[domain];
                const status = typeof value === "string" ? value : value.status;
                return (
                  <section key={domain} aria-label={copy.domains[domain]}>
                    <CanvasCard
                      theme={theme}
                      title={copy.domains[domain]}
                      subtitle={detail}
                    >
                      <div style={{ display: "grid", gap: 14 }}>
                        <div
                          aria-live="polite"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            flexWrap: "wrap",
                          }}
                        >
                          <span>{copy.status}</span>
                          <CanvasPill
                            theme={theme}
                            tone={
                              status === "failed" ||
                              status === "expired" ||
                              status === "ineligible"
                                ? "warn"
                                : "info"
                            }
                          >
                            {domain === "erp" && status === "pending"
                              ? copy.erpPending
                              : copy.states[status]}
                          </CanvasPill>
                          {typeof value !== "string" ? (
                            <span>
                              {copy.attempts}: {value.attempts}
                            </span>
                          ) : null}
                        </div>
                        <div
                          role="group"
                          aria-label={`${copy.domains[domain]} · ${copy.actions}`}
                          style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
                        >
                          {actions[domain].map((action) => (
                            <CanvasBtn
                              key={action}
                              theme={theme}
                              size="sm"
                              disabled={
                                transitionDemo(state, action, "") === state
                              }
                              onClick={() => act(action)}
                            >
                              {copy.action[action]}
                            </CanvasBtn>
                          ))}
                        </div>
                        {domain === "erp" && status === "acknowledged" ? (
                          <p>{copy.erpReceipt}</p>
                        ) : null}
                        <a
                          href={demoLiveHref(liveRoutes[domain], search)}
                          style={{ color: theme.accent }}
                        >
                          {copy.live}
                        </a>
                        <small style={{ color: theme.textMuted }}>
                          {copy.liveHint}
                        </small>
                      </div>
                    </CanvasCard>
                  </section>
                );
              })}
            </div>
            <CanvasCard
              theme={theme}
              title={copy.inbox}
              subtitle={copy.inboxHint}
            >
              {state.inbox.length ? (
                <ul style={{ display: "grid", gap: 12, paddingLeft: 20 }}>
                  {[...state.inbox].reverse().map((item) => (
                    <li key={item.id}>
                      <strong>{copy.domains[item.channel]}</strong>
                      <p>
                        {item.channel === "push"
                          ? copy.pushMessage
                          : copy.emailMessage}
                      </p>
                      <time dateTime={item.at}>
                        {new Date(item.at).toLocaleString(
                          locale === "zh" ? "zh-TW" : "en-US",
                        )}
                      </time>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>{copy.inboxEmpty}</p>
              )}
            </CanvasCard>
            <CanvasCard theme={theme} title={copy.events}>
              {state.events.length ? (
                <ol style={{ display: "grid", gap: 10, paddingLeft: 20 }}>
                  {[...state.events].reverse().map((event) => (
                    <li key={event.id}>
                      <strong>
                        {copy.domains[event.domain]} ·{" "}
                        {copy.action[event.action]}
                      </strong>
                      <div>
                        {event.domain === "erp" && event.status === "pending"
                          ? copy.erpPending
                          : copy.states[event.status]}{" "}
                        ·{" "}
                        <time dateTime={event.at}>
                          {new Date(event.at).toLocaleString(
                            locale === "zh" ? "zh-TW" : "en-US",
                          )}
                        </time>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>{copy.eventsEmpty}</p>
              )}
            </CanvasCard>
          </>
        )}
      </div>
    </div>
  );
}
