export class ApiError extends Error {
  status: number;
  reason?: string;

  constructor(message: string, status: number, reason?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.reason = reason;
  }
}

/** Fetch JSON, turning a non-2xx response into an ApiError carrying the
 *  backend's own message so the UI can show something specific. */
export async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);

  if (!response.ok) {
    let message = 'Something went wrong. Please try again.';
    let reason: string | undefined;

    try {
      const body = await response.json();
      if (body?.error) message = body.error;
      reason = body?.reason;
    } catch {
      // A non-JSON error body leaves the default message in place.
    }

    throw new ApiError(message, response.status, reason);
  }

  return response.json() as Promise<T>;
}
