/**
 * ASSIST-FF: ops-console LLM assistant feature flag.
 *
 * Per-realm toggle that controls both the ops-console assistant widget
 * visibility and the backend assistant availability. This is a switch, not a
 * credential — it carries no secrets and defaults off.
 */
export const OPS_ASSISTANT_FLAG_KEY = "ops.assistant.enabled";

export const OPS_ASSISTANT_FLAG_DESCRIPTION =
  "Enable ops console LLM assistant widget + backend availability (per-realm toggle, not a credential)";
