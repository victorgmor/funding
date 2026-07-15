import type { Fund } from "@/lib/funds/types";

export type LifecycleStage = "deposit" | "trading" | "closed";
export type StageState = "past" | "current" | "future";

export type LifecycleStageView = {
  id: LifecycleStage;
  label: string;
  state: StageState;
  line1: string;
  line2?: string;
};

const DAY_MS = 86_400_000;

export function formatFundDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

export function daysUntil(iso: string, now = Date.now()): number {
  return Math.max(0, Math.ceil((Date.parse(iso) - now) / DAY_MS));
}

export function daysSince(iso: string, now = Date.now()): number {
  return Math.max(0, Math.floor((now - Date.parse(iso)) / DAY_MS));
}

export function formatDaysLeft(iso: string, now = Date.now()): string {
  const days = daysUntil(iso, now);
  if (days === 0) return "Ends today";
  return `${days} ${days === 1 ? "day" : "days"} left`;
}

export function formatDaysAgo(iso: string, now = Date.now()): string {
  const ago = daysSince(iso, now);
  if (ago === 0) return "Today";
  return `${ago} ${ago === 1 ? "day" : "days"} ago`;
}

export function effectiveClosedAt(fund: Fund, now = Date.now()): string | null {
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
  if (fund.status === "closed" || fund.closedAt) return false;
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
  if (fund.status === "closed" || fund.closedAt) return "closed";
  if (fund.tradingEndsAt && Date.parse(fund.tradingEndsAt) < now) {
    return "closed";
  }
  if (depositPhaseActive(fund, totalNotional, now)) {
    return "deposit";
  }
  return "trading";
}

export function buildLifecycleStages(
  fund: Fund,
  now = Date.now(),
  totalNotional = 0,
): LifecycleStageView[] {
  const current = resolveLifecycleStage(fund, now, totalNotional);
  const closedAt = effectiveClosedAt(fund, now);

  const deposit: LifecycleStageView = {
    id: "deposit",
    label: "Deposit Stage",
    state:
      current === "deposit"
        ? "current"
        : current === "trading" || current === "closed"
          ? "past"
          : "future",
    line1: "",
  };

  if (fund.raiseEndsAt) {
    if (current === "deposit") {
      deposit.line1 = formatDaysLeft(fund.raiseEndsAt, now);
    } else if (
      poolCapReached(fund, totalNotional) &&
      Date.parse(fund.raiseEndsAt) > now
    ) {
      deposit.line1 = "Cap reached";
    } else {
      deposit.line1 = formatDaysAgo(fund.raiseEndsAt, now);
    }
  } else {
    deposit.line1 = current === "deposit" ? "Accepting commitments" : "—";
  }

  const trading: LifecycleStageView = {
    id: "trading",
    label: "Trading Stage",
    state:
      current === "trading"
        ? "current"
        : current === "closed"
          ? "past"
          : "future",
    line1: "",
  };

  if (fund.tradingEndsAt) {
    if (current === "trading") {
      trading.line1 = formatDaysLeft(fund.tradingEndsAt, now);
    } else if (current === "closed") {
      trading.line1 = formatDaysAgo(fund.tradingEndsAt, now);
    } else {
      trading.line1 = formatDaysLeft(fund.tradingEndsAt, now);
    }
  } else {
    trading.line1 =
      current === "trading" ? "Manager may open risk" : current === "closed" ? "Ended" : "—";
  }

  const closed: LifecycleStageView = {
    id: "closed",
    label: "Closed Stage",
    state: current === "closed" ? "current" : "future",
    line1: "",
  };

  if (current === "closed" && closedAt) {
    closed.line1 = formatDaysAgo(closedAt, now);
  } else if (fund.tradingEndsAt) {
    closed.line1 = formatDaysLeft(fund.tradingEndsAt, now);
  } else {
    closed.line1 = "—";
  }

  return [deposit, trading, closed];
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
