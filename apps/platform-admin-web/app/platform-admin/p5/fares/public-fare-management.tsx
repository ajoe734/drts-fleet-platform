"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type {
  MultiTaxiFareManagementList,
  MultiTaxiManagedFareVersion,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTableColumn,
} from "@drts/ui-web";
import { usePlatformAdminClient } from "@/lib/admin-client";
import { usePlatformAdminAuthority } from "@/lib/platform-admin-authority";
import { useTranslation } from "@/lib/i18n";
import {
  demoChange,
  demoCreate,
  demoFareList,
  demoSchedule,
  emptyFareEditor,
  evaluateDemo,
  fareEditor,
  fareEditorCommand,
  fareRuleFields,
  numericFareFields,
  taiwanDateInput,
  taiwanDateISO,
  type FareEditor,
} from "./fare-management-model";

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });
const inputStyle: CSSProperties = {
  border: `1px solid ${theme.border}`,
  borderRadius: 8,
  background: theme.bgRaised,
  color: theme.text,
  padding: "8px 10px",
  minHeight: 36,
  width: "100%",
};
const actionsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};
type TableRow = MultiTaxiManagedFareVersion & Record<string, unknown>;

function failureKey(error: unknown): string {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error
        ? error.message
        : "";
  if (code === "fare_input_invalid" || code === "fare_filing_metadata_required")
    return "fareManage.inputError";
  if (code === "fare_revision_conflict") return "fareManage.revisionError";
  if (
    code === "fare_effective_time_conflict" ||
    code === "fare_timeline_conflict"
  )
    return "fareManage.timeError";
  if (code === "fare_replacement_required") return "fareManage.replacement";
  if (code === "fare_lifecycle_conflict" || code === "fare_version_not_found")
    return "fareManage.lifecycleError";
  if (code === "fare_version_exists") return "fareManage.existsError";
  return "fareManage.saveError";
}

