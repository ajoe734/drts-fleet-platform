/** Browser navigation is an external boundary for jsdom component tests. */
export function redirectToProvider(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:")
    throw new Error("Invalid provider redirect");
  window.location.assign(url);
}
