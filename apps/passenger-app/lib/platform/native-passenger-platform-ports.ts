import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { AppState } from "react-native";
import { uuid } from "expo-modules-core";
import type { NativePassengerRuntimeOptions } from "../native-passenger-runtime";
import type {
  NativePassengerSessionStore,
  NativePassengerReceiptFilePort,
  NativePassengerStreamRequest,
  NativePassengerBinaryRequest,
  NativePassengerAppStatePort,
} from "@drts/passenger-client";
import type { PassengerOAuthBrowserPort } from "../../components/auth/passenger-login-screen";

type RawRequest = Pick<
  XMLHttpRequest,
  | "readyState"
  | "status"
  | "responseText"
  | "response"
  | "responseType"
  | "onreadystatechange"
  | "onprogress"
  | "onload"
  | "onerror"
  | "onabort"
  | "open"
  | "setRequestHeader"
  | "getResponseHeader"
  | "send"
  | "abort"
>;
export interface NativePassengerExpoModules {
  secureStore: Pick<
    typeof SecureStore,
    "getItemAsync" | "setItemAsync" | "deleteItemAsync"
  >;
  browser: Pick<typeof WebBrowser, "openAuthSessionAsync">;
  linking: Pick<typeof Linking, "openURL">;
  appState: Pick<typeof AppState, "currentState" | "addEventListener">;
  uuid: Pick<typeof uuid, "v4">;
  fetch: typeof globalThis.fetch;
  createRequest(): RawRequest;
}

/** Exact installed SecureStore15 async API; one awaited key stores the pair together. */
export function createNativePassengerSecureStore(
  store: NativePassengerExpoModules["secureStore"],
  key = "drts.passenger.session.v1",
): NativePassengerSessionStore {
  return {
    async read() {
      const value = await store.getItemAsync(key);
      if (value === null) return null;
      try {
        const data: unknown = JSON.parse(value);
        if (!data || typeof data !== "object") return null;
        const pair = data as { accessToken?: unknown; refreshToken?: unknown };
        return typeof pair.accessToken === "string" &&
          pair.accessToken.length > 0 &&
          typeof pair.refreshToken === "string" &&
          pair.refreshToken.length > 0
          ? { accessToken: pair.accessToken, refreshToken: pair.refreshToken }
          : null;
      } catch {
        return null;
      }
    },
    async write(pair) {
      await store.setItemAsync(
        key,
        JSON.stringify({
          accessToken: pair.accessToken,
          refreshToken: pair.refreshToken,
        }),
      );
    },
    async clear() {
      await store.deleteItemAsync(key);
    },
  };
}

/** API owns PKCE/state/transaction; native browser only returns its callback URL. */
export function createNativePassengerOAuthBrowser(
  browser: NativePassengerExpoModules["browser"],
): PassengerOAuthBrowserPort {
  return {
    async openAuthSession(authUrl, redirectUri) {
      const result = await browser.openAuthSessionAsync(authUrl, redirectUri);
      if (result.type === "success")
        return { type: "success", url: result.url };
      if (result.type === "cancel" || result.type === "dismiss")
        return { type: result.type };
      throw new Error("oauth_browser_result_unconfirmed");
    },
  };
}

export function createNativePassengerExpoAppState(
  appState: NativePassengerExpoModules["appState"],
): NativePassengerAppStatePort {
  return {
    currentState: () => appState.currentState ?? "unknown",
    subscribe(listener) {
      const subscription = appState.addEventListener("change", listener);
      return () => subscription.remove();
    },
  };
}

/** Callback bridges preserve RN's event signatures and detach actual native handlers. */
export function createNativePassengerStreamRequest(
  raw: RawRequest,
): NativePassengerStreamRequest {
  const listeners: Record<
    "onreadystatechange" | "onprogress" | "onload" | "onerror" | "onabort",
    (() => void) | null
  > = {
    onreadystatechange: null,
    onprogress: null,
    onload: null,
    onerror: null,
    onabort: null,
  };
  const request = {
    get readyState() {
      return raw.readyState;
    },
    get status() {
      return raw.status;
    },
    get responseText() {
      return raw.responseText;
    },
    open(method: string, url: string, async: boolean) {
      raw.open(method, url, async);
    },
    setRequestHeader(name: string, value: string) {
      raw.setRequestHeader(name, value);
    },
    getResponseHeader(name: string) {
      return raw.getResponseHeader(name);
    },
    send() {
      raw.send();
    },
    abort() {
      raw.abort();
    },
  };
  for (const name of Object.keys(listeners) as Array<keyof typeof listeners>) {
    Object.defineProperty(request, name, {
      enumerable: true,
      get: () => listeners[name],
      set: (listener: (() => void) | null) => {
        listeners[name] = listener;
        raw[name] = listener ? () => listener() : null;
      },
    });
  }
  return request as NativePassengerStreamRequest;
}
export function createNativePassengerBinaryRequest(
  raw: RawRequest,
): NativePassengerBinaryRequest {
  const stream = createNativePassengerStreamRequest(raw);
  return {
    get status() {
      return raw.status;
    },
    get response() {
      return raw.response;
    },
    get responseType() {
      return raw.responseType;
    },
    set responseType(value: string) {
      raw.responseType = value as XMLHttpRequestResponseType;
    },
    get onload() {
      return stream.onload;
    },
    set onload(value) {
      stream.onload = value;
    },
    get onerror() {
      return stream.onerror;
    },
    set onerror(value) {
      stream.onerror = value;
    },
    get onabort() {
      return stream.onabort;
    },
    set onabort(value) {
      stream.onabort = value;
    },
    open: (method, url, async) => stream.open(method, url, async),
    setRequestHeader: (name, value) => stream.setRequestHeader(name, value),
    getResponseHeader: (name) => stream.getResponseHeader(name),
    send: () => stream.send(),
    abort: () => stream.abort(),
  };
}

