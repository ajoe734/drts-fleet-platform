/** Keeps the formal API error envelope across the browser/BFF boundary. */
export class PassengerApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "PassengerApiError";
  }
}