export function PublicFareManagement() {
  const { locale, t } = useTranslation();
  const client = usePlatformAdminClient();
  const authority = usePlatformAdminAuthority();
  const canWrite = authority.scopes.includes("foundation:write");
  const [demo, setDemo] = useState(false);
  const [view, setView] = useState<MultiTaxiFareManagementList | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editor, setEditor] = useState<FareEditor | null>(null);
  const [editRevision, setEditRevision] = useState<number | null>(null);
  const [filingRef, setFilingRef] = useState("");
  const [evidence, setEvidence] = useState("");
  const [scheduleLocal, setScheduleLocal] = useState("");
  const [reason, setReason] = useState("");
  const generation = useRef(0);
  const intent = useRef<{ fingerprint: string; key: string } | null>(null);
  const busy = useRef(false);
  const selected =
    view?.items.find((item) => item.fareVersionId === selectedId) ?? null;
  const selectedEffectiveFrom = selected?.effectiveFrom;
  const writable =
    (demo || canWrite) && !pending && !loading && !loadError && view !== null;

  const refresh = useCallback(async () => {
    if (demo) return;
    const current = ++generation.current;
    setLoading(true);
    try {
      const result = await client.listPlatformFareVersions();
      if (current !== generation.current) return;
      setView(result);
      setLoadError(false);
      setSelectedId((previous) =>
        result.items.some((item) => item.fareVersionId === previous)
          ? previous
          : (result.activeFareVersionId ??
            result.items[0]?.fareVersionId ??
            ""),
      );
    } catch {
      if (current === generation.current) setLoadError(true);
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [client, demo]);

  useEffect(() => {
    if (!demo) void refresh();
    return () => {
      generation.current += 1;
    };
  }, [demo, refresh]);

  useEffect(() => {
    setFilingRef("");
    setEvidence("");
    setReason("");
    setScheduleLocal(
      selectedEffectiveFrom ? taiwanDateInput(selectedEffectiveFrom) : "",
    );
    // Selection changes reset only the action fields; a failed editor keeps its input.
  }, [selectedId, selectedEffectiveFrom]);

  function switchMode(nextDemo: boolean) {
    if (busy.current) return;
    generation.current += 1;
    setDemo(nextDemo);
    setEditor(null);
    setError(null);
    setNotice(null);
    intent.current = null;
    setLoadError(false);
    if (nextDemo) {
      const next = demoFareList();
      setView(next);
      setSelectedId(next.activeFareVersionId!);
      setLoading(false);
    } else {
      setView(null);
      setSelectedId("");
      setLoading(true);
    }
  }

  async function perform(
    action: string,
    command: unknown,
    live: (key: string) => Promise<MultiTaxiManagedFareVersion>,
    simulation: () => MultiTaxiFareManagementList,
    selectId = selectedId,
  ) {
    if (!writable || busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      if (demo) {
        const next = simulation();
        setView(next);
        setSelectedId(selectId);
      } else {
        const fingerprint = JSON.stringify([action, selectId, command]);
        if (intent.current?.fingerprint !== fingerprint)
          intent.current = { fingerprint, key: crypto.randomUUID() };
        const saved = await live(intent.current.key);
        intent.current = null;
        setSelectedId(saved.fareVersionId);
        setView((previous) =>
          previous
            ? {
                ...previous,
                items: [
                  saved,
                  ...previous.items.filter(
                    (item) => item.fareVersionId !== saved.fareVersionId,
                  ),
                ],
              }
            : previous,
        );
        // A failed list refresh does not turn a committed mutation into a failed save.
        await refresh();
      }
      setEditor(null);
      setNotice(demo ? "fareManage.demoSaved" : "fareManage.saved");
    } catch (failure) {
      setError(failureKey(failure));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  function selectRecord(record: MultiTaxiManagedFareVersion) {
    if (busy.current) return;
    setSelectedId(record.fareVersionId);
    setEditor(null);
    setError(null);
    setNotice(null);
    intent.current = null;
  }

  async function saveEditor() {
    if (!editor || !view) return;
    try {
      const command = fareEditorCommand(editor);
      if (editRevision === null)
        await perform(
          "create",
          command,
          (key) => client.createPlatformFareVersion(command, key),
          () => demoCreate(view, command),
          command.fareVersionId,
        );
      else {
        const { fareVersionId, ...body } = command;
        const update = { ...body, expectedRevision: editRevision };
        await perform(
          "update",
          update,
          (key) => client.updatePlatformFareVersion(fareVersionId, update, key),
          () => demoChange(view, fareVersionId, body),
          fareVersionId,
        );
      }
    } catch (failure) {
      setError(failureKey(failure));
    }
  }

  function schedule(immediate: boolean) {
    if (!selected || !view) return;
    try {
      const command = {
        expectedRevision: selected.revision,
        effectiveFrom: immediate ? null : taiwanDateISO(scheduleLocal),
      };
      void perform(
        "schedule",
        command,
        (key) =>
          client.schedulePlatformFareVersion(
            selected.fareVersionId,
            command,
            key,
          ),
        () => demoSchedule(view, selected.fareVersionId, command.effectiveFrom),
      );
    } catch (failure) {
      setError(failureKey(failure));
    }
  }

  const date = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
          timeZone: "Asia/Taipei",
          dateStyle: "short",
          timeStyle: "short",
        }).format(new Date(value))
      : "—";
  const money = (amount: number) =>
    new Intl.NumberFormat(locale === "zh" ? "zh-TW" : "en-US", {
      style: "currency",
      currency: "TWD",
      maximumFractionDigits: 0,
    }).format(amount);
  const columns: CanvasTableColumn<TableRow>[] = [
    { h: t("p5.fares.col.id"), k: "fareVersionId", mono: true },
    { h: t("p5.fares.col.name"), k: "displayName" },
    {
      h: t("p5.fares.col.status"),
      r: (row) => (
        <CanvasPill
          theme={theme}
          tone={
            row.status === "active"
              ? "success"
              : row.status === "filed"
                ? "info"
                : "neutral"
          }
        >
          {t(`p5.status.${row.status}`)}
        </CanvasPill>
      ),
    },
    { h: t("p5.fares.col.effectiveFrom"), r: (row) => date(row.effectiveFrom) },
    {
      h: t("p5.fares.col.filingRef"),
      r: (row) => row.authorityFilingRef ?? "—",
    },
    {
      h: "",
      r: (row) => (
        <CanvasBtn
          theme={theme}
          size="xs"
          disabled={pending}
          onClick={() => selectRecord(row)}
        >
          {row.availableActions.schedule
            ? t("p5.fares.schedule")
            : t("p5.fares.preview")}
        </CanvasBtn>
      ),
    },
  ];
  const field = (label: string, control: ReactNode) => (
    <label key={label} style={{ display: "grid", gap: 5 }}>
      <span>{label}</span>
      {control}
    </label>
  );

  return (
    <div style={{ padding: 24, display: "grid", gap: 16 }}>
      <CanvasPageHeader
        theme={theme}
        title={t("p5.fares.title")}
        subtitle={t("p5.fares.subtitle")}
        actions={
          <div style={actionsStyle}>
            <CanvasBtn
              theme={theme}
              disabled={pending}
              onClick={() => switchMode(!demo)}
            >
              {t(demo ? "fareManage.exitDemo" : "fareManage.enterDemo")}
            </CanvasBtn>
            <CanvasBtn
              theme={theme}
              variant="primary"
              icon="plus"
              disabled={!writable}
              onClick={() => {
                setEditor(
                  selected ? fareEditor(selected, true) : emptyFareEditor(),
                );
                setEditRevision(null);
                setError(null);
                setNotice(null);
              }}
            >
              {t("p5.fares.create")}
            </CanvasBtn>
          </div>
        }
      />
      {demo && (
        <CanvasBanner
          theme={theme}
          tone="warn"
          body={t("fareManage.demoNotice")}
        />
      )}
      {loading && (
        <CanvasBanner
          theme={theme}
          tone="info"
          body={t("fareManage.loading")}
        />
      )}
      {loadError && (
        <div role="alert">
          <CanvasBanner
            theme={theme}
            tone="danger"
            body={t(
              notice === "fareManage.saved"
                ? "fareManage.savedReadError"
                : "fareManage.loadError",
            )}
          />
          <CanvasBtn
            theme={theme}
            disabled={pending || loading}
            onClick={() => void refresh()}
          >
            {t("fareManage.retry")}
          </CanvasBtn>
        </div>
      )}
      {error && (
        <div role="alert">
          <CanvasBanner theme={theme} tone="danger" body={t(error)} />
        </div>
      )}
      {notice && (
        <div role="status">
          <CanvasBanner theme={theme} tone="info" body={t(notice)} />
        </div>
      )}
      <div style={actionsStyle}>
        {demo ? (
          <>
            <CanvasBtn
              theme={theme}
              disabled={pending}
              onClick={() => switchMode(true)}
            >
              {t("fareManage.resetDemo")}
            </CanvasBtn>
            <CanvasBtn
              theme={theme}
              disabled={!selected?.scheduledFor || pending}
              onClick={() => {
                if (view && selected?.scheduledFor)
                  setView(evaluateDemo(view, selected.scheduledFor));
              }}
            >
              {t("fareManage.advanceDemo")}
            </CanvasBtn>
          </>
        ) : (
          <CanvasBtn
            theme={theme}
            disabled={loading || pending}
            onClick={() => void refresh()}
          >
            {t("fareManage.refresh")}
          </CanvasBtn>
        )}
        {view && (
          <span>
            {t("fareManage.evaluatedAt", { time: date(view.evaluatedAt) })}
          </span>
        )}
      </div>
      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "minmax(0, 1.45fr) minmax(280px, 1fr)",
          alignItems: "start",
        }}
      >
        <CanvasCard theme={theme} padding={0}>
          <CanvasTable
            theme={theme}
            columns={columns}
            rows={(view?.items ?? []) as TableRow[]}
          />
          {!loading && !loadError && view?.items.length === 0 && (
            <CanvasBanner
              theme={theme}
              tone="info"
              body={t("fareManage.empty")}
            />
          )}
        </CanvasCard>
        <CanvasCard
          theme={theme}
          title={
            editor
              ? t(editRevision === null ? "p5.fares.create" : "fareManage.edit")
              : t("p5.fares.previewCard")
          }
          subtitle={
            selected && !editor
              ? `${selected.fareVersionId} · ${t(`p5.status.${selected.status}`)}`
              : undefined
          }
        >
          {editor ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void saveEditor();
              }}
              style={{ display: "grid", gap: 12 }}
            >
              {(
                [
                  "fareVersionId",
                  "displayName",
                  "publicSummary",
                  "sourceReference",
                ] as const
              ).map((key) =>
                field(
                  t(`fareManage.field.${key}`),
                  <input
                    key={key}
                    aria-label={t(`fareManage.field.${key}`)}
                    required
                    style={inputStyle}
                    disabled={
                      pending ||
                      (key === "fareVersionId" && editRevision !== null)
                    }
                    value={editor[key]}
                    onChange={(event) =>
                      setEditor({ ...editor, [key]: event.target.value })
                    }
                  />,
                ),
              )}
              {field(
                t("fareManage.field.effectiveLocal"),
                <input
                  type="datetime-local"
                  aria-label={t("fareManage.field.effectiveLocal")}
                  required
                  style={inputStyle}
                  disabled={pending}
                  value={editor.effectiveLocal}
                  onChange={(event) =>
                    setEditor({ ...editor, effectiveLocal: event.target.value })
                  }
                />,
              )}
              {numericFareFields.map((key) =>
                field(
                  t(`fareManage.field.${key}`),
                  <input
                    key={key}
                    type="number"
                    min={
                      [
                        "baseDistanceMeters",
                        "distanceIncrementMeters",
                        "delayIncrementSeconds",
                        "totalIncrement",
                      ].includes(key)
                        ? 1
                        : 0
                    }
                    step={1}
                    required
                    style={inputStyle}
                    aria-label={t(`fareManage.field.${key}`)}
                    disabled={pending}
                    value={editor.parameters[key]}
                    onChange={(event) =>
                      setEditor({
                        ...editor,
                        parameters: {
                          ...editor.parameters,
                          [key]: event.target.value,
                        },
                      })
                    }
                  />,
                ),
              )}
              {(
                [
                  "nightSurchargeWindowStart",
                  "nightSurchargeWindowEnd",
                ] as const
              ).map((key) =>
                field(
                  t(`fareManage.field.${key}`),
                  <input
                    key={key}
                    type="time"
                    required
                    aria-label={t(`fareManage.field.${key}`)}
                    style={inputStyle}
                    disabled={pending}
                    value={editor.parameters[key]}
                    onChange={(event) =>
                      setEditor({
                        ...editor,
                        parameters: {
                          ...editor.parameters,
                          [key]: event.target.value,
                        },
                      })
                    }
                  />,
                ),
              )}
              {Object.entries(fareRuleFields).map(([key, options]) =>
                field(
                  t(`fareManage.field.${key}`),
                  <select
                    key={key}
                    required
                    style={inputStyle}
                    aria-label={t(`fareManage.field.${key}`)}
                    disabled={pending}
                    value={
                      editor.parameters[key as keyof typeof fareRuleFields]
                    }
                    onChange={(event) =>
                      setEditor({
                        ...editor,
                        parameters: {
                          ...editor.parameters,
                          [key]: event.target.value,
                        },
                      })
                    }
                  >
                    <option value="">{t("fareManage.choose")}</option>
                    {options.map((option) => (
                      <option key={option} value={option}>
                        {t(`fareManage.rule.${option}`)}
                      </option>
                    ))}
                  </select>,
                ),
              )}
              {editor.fees.map((fee, index) => (
                <div key={index} style={{ display: "grid", gap: 6 }}>
                  {field(
                    t("fareManage.feeName"),
                    <input
                      aria-label={`${t("fareManage.feeName")} ${index + 1}`}
                      required
                      style={inputStyle}
                      disabled={pending}
                      value={fee.name}
                      onChange={(event) =>
                        setEditor({
                          ...editor,
                          fees: editor.fees.map((item, i) =>
                            i === index
                              ? { ...item, name: event.target.value }
                              : item,
                          ),
                        })
                      }
                    />,
                  )}
                  {field(
                    t("fareManage.feeAmount"),
                    <input
                      type="number"
                      min={0}
                      step={1}
                      required
                      aria-label={`${t("fareManage.feeAmount")} ${index + 1}`}
                      style={inputStyle}
                      disabled={pending}
                      value={fee.amount}
                      onChange={(event) =>
                        setEditor({
                          ...editor,
                          fees: editor.fees.map((item, i) =>
                            i === index
                              ? { ...item, amount: event.target.value }
                              : item,
                          ),
                        })
                      }
                    />,
                  )}
                  <CanvasBtn
                    theme={theme}
                    disabled={pending}
                    onClick={() =>
                      setEditor({
                        ...editor,
                        fees: editor.fees.filter((_, i) => i !== index),
                      })
                    }
                  >
                    {t("fareManage.removeFee")}
                  </CanvasBtn>
                </div>
              ))}
              <CanvasBtn
                theme={theme}
                disabled={pending}
                onClick={() =>
                  setEditor({
                    ...editor,
                    fees: [...editor.fees, { name: "", amount: "" }],
                  })
                }
              >
                {t("fareManage.addFee")}
              </CanvasBtn>
              <div style={actionsStyle}>
                <CanvasBtn
                  theme={theme}
                  type="submit"
                  variant="primary"
                  disabled={!writable}
                >
                  {t(pending ? "fareManage.saving" : "fareManage.saveDraft")}
                </CanvasBtn>
                <CanvasBtn
                  theme={theme}
                  disabled={pending}
                  onClick={() => {
                    setEditor(null);
                    setError(null);
                  }}
                >
                  {t("fareManage.cancel")}
                </CanvasBtn>
              </div>
            </form>
          ) : selected ? (
            <div style={{ display: "grid", gap: 14 }}>
              <CanvasDL
                theme={theme}
                cols={1}
                items={[
                  {
                    k: t("fareManage.field.baseFare"),
                    v: `${money(selected.tariff.baseFare)} / ${selected.tariff.baseDistanceMeters} m`,
                    mono: true,
                  },
                  {
                    k: t("p5.fares.distanceFare"),
                    v: `${money(selected.tariff.distanceRate)} / ${selected.tariff.distanceIncrementMeters} m`,
                    mono: true,
                  },
                  {
                    k: t("p5.fares.waitingFare"),
                    v: `${money(selected.tariff.delayRate)} / ${selected.tariff.delayIncrementSeconds} s`,
                    mono: true,
                  },
                  {
                    k: t("fareManage.field.nightSurchargeAmount"),
                    v: `${money(selected.tariff.nightSurchargeAmount)} · ${selected.tariff.nightSurchargeWindowStart}–${selected.tariff.nightSurchargeWindowEnd}`,
                    mono: true,
                  },
                  ...Object.entries(fareRuleFields).map(([key]) => ({
                    k: t(`fareManage.field.${key}`),
                    v: t(
                      `fareManage.rule.${selected.tariff[key as keyof typeof fareRuleFields]}`,
                    ),
                  })),
                  {
                    k: t("fareManage.field.totalIncrement"),
                    v: money(selected.tariff.totalIncrement),
                    mono: true,
                  },
                  ...Object.entries(selected.tariff.additionalFees).map(
                    ([name, amount]) => ({
                      k: name,
                      v: money(amount),
                      mono: true,
                    }),
                  ),
                  {
                    k: t("fareManage.field.publicSummary"),
                    v: selected.publicSummary || "—",
                  },
                  {
                    k: t("fareManage.field.sourceReference"),
                    v: selected.sourceReference,
                  },
                  {
                    k: t("fareManage.field.effectiveLocal"),
                    v: date(selected.effectiveFrom),
                    mono: true,
                  },
                  {
                    k: t("fareManage.effectiveUntil"),
                    v: date(selected.effectiveUntil),
                    mono: true,
                  },
                  {
                    k: t("p5.fares.col.filingRef"),
                    v: selected.authorityFilingRef ?? "—",
                  },
                  {
                    k: t("fareManage.evidence"),
                    v: selected.filingEvidenceReference ?? "—",
                  },
                  { k: t("fareManage.filedAt"), v: date(selected.filedAt) },
                  { k: t("fareManage.filedBy"), v: selected.filedBy ?? "—" },
                ]}
              />
              {selected.publicationScheduled && (
                <CanvasBanner
                  theme={theme}
                  tone="info"
                  body={t("fareManage.scheduled", {
                    time: date(selected.scheduledFor),
                  })}
                />
              )}
              {selected.retirementBlockedReason && (
                <CanvasBanner
                  theme={theme}
                  tone="info"
                  body={t("fareManage.replacement")}
                />
              )}
              {selected.availableActions.edit && (
                <CanvasBtn
                  theme={theme}
                  disabled={!writable}
                  onClick={() => {
                    setEditor(fareEditor(selected, false));
                    setEditRevision(selected.revision);
                    setError(null);
                  }}
                >
                  {t("fareManage.edit")}
                </CanvasBtn>
              )}
              {selected.availableActions.file &&
                (demo ? (
                  <div style={actionsStyle}>
                    <CanvasBtn
                      theme={theme}
                      disabled={!writable}
                      onClick={() => setNotice("fareManage.filingUnavailable")}
                    >
                      {t("fareManage.tryDemoFiling")}
                    </CanvasBtn>
                    <CanvasBtn
                      theme={theme}
                      disabled={!writable}
                      onClick={() =>
                        void perform(
                          "demo-skip",
                          {},
                          async () => {
                            throw new Error("demo only");
                          },
                          () =>
                            demoChange(view!, selected.fareVersionId, {
                              status: "filed",
                              authorityFilingRef: null,
                              filingEvidenceReference: null,
                              filedAt: view!.evaluatedAt,
                              filedBy: "demo",
                              availableActions: {
                                edit: false,
                                file: false,
                                schedule: true,
                                retire: true,
                              },
                            }),
                        )
                      }
                    >
                      {t("fareManage.skipFiling")}
                    </CanvasBtn>
                  </div>
                ) : (
                  <form
                    style={{ display: "grid", gap: 8 }}
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!filingRef.trim() || !evidence.trim()) {
                        setError("fareManage.inputError");
                        return;
                      }
                      const command = {
                        expectedRevision: selected.revision,
                        authorityFilingRef: filingRef.trim(),
                        filingEvidenceReference: evidence.trim(),
                      };
                      void perform(
                        "file",
                        command,
                        (key) =>
                          client.recordPlatformFareVersionFiling(
                            selected.fareVersionId,
                            command,
                            key,
                          ),
                        () => view!,
                      );
                    }}
                  >
                    {field(
                      t("p5.fares.col.filingRef"),
                      <input
                        required
                        aria-label={t("p5.fares.col.filingRef")}
                        style={inputStyle}
                        disabled={pending}
                        value={filingRef}
                        onChange={(event) => setFilingRef(event.target.value)}
                      />,
                    )}
                    {field(
                      t("fareManage.evidence"),
                      <input
                        required
                        aria-label={t("fareManage.evidence")}
                        style={inputStyle}
                        disabled={pending}
                        value={evidence}
                        onChange={(event) => setEvidence(event.target.value)}
                      />,
                    )}
                    <CanvasBanner
                      theme={theme}
                      tone="info"
                      body={t("fareManage.manualFiling")}
                    />
                    <CanvasBtn theme={theme} type="submit" disabled={!writable}>
                      {t("fareManage.recordFiling")}
                    </CanvasBtn>
                  </form>
                ))}
              {selected.availableActions.schedule && (
                <div style={{ display: "grid", gap: 8 }}>
                  {field(
                    t("fareManage.field.effectiveLocal"),
                    <input
                      type="datetime-local"
                      aria-label={t("fareManage.field.effectiveLocal")}
                      style={inputStyle}
                      disabled={pending}
                      value={scheduleLocal}
                      onChange={(event) => setScheduleLocal(event.target.value)}
                    />,
                  )}
                  <div style={actionsStyle}>
                    <CanvasBtn
                      theme={theme}
                      disabled={!writable || !scheduleLocal}
                      onClick={() => schedule(false)}
                    >
                      {t("p5.fares.schedule")}
                    </CanvasBtn>
                    <CanvasBtn
                      theme={theme}
                      disabled={!writable}
                      onClick={() => schedule(true)}
                    >
                      {t("fareManage.activateNow")}
                    </CanvasBtn>
                  </div>
                </div>
              )}
              {selected.availableActions.retire && (
                <form
                  style={{ display: "grid", gap: 8 }}
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!reason.trim()) {
                      setError("fareManage.inputError");
                      return;
                    }
                    const command = {
                      expectedRevision: selected.revision,
                      reason: reason.trim(),
                    };
                    void perform(
                      "retire",
                      command,
                      (key) =>
                        client.retirePlatformFareVersion(
                          selected.fareVersionId,
                          command,
                          key,
                        ),
                      () =>
                        demoChange(view!, selected.fareVersionId, {
                          status: "retired",
                          availableActions: {
                            edit: false,
                            file: false,
                            schedule: false,
                            retire: false,
                          },
                        }),
                    );
                  }}
                >
                  {field(
                    t("fareManage.retireReason"),
                    <input
                      required
                      aria-label={t("fareManage.retireReason")}
                      style={inputStyle}
                      disabled={pending}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                    />,
                  )}
                  <CanvasBtn theme={theme} type="submit" disabled={!writable}>
                    {t("fareManage.retire")}
                  </CanvasBtn>
                </form>
              )}
            </div>
          ) : (
            <CanvasBanner
              theme={theme}
              tone="info"
              body={t("fareManage.selectVersion")}
            />
          )}
        </CanvasCard>
      </div>
    </div>
  );
}
