/** Flatten fetch/TLS errors into a plain string (avoids circular `cause` chains). */
export function fetchErrorMessage(
  error: unknown,
  fallback = "Request failed",
): string {
  if (!(error instanceof Error)) return fallback;

  const parts: string[] = [];
  let current: unknown = error;
  let depth = 0;

  while (current instanceof Error && depth < 5) {
    if (current.message && !parts.includes(current.message)) {
      parts.push(current.message);
    }
    current = current.cause;
    depth++;
  }

  return parts.join(" — ") || fallback;
}
