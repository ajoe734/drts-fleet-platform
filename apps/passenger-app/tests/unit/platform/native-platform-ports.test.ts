import { describe, it, expect, vi } from "vitest";
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));
vi.mock("expo-web-browser", () => ({ openAuthSessionAsync: vi.fn() }));
vi.mock("expo-linking", () => ({ openURL: vi.fn() }));
vi.mock("expo-modules-core", () => ({
  uuid: { v4: vi.fn(() => "native-uuid") },
}));
vi.mock("react-native", () => ({
  AppState: {
    currentState: "active",
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  },
}));
import {
  createNativePassengerSecureStore,
  createNativePassengerOAuthBrowser,
  createNativePassengerExpoAppState,
  createNativePassengerStreamRequest,
  createNativePassengerBinaryRequest,
  createNativePassengerExpoReceiptFiles,
  createNativePassengerPlatformPorts,
  type NativePassengerExpoModules,
  type NativePassengerExpoFileSystem,
} from "../../../lib/platform/native-passenger-platform-ports";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function storage() {
  return {
    getItemAsync: vi
      .fn<NativePassengerExpoModules["secureStore"]["getItemAsync"]>()
      .mockResolvedValue(null),
    setItemAsync: vi
      .fn<NativePassengerExpoModules["secureStore"]["setItemAsync"]>()
      .mockResolvedValue(undefined),
    deleteItemAsync: vi
      .fn<NativePassengerExpoModules["secureStore"]["deleteItemAsync"]>()
      .mockResolvedValue(undefined),
  };
}
function rawRequest() {
  return {
    readyState: 0,
    status: 0,
    responseText: "",
    response: null as unknown,
    responseType: "" as XMLHttpRequestResponseType,
    onreadystatechange: null as XMLHttpRequest["onreadystatechange"],
    onprogress: null as XMLHttpRequest["onprogress"],
    onload: null as XMLHttpRequest["onload"],
    onerror: null as XMLHttpRequest["onerror"],
    onabort: null as XMLHttpRequest["onabort"],
    open: vi.fn(),
    setRequestHeader: vi.fn(),
    getResponseHeader: vi
      .fn<(name: string) => string | null>()
      .mockReturnValue(null),
    send: vi.fn(),
    abort: vi.fn(),
  };
}
function modules() {
  const requests: ReturnType<typeof rawRequest>[] = [];
  const m: NativePassengerExpoModules = {
    secureStore: storage(),
    browser: {
      openAuthSessionAsync: vi
        .fn<NativePassengerExpoModules["browser"]["openAuthSessionAsync"]>()
        .mockResolvedValue({ type: "cancel" } as never),
    },
    linking: {
      openURL: vi
        .fn<NativePassengerExpoModules["linking"]["openURL"]>()
        .mockResolvedValue(true),
    },
    appState: {
      currentState: "active",
      addEventListener: vi.fn().mockReturnValue({ remove: vi.fn() }),
    },
    uuid: { v4: vi.fn().mockReturnValue("native-uuid") },
    fetch: vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      } as Response),
    createRequest: vi.fn(() => {
      const xhr = rawRequest();
      requests.push(xhr);
      return xhr;
    }),
  };
  return { m, requests };
}
const pair = { accessToken: "access", refreshToken: "refresh" };

