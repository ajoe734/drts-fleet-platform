const DEFAULT_API_BASE_URL = "http://localhost:3001";

export function getRuntimeApiBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    process.env.DRTS_API_URL?.trim() ||
    DEFAULT_API_BASE_URL
  );
}
