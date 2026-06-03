/**
 * Ops Assistant — public surface.
 *
 * Ships the Context Envelope provider, page selection/scope publishers, and
 * the floating widget shell used to surface assistant navigation/deep-link
 * actions inside ops-console.
 */

export type {
  AssistantEntityKind,
  AssistantScope,
  AssistantSelection,
  OpsAssistantContext,
  OpsAssistantIdentity,
} from "./context-envelope";

export {
  OpsAssistantContextProvider,
  useOpsAssistantContext,
  useOpsAssistantContextActions,
  useAssistantSelection,
  type OpsAssistantContextActions,
  type OpsAssistantContextProviderProps,
} from "./assistant-context-provider";

export {
  PublishAssistantSelection,
  PublishAssistantScope,
  type PublishAssistantSelectionProps,
  type PublishAssistantScopeProps,
} from "./publish-assistant-context";
export { OpsAssistantWidget } from "./assistant-widget";
