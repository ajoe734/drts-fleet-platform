type RuntimeConfig = {
  apiBaseUrl: string;
};

const DEFAULT_API_BASE_URL = "http://localhost:3001";
const RUNTIME_CONFIG_WINDOW_KEY = "__DRTS_RUNTIME_CONFIG__";

declare global {
  interface Window {
    __DRTS_RUNTIME_CONFIG__?: RuntimeConfig;
  }
}

function resolveServerApiBaseUrl(): string {
  return (
    process.env.DRTS_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    DEFAULT_API_BASE_URL
  );
}

export function getRuntimeApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return resolveServerApiBaseUrl();
  }

  return (
    window.__DRTS_RUNTIME_CONFIG__?.apiBaseUrl || resolveServerApiBaseUrl()
  );
}

export function RuntimeConfigScript() {
  const config: RuntimeConfig = {
    apiBaseUrl: resolveServerApiBaseUrl(),
  };
  const serializedConfig = JSON.stringify(config).replace(/</g, "\\u003c");

  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `window.${RUNTIME_CONFIG_WINDOW_KEY} = ${serializedConfig};`,
      }}
    />
  );
}
