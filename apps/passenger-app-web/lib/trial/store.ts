/**
 * The self-serve trial (/trial) is a presentation over the shared-dev review
 * backend: the same synthetic SMS, test card and test terms, without the
 * review's three-window rehearsal wording. This flag only marks that the
 * visitor came in through /trial; it grants nothing on the server.
 */
const TRIAL_STORAGE_KEY = "pax.trial.v1";
const TRIAL_CHANGE_EVENT = "pax-trial-change";

export function isTrialMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(TRIAL_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setTrialMode(enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (enabled) window.localStorage.setItem(TRIAL_STORAGE_KEY, "1");
    else window.localStorage.removeItem(TRIAL_STORAGE_KEY);
  } catch {
    /* Storage can be blocked; the trial then shows the review presentation. */
  }
  window.dispatchEvent(new Event(TRIAL_CHANGE_EVENT));
}

export function subscribeTrial(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(TRIAL_CHANGE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(TRIAL_CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}