export interface NativePassengerExpoFileSystem {
  Paths: { readonly cache: { readonly uri: string } };
  File: new (...uris: string[]) => {
    readonly uri: string;
    create(options?: {
      overwrite?: boolean;
      intermediates?: boolean;
    }): void | Promise<void>;
    write(bytes: Uint8Array): void | Promise<void>;
    delete(): void | Promise<void>;
  };
}
export type NativePassengerReceiptFiles =
  | { status: "unavailable"; reason: string }
  | { status: "ready"; port: NativePassengerReceiptFilePort };
/** FileSystem19 File.write accepts actual Uint8Array; opener is explicitly external. */
export function createNativePassengerExpoReceiptFiles(options: {
  fileSystem?: NativePassengerExpoFileSystem;
  openSavedFile?: (uri: string, contentType: string) => Promise<void>;
  newFileId(): string;
}): NativePassengerReceiptFiles {
  if (!options.fileSystem || !options.openSavedFile)
    return {
      status: "unavailable",
      reason: "receipt_file_opening_unavailable",
    };
  const files = options.fileSystem,
    open = options.openSavedFile;
  return {
    status: "ready",
    port: {
      async write(input) {
        const file = new files.File(
          files.Paths.cache.uri,
          `${options.newFileId()}-${input.fileName}`,
        );
        await file.create({ overwrite: true, intermediates: true });
        await file.write(input.bytes);
        return file.uri;
      },
      async remove(uri) {
        await new files.File(uri).delete();
      },
      async open(uri, contentType) {
        await open(uri, contentType);
      },
    },
  };
}

export type NativePassengerPlatformPorts = Omit<
  NativePassengerRuntimeOptions,
  "baseUrl" | "mode" | "callbackUri"
> & {
  receiptFiles: NativePassengerReceiptFiles;
  shareWeb: {
    status: "ready" | "unavailable";
    message?: string;
    openSharedRide(
      token: string,
      kind?: "ride" | "receipt",
    ): Promise<{ status: "opened" | "skipped"; message?: string }>;
  };
};
/** Defaults use installed Expo/RN modules; tests inject only the platform boundary. */
export function createNativePassengerPlatformPorts(input: {
  baseUrl: string;
  callbackUri: string;
  modules?: NativePassengerExpoModules;
  sessionKey?: string;
  shareWebOrigin?: string;
  fileSystem?: NativePassengerExpoFileSystem;
  openSavedFile?: (uri: string, contentType: string) => Promise<void>;
}): NativePassengerPlatformPorts {
  const modules = input.modules ?? {
    secureStore: SecureStore,
    browser: WebBrowser,
    linking: Linking,
    appState: AppState,
    uuid,
    fetch: globalThis.fetch,
    createRequest: () => new XMLHttpRequest(),
  };
  const newRequestId = () => modules.uuid.v4();
  const receiptFiles = createNativePassengerExpoReceiptFiles({
    newFileId: newRequestId,
    ...(input.fileSystem ? { fileSystem: input.fileSystem } : {}),
    ...(input.openSavedFile ? { openSavedFile: input.openSavedFile } : {}),
  });
  const shareOrigin = input.shareWebOrigin?.replace(/\/+$/, "");
  const skipped = "分享網址尚未設定，已略過開啟步驟。";
  return {
    fetchFn: (url, options) => modules.fetch(url, options),
    store: createNativePassengerSecureStore(
      modules.secureStore,
      input.sessionKey,
    ),
    browser: {
      status: "ready",
      port: createNativePassengerOAuthBrowser(modules.browser),
    },
    newRequestId,
    now: Date.now,
    events: {
      createRequest: () =>
        createNativePassengerStreamRequest(modules.createRequest()),
      appState: createNativePassengerExpoAppState(modules.appState),
    },
    ...(receiptFiles.status === "ready"
      ? {
          receipts: {
            createRequest: () =>
              createNativePassengerBinaryRequest(modules.createRequest()),
            files: receiptFiles.port,
          },
        }
      : {}),
    receiptFiles,
    telephone: {
      async open(uri) {
        await modules.linking.openURL(uri);
      },
    },
    shareWeb: {
      status: shareOrigin ? "ready" : "unavailable",
      ...(!shareOrigin ? { message: skipped } : {}),
      async openSharedRide(token, kind = "ride") {
        if (!shareOrigin) return { status: "skipped", message: skipped };
        await modules.linking.openURL(
          `${shareOrigin}/r/${encodeURIComponent(token)}${kind === "receipt" ? "/receipt" : ""}`,
        );
        return { status: "opened" };
      },
    },
    paymentFields: { status: "unavailable" },
    paymentBrowser: { status: "unavailable" },
    bookingMap: { status: "unavailable" },
    notifications: { status: "disabled" },
  };
}
