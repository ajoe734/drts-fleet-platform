"use client";

import React, { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { IncidentRecord } from "@drts/contracts";
import { getOpsClient, createOpsDispatchEventSource } from "@/lib/api-client";
import { type CanvasTone } from "@drts/ui-web";

export interface SosSoundContextType {
  incidents: IncidentRecord[];
  soundOff: boolean;
  audioBlocked: boolean;
  toggleSound: () => Promise<void>;
  handleEnableSound: () => Promise<void>;
  pendingAlert: any; // Mapped pending alert
  pendingCount: number;
  soundTone: CanvasTone;
  soundLabel: string;
  soundTag: string;
  fetchIncidents: () => Promise<void>;
}

const SosSoundContext = createContext<SosSoundContextType | undefined>(undefined);

export function SosSoundProvider({ children }: { children: ReactNode }) {
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [soundOff, setSoundOff] = useState<boolean>(false);
  const [audioBlocked, setAudioBlocked] = useState<boolean>(true);
  const [nowTime, setNowTime] = useState<number>(Date.now());

  // Fetch incidents from API
  const fetchIncidents = async () => {
    try {
      const client = getOpsClient();
      const res = await client.get<any>("/api/incidents");
      const items: IncidentRecord[] = Array.isArray(res)
        ? res
        : res?.items || [];
      setIncidents(items);
    } catch (err) {
      console.error("Failed to fetch incidents in SosSoundProvider:", err);
    }
  };

  useEffect(() => {
    void fetchIncidents();

    // Poll every 5s for updating elapsed waiting timers
    const timeTimer = setInterval(() => {
      setNowTime(Date.now());
    }, 5000);

    // Wire SSE stream for live updates
    let sse: EventSource | null = null;
    const handleUpdate = () => {
      void fetchIncidents();
    };

    try {
      sse = createOpsDispatchEventSource();
      sse.addEventListener("message", handleUpdate);
      sse.addEventListener("order_created", handleUpdate);
      sse.addEventListener("order_updated", handleUpdate);
      sse.addEventListener("dispatch_job_updated", handleUpdate);
      sse.addEventListener("driver_location_updated", handleUpdate);
      sse.addEventListener("supply_lifecycle_updated", handleUpdate);
      sse.addEventListener("incident_created", handleUpdate);
      sse.addEventListener("incident_updated", handleUpdate);
    } catch (e) {
      console.error("Failed to initialize SSE in SosSoundProvider:", e);
    }

    // Read saved sound preference
    const savedSound = localStorage.getItem("drts-sos-sound-off");
    if (savedSound === "true") {
      setSoundOff(true);
    }

    // Check initial AudioContext block state
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const tempCtx = new AudioCtx();
        if (tempCtx.state === "running") {
          setAudioBlocked(false);
        } else {
          setAudioBlocked(true);
        }
        tempCtx.close();
      } else {
        setAudioBlocked(true);
      }
    } catch {
      setAudioBlocked(true);
    }

    // Listen to user interaction to detect if browser unblocks audio
    const handleInteraction = async () => {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const tempCtx = new AudioCtx();
          if (tempCtx.state === "suspended") {
            await tempCtx.resume();
          }
          if (tempCtx.state === "running") {
            setAudioBlocked(false);
            document.removeEventListener("click", handleInteraction);
            document.removeEventListener("keydown", handleInteraction);
          }
          tempCtx.close();
        }
      } catch {
        // Ignore browser autoplay check errors
      }
    };

    document.addEventListener("click", handleInteraction);
    document.addEventListener("keydown", handleInteraction);

    return () => {
      clearInterval(timeTimer);
      if (sse) sse.close();
      document.removeEventListener("click", handleInteraction);
      document.removeEventListener("keydown", handleInteraction);
    };
  }, []);

  // Filter for SOS incidents
  const sosIncidents = incidents.filter(
    (inc) =>
      inc.category === "safety" ||
      inc.category === "traffic" ||
      inc.category === "passenger_injury" ||
      (inc.title && inc.title.includes("SOS"))
  );

  // Map to detailed rows
  const mappedAlerts = sosIncidents.map((incident) => {
    const title = incident.title || "";
    let eventNo = incident.incidentId;
    const match = title.match(/SOS-\d+-\w+/);
    if (match) {
      eventNo = match[0];
    }

    let statusText = "待確認";
    let tone: CanvasTone = "danger";
    if (incident.status === "open" && incident.assignedTo) {
      statusText = "已確認";
      tone = "accent";
    } else if (incident.status === "investigating") {
      statusText = "調查中";
      tone = "warn";
    } else if (incident.status === "resolved") {
      statusText = "駕駛回報誤觸";
      tone = "neutral";
    } else if (incident.status === "closed") {
      statusText = "已結案";
      tone = "success";
    }

    let waitText = "—";
    if (incident.status === "open" && !incident.assignedTo) {
      const occurred = new Date(incident.occurredAt || incident.createdAt);
      const diff = Math.max(0, Math.floor((nowTime - occurred.getTime()) / 1000));
      const mins = Math.floor(diff / 60).toString().padStart(2, "0");
      const secs = (diff % 60).toString().padStart(2, "0");
      waitText = `${mins}:${secs}`;
    }

    let typeText = "其他";
    if (incident.category === "traffic") typeText = "交通事故";
    else if (incident.category === "passenger_injury") typeText = "乘客急病";
    else if (incident.category === "safety") typeText = "治安事件";

    return {
      id: incident.incidentId,
      no: eventNo,
      status: statusText,
      tone,
      wait: waitText,
      driver: incident.relatedDriverId || "—",
      plate: incident.relatedVehicleId || "—",
      order: incident.relatedOrderId || "—",
      loc: incident.location || "—",
      type: typeText,
      ack: incident.assignedTo || "—",
      hl: incident.status === "open" && !incident.assignedTo,
      originalRecord: incident,
    };
  });

  // Sort: active unacknowledged first, then by trigger time descending
  mappedAlerts.sort((a, b) => {
    if (a.hl && !b.hl) return -1;
    if (!a.hl && b.hl) return 1;
    const aTime = new Date(
      a.originalRecord.occurredAt || a.originalRecord.createdAt
    ).getTime();
    const bTime = new Date(
      b.originalRecord.occurredAt || b.originalRecord.createdAt
    ).getTime();
    return bTime - aTime;
  });

  const pendingAlert = mappedAlerts.find((r) => r.hl);
  const pendingCount = mappedAlerts.filter((r) => r.hl).length;

  // Sound chip visual styles
  let soundLabel = "提示音已啟用";
  let soundTone: CanvasTone = "success";
  let soundTag = "sound_on";

  if (soundOff) {
    soundLabel = "提示音已關閉";
    soundTone = "warn";
    soundTag = "sound_off";
  } else if (audioBlocked) {
    soundLabel = "瀏覽器已封鎖音效";
    soundTone = "danger";
    soundTag = "sound_blocked";
  }

  // Play beep periodically if there's a pending alert
  useEffect(() => {
    if (!pendingAlert || soundOff || audioBlocked) return;

    function playBeep() {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        const audioCtx = new AudioCtx();

        if (audioCtx.state === "suspended") {
          setAudioBlocked(true);
          audioCtx.close();
          return;
        }

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.type = "sine";
        osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);

        osc.start();
        osc.stop(audioCtx.currentTime + 0.25); // beep for 250ms

        setTimeout(() => {
          try {
            audioCtx.close();
          } catch {
            // Ignore potential close errors
          }
        }, 300);
      } catch (e) {
        console.error("Audio Context playback blocked or failed:", e);
        setAudioBlocked(true);
      }
    }

    playBeep();
    const alertInterval = setInterval(playBeep, 4000);
    return () => clearInterval(alertInterval);
  }, [pendingAlert, soundOff, audioBlocked]);

  const resumeAudio = async () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const tempCtx = new AudioCtx();
        if (tempCtx.state === "suspended") {
          await tempCtx.resume();
        }
        if (tempCtx.state === "running") {
          setAudioBlocked(false);
        }
        tempCtx.close();
      }
    } catch (e) {
      console.error("Failed to resume audio context:", e);
    }
  };

  const toggleSound = async () => {
    const nextVal = !soundOff;
    setSoundOff(nextVal);
    localStorage.setItem("drts-sos-sound-off", String(nextVal));
    if (!nextVal) {
      await resumeAudio();
    }
  };

  const handleEnableSound = async () => {
    setSoundOff(false);
    localStorage.setItem("drts-sos-sound-off", "false");
    await resumeAudio();
  };

  return (
    <SosSoundContext.Provider
      value={{
        incidents,
        soundOff,
        audioBlocked,
        toggleSound,
        handleEnableSound,
        pendingAlert,
        pendingCount,
        soundTone,
        soundLabel,
        soundTag,
        fetchIncidents,
      }}
    >
      {children}
    </SosSoundContext.Provider>
  );
}

export function useSosSound() {
  const context = useContext(SosSoundContext);
  if (context === undefined) {
    throw new Error("useSosSound must be used within a SosSoundProvider");
  }
  return context;
}
