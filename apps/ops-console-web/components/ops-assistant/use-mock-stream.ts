"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AssistantMessage } from "./types";

const STREAM_TICK_MS = 32;

let messageCounter = 0;
function nextMessageId(prefix: string) {
  messageCounter += 1;
  return `${prefix}-${messageCounter}`;
}

/**
 * Tokenise a string into word-plus-trailing-space chunks so the mock stream
 * renders progressively, the way a real token stream would.
 */
function tokenize(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [text];
}

function buildMockReply(prompt: string): string {
  const echo = prompt.length > 48 ? `${prompt.slice(0, 48)}…` : prompt;
  return (
    `You asked: "${echo}". This is a mocked streaming reply from the ops ` +
    `assistant shell — there is no model wired up yet. The shell exists so the ` +
    `floating window, drag, dock, minimise and resize behaviours can be ` +
    `exercised end to end. Real responses and the final visual language are ` +
    `owned by the design and platform teams.`
  );
}

export interface UseMockStream {
  messages: AssistantMessage[];
  isStreaming: boolean;
  send: (text: string) => void;
  reset: () => void;
}

export function useMockStream(greeting: string): UseMockStream {
  const greetingRef = useRef(greeting);
  greetingRef.current = greeting;

  const buildGreeting = useCallback(
    (): AssistantMessage => ({
      id: nextMessageId("greeting"),
      role: "assistant",
      content: greetingRef.current,
    }),
    [],
  );

  const [messages, setMessages] = useState<AssistantMessage[]>(() => [
    buildGreeting(),
  ]);
  const [isStreaming, setIsStreaming] = useState(false);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      // Ignore empty input or a send while a stream is still in flight.
      if (!trimmed || timerRef.current !== null) {
        return;
      }

      const userMessage: AssistantMessage = {
        id: nextMessageId("user"),
        role: "user",
        content: trimmed,
      };
      const replyId = nextMessageId("assistant");
      setMessages((prev) => [
        ...prev,
        userMessage,
        { id: replyId, role: "assistant", content: "", streaming: true },
      ]);

      const tokens = tokenize(buildMockReply(trimmed));
      let index = 0;
      setIsStreaming(true);
      timerRef.current = window.setInterval(() => {
        index += 1;
        const content = tokens.slice(0, index).join("");
        const done = index >= tokens.length;
        setMessages((prev) =>
          prev.map((message) =>
            message.id === replyId
              ? { ...message, content, streaming: !done }
              : message,
          ),
        );
        if (done) {
          clearTimer();
          setIsStreaming(false);
        }
      }, STREAM_TICK_MS);
    },
    [clearTimer],
  );

  const reset = useCallback(() => {
    clearTimer();
    setIsStreaming(false);
    setMessages([buildGreeting()]);
  }, [buildGreeting, clearTimer]);

  // Stop any in-flight stream when the widget unmounts.
  useEffect(() => clearTimer, [clearTimer]);

  return { messages, isStreaming, send, reset };
}
