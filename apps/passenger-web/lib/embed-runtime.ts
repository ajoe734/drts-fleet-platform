const DEFAULT_SERVER_API_BASE_URL = "http://localhost:3001";

export function getServerApiBaseUrl() {
  return process.env.DRTS_API_URL || DEFAULT_SERVER_API_BASE_URL;
}
