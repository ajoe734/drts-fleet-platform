export type AssistantMode = "closed" | "floating" | "minimized" | "docked";

export interface AssistantPosition {
  x: number;
  y: number;
}

export interface AssistantSize {
  width: number;
  height: number;
}

export interface AssistantWindowState {
  mode: AssistantMode;
  /** Top-left corner of the floating window, in viewport pixels. */
  position: AssistantPosition;
  /** Size of the floating window (also drives docked-panel width). */
  size: AssistantSize;
}

export type AssistantRole = "user" | "assistant";

export interface AssistantMessage {
  id: string;
  role: AssistantRole;
  content: string;
  /** True while a mock stream is still appending tokens to this message. */
  streaming?: boolean;
}
