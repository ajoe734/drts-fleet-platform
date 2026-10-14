"use client";

import { useEffect, useState } from "react";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasPageHeader,
  CanvasPill,
} from "@drts/ui-web";
import { useTranslation } from "../../lib/i18n";
import { buildFleetTheme } from "../../lib/fleet-portal-theme";
import {
  createDocumentDemoState,
  exportDocumentDemo,
  FLEET_DOCUMENT_DEMO_KEY,
  fleetDocumentExamples,
  restoreDocumentDemo,
  transitionDocumentDemo,
  type DocumentDemoAction,
  type DocumentDemoState,
} from "../../lib/fleet-document-demo";
import { documentDemoCopy } from "./translations";

const theme = buildFleetTheme();
const externalActions: Record<"storage" | "scanner", DocumentDemoAction[]> = {
  storage: [
    "storage.start",
    "storage.fail",
    "storage.retry",
    "storage.succeed",
    "storage.skip",
  ],
  scanner: [
    "scanner.start",
    "scanner.fail",
    "scanner.retry",
    "scanner.succeed",
    "scanner.skip",
  ],
};
const localActions: DocumentDemoAction[] = [
  "document.confirm",
  "submission.submit",
  "submission.withdraw",
  "submission.resubmit",
];

export default function FleetDocumentDemoPage() {
  const { locale } = useTranslation();
  const copy = documentDemoCopy(locale);
  const [state, setState] = useState<DocumentDemoState | null>(null);
  const [storageFailed, setStorageFailed] = useState(false);
  const [exportFailed, setExportFailed] = useState(false);

  useEffect(() => {
    try {
      setState(
        restoreDocumentDemo(localStorage.getItem(FLEET_DOCUMENT_DEMO_KEY)),
      );
    } catch {
      setState(createDocumentDemoState());
      setStorageFailed(true);
    }
  }, []);

  const commit = (next: DocumentDemoState) => {
    setState(next);
    try {
      localStorage.setItem(FLEET_DOCUMENT_DEMO_KEY, JSON.stringify(next));
      setStorageFailed(false);
    } catch {
      setStorageFailed(true);
    }
  };
  const act = (action: DocumentDemoAction) => {
    if (state) {
      const next = transitionDocumentDemo(
        state,
        action,
        new Date().toISOString(),
      );
      if (next !== state) commit(next);
    }
  };
  const download = () => {
    if (!state) return;
    setExportFailed(false);
    let url: string | undefined;
    try {
      const blob = new Blob([exportDocumentDemo(state)], {
        type: "application/json",
      });
      url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "fleet-document-SIMULATION.json";
      link.click();
    } catch {
      setExportFailed(true);
    } finally {
      if (url) {
        const objectUrl = url;
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      }
    }
  };
  const example = fleetDocumentExamples.find(
    (item) => item.id === state?.exampleId,
  );
  const controls = (actions: DocumentDemoAction[], label: string) => (
    <div
      role="group"
      aria-label={`${label} · ${copy.actions}`}
      style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
    >
      {actions.map((action) => (
        <CanvasBtn
          key={action}
          theme={theme}
          size="sm"
          disabled={
            !state || transitionDocumentDemo(state, action, "") === state
          }
          onClick={() => act(action)}
        >
          {copy.action[action]}
        </CanvasBtn>
      ))}
    </div>
  );

  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={copy.title}
        subtitle={copy.banner}
        actions={
          <>
            <CanvasBtn theme={theme} disabled={!state} onClick={download}>
              {copy.download}
            </CanvasBtn>
            <CanvasBtn
              theme={theme}
              disabled={!state}
              onClick={() => {
                commit(createDocumentDemoState());
                setExportFailed(false);
              }}
            >
              {copy.reset}
            </CanvasBtn>
          </>
        }
      />
      <div style={{ padding: 24, display: "grid", gap: 16 }}>
        <CanvasBanner
          theme={theme}
          tone="warn"
          title={copy.banner}
          body={copy.notice}
        />
        {storageFailed ? <p role="status">{copy.storageError}</p> : null}
        {exportFailed ? <p role="alert">{copy.exportError}</p> : null}
        {!state ? (
          <p role="status">{copy.loading}</p>
        ) : (
          <>
            <section aria-label={copy.example}>
              <CanvasCard theme={theme} title={copy.example}>
                <div style={{ display: "grid", gap: 12 }}>
                  <label htmlFor="demo-example">{copy.select}</label>
                  <select
                    id="demo-example"
                    value={state.exampleId ?? ""}
                    disabled={state.confirmed}
                    onChange={(event) => {
                      if (event.target.value === "vehicle_registration")
                        act("select.vehicle_registration");
                      else if (event.target.value === "other")
                        act("select.other");
                    }}
                    style={{
                      padding: 10,
                      background: theme.bg,
                      color: theme.text,
                      border: `1px solid ${theme.border}`,
                      borderRadius: 8,
                    }}
                  >
                    <option value="" disabled>
                      {copy.placeholder}
                    </option>
                    {fleetDocumentExamples.map((item) => (
                      <option key={item.id} value={item.id}>
                        {copy.examples[item.id]}
                      </option>
                    ))}
                  </select>
                  {example ? (
                    <dl aria-label={copy.metadata}>
                      <dt>{copy.name}</dt>
                      <dd>{example.originalFileName}</dd>
                      <dt>{copy.type}</dt>
                      <dd>
                        {example.documentType} / {example.contentType}
                      </dd>
                      <dt>{copy.size}</dt>
                      <dd>{example.fileSize}</dd>
                    </dl>
                  ) : null}
                </div>
              </CanvasCard>
            </section>
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
                gap: 16,
              }}
            >
              {(["storage", "scanner"] as const).map((domain) => (
                <section key={domain} aria-label={copy[domain]}>
                  <CanvasCard theme={theme} title={copy[domain]}>
                    <div style={{ display: "grid", gap: 12 }}>
                      <p>{copy.externalHint}</p>
                      <div aria-live="polite">
                        <span>{copy.status}: </span>
                        <CanvasPill
                          theme={theme}
                          tone={
                            state[domain].status === "failed" ||
                            state[domain].status === "skipped"
                              ? "warn"
                              : "info"
                          }
                        >
                          {copy.states[state[domain].status]}
                        </CanvasPill>
                        <p>
                          {copy.attempts}: {state[domain].attempts}
                        </p>
                      </div>
                      {controls(externalActions[domain], copy[domain])}
                      {state[domain].status === "skipped" ? (
                        <p>{copy.skippedHint}</p>
                      ) : null}
                    </div>
                  </CanvasCard>
                </section>
              ))}
            </div>
            <section aria-label={copy.local}>
              <CanvasCard theme={theme} title={copy.local}>
                <div style={{ display: "grid", gap: 12 }}>
                  <p>{copy.localHint}</p>
                  <div aria-live="polite">
                    <p>{state.confirmed ? copy.confirmed : copy.unconfirmed}</p>
                    <CanvasPill theme={theme} tone="info">
                      {copy.submission[state.submission]}
                    </CanvasPill>
                  </div>
                  {controls(localActions, copy.local)}
                  <a href="/supply/submissions" style={{ color: theme.accent }}>
                    {copy.live}
                  </a>
                  <small>{copy.liveHint}</small>
                </div>
              </CanvasCard>
            </section>
            <section aria-label={copy.history}>
              <CanvasCard theme={theme} title={copy.history}>
                {state.events.length ? (
                  <ol>
                    {state.events.map((event, index) => (
                      <li key={index}>
                        {copy.action[event.action]} · {event.at}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p>{copy.noEvents}</p>
                )}
              </CanvasCard>
            </section>
          </>
        )}
      </div>
    </>
  );
}