describe("Expo SecureStore token pair", () => {
  it("writes only the pair atomically to one configured key and waits for native storage", async () => {
    const s = storage(),
      hold = deferred<void>();
    s.setItemAsync.mockReturnValue(hold.promise);
    const store = createNativePassengerSecureStore(s, "custom.session");
    let settled = false;
    const write = store
      .write({ ...pair, ignored: "never stored" } as typeof pair)
      .then(() => {
        settled = true;
      });
    expect(s.setItemAsync).toHaveBeenCalledExactlyOnceWith(
      "custom.session",
      JSON.stringify(pair),
    );
    await Promise.resolve();
    expect(settled).toBe(false);
    hold.resolve();
    await write;
    expect(settled).toBe(true);
  });
  it("reads a stored pair after the native read completes", async () => {
    const s = storage(),
      hold = deferred<string | null>();
    s.getItemAsync.mockReturnValue(hold.promise);
    const read = createNativePassengerSecureStore(s).read();
    expect(s.getItemAsync).toHaveBeenCalledExactlyOnceWith(
      "drts.passenger.session.v1",
    );
    hold.resolve(JSON.stringify({ ...pair, ignored: true }));
    expect(await read).toEqual(pair);
  });
  it.each([
    null,
    "not-json",
    "{}",
    JSON.stringify({ accessToken: "a" }),
    JSON.stringify({ accessToken: "", refreshToken: "r" }),
  ])(
    "returns no session for absent or incomplete stored data %s",
    async (value) => {
      const s = storage();
      s.getItemAsync.mockResolvedValue(value);
      expect(await createNativePassengerSecureStore(s).read()).toBeNull();
      expect(s.deleteItemAsync).not.toHaveBeenCalled();
    },
  );
  it("waits for native deletion on clear", async () => {
    const s = storage(),
      hold = deferred<void>();
    s.deleteItemAsync.mockReturnValue(hold.promise);
    let done = false;
    const clear = createNativePassengerSecureStore(s)
      .clear()
      .then(() => {
        done = true;
      });
    await Promise.resolve();
    expect(done).toBe(false);
    expect(s.deleteItemAsync).toHaveBeenCalledExactlyOnceWith(
      "drts.passenger.session.v1",
    );
    hold.resolve();
    await clear;
    expect(done).toBe(true);
  });
  it("propagates storage write and clear failures rather than confirming persistence", async () => {
    const s = storage();
    s.setItemAsync.mockRejectedValue(new Error("write failed"));
    s.deleteItemAsync.mockRejectedValue(new Error("delete failed"));
    const store = createNativePassengerSecureStore(s);
    await expect(store.write(pair)).rejects.toThrow("write failed");
    await expect(store.clear()).rejects.toThrow("delete failed");
  });
  it("propagates native storage read failures", async () => {
    const s = storage();
    s.getItemAsync.mockRejectedValue(new Error("locked native store"));
    await expect(createNativePassengerSecureStore(s).read()).rejects.toThrow(
      "locked native store",
    );
  });
});
describe("API-owned OAuth browser", () => {
  it("passes exact API URL and callback URI, awaits browser and preserves the callback unchanged", async () => {
    const hold =
      deferred<
        Awaited<
          ReturnType<
            NativePassengerExpoModules["browser"]["openAuthSessionAsync"]
          >
        >
      >();
    const browser = {
      openAuthSessionAsync: vi
        .fn<NativePassengerExpoModules["browser"]["openAuthSessionAsync"]>()
        .mockReturnValue(hold.promise),
    };
    const call = createNativePassengerOAuthBrowser(browser).openAuthSession(
      "https://provider.invalid/auth?state=api-state&code_challenge=api-owned",
      "drtspassenger://auth",
    );
    expect(browser.openAuthSessionAsync).toHaveBeenCalledExactlyOnceWith(
      "https://provider.invalid/auth?state=api-state&code_challenge=api-owned",
      "drtspassenger://auth",
    );
    hold.resolve({
      type: "success",
      url: "drtspassenger://auth?code=one&state=api-state",
    } as never);
    expect(await call).toEqual({
      type: "success",
      url: "drtspassenger://auth?code=one&state=api-state",
    });
  });
  it.each(["cancel", "dismiss"] as const)(
    "keeps %s as a cancellation",
    async (type) => {
      const { m } = modules();
      vi.mocked(m.browser.openAuthSessionAsync).mockResolvedValue({
        type,
      } as never);
      expect(
        await createNativePassengerOAuthBrowser(m.browser).openAuthSession(
          "https://provider.invalid",
          "drtspassenger://auth",
        ),
      ).toEqual({ type });
    },
  );
  it("refuses to report an opened browser as a completed callback", async () => {
    const { m } = modules();
    vi.mocked(m.browser.openAuthSessionAsync).mockResolvedValue({
      type: "opened",
    } as never);
    await expect(
      createNativePassengerOAuthBrowser(m.browser).openAuthSession(
        "https://provider.invalid",
        "drtspassenger://auth",
      ),
    ).rejects.toThrow("oauth_browser_result_unconfirmed");
  });
  it("propagates native browser failure", async () => {
    const { m } = modules();
    vi.mocked(m.browser.openAuthSessionAsync).mockRejectedValue(
      new Error("browser unavailable"),
    );
    await expect(
      createNativePassengerOAuthBrowser(m.browser).openAuthSession(
        "https://provider.invalid",
        "drtspassenger://auth",
      ),
    ).rejects.toThrow("browser unavailable");
  });
});
describe("RN lifecycle and real XHR shape", () => {
  it("subscribes to real AppState change and removes its native subscription", () => {
    const remove = vi.fn();
    let callback: (state: string) => void = () => {};
    const { m } = modules();
    m.appState.addEventListener = vi.fn((_event, listener) => {
      callback = listener;
      return { remove };
    });
    const port = createNativePassengerExpoAppState(m.appState),
      receive = vi.fn();
    expect(port.currentState()).toBe("active");
    const clean = port.subscribe(receive);
    callback("background");
    expect(receive).toHaveBeenCalledExactlyOnceWith("background");
    clean();
    expect(remove).toHaveBeenCalledOnce();
  });
  it("retains unknown initial AppState instead of pretending active", () => {
    const { m } = modules();
    m.appState.currentState = "unknown";
    expect(createNativePassengerExpoAppState(m.appState).currentState()).toBe(
      "unknown",
    );
  });
  it("reads progressive responseText and forwards request methods with their native receiver", () => {
    const raw = rawRequest(),
      stream = createNativePassengerStreamRequest(raw);
    stream.open("GET", "https://api.invalid/events", true);
    stream.setRequestHeader("Authorization", "Bearer persisted");
    stream.send();
    raw.readyState = 3;
    raw.status = 200;
    raw.responseText = "event: trip";
    expect(stream.readyState).toBe(3);
    expect(stream.status).toBe(200);
    expect(stream.responseText).toBe("event: trip");
    raw.responseText += "_updated\n";
    expect(stream.responseText).toBe("event: trip_updated\n");
    expect(raw.open).toHaveBeenCalledExactlyOnceWith(
      "GET",
      "https://api.invalid/events",
      true,
    );
    expect(raw.open.mock.contexts[0]).toBe(raw);
    expect(raw.setRequestHeader).toHaveBeenCalledExactlyOnceWith(
      "Authorization",
      "Bearer persisted",
    );
    expect(raw.send.mock.contexts[0]).toBe(raw);
  });
  it.each([
    "onreadystatechange",
    "onprogress",
    "onload",
    "onerror",
    "onabort",
  ] as const)("bridges %s and truly detaches the native handler", (name) => {
    const raw = rawRequest(),
      stream = createNativePassengerStreamRequest(raw),
      callback = vi.fn();
    stream[name] = callback;
    expect(stream[name]).toBe(callback);
    (raw[name] as unknown as () => void)();
    expect(callback).toHaveBeenCalledOnce();
    stream[name] = null;
    expect(raw[name]).toBeNull();
    expect(stream[name]).toBeNull();
  });
  it("forwards binary arraybuffer response and headers without converting bytes to text", () => {
    const raw = rawRequest(),
      binary = createNativePassengerBinaryRequest(raw);
    const body = new Uint8Array([0, 255, 37]).buffer;
    binary.open("GET", "https://api.invalid/receipt", true);
    binary.responseType = "arraybuffer";
    raw.response = body;
    raw.status = 200;
    raw.getResponseHeader.mockReturnValue("application/pdf");
    expect(raw.responseType).toBe("arraybuffer");
    expect(binary.response).toBe(body);
    expect(binary.status).toBe(200);
    expect(binary.getResponseHeader("Content-Type")).toBe("application/pdf");
    binary.abort();
    expect(raw.abort).toHaveBeenCalledOnce();
  });
});
function files() {
  const instances: Array<{
    uri: string;
    create: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  }> = [];
  class File {
    readonly uri: string;
    create = vi.fn();
    write = vi.fn();
    delete = vi.fn();
    constructor(...parts: string[]) {
      this.uri = parts.join("/");
      instances.push(this);
    }
  }
  const fs: NativePassengerExpoFileSystem = {
    Paths: { cache: { uri: "file:///cache" } },
    File,
  };
  return { fs, instances };
}
describe("receipt native file boundary", () => {
  it("skips opening when no actual file library or opener exists", () => {
    const f = files();
    expect(
      createNativePassengerExpoReceiptFiles({ newFileId: () => "id" }).status,
    ).toBe("unavailable");
    expect(
      createNativePassengerExpoReceiptFiles({
        fileSystem: f.fs,
        newFileId: () => "id",
      }),
    ).toEqual({
      status: "unavailable",
      reason: "receipt_file_opening_unavailable",
    });
    expect(f.instances).toHaveLength(0);
  });
  it("awaits create and original-byte write before returning actual file URI", async () => {
    const f = files(),
      createHold = deferred<void>(),
      writeHold = deferred<void>();
    class AsyncFile extends f.fs.File {
      constructor(...parts: string[]) {
        super(...parts);
        vi.mocked(this.create).mockReturnValue(createHold.promise);
        vi.mocked(this.write).mockReturnValue(writeHold.promise);
      }
    }
    const result = createNativePassengerExpoReceiptFiles({
      fileSystem: { ...f.fs, File: AsyncFile },
      newFileId: () => "id",
      openSavedFile: async () => {},
    });
    if (result.status !== "ready") throw Error("missing file port");
    const bytes = new Uint8Array([37, 80, 68, 70, 0, 255]);
    let done = false;
    const write = result.port
      .write({ fileName: "receipt.pdf", contentType: "application/pdf", bytes })
      .then((uri) => {
        done = true;
        return uri;
      });
    const instance = f.instances[0]!;
    expect(instance.create).toHaveBeenCalledExactlyOnceWith({
      overwrite: true,
      intermediates: true,
    });
    expect(instance.write).not.toHaveBeenCalled();
    createHold.resolve();
    await Promise.resolve();
    expect(instance.write).toHaveBeenCalledExactlyOnceWith(bytes);
    expect(instance.write.mock.calls[0]![0]).toBe(bytes);
    expect(done).toBe(false);
    writeHold.resolve();
    expect(await write).toBe("file:///cache/id-receipt.pdf");
  });
  it("removes the saved URI and awaits the actual saved-file opener with MIME type", async () => {
    const f = files(),
      hold = deferred<void>(),
      open = vi.fn().mockReturnValue(hold.promise);
    const result = createNativePassengerExpoReceiptFiles({
      fileSystem: f.fs,
      newFileId: () => "id",
      openSavedFile: open,
    });
    if (result.status !== "ready") throw Error("missing file port");
    await result.port.remove("file:///cache/one.pdf");
    expect(f.instances[0]!.uri).toBe("file:///cache/one.pdf");
    expect(f.instances[0]!.delete).toHaveBeenCalledOnce();
    let done = false;
    const call = result.port
      .open("file:///cache/one.pdf", "application/pdf")
      .then(() => {
        done = true;
      });
    expect(open).toHaveBeenCalledExactlyOnceWith(
      "file:///cache/one.pdf",
      "application/pdf",
    );
    await Promise.resolve();
    expect(done).toBe(false);
    hold.resolve();
    await call;
    expect(done).toBe(true);
  });
  it("propagates actual byte-write failure instead of returning a downloadable URI", async () => {
    const f = files();
    class BrokenFile extends f.fs.File {
      constructor(...parts: string[]) {
        super(...parts);
        vi.mocked(this.write).mockRejectedValue(Error("disk full"));
      }
    }
    const result = createNativePassengerExpoReceiptFiles({
      fileSystem: { ...f.fs, File: BrokenFile },
      newFileId: () => "id",
      openSavedFile: async () => {},
    });
    if (result.status !== "ready") throw Error("missing file port");
    await expect(
      result.port.write({
        fileName: "r.pdf",
        contentType: "application/pdf",
        bytes: new Uint8Array([0]),
      }),
    ).rejects.toThrow("disk full");
  });
});
describe("configured runtime platform composition", () => {
  it("uses native UUID, actual fetch, fresh requests and exposes unavailable external boundaries", async () => {
    const { m, requests } = modules();
    const ports = createNativePassengerPlatformPorts({
      baseUrl: "https://api.invalid",
      callbackUri: "drtspassenger://auth",
      modules: m,
    });
    expect(ports.newRequestId()).toBe("native-uuid");
    expect(m.uuid.v4).toHaveBeenCalledOnce();
    await ports.fetchFn("https://api.invalid/me", {
      headers: { Authorization: "Bearer real" },
    });
    expect(m.fetch).toHaveBeenCalledExactlyOnceWith("https://api.invalid/me", {
      headers: { Authorization: "Bearer real" },
    });
    ports.events!.createRequest();
    ports.events!.createRequest();
    expect(requests).toHaveLength(2);
    expect(requests[0]).not.toBe(requests[1]);
    expect(ports.browser.status).toBe("ready");
    expect(ports.paymentFields.status).toBe("unavailable");
    expect(ports.paymentBrowser.status).toBe("unavailable");
    expect(ports.bookingMap.status).toBe("unavailable");
    expect(ports.notifications).toEqual({ status: "disabled" });
    expect(ports.receipts).toBeUndefined();
    expect(ports.receiptFiles.status).toBe("unavailable");
  });
  it("awaits native telephone opening and propagates failures", async () => {
    const { m } = modules(),
      hold = deferred<true>();
    vi.mocked(m.linking.openURL).mockReturnValue(hold.promise);
    const ports = createNativePassengerPlatformPorts({
      baseUrl: "https://api.invalid",
      callbackUri: "drtspassenger://auth",
      modules: m,
    });
    let done = false;
    const call = Promise.resolve(
      ports.telephone!.open("tel:+886912345678"),
    ).then(() => {
      done = true;
    });
    expect(m.linking.openURL).toHaveBeenCalledExactlyOnceWith(
      "tel:+886912345678",
    );
    await Promise.resolve();
    expect(done).toBe(false);
    hold.resolve(true);
    await call;
    expect(done).toBe(true);
    vi.mocked(m.linking.openURL).mockRejectedValue(Error("dialer absent"));
    await expect(ports.telephone!.open("tel:123")).rejects.toThrow(
      "dialer absent",
    );
  });
  it("visibly skips shared Web URLs without an actual configured origin", async () => {
    const { m } = modules(),
      ports = createNativePassengerPlatformPorts({
        baseUrl: "https://api.invalid",
        callbackUri: "drtspassenger://auth",
        modules: m,
      });
    expect(ports.shareWeb.status).toBe("unavailable");
    const result = await ports.shareWeb.openSharedRide("shared token");
    expect(result.status).toBe("skipped");
    expect(result.message).toContain("略過");
    expect(m.linking.openURL).not.toHaveBeenCalled();
  });
  it("opens only configured existing shared ride and receipt Web paths", async () => {
    const { m } = modules(),
      ports = createNativePassengerPlatformPorts({
        baseUrl: "https://api.invalid",
        callbackUri: "drtspassenger://auth",
        modules: m,
        shareWebOrigin: "https://web.invalid///",
      });
    expect(await ports.shareWeb.openSharedRide("token/a?b")).toEqual({
      status: "opened",
    });
    expect(await ports.shareWeb.openSharedRide("token/a?b", "receipt")).toEqual(
      { status: "opened" },
    );
    expect(m.linking.openURL).toHaveBeenNthCalledWith(
      1,
      "https://web.invalid/r/token%2Fa%3Fb",
    );
    expect(m.linking.openURL).toHaveBeenNthCalledWith(
      2,
      "https://web.invalid/r/token%2Fa%3Fb/receipt",
    );
  });
  it("wires binary receipt requests only when a real saved-file opener is supplied", () => {
    const { m, requests } = modules(),
      f = files(),
      ports = createNativePassengerPlatformPorts({
        baseUrl: "https://api.invalid",
        callbackUri: "drtspassenger://auth",
        modules: m,
        fileSystem: f.fs,
        openSavedFile: async () => {},
      });
    expect(ports.receiptFiles.status).toBe("ready");
    const xhr = ports.receipts!.createRequest();
    xhr.responseType = "arraybuffer";
    expect(requests[0]!.responseType).toBe("arraybuffer");
    expect(ports.receipts!.files).toBe(
      ports.receiptFiles.status === "ready"
        ? ports.receiptFiles.port
        : undefined,
    );
  });
});
