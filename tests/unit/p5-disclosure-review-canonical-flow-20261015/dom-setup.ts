// Install the DOM before ReactDOM feature detection, matching a real browser.
import { JSDOM } from "jsdom";
import { vi, afterAll } from "vitest";
const initialDOM = new JSDOM("<html><body></body></html>", {
  url: "https://p5-unit.invalid",
});
vi.stubGlobal("window", initialDOM.window);
vi.stubGlobal("document", initialDOM.window.document);
vi.stubGlobal("navigator", initialDOM.window.navigator);
afterAll(() => initialDOM.window.close());
