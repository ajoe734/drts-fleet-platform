const DEFAULT_SERVER_API_BASE_URL = "http://localhost:3001";
const DEFAULT_BROWSER_API_BASE_URL = "/control-plane-proxy";

export function getServerApiBaseUrl() {
  return (
    process.env.DRTS_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    DEFAULT_SERVER_API_BASE_URL
  );
}

export function getBrowserApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_URL || DEFAULT_BROWSER_API_BASE_URL;
}
