/** In-memory demo storage for local styling — no AWS required. */
export function useDemoStore(): boolean {
  const flag = process.env.DEMO_MODE?.trim().toLowerCase();
  if (flag === "true" || flag === "1") return true;
  if (flag === "false" || flag === "0") return false;
  return !process.env.FUNDS_TABLE?.trim();
}
