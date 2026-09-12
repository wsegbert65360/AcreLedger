export function isTransientError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string; status?: number; message?: string };
  if (err.status && [429, 500, 502, 503, 504].includes(err.status)) return true;
  if (err.code && ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "EPIPE"].includes(err.code)) {
    return true;
  }
  const message = (err.message ?? "").toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("temporarily") ||
    message.includes("rate limit") ||
    message.includes("econnreset")
  );
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { attempts?: number; baseMs?: number; isTransient?: (error: unknown) => boolean } = {},
): Promise<T> {
  const attempts = options.attempts ?? 5;
  const baseMs = options.baseMs ?? 500;
  const transient = options.isTransient ?? isTransientError;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !transient(error)) throw error;
      const delay = baseMs * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
