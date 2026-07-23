/** Parse JSON from a fetch Response; surface gateway HTML as a clear error. */
export async function readResponseJson<T = unknown>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    if (
      res.status === 502 ||
      res.status === 503 ||
      res.status === 504 ||
      /504|502|gateway/i.test(text)
    ) {
      throw new Error(
        "Service temporarily unavailable — wait for deploy to finish and retry",
      );
    }
    throw new Error(`Unexpected response (${res.status || "?"})`);
  }
}
