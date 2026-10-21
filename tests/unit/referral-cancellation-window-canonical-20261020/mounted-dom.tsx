import { act, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { fireEvent as domFireEvent } from "@testing-library/dom";

export { screen, waitFor, within } from "@testing-library/dom";
export { act };

export const fireEvent = {
  click(...args: Parameters<typeof domFireEvent.click>) {
    let result = false;
    flushSync(() => {
      result = domFireEvent.click(...args);
    });
    return result;
  },
};

const roots = new Map<Root, HTMLDivElement>();

/** Use the repository's installed ReactDOM and DOM interaction boundaries. */
export function render(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.set(root, host);
  flushSync(() => root.render(node));
  return {
    rerender(next: ReactNode) {
      flushSync(() => root.render(next));
    },
  };
}

export function cleanup() {
  for (const [root, host] of roots) {
    flushSync(() => root.unmount());
    host.remove();
  }
  roots.clear();
}
