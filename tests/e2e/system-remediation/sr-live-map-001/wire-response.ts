// Only product API responses cross this boundary. Google payloads, request
// bodies, string values (including reason codes), and evidence keys keep their
// own contracts. Accept both the production SnakeCaseInterceptor wire shape
// and camelCase responses from endpoints that bypass that interceptor.
export function normalizeApiResponse(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeApiResponse);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
        normalizeApiResponse(item),
      ]),
    );
  }
  return value;
}
