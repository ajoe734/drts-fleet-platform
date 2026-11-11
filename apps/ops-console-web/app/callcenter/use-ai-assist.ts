"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AddressPayload } from "@drts/contracts";
import {
  candidateToAddressPayload,
  type AddressMapPickerProvider,
} from "@drts/ui-web/client";

import { getOpsClient } from "@/lib/api-client";

import {
  acceptAssistOffer,
  applyAssistDraft,
  blockingUncertainFields,
  buildAssistOutcomeReport,
  composeOrderNotes,
  confirmAssistField,
  editAssistField,
  emptyAssistForm,
  sameAddress,
  type AssistAccuracyView,
  type AssistDraftView,
  type AssistField,
  type AssistFormState,
  type HandoffQueueItemView,
} from "./ai-assist";
import type { AssistAddressStatus } from "./ai-assist-panel";

export const ASSIST_POLL_INTERVAL_MS = 2500;
export const ASSIST_QUEUE_POLL_INTERVAL_MS = 5000;
export const ASSIST_ACCURACY_POLL_INTERVAL_MS = 60_000;

type AddressField = "pickup" | "dropoff";

export interface UseCallcenterAiAssistOptions {
  callId: string | null;
  callOpen: boolean;
  actorId: string;
  locale: "zh" | "en";
  provider: AddressMapPickerProvider;
  /** Write an AI value into the order form's own inputs. */
  onApplyPassenger: (
    field: "passengerName" | "passengerPhone",
    value: string,
  ) => void;
  onApplyAddress: (field: AddressField, address: AddressPayload) => void;
}

/**
 * CALLCENTER-AI-ASSIST-20261111: keeps the selected call's AI draft in sync
 * with the order form. Polls the draft while the call is open, fills empty
 * or still-AI-owned fields, geocodes AI addresses into the map pickers, and
 * never overwrites a field the agent changed.
 */
