import type { Fund } from "@/lib/funds/types";

export type LifecycleStage = "deposit" | "trading" | "closed";

const DAY_MS = 86_400_000;

/** True when the fund is closed or archived — no longer accepting deposits or trades. */
export function isFundInactive(fund: Fund): boolean {
  return (
    fund.status === "closed" ||
    fund.status === "archived" ||
    Boolean(fund.closedAt) ||
    Boolean(fund.archivedAt)
  );
}

export function daysUntil(iso: string, now = Date.now()): number {
  return Math.max(0, Math.ceil((Date.parse(iso) - now) / DAY_MS));
}

export function daysSince(iso: string, now = Date.now()): number {
  return Math.max(0, Math.floor((now - Date.parse(iso)) / DAY_MS));
}

export function effectiveClosedAt(fund: Fund, now = Date.now()): string | null {
  if (fund.archivedAt) return fund.archivedAt;
  if (fund.closedAt) return fund.closedAt;
  if (fund.status === "closed" && fund.tradingEndsAt) return fund.tradingEndsAt;
  if (fund.tradingEndsAt && Date.parse(fund.tradingEndsAt) < now) {
    return fund.tradingEndsAt;
  }
  return null;
}

export function poolCapReached(fund: Fund, totalNotional: number): boolean {
  if (fund.capUsdc == null || fund.capUsdc <= 0) return false;
  return totalNotional >= fund.capUsdc;
}

export function raiseWindowOpen(fund: Fund, now = Date.now()): boolean {
  if (!fund.raiseEndsAt) return true;
  return Date.parse(fund.raiseEndsAt) >= now;
}

/** Deposit window is open until the raise date passes or the pool cap fills. */
export function depositPhaseActive(
  fund: Fund,
  totalNotional = 0,
  now = Date.now(),
): boolean {
  if (isFundInactive(fund)) return false;
  if (fund.tradingEndsAt && Date.parse(fund.tradingEndsAt) < now) return false;
  if (!raiseWindowOpen(fund, now)) return false;
  if (poolCapReached(fund, totalNotional)) return false;
  return true;
}

export function resolveLifecycleStage(
  fund: Fund,
  now = Date.now(),
  totalNotional = 0,
): LifecycleStage {
  if (isFundInactive(fund)) return "closed";
  if (fund.tradingEndsAt && Date.parse(fund.tradingEndsAt) < now) {
    return "closed";
  }
  if (depositPhaseActive(fund, totalNotional, now)) {
    return "deposit";
  }
  return "trading";
}

export function parseFundDateInput(value: string): string {
  const text = value.trim();
  if (!text) throw new Error("Date required");
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return new Date(`${text}T23:59:59.999Z`).toISOString();
  }
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) throw new Error("Invalid date");
  return new Date(ms).toISOString();
}

export function validateLifecycleDates(
  raiseEndsAt: string | null | undefined,
  tradingEndsAt: string | null | undefined,
): string | null {
  if (!raiseEndsAt || !tradingEndsAt) {
    return "Deposit and trading end dates are required";
  }

  const raiseMs = Date.parse(raiseEndsAt);
  const tradingMs = Date.parse(tradingEndsAt);
  if (!Number.isFinite(raiseMs) || !Number.isFinite(tradingMs)) {
    return "Invalid lifecycle dates";
  }

  const now = Date.now();
  if (raiseMs <= now) return "Deposit end date must be in the future";
  if (tradingMs <= raiseMs) {
    return "Trading must end after the deposit window";
  }

  return null;
}

export function defaultLifecycleDate(daysFromNow: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

/** Shift dates/status so resolveLifecycleStage returns the requested stage (testing only). */
export function fundPatchForTestStage(
  stage: LifecycleStage,
  now = Date.now(),
): Pick<Fund, "status" | "closedAt" | "raiseEndsAt" | "tradingEndsAt"> {
  if (stage === "deposit") {
    return {
      status: "trading",
      closedAt: null,
      raiseEndsAt: new Date(now + 30 * DAY_MS).toISOString(),
      tradingEndsAt: new Date(now + 60 * DAY_MS).toISOString(),
    };
  }

  if (stage === "trading") {
    return {
      status: "trading",
      closedAt: null,
      raiseEndsAt: new Date(now - DAY_MS).toISOString(),
      tradingEndsAt: new Date(now + 30 * DAY_MS).toISOString(),
    };
  }

  return {
    status: "closed",
    closedAt: new Date(now).toISOString(),
    raiseEndsAt: new Date(now - 60 * DAY_MS).toISOString(),
    tradingEndsAt: new Date(now - DAY_MS).toISOString(),
  };
}