export function useCallcenterAiAssist({
  callId,
  callOpen,
  actorId,
  locale,
  provider,
  onApplyPassenger,
  onApplyAddress,
}: UseCallcenterAiAssistOptions) {
  const [draft, setDraft] = useState<AssistDraftView | null>(null);
  const [loadState, setLoadState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [form, setForm] = useState<AssistFormState>(() =>
    emptyAssistForm(callId),
  );
  const [addressStatus, setAddressStatus] = useState<
    Record<AddressField, AssistAddressStatus>
  >({ pickup: "idle", dropoff: "idle" });
  const [handoffs, setHandoffs] = useState<HandoffQueueItemView[]>([]);
  const [accuracy, setAccuracy] = useState<AssistAccuracyView | null>(null);

  const formRef = useRef(form);
  formRef.current = form;
  const appliedAddressRef = useRef<Record<AddressField, AddressPayload | null>>(
    { pickup: null, dropoff: null },
  );
  const addressRequestRef = useRef<Record<AddressField, number>>({
    pickup: 0,
    dropoff: 0,
  });
  const callbacksRef = useRef({
    onApplyPassenger,
    onApplyAddress,
    provider,
    actorId,
    locale,
  });
  callbacksRef.current = {
    onApplyPassenger,
    onApplyAddress,
    provider,
    actorId,
    locale,
  };

  const resolveAddress = useCallback(
    async (field: AddressField, text: string, forCallId: string) => {
      const request = ++addressRequestRef.current[field];
      setAddressStatus((current) => ({ ...current, [field]: "resolving" }));
      const {
        provider: geo,
        actorId: actor,
        locale: lang,
      } = callbacksRef.current;
      try {
        const response = await geo.search({
          q: text,
          limit: 1,
          surface: "callcenter",
          locale: lang === "zh" ? "zh-TW" : "en-US",
          requestedByActorId: actor,
        });
        if (
          request !== addressRequestRef.current[field] ||
          formRef.current.callId !== forCallId ||
          formRef.current.agentEdited[field]
        ) {
          return;
        }
        const candidate = response.candidates[0];
        const address = candidate
          ? candidateToAddressPayload(candidate, {
              surface: "callcenter",
              selectedByActorId: actor,
              selectedAt: new Date().toISOString(),
            })
          : null;
        if (!address) {
          setAddressStatus((current) => ({ ...current, [field]: "not_found" }));
          return;
        }
        appliedAddressRef.current[field] = address;
        callbacksRef.current.onApplyAddress(field, address);
        setAddressStatus((current) => ({ ...current, [field]: "applied" }));
      } catch {
        if (request === addressRequestRef.current[field]) {
          setAddressStatus((current) => ({ ...current, [field]: "error" }));
        }
      }
    },
    [],
  );

  const ingestDraft = useCallback(
    (next: AssistDraftView) => {
      const { state, changed } = applyAssistDraft(formRef.current, next);
      formRef.current = state;
      setForm(state);
      for (const field of changed) {
        const value = state.values[field] ?? "";
        if (field === "passengerName" || field === "passengerPhone") {
          callbacksRef.current.onApplyPassenger(field, value);
        } else if ((field === "pickup" || field === "dropoff") && value) {
          void resolveAddress(field, value, next.callId);
        }
      }
    },
    [resolveAddress],
  );

  // A different call starts from a clean assist state.
  useEffect(() => {
    const fresh = emptyAssistForm(callId);
    formRef.current = fresh;
    setForm(fresh);
    setDraft(null);
    setLoadState(callId ? "loading" : "idle");
    setAddressStatus({ pickup: "idle", dropoff: "idle" });
    appliedAddressRef.current = { pickup: null, dropoff: null };
    addressRequestRef.current = {
      pickup: addressRequestRef.current.pickup + 1,
      dropoff: addressRequestRef.current.dropoff + 1,
    };
  }, [callId]);

  useEffect(() => {
    if (!callId) {
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const result = await getOpsClient().get<{
          draft: AssistDraftView | null;
        }>(`/api/callcenter/sessions/${encodeURIComponent(callId)}/assist`);
        if (cancelled) return;
        setLoadState("ready");
        if (result.draft && result.draft.callId === callId) {
          setDraft(result.draft);
          ingestDraft(result.draft);
        }
      } catch {
        if (!cancelled) setLoadState("error");
      }
    };
    void load();
    if (!callOpen) {
      return () => {
        cancelled = true;
      };
    }
    const intervalId = window.setInterval(() => {
      void load();
    }, ASSIST_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [callId, callOpen, ingestDraft]);

  useEffect(() => {
    let cancelled = false;
    const loadQueue = async () => {
      try {
        const result = await getOpsClient().get<{
          items: HandoffQueueItemView[];
        }>("/api/callcenter/handoffs");
        if (!cancelled) setHandoffs(result.items ?? []);
      } catch {
        if (!cancelled) setHandoffs([]);
      }
    };
    void loadQueue();
    const intervalId = window.setInterval(() => {
      void loadQueue();
    }, ASSIST_QUEUE_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const loadAccuracy = useCallback(async () => {
    try {
      setAccuracy(
        await getOpsClient().get<AssistAccuracyView>(
          "/api/callcenter/assist/accuracy",
        ),
      );
    } catch {
      setAccuracy(null);
    }
  }, []);

  useEffect(() => {
    void loadAccuracy();
    const intervalId = window.setInterval(() => {
      void loadAccuracy();
    }, ASSIST_ACCURACY_POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [loadAccuracy]);

  const edit = useCallback((field: AssistField, value: string) => {
    const next = editAssistField(formRef.current, field, value);
    formRef.current = next;
    setForm(next);
  }, []);

  const confirm = useCallback((field: AssistField) => {
    const next = confirmAssistField(formRef.current, field);
    formRef.current = next;
    setForm(next);
  }, []);

  const acceptOffer = useCallback(
    (field: AssistField) => {
      const offer = formRef.current.offers[field];
      const next = acceptAssistOffer(formRef.current, field);
      formRef.current = next;
      setForm(next);
      if (offer === undefined || !next.callId) return;
      if (field === "passengerName" || field === "passengerPhone") {
        callbacksRef.current.onApplyPassenger(field, offer);
      } else if (field === "pickup" || field === "dropoff") {
        void resolveAddress(field, offer, next.callId);
      }
    },
    [resolveAddress],
  );

  /** Call from the map picker's onChange: tells agent edits from AI fills. */
  const observeAddress = useCallback(
    (field: AddressField, address: AddressPayload | null) => {
      if (sameAddress(address, appliedAddressRef.current[field])) {
        return;
      }
      const state = formRef.current;
      if (!state.aiApplied[field] && !address) {
        return;
      }
      // The agent picked another place (or cleared it): AI no longer owns it.
      addressRequestRef.current[field] += 1;
      appliedAddressRef.current[field] = null;
      setAddressStatus((current) => ({ ...current, [field]: "idle" }));
      const next = editAssistField(
        state,
        field,
        address?.address ?? address?.addressName ?? "",
      );
      // A deliberate pick always counts as the agent's own value.
      next.agentEdited = { ...next.agentEdited, [field]: true };
      formRef.current = next;
      setForm(next);
    },
    [],
  );

  const blocking = useMemo(
    () => blockingUncertainFields(form, draft),
    [draft, form],
  );

  const orderNotes = useCallback(
    (agentNotes: string) =>
      composeOrderNotes(agentNotes, formRef.current, locale),
    [locale],
  );

  /** After the order was created: report each field's outcome. Best effort. */
  const reportOutcome = useCallback(
    async (
      orderId: string,
      finalPresence: Partial<Record<AssistField, boolean>>,
    ) => {
      const state = formRef.current;
      if (!state.callId || !draft || draft.callId !== state.callId) {
        return;
      }
      try {
        await getOpsClient().post(
          `/api/callcenter/sessions/${encodeURIComponent(state.callId)}/assist/outcomes`,
          {
            body: {
              orderId,
              agentId: callbacksRef.current.actorId,
              fields: buildAssistOutcomeReport(state, finalPresence),
            },
          },
        );
        void loadAccuracy();
      } catch {
        // The order exists; a missing measurement must not bother the agent.
      }
    },
    [draft, loadAccuracy],
  );

  return {
    draft,
    loadState,
    form,
    addressStatus,
    blocking,
    handoffs,
    accuracy,
    edit,
    confirm,
    acceptOffer,
    observeAddress,
    orderNotes,
    reportOutcome,
  };
}
